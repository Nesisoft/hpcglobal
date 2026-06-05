const router    = require('express').Router();
const { z }     = require('zod');

const { validate }   = require('../middleware/validate');
const emailService   = require('../services/email');
const supabaseAdmin  = require('../lib/supabaseAdmin');
const paystack       = require('../services/paystack');
const prisma         = require('../lib/prisma');

// ─── Partner auth middleware (validates a Supabase access token) ───────────────
async function verifyPartner(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(auth.slice(7));
    if (error || !data?.user?.email) return res.status(401).json({ message: 'Session expired. Please log in again.' });

    const partner = await prisma.partner.findUnique({ where: { email: data.user.email.toLowerCase() } });
    if (!partner || partner.status !== 'APPROVED') {
      return res.status(403).json({ message: 'Your partner account is not active.' });
    }
    req.partner = partner;
    next();
  } catch (err) {
    console.error('verifyPartner error:', err.message);
    res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
}

// ─── Apply (no commitment at this stage) ──────────────────────────────────────
const applySchema = z.object({
  firstName:  z.string().min(1),
  lastName:   z.string().min(1),
  email:      z.string().email(),
  phone:      z.string().optional(),
  country:    z.string().optional(),
  city:       z.string().optional(),
  motivation: z.string().optional(),
});

router.post('/apply', validate(applySchema), async (req, res) => {
  try {
    const email = req.body.email.toLowerCase();
    const existing = await prisma.partner.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ message: 'An application with this email already exists.' });
    const partner = await prisma.partner.create({ data: { ...req.body, email } });
    try { await emailService.sendPartnerApplicationConfirmation(partner.email, partner.firstName); } catch (e) {
      console.error('Partner confirmation email error (non-fatal):', e.message);
    }
    res.status(201).json({ message: 'Application received. You will receive an email to activate your account after verification.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Me ───────────────────────────────────────────────────────────────────────
router.get('/me', verifyPartner, async (req, res) => {
  const p = req.partner;
  // touch lastLogin (best-effort)
  prisma.partner.update({ where: { id: p.id }, data: { lastLogin: new Date() } }).catch(() => {});
  res.json({
    id: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email,
    phone: p.phone, country: p.country, city: p.city,
    commitmentAmount: p.commitmentAmount, currency: p.currency, frequency: p.frequency,
    commitmentSet: p.commitmentAmount != null && p.frequency != null,
    status: p.status,
  });
});

// ─── Set / update commitment ──────────────────────────────────────────────────
const commitmentSchema = z.object({
  amount:    z.number().positive(),
  currency:  z.enum(['GHS', 'USD', 'GBP', 'EUR']),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
});

router.put('/commitment', verifyPartner, validate(commitmentSchema), async (req, res) => {
  try {
    const { amount, currency, frequency } = req.body;
    const updated = await prisma.partner.update({
      where: { id: req.partner.id },
      data:  { commitmentAmount: amount, currency, frequency, commitmentSetAt: new Date() },
    });
    res.json({
      commitmentAmount: updated.commitmentAmount,
      currency: updated.currency,
      frequency: updated.frequency,
      commitmentSet: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Pay (partner commitment via Paystack — tagged source=PARTNER) ─────────────
const paySchema = z.object({
  method: z.enum(['MTN_MOMO', 'TELECEL', 'AIRTELTIGO', 'BANK_TRANSFER', 'CARD']),
});

router.post('/pay', verifyPartner, validate(paySchema), async (req, res) => {
  try {
    const p = req.partner;
    if (p.commitmentAmount == null) {
      return res.status(400).json({ message: 'Please set your giving commitment first.' });
    }
    const { method } = req.body;

    // Create a pending giving record tagged as a partner payment
    const record = await prisma.givingRecord.create({
      data: {
        name:      `${p.firstName} ${p.lastName}`,
        phone:     p.phone || '000',
        email:     p.email,
        amount:    p.commitmentAmount,
        currency:  'GHS',
        category:  'PASTORAL',
        method,
        status:    'PENDING',
        source:    'PARTNER',
        partnerId: p.id,
      },
    });

    if (['MTN_MOMO', 'TELECEL', 'AIRTELTIGO', 'CARD'].includes(method)) {
      const callbackUrl = `${process.env.CLIENT_URL || 'https://www.hpcglobal.org'}/giving/callback`;
      const init = await paystack.initializePayment({
        amount:       p.commitmentAmount * 100,
        email:        p.email || `${p.phone}@hpcglobal.org`,
        reference:    record.id,
        callback_url: callbackUrl,
        metadata:     { name: record.name, phone: record.phone, source: 'PARTNER', partnerId: p.id, givingRecordId: record.id },
        channels:     method === 'CARD' ? ['card'] : ['mobile_money'],
      });
      return res.json({ url: init.data.authorization_url, reference: record.id });
    }

    // Bank transfer — return account details
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
    res.json({
      reference: record.id,
      bankDetails: {
        bankName:    settings?.bankName,
        bankAccount: settings?.bankAccount,
        bankBranch:  settings?.bankBranch,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Zoom Schedules ───────────────────────────────────────────────────────────
router.get('/zoom-schedules', verifyPartner, async (_req, res) => {
  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const schedules = await prisma.zoomSchedule.findMany({
      where: { isActive: true, scheduledAt: { gte: cutoff } },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(schedules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Messages ─────────────────────────────────────────────────────────────────
router.get('/messages', verifyPartner, async (_req, res) => {
  try {
    const messages = await prisma.partnerMessage.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
    });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
