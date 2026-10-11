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

// Long enough for a slow provider, short enough that a hanging call does not
// burn the serverless function's whole budget.
const SEND_TIMEOUT_MS = 8000;

function withTimeout(promise, label, ms = SEND_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms).unref?.()
    ),
  ]);
}

/**
 * Send a set of independent notifications at once.
 *
 * Each job is `[label, send]`, where `send` starts one email or SMS and returns
 * its promise. Falsy entries are ignored, so a message that only some
 * submissions get can be written inline:
 *
 *   prayer.email && ['confirmation email', () => emailService.sendPrayerConfirmation(…)]
 *
 * Never throws — the record the messages are about is already saved, and a
 * provider outage must not turn that into an error. Failures are logged as
 * "<context>: <label> failed" and reported back so the caller can tell what
 * reached whom.
 *
 * @param {string} context  what the messages are about, e.g. 'Prayer request'
 * @param {Array<[string, () => Promise<unknown>]>} jobs  falsy entries are skipped
 * @returns {Promise<Object<string, string>>} label → 'sent' | 'not configured' | 'failed'
 */
async function sendNotifications(context, jobs) {
  const result = {};

  await Promise.all(jobs.filter(Boolean).map(([label, send]) =>
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
      })
  ));

  return result;
}

module.exports = { withTimeout, sendNotifications };
