/**
 * Recording a tithe payment and sending its acknowledgement — shared by the
 * office's own payment routes (routes/tithes.js) and online giving
 * (services/onlineGiving.js), so a tithe paid on the website lands on the
 * register exactly as one the office types in.
 */
const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const tithe = require('../lib/tithe');
const { sendAcknowledgement } = require('./titheSms');

/** The SMS Template settings, created with the default wording on first use. */
async function titheSettings() {
  try {
    return await prisma.titheSettings.upsert({
      where:  { id: 'singleton' },
      update: {},
      create: { id: 'singleton', smsTemplate: tithe.DEFAULT_SMS_TEMPLATE },
    });
  } catch (err) {
    // Two first-ever reads at once — the giver's page and Paystack's webhook
    // for the same tithe — both try to create the row, and one loses. The
    // row is there now, so read it rather than fail the payment.
    if (err.code === 'P2002') return prisma.titheSettings.findUnique({ where: { id: 'singleton' } });
    throw err;
  }
}

async function churchName() {
  const site = await prisma.siteSettings.findUnique({ where: { id: 'singleton' }, select: { churchName: true } });
  return site?.churchName || 'HPC Global';
}

/**
 * What the browser shows for a payment: the row plus who it was for, and the
 * website gift behind it when it was paid online.
 */
const paymentInclude = {
  tither:       { select: { id: true, number: true, name: true, type: true, spouseName: true, isActive: true } },
  givingRecord: { select: { id: true, method: true, name: true, phone: true, paidAt: true } },
};

const ymd    = (date) => new Date(date).toISOString().slice(0, 10);
const asDate = (s) => new Date(`${s}T00:00:00.000Z`);

// A payment is online exactly when a website gift backs it.
function presentPayment({ givingRecord, ...p }) {
  return {
    ...p,
    paidOn: ymd(p.paidOn),
    smsTo:  p.smsTo ? p.smsTo.split(',').map(tithe.formatPhone) : [],
    online: givingRecord
      ? { giftId: givingRecord.id, method: givingRecord.method, name: givingRecord.name, phone: tithe.formatPhone(givingRecord.phone), paidAt: givingRecord.paidAt }
      : null,
  };
}

/**
 * Why no acknowledgement goes out for a new payment, or null when one should.
 * The office's choice for this payment wins — switching the toggle on is how
 * a text is sent by hand while automatic sending is off.
 */
function smsSkipReason(config, sendSms) {
  const wanted = typeof sendSms === 'boolean' ? sendSms : config.smsEnabled;
  if (wanted) return null;
  return sendSms === false
    ? 'Switched off for this payment.'
    : 'Automatic acknowledgements are switched off under SMS Template.';
}

/**
 * Send (or resend) the acknowledgement and keep the outcome on the payment.
 *
 * Everything that can fail before the text goes out is the caller's to fetch
 * first. Once a text has gone, this does not throw: answering with an error
 * then would have the office record the payment, or press Send, a second time
 * — and text the tither twice. If the outcome cannot be saved it is logged and
 * the payment is answered as it stood.
 */
async function acknowledge(payment, tither, { template, church }) {
  // A resend after a partly failed send finishes the job: the phones the text
  // already reached are not texted again, and stay on the record as reached.
  // A resend of one that went through goes to everyone, as asked.
  const before = payment.smsStatus === 'FAILED' && payment.smsTo ? payment.smsTo.split(',') : [];
  const result = await sendAcknowledgement({ tither, payment, template, church, skip: before });

  const to  = result.status === 'SKIPPED' ? result.to : [...new Set([...result.to, ...before])];
  const sms = { status: result.status, to: to.map(tithe.formatPhone), error: result.error, text: result.text };

  // A resend that did not get through — nothing went (say the phone has since
  // been removed), or Hubtel failed — must not overwrite the record of a text
  // that did go. The office still sees this attempt's outcome in `sms`.
  const keepRecord = (result.status === 'SKIPPED' && (payment.smsStatus === 'SENT' || before.length))
    || (result.status !== 'SENT' && payment.smsStatus === 'SENT');
  if (keepRecord) return { payment: presentPayment(payment), sms };
  // When the text last reached a phone: now, if this attempt reached one.
  const reachedNow = result.to.some((p) => !before.includes(p));

  try {
    const updated = await withDbRetry(() => prisma.tithePayment.update({
      where: { id: payment.id },
      data: {
        smsStatus: result.status,
        smsTo:     to.join(',') || null,
        smsError:  result.error,
        smsSentAt: reachedNow ? new Date() : payment.smsSentAt ?? null,
      },
      include: paymentInclude,
    }), { label: 'tithe SMS outcome' });
    return { payment: presentPayment(updated), sms };
  } catch (err) {
    console.error(`Tithe payment ${payment.id}: the SMS outcome (${result.status}) could not be saved:`, err);
    return { payment: presentPayment(payment), sms };
  }
}

module.exports = {
  titheSettings, churchName, paymentInclude, presentPayment, ymd, asDate, smsSkipReason, acknowledge,
};
