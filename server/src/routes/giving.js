const router  = require('express').Router();
const { z }   = require('zod');

const { validate }     = require('../middleware/validate');
const paystack = require('../services/paystack');
const { settleGiving, isOnlineTithe } = require('../services/onlineGiving');
const tithe = require('../lib/tithe');

const prisma = require('../lib/prisma');

const MAX_AMOUNT = 10_000_000;

// A field the form may leave out, or send blank.
const optionalText = (max) => z.preprocess((v) => (v == null ? '' : v), z.string().trim().max(max, `Keep that under ${max} characters`)).optional();

const giveSchema = z.object({
  name:        optionalText(120),
  email:       z.string({ error: 'Please enter your email address' }).trim().email('Please enter a valid email address').max(200),
  amount:      z.number({ error: 'Please enter the amount' })
    .positive('The amount must be more than zero')
    .max(MAX_AMOUNT, 'That amount is too large')
    .transform((n) => Math.round(n * 100) / 100)
    // 0.004 is more than zero but rounds to nothing.
    .refine((n) => n > 0, 'The amount must be more than zero'),
  category:    z.enum(['TITHE','OFFERING','FIRST_FRUITS','BUILDING_FUND','MISSIONS','PASTORAL','OTHER']),
  method:      z.enum(['MTN_MOMO','TELECEL','AIRTELTIGO','BANK_TRANSFER','CARD']),
  phone:       optionalText(40),
  titheMonth:  optionalText(20),
  titheNumber: optionalText(40),
}).refine(
  (d) => ['TITHE', 'OFFERING'].includes(d.category) || !!d.name,
  { message: 'Name is required', path: ['name'] }
);

const monthRe = /^(\d{4})-(0[1-9]|1[0-2])$/;
const monthIndex = (year, month) => year * 12 + (month - 1);

/**
 * Whether a tithe may be for this month. The form offers twelve months back
 * to two ahead; one more each way allows for a page left open across the
 * turn of a month.
 */
function allowedTitheMonth(value) {
  const m = monthRe.exec(String(value));
  if (!m) return false;
  const now   = new Date();
  const index = monthIndex(Number(m[1]), Number(m[2]));
  const today = monthIndex(now.getUTCFullYear(), now.getUTCMonth() + 1);
  return index >= today - 13 && index <= today + 3;
}

/**
 * The tithe details in their stored form, or the field the giver has to fix.
 * The phone is what matches a tithe to the giver when the number cannot, so
 * it is required; the tithe number is not — plenty of givers don't know it.
 */
function titheDetails({ phone, titheMonth, titheNumber }) {
  if (!phone) return { field: 'phone', message: 'Please enter your phone number.' };
  const stored = tithe.canonicalPhone(phone);
  if (!stored) return { field: 'phone', message: "That phone number doesn't look right. Enter it like 024 412 3456, or with the country code (+233…)." };
  if (!allowedTitheMonth(titheMonth)) return { field: 'titheMonth', message: 'Please choose the month this tithe is for.' };
  let number = null;
  if (titheNumber) {
    number = tithe.normalizeTitheNumber(titheNumber);
    if (!number) return { field: 'titheNumber', message: `"${titheNumber}" isn't a tithe number. Tithe numbers look like HPC021 — or leave it blank.` };
  }
  return { data: { phone: stored, titheMonth, titheNumber: number } };
}

const callbackUrl = () => `${process.env.CLIENT_URL || 'https://www.hpcglobal.org'}/giving/callback`;

// POST /api/give — initiate payment
router.post('/', validate(giveSchema), async (req, res) => {
  const { name, email, amount, category, method } = req.body;

  // Other categories keep none of the tithe details, whatever was sent.
  let extra = { phone: null, titheMonth: null, titheNumber: null };
  if (category === 'TITHE') {
    const { data, field, message } = titheDetails(req.body);
    if (field) return res.status(400).json({ message, field });
    extra = data;
  }

  try {
    // Create a pending record first
    const record = await prisma.givingRecord.create({
      data: { name: name || null, email, amount, currency: 'GHS', category, method, ...extra, status: 'PENDING' },
    });

    const metadata = {
      name, category, givingRecordId: record.id,
      ...(category === 'TITHE' && { titheNumber: extra.titheNumber, titheMonth: extra.titheMonth }),
    };

    // For Mobile Money — initialise Paystack
    if (['MTN_MOMO', 'TELECEL', 'AIRTELTIGO', 'CARD'].includes(method)) {
      const init = await paystack.initializePayment({
        amount:       amount * 100, // pesewas; paystack.js rounds
        email,
        reference:    record.id,
        callback_url: callbackUrl(),
        metadata,
        channels:     method === 'CARD' ? ['card'] : ['mobile_money'],
      });
      return res.json({ url: init.data.authorization_url, reference: record.id });
    }

    // Bank transfer — try Paystack's bank-transfer channel, fall back to manual details
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
    try {
      const init = await paystack.initializePayment({
        amount:       amount * 100,
        email,
        reference:    record.id,
        callback_url: callbackUrl(),
        metadata,
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

// GET /api/give/verify/:ref — payment callback (shared by giving + partner).
// Public, so it says nothing about anyone: not the tither's name, not whether
// an account is archived — only whether this gift went on the register.
router.get('/verify/:ref', async (req, res) => {
  try {
    const result = await settleGiving(req.params.ref);
    if (result.notFound) return res.status(404).json({ message: 'We could not find that payment.' });

    const { record, stage } = result;
    // Once on the register, what was recorded — which may differ from what
    // the giver typed if the office matched it to another number or month.
    const recorded = record.titheStatus === 'RECORDED' ? record.tithePayment : null;
    res.json({
      status:   record.status,
      ...(stage && { stage }),
      source:   record.source,   // 'GIVING' | 'PARTNER'
      category: record.category,
      amount:   record.amount,
      currency: record.currency,
      tithe:    isOnlineTithe(record)
        ? {
            month:    recorded?.month ?? record.titheMonth,
            number:   recorded?.tither?.number ?? (record.titheNumber || null),
            recorded: record.titheStatus === 'RECORDED',
          }
        : null,
    });
  } catch (err) {
    console.error('Giving verify error:', err);
    res.status(502).json({ message: "We couldn't confirm your payment just now. Please try again in a moment." });
  }
});

module.exports = router;
