const router      = require('express').Router();
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const { z }       = require('zod');
const rateLimit   = require('express-rate-limit');

const { validate }   = require('../middleware/validate');
const emailService   = require('../services/email');
const prisma         = require('../lib/prisma');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15 });

// ─── Partner JWT middleware ───────────────────────────────────────────────────
function verifyPartner(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    if (payload.type !== 'partner') return res.status(401).json({ message: 'Unauthorized' });
    req.partner = payload;
    next();
  } catch {
    res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
}

// ─── Apply ────────────────────────────────────────────────────────────────────
const applySchema = z.object({
  firstName:     z.string().min(1),
  lastName:      z.string().min(1),
  email:         z.string().email(),
  phone:         z.string().optional(),
  country:       z.string().optional(),
  city:          z.string().optional(),
  monthlyAmount: z.number().positive(),
  currency:      z.enum(['GHS', 'USD', 'GBP', 'EUR']).default('GHS'),
  motivation:    z.string().optional(),
});

router.post('/apply', validate(applySchema), async (req, res) => {
  try {
    const existing = await prisma.partner.findUnique({ where: { email: req.body.email } });
    if (existing) return res.status(409).json({ message: 'An application with this email already exists.' });
    const partner = await prisma.partner.create({ data: req.body });
    try { await emailService.sendPartnerApplicationConfirmation(partner.email, partner.firstName); } catch (e) {
      console.error('Partner confirmation email error:', e.message);
    }
    res.status(201).json({ message: 'Application received. You will receive your login credentials after verification.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required.' });
  try {
    const partner = await prisma.partner.findUnique({ where: { email } });
    if (!partner || partner.status !== 'APPROVED' || !partner.passwordHash) {
      return res.status(401).json({ message: 'Invalid credentials or account not yet activated.' });
    }
    const valid = await bcrypt.compare(password, partner.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials.' });
    await prisma.partner.update({ where: { id: partner.id }, data: { lastLogin: new Date() } });
    const token = jwt.sign(
      { type: 'partner', id: partner.id, email: partner.email, firstName: partner.firstName, lastName: partner.lastName },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      partner: {
        id: partner.id, firstName: partner.firstName, lastName: partner.lastName,
        email: partner.email, monthlyAmount: partner.monthlyAmount, currency: partner.currency,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Me ───────────────────────────────────────────────────────────────────────
router.get('/me', verifyPartner, async (req, res) => {
  try {
    const partner = await prisma.partner.findUnique({
      where: { id: req.partner.id },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        phone: true, country: true, city: true,
        monthlyAmount: true, currency: true, status: true, accountActivatedAt: true,
      },
    });
    if (!partner) return res.status(404).json({ message: 'Not found' });
    res.json(partner);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Zoom Schedules ───────────────────────────────────────────────────────────
router.get('/zoom-schedules', verifyPartner, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // show meetings up to 2h past
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
router.get('/messages', verifyPartner, async (req, res) => {
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
