const router  = require('express').Router();
const { z }   = require('zod');

const { validate }     = require('../middleware/validate');
const paystack = require('../services/paystack');

const prisma = require('../lib/prisma');

const giveSchema = z.object({
  name:     z.string().min(1),
  phone:    z.string().min(1),
  email:    z.string().email().optional(),
  amount:   z.number().positive(),
  currency: z.string().default('GHS'),
  category: z.enum(['TITHE','OFFERING','FIRST_FRUITS','BUILDING_FUND','MISSIONS','PASTORAL','OTHER']),
  method:   z.enum(['MTN_MOMO','TELECEL','AIRTELTIGO','BANK_TRANSFER','CARD']),
});

// POST /api/give — initiate payment
router.post('/', validate(giveSchema), async (req, res) => {
  try {
    const { name, phone, email, amount, currency, category, method } = req.body;

    // Create a pending record first
    const record = await prisma.givingRecord.create({
      data: { name, phone, email, amount, currency, category, method, status: 'PENDING' },
    });

    // For Mobile Money — initialise Paystack
    if (['MTN_MOMO', 'TELECEL', 'AIRTELTIGO', 'CARD'].includes(method)) {
      const callbackUrl = `${process.env.CLIENT_URL || 'https://www.hpcglobal.org'}/giving/callback`;
      const init = await paystack.initializePayment({
        amount:       amount * 100, // kobo/pesewas
        email:        email || `${phone}@hpcglobal.org`,
        reference:    record.id,
        callback_url: callbackUrl,
        metadata:     { name, phone, category, givingRecordId: record.id },
        channels:     method === 'CARD' ? ['card'] : ['mobile_money'],
      });
      return res.json({ url: init.data.authorization_url, reference: record.id });
    }

    // Bank transfer — just return account details
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
    res.json({
      reference: record.id,
      bankDetails: {
        bankName:      settings?.bankName,
        bankAccount:   settings?.bankAccount,
        bankBranch:    settings?.bankBranch,
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
