/**
 * Admin → Tithes → Online tithes: tithes paid on the website that could not
 * go on the register by themselves — no tithe number, a number nobody holds,
 * or an archived account — for the office to add to an account or dismiss.
 *
 * Mounted inside routes/tithes.js after its sign-in check, so super admins only.
 *
 * What is wrong with a gift is worked out when the list is read, not stored:
 * once the office adds the missing tither, the row says the number is now on
 * the register.
 */
const router = require('express').Router();
const { z }  = require('zod');

const { validate } = require('../middleware/validate');
const prisma = require('../lib/prisma');
const { withDbRetry, isRetryable } = require('../lib/dbRetry');
const tithe  = require('../lib/tithe');
const { assignOnlineTithe, isGiftId, GiftError } = require('../services/onlineGiving');

const dbStatus  = (err) => (isRetryable(err) ? 503 : 500);
const dbMessage = (err) =>
  (isRetryable(err)
    ? 'The database is busy right now. Please try again in a moment.'
    : 'Server error');

const STATUSES = ['NEEDS_MATCH', 'RECORDED', 'DISMISSED'];

// Settled online tithes from the new Give form. Older tithes, unfinished
// payments and other categories never show here.
const base = { category: 'TITHE', source: 'GIVING', status: 'COMPLETED', titheMonth: { not: null } };

const titherLite = { id: true, number: true, type: true, name: true, spouseName: true, phone: true, spousePhone: true, isActive: true };

const giftSelect = {
  id: true, createdAt: true, paidAt: true, amount: true, currency: true, method: true,
  name: true, email: true, phone: true, titheNumber: true, titheMonth: true,
  titheStatus: true, titheNote: true, titheReviewedBy: true,
  tithePayment: { select: { id: true, month: true, tither: { select: titherLite } } },
};

const byName = (req) => req.user.name || req.user.email || null;

/**
 * The gifts as the office sees them: what is wrong with each, who holds the
 * number given, and who on the register has the giver's phone. Two queries for
 * the whole page, whatever its length.
 */
async function present(gifts) {
  const numbers = [...new Set(gifts.map((g) => tithe.normalizeTitheNumber(g.titheNumber)).filter(Boolean))];
  const phones  = [...new Set(gifts.map((g) => tithe.canonicalPhone(g.phone)).filter(Boolean))];

  const [holders, samePhone] = await withDbRetry(() => Promise.all([
    numbers.length ? prisma.tither.findMany({ where: { number: { in: numbers } }, select: titherLite }) : [],
    phones.length
      ? prisma.tither.findMany({
        where:   { OR: [{ phone: { in: phones } }, { spousePhone: { in: phones } }] },
        select:  titherLite,
        orderBy: [{ isActive: 'desc' }, { number: 'asc' }],
      })
      : [],
  ]), { label: 'online tithes matches' });

  const byNumber = new Map(holders.map((t) => [t.number, t]));

  return gifts.map(({ tithePayment, ...g }) => {
    const number = tithe.normalizeTitheNumber(g.titheNumber);
    const phone  = tithe.canonicalPhone(g.phone);
    const holder = number ? byNumber.get(number) || null : null;

    let issue = null;
    if (!number) issue = 'NO_NUMBER';
    else if (!holder) issue = 'NOT_FOUND';
    else if (!holder.isActive) issue = 'ARCHIVED';
    else issue = 'NOW_ON_REGISTER';
    // Recorded automatically against the number given: nothing was wrong.
    if (tithePayment && holder && tithePayment.tither.id === holder.id && issue === 'NOW_ON_REGISTER') issue = null;

    const suggestions = phone
      ? samePhone.filter((t) => t.phone === phone || t.spousePhone === phone).slice(0, 3)
      : [];

    return {
      ...g,
      phone: tithe.formatPhone(g.phone),
      issue,
      holder,
      suggestions,
      payment: tithePayment ? { id: tithePayment.id, month: tithePayment.month, tither: tithePayment.tither } : null,
    };
  });
}

async function findGift(id) {
  if (!isGiftId(id)) return null;
  return withDbRetry(() => prisma.givingRecord.findFirst({ where: { id, ...base }, select: giftSelect }), { label: 'online tithe lookup' });
}

// ─── Lists ────────────────────────────────────────────────────────────────────

router.get('/count', async (_req, res) => {
  try {
    const needsMatch = await withDbRetry(
      () => prisma.givingRecord.count({ where: { ...base, titheStatus: 'NEEDS_MATCH' } }),
      { label: 'online tithes count' },
    );
    res.json({ needsMatch });
  } catch (err) {
    console.error('Online tithes count error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

router.get('/', async (req, res) => {
  try {
    const status = STATUSES.includes(req.query.status) ? req.query.status : 'NEEDS_MATCH';
    const take   = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const skip   = (Math.max(Number(req.query.page) || 1, 1) - 1) * take;
    const where  = { ...base, titheStatus: status };
    // The waiting list is worked through oldest first; the others are history.
    const dir    = status === 'NEEDS_MATCH' ? 'asc' : 'desc';

    const [rows, total, sum] = await withDbRetry(() => Promise.all([
      prisma.givingRecord.findMany({ where, skip, take, orderBy: [{ paidAt: dir }, { createdAt: dir }], select: giftSelect }),
      prisma.givingRecord.count({ where }),
      prisma.givingRecord.aggregate({ where, _sum: { amount: true } }),
    ]), { label: 'online tithes list' });

    res.json({ gifts: await present(rows), total, sum: sum._sum.amount ?? 0 });
  } catch (err) {
    console.error('Online tithes list error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// ─── Acting on one ────────────────────────────────────────────────────────────

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

const assignSchema = z.object({
  titherId: z.string({ error: 'Please choose who the tithe is from' }).min(1, 'Please choose who the tithe is from'),
  month:    z.string({ error: 'Please choose the month the tithe is for' }).regex(monthRe, 'Please choose the month the tithe is for'),
  note:     z.preprocess((v) => (v == null ? '' : v), z.string().trim().max(300, 'Keep that under 300 characters')),
  // Left out, the SMS Template setting decides.
  sendSms:  z.boolean().optional(),
});

router.post('/:id/assign', validate(assignSchema), async (req, res) => {
  if (!isGiftId(req.params.id)) return res.status(404).json({ message: 'That gift no longer exists.' });
  try {
    res.status(201).json(await assignOnlineTithe(req.params.id, req.body, byName(req)));
  } catch (err) {
    if (err instanceof GiftError) return res.status(err.status).json({ message: err.message });
    console.error('Online tithe assign error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

const dismissSchema = z.object({
  note: z.preprocess((v) => (v == null ? '' : v), z.string().trim()
    .min(1, 'Please say why it is being dismissed.')
    .max(300, 'Keep the reason under 300 characters')),
});

/**
 * Move a gift from one review status to another, if it is still where the
 * page last saw it — someone else may have dealt with it since.
 */
async function move(req, res, { from, data, wrongState }) {
  try {
    const { count } = await withDbRetry(() => prisma.givingRecord.updateMany({
      where: { id: req.params.id, ...base, titheStatus: from },
      data,
    }), { label: 'online tithe review' });
    const gift = await findGift(req.params.id);
    if (!gift) return res.status(404).json({ message: 'That gift no longer exists.' });
    if (!count) return res.status(409).json({ message: wrongState(gift) });
    const [shown] = await present([gift]);
    res.json({ gift: shown });
  } catch (err) {
    console.error('Online tithe review error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
}

router.post('/:id/dismiss', validate(dismissSchema), (req, res) => {
  if (!isGiftId(req.params.id)) return res.status(404).json({ message: 'That gift no longer exists.' });
  return move(req, res, {
    from: 'NEEDS_MATCH',
    data: { titheStatus: 'DISMISSED', titheNote: req.body.note, titheReviewedBy: byName(req) },
    wrongState: (g) => (g.titheStatus === 'RECORDED'
      ? 'This online tithe has already been added to the register.'
      : 'This online tithe has already been dismissed.'),
  });
});

router.post('/:id/restore', (req, res) => {
  if (!isGiftId(req.params.id)) return res.status(404).json({ message: 'That gift no longer exists.' });
  return move(req, res, {
    from: 'DISMISSED',
    data: { titheStatus: 'NEEDS_MATCH', titheNote: null, titheReviewedBy: byName(req) },
    wrongState: (g) => (g.titheStatus === 'RECORDED'
      ? 'This online tithe has already been added to the register.'
      : 'This online tithe is not dismissed, so there is nothing to restore.'),
  });
});

module.exports = router;
