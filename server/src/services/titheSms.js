const { sendSms, smsTransportName } = require('./sms');
const { withTimeout, recordFailure } = require('../lib/notify');
const { smsRecipients, acknowledgementText, canonicalPhone, formatPhone, displayName } = require('../lib/tithe');

/**
 * Text the tither — both of them, for a couple — that their payment has been
 * received.
 *
 * Never throws: the payment is already saved, and a provider outage must not
 * turn that into an error. Each failure is recorded for Admin → Delivery
 * Problems and summarised in the result, which the route keeps on the payment
 * so the office can see at a glance who was told and who wasn't.
 *
 * `skip` lists phones (stored form) that already have this text from an
 * earlier send that only partly went through: they are not texted again, but
 * count as reached, so a resend finishes the job instead of repeating it.
 *
 * @param {{tither: object, payment: object, template: string, church: string, skip?: string[]}} options
 * @returns {Promise<{status: 'SENT'|'FAILED'|'SKIPPED', to: string[], error: string|null, text: string}>}
 */
async function sendAcknowledgement({ tither, payment, template, church, skip = [] }) {
  const to   = smsRecipients(tither);
  const text = acknowledgementText(template, tither, payment, { church });

  if (!to.length) return { status: 'SKIPPED', to, error: 'No phone number on the account.', text };
  if (smsTransportName() === 'none') {
    // `to` is who has the text, and nobody does.
    return { status: 'SKIPPED', to: [], error: 'SMS is not set up — the Hubtel credentials are missing in Vercel.', text };
  }

  const context = `Tithe from ${displayName(tither)} (${tither.number})`;
  const own     = canonicalPhone(tither.phone);
  const already = new Set(skip);
  // One slot per recipient, filled as each reply arrives, so the summary below
  // reads in recipient order (account holder, then spouse) whichever Hubtel
  // answers first.
  const errors  = to.map(() => null);

  await Promise.all(to.map((phone, i) => {
    if (already.has(phone)) return null;
    const label = phone === own ? 'acknowledgement SMS' : 'acknowledgement SMS (spouse)';
    return withTimeout(sendSms(phone, text), label)
      .catch(async (err) => {
        errors[i] = `${formatPhone(phone)}: ${err.timedOut
          ? 'no answer from Hubtel in time, so it may still have been delivered'
          : err.message}`;
        console.error(`${context}: ${label} failed (non-fatal):`, err.message);
        await recordFailure({ channel: 'SMS', context, label, to: phone, error: err });
      });
  }));

  // `to` is who has the text. A couple's text can reach one phone and not the
  // other; the error names only the number that missed out.
  if (errors.some(Boolean)) {
    return {
      status: 'FAILED',
      to:     to.filter((_, i) => !errors[i]),
      error:  errors.filter(Boolean).join(' | ').slice(0, 500),
      text,
    };
  }
  return { status: 'SENT', to, error: null, text };
}

/**
 * The tither as the acknowledgement should see them for a tithe paid online:
 * the phones on the account when it has any, otherwise the phone the giver
 * typed on the Give page — so someone the office never took a number for
 * still hears their tithe arrived. Never both: a giver's number that is not
 * on the account may be a typo that reached the wrong person's tithe.
 */
function withFallbackPhone(tither, phone) {
  if (smsRecipients(tither).length) return tither;
  const fallback = canonicalPhone(phone);
  return fallback ? { ...tither, phone: fallback } : tither;
}

module.exports = { sendAcknowledgement, withFallbackPhone };
