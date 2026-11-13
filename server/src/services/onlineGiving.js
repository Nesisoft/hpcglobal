/**
 * Settling a gift made on the Give page, and putting online tithes on the
 * tithe register.
 *
 * A gift is settled from two places that can arrive together: the giver's
 * browser coming back from Paystack (GET /api/give/verify/:ref) and Paystack's
 * own webhook. Both end up here, and the gift is claimed with a conditional
 * update, so whichever comes first does the work and the other finds it done —
 * one payment on the register and one SMS, however they race.
 *
 * An online tithe whose tithe number belongs to an active tither is recorded
 * for the month the giver chose, as if the office had typed it in. Anything
 * else (no number, a number nobody holds, an archived account) waits under
 * Admin → Tithes → Online tithes for the office to add or dismiss.
 */
const prisma   = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const tithe    = require('../lib/tithe');
const paystack = require('./paystack');
const { withFallbackPhone } = require('./titheSms');
const {
  titheSettings, churchName, paymentInclude, presentPayment, ymd, asDate, smsSkipReason, acknowledge,
} = require('./tithePayments');

// Every gift's id is a UUID and is the Paystack reference. Anything else is
// not ours, and is answered without asking Paystack or the database.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isGiftId = (ref) => UUID_RE.test(String(ref ?? ''));

// One connection per function instance: a transaction must not wait long for
// it, and must not hold it for long either.
const TX_OPTIONS = { maxWait: 10000, timeout: 15000 };

const METHOD_LABELS = {
  MTN_MOMO:      'MTN MoMo',
  TELECEL:       'Telecel',
  AIRTELTIGO:    'AirtelTigo',
  BANK_TRANSFER: 'Bank Transfer',
  CARD:          'Card',
};

/** A tithe given through the new Give form — the only gifts matched to the register. */
const isOnlineTithe = (r) => r.category === 'TITHE' && r.source === 'GIVING' && !!r.titheMonth;

/**
 * The note on a payment made from a gift: how it was paid and from which
 * phone, and whether that phone is one of the account's. A giver who mistypes
 * their tithe number and lands on someone else's account shows up here.
 */
function onlineNote(gift, tither) {
  let note = `Paid online (${METHOD_LABELS[gift.method] || gift.method})`;
  const phone = tithe.canonicalPhone(gift.phone);
  if (phone) {
    note += ` from ${tithe.formatPhone(phone)}`;
    const own = [tither.phone, tither.spousePhone].map(tithe.canonicalPhone).filter(Boolean);
    if (!own.includes(phone)) note += ' — not a number on this account';
  }
  return note;
}

/** The day a gift was paid, as the date-only value a payment stores (UTC). */
const paidOnOf = (gift) => asDate(ymd(gift.paidAt || gift.createdAt));

// With the payment it became, if any: the office may have put it on another
// account or month than the giver typed, and the thank-you page should say
// what was actually recorded.
const reload = (id) => withDbRetry(() => prisma.givingRecord.findUnique({
  where: { id },
  include: { tithePayment: { select: { month: true, tither: { select: { number: true } } } } },
}), { label: 'gift reload' });

/** An error with the HTTP status a route should answer with. */
class GiftError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Ask Paystack about a gift and act on the answer.
 *
 * @returns {Promise<{notFound: true} | {record: object, stage?: string}>}
 *   `stage` is set while the payment is unfinished: Paystack's own status
 *   ('ongoing', 'abandoned' …) or 'mismatch' when what was paid does not
 *   match the gift. Throws when the database or Paystack cannot be reached,
 *   so the caller can ask to be tried again.
 */
async function settleGiving(reference) {
  if (!isGiftId(reference)) return { notFound: true };
  const id = String(reference);

  const record = await reload(id);
  if (!record) return { notFound: true };
  if (record.status === 'COMPLETED') return { record };

  let data;
  try {
    ({ data } = await paystack.verifyPayment(id));
  } catch (err) {
    // 400/404 is Paystack's "Transaction reference not found": nothing to
    // tell us (a bank transfer given manually, say, which it never saw).
    // Anything else — 429 rate limiting, 401/403, 5xx — says nothing about
    // the payment, so it is thrown: the webhook then answers 500 and Paystack
    // tries again, rather than a paid gift being left pending for good.
    const status = err.response?.status;
    if (status === 400 || status === 404) {
      console.warn(`Gift ${id}: Paystack has no transaction for it (${status}: ${err.response?.data?.message || err.message}).`);
      return { record };
    }
    throw err;
  }
  if (!data || typeof data !== 'object') throw new Error(`Gift ${id}: Paystack's answer had no transaction in it.`);

  if (data.status !== 'success') {
    if (data.status === 'failed' || data.status === 'reversed') {
      await withDbRetry(() => prisma.givingRecord.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'FAILED' } }), { label: 'gift failed' });
      return { record: await reload(id) };
    }
    // Still going: the giver may not have approved the prompt on their phone
    // yet. Leave it PENDING; the webhook settles it when it finishes.
    return { record, stage: String(data.status || 'unknown') };
  }

  // Paystack fees passed on to the giver are on top of what they asked to
  // give, so the amount may be more but never less.
  const expected = Math.round(record.amount * 100);
  const paid     = Number(data.requested_amount ?? data.amount);
  if (data.reference !== record.id || data.currency !== 'GHS' || !(paid >= expected)) {
    console.error(`Gift ${id}: Paystack reports a payment that does not match the gift — left as it is for a person to check.`, {
      reference: data.reference, currency: data.currency, amount: data.amount, requested_amount: data.requested_amount, expected,
    });
    return { record, stage: 'mismatch' };
  }

  const online = isOnlineTithe(record);
  // Read before the transaction: there is one connection per function
  // instance, and the transaction holds it.
  let config = null;
  let church = null;
  let skip   = null;
  if (online) {
    [config, church] = await withDbRetry(() => Promise.all([titheSettings(), churchName()]), { label: 'online tithe settings' });
    skip = smsSkipReason(config);
  }

  const confirmed = new Date(data.paid_at || Date.now());
  const paidAt    = Number.isNaN(confirmed.getTime()) ? new Date() : confirmed;

  const outcome = await withDbRetry(() => prisma.$transaction(async (db) => {
    // Whose tithe it is, decided before the claim so the claim can say.
    let tither = null;
    if (online) {
      const number = tithe.normalizeTitheNumber(record.titheNumber);
      if (number) tither = await db.tither.findUnique({ where: { number } });
    }
    const recordIt = Boolean(tither?.isActive);

    const claimed = await db.givingRecord.updateMany({
      where: { id, status: { in: ['PENDING', 'FAILED'] } },
      data: {
        status: 'COMPLETED', paidAt, reference: data.reference,
        ...(online && { titheStatus: recordIt ? 'RECORDED' : 'NEEDS_MATCH' }),
      },
    });
    // Someone else (the webhook, or the giver's other tab) settled it first.
    if (!claimed.count || !recordIt) return null;

    const gift    = { ...record, paidAt };
    const payment = await db.tithePayment.create({
      data: {
        titherId:       tither.id,
        amount:         record.amount,
        currency:       record.currency,
        month:          record.titheMonth,
        paidOn:         paidOnOf(gift),
        recordedBy:     'Online giving',
        note:           onlineNote(gift, tither),
        givingRecordId: id,
        ...(skip && { smsStatus: 'SKIPPED', smsError: skip }),
      },
      include: paymentInclude,
    });
    return { payment, tither };
  }, TX_OPTIONS), { label: 'settle gift' });

  // Sent before answering — on Vercel nothing runs after the response.
  if (outcome && !skip) {
    // Only to the phones on the account. The phone typed on the give page is
    // anyone's: texting it would tell a stranger a member's name and tithe
    // number for the price of a small gift. (The office, having checked who
    // paid, may text it when adding the tithe by hand.)
    await acknowledge(outcome.payment, outcome.tither, { template: config.smsTemplate, church });
  }
  return { record: await reload(id) };
}

/** Why a gift can no longer be added to the register, as the office reads it. */
function notWaiting(gift) {
  if (gift.titheStatus === 'RECORDED')  return 'This online tithe has already been added to the register.';
  if (gift.titheStatus === 'DISMISSED') return 'This online tithe was dismissed. Restore it first.';
  return 'This gift is not an online tithe waiting to be added to the register.';
}

/**
 * The office adding a waiting online tithe to a tither's account. The amount
 * and the day come from the gift; the month is the office's to confirm.
 *
 * @returns {Promise<{payment: object, sms: object}>} as POST /payments answers
 * @throws {GiftError} 404 / 409 with a message for the office
 */
async function assignOnlineTithe(giftId, { titherId, month, note, sendSms }, by) {
  const [gift, tither] = await withDbRetry(() => Promise.all([
    prisma.givingRecord.findUnique({ where: { id: String(giftId) } }),
    prisma.tither.findUnique({ where: { id: String(titherId) } }),
  ]), { label: 'online tithe assign lookup' });

  if (!gift) throw new GiftError(404, 'That gift no longer exists.');
  if (!isOnlineTithe(gift) || gift.status !== 'COMPLETED' || gift.titheStatus !== 'NEEDS_MATCH') throw new GiftError(409, notWaiting(gift));
  if (!tither) throw new GiftError(404, 'That tither no longer exists.');
  if (!tither.isActive) throw new GiftError(409, `${tithe.displayName(tither)}'s account is archived. Restore it first, then record the payment.`);

  // Read before the payment is saved: a failure after it would answer an
  // error for a payment that is in fact recorded, inviting a second one.
  const [config, church] = await withDbRetry(() => Promise.all([titheSettings(), churchName()]), { label: 'online tithe settings' });
  const reason = smsSkipReason(config, sendSms);

  let payment;
  try {
    payment = await withDbRetry(() => prisma.$transaction(async (db) => {
      const claimed = await db.givingRecord.updateMany({
        where: { id: gift.id, status: 'COMPLETED', titheStatus: 'NEEDS_MATCH' },
        data:  { titheStatus: 'RECORDED' },
      });
      if (!claimed.count) return null;
      return db.tithePayment.create({
        data: {
          titherId:       tither.id,
          amount:         gift.amount,
          currency:       gift.currency,
          month,
          paidOn:         paidOnOf(gift),
          note:           note || onlineNote(gift, tither),
          recordedBy:     by || null,
          givingRecordId: gift.id,
          ...(reason && { smsStatus: 'SKIPPED', smsError: reason }),
        },
        include: paymentInclude,
      });
    }, TX_OPTIONS), { label: 'online tithe assign' });
  } catch (err) {
    // The tither was deleted in the moment between the check and the save.
    if (err.code === 'P2003') throw new GiftError(404, 'That tither no longer exists.');
    throw err;
  }

  if (!payment) {
    // Someone else added or dismissed it in the meantime.
    const now = await reload(gift.id);
    throw new GiftError(409, now ? notWaiting(now) : 'That gift no longer exists.');
  }

  if (reason) return { payment: presentPayment(payment), sms: { status: 'SKIPPED', to: [], error: reason, text: null } };
  return acknowledge(payment, withFallbackPhone(tither, gift.phone), { template: config.smsTemplate, church });
}

module.exports = { isGiftId, isOnlineTithe, onlineNote, settleGiving, assignOnlineTithe, GiftError, METHOD_LABELS };
