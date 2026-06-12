const router  = require('express').Router();
const { z }   = require('zod');

const { validate }     = require('../middleware/validate');
const paystack = require('../services/paystack');

const prisma = require('../lib/prisma');

const giveSchema = z.object({
  name:        z.string().optional(),
  email:       z.string().email(),
  amount:      z.number().positive(),
  currency:    z.string().default('GHS'),
  category:    z.enum(['TITHE','OFFERING','FIRST_FRUITS','BUILDING_FUND','MISSIONS','PASTORAL','OTHER']),
  method:      z.enum(['MTN_MOMO','TELECEL','AIRTELTIGO','BANK_TRANSFER','CARD']),
  titheNumber: z.string().optional(),
}).refine(
  (d) => ['TITHE', 'OFFERING'].includes(d.category) || !!d.name?.trim(),
  { message: 'Name is required', path: ['name'] }
);

// POST /api/give — initiate payment
router.post('/', validate(giveSchema), async (req, res) => {
  try {
    const { name, email, amount, currency, category, method, titheNumber } = req.body;

    // Create a pending record first
    const record = await prisma.givingRecord.create({
      data: { name, email, amount, currency, category, method, titheNumber, status: 'PENDING' },
    });

    // For Mobile Money — initialise Paystack
    if (['MTN_MOMO', 'TELECEL', 'AIRTELTIGO', 'CARD'].includes(method)) {
      const callbackUrl = `${process.env.CLIENT_URL || 'https://www.hpcglobal.org'}/giving/callback`;
      const init = await paystack.initializePayment({
        amount:       amount * 100, // kobo/pesewas
        email,
        reference:    record.id,
        callback_url: callbackUrl,
        metadata:     { name, category, givingRecordId: record.id },
        channels:     method === 'CARD' ? ['card'] : ['mobile_money'],
      });
      return res.json({ url: init.data.authorization_url, reference: record.id });
    }

    // Bank transfer — try Paystack's bank-transfer channel, fall back to manual details
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
    try {
      const callbackUrl = `${process.env.CLIENT_URL || 'https://www.hpcglobal.org'}/giving/callback`;
      const init = await paystack.initializePayment({
        amount:       amount * 100,
        email,
        reference:    record.id,
        callback_url: callbackUrl,
        metadata:     { name, category, givingRecordId: record.id },
        channels:     ['bank_transfer'],
      });
      if (init?.data?.authorization_url) {
        return res.json({ url: init.data.authorization_url, reference: record.id });
      }
    } catch (bankErr) {
      console.warn('Paystack bank transfer unavailable, using manual details:', bankErr.response?.data?.message || bankErr.message);
    }
    res.json({
      reference: record.id,
      bankDetails: {
        bankName:    settings?.bankName,
        bankAccount: settings?.bankAccount,
        bankBranch:  settings?.bankBranch,
        ...(settings?.bankSwift && { bankSwift: settings.bankSwift }),
        ...(settings?.bankCode  && { bankCode:  settings.bankCode  }),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/give/verify/:ref — payment callback (shared by giving + partner)
router.get('/verify/:ref', async (req, res) => {
  try {
    const { ref } = req.params;
    const result  = await paystack.verifyPayment(ref);
    const status  = result.data.status === 'success' ? 'COMPLETED' : 'FAILED';
    const record  = await prisma.givingRecord.update({
      where: { id: ref },
      data:  { status, reference: result.data.reference },
    });
    res.json({
      status,
      source:   record.source,   // 'GIVING' | 'PARTNER'
      category: record.category,
      amount:   record.amount,
      currency: record.currency,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
