/**
 * Delivery rules for the messages the site sends on its own behalf — the
 * confirmations and office alerts that follow a form submission.
 *
 * On Vercel the function can be frozen as soon as it has responded, so these
 * are awaited before the response rather than left to run after it. That makes
 * two rules matter: every send is bounded, so a hanging provider cannot hold the
 * request up, and every send fails on its own, so one outage does not stop the
 * messages queued behind it.
 */

const prisma = require('./prisma');

// Long enough for a slow provider, short enough that a hanging call does not
// burn the serverless function's whole budget.
const SEND_TIMEOUT_MS = 8000;

function withTimeout(promise, label, ms = SEND_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${ms}ms`), { timedOut: true })), ms).unref?.()
    ),
  ]);
}

/**
 * Keep a failed send where the office will see it — Admin → Delivery Problems —
 * rather than only in Vercel's logs, which nobody reads.
 *
 * Never throws: losing the record of a failure must not become a failure of
 * its own.
 *
 * @param {{channel: 'EMAIL'|'SMS', context: string, label: string, to?: string, error: unknown}} failure
 */
async function recordFailure({ channel, context, label, to, error }) {
  // A send we stopped waiting for may have gone through after all; the
  // office should know that before chasing someone about it.
  const reason = error?.timedOut
    ? `No answer from the provider in time (${error.message}), so it may still have been delivered.`
    : String(error?.message || error || 'unknown error');
  try {
    // Bounded, since a visitor's form is waiting on this: a slow database must
    // not stretch the response past the send it is reporting on.
    await withTimeout(prisma.deliveryFailure.create({
      data: {
        channel,
        context:   String(context).slice(0, 200),
        label:     String(label).slice(0, 100),
        recipient: to ? String(to).slice(0, 200) : null,
        error:     reason.slice(0, 500),
      },
    }), 'recording a delivery failure', 3000);
  } catch (err) {
    console.error('Could not record delivery failure:', err.message);
  }
}

/**
 * Send a set of independent notifications at once.
 *
 * Each job is `[label, send, to]`: `send` starts one email or SMS and returns
 * its promise, and `to` is who it is for, kept with any failure so the office
 * can follow up. Labels name the message the way the office would ("office
 * SMS", "confirmation email"); one containing "SMS" is recorded as SMS, the
 * rest as email. Falsy entries are ignored, so a message that only some
 * submissions get can be written inline:
 *
 *   prayer.email && ['confirmation email', () => emailService.sendPrayerConfirmation(…), prayer.email]
 *
 * Never throws — the record the messages are about is already saved, and a
 * provider outage must not turn that into an error. Failures are logged as
 * "<context>: <label> failed", recorded for Delivery Problems, and reported
 * back so the caller can tell what reached whom. A transport that isn't set
 * up is not recorded per message; the Delivery Problems page says so once.
 *
 * @param {string} context  what the messages are about, e.g. 'Prayer request from Ama'
 * @param {Array<[string, () => Promise<unknown>, string?]>} jobs  falsy entries are skipped
 * @returns {Promise<Object<string, string>>} label → 'sent' | 'not configured' | 'failed'
 */
async function sendNotifications(context, jobs) {
  const result = {};

  await Promise.all(jobs.filter(Boolean).map(([label, send, to]) =>
    // Started inside the chain so a send that throws before it returns a
    // promise is caught like any other failure.
    withTimeout(Promise.resolve().then(() => send()), label)
      // A transport that is not configured returns {skipped:true} rather than
      // throwing; reporting that as "sent" would tell the office a message
      // went out when nothing did.
      .then((r) => { result[label] = r && r.skipped ? 'not configured' : 'sent'; })
      .catch((err) => {
        result[label] = 'failed';
        console.error(`${context}: ${label} failed (non-fatal):`, err.message);
        return recordFailure({ channel: /\bSMS\b/i.test(label) ? 'SMS' : 'EMAIL', context, label, to, error: err });
      })
  ));

  return result;
}

module.exports = { withTimeout, sendNotifications, recordFailure };
