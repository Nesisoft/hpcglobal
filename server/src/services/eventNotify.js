const emailService = require('./email');
const { sendSms }  = require('./sms');
const { escapeHtml } = require('../lib/html');

/**
 * Composes and delivers the messages an event sends to a registrant.
 *
 * Transport lives in ./email and ./sms; this module owns what the church
 * actually says and the rules around delivery — bounded, never fatal, and
 * reported back so the caller can tell what reached whom.
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
 * Event times are free text and admins are told to type "9:00 AM GMT", so the
 * zone is appended only when it is missing. Mirrors withGmt in the client's
 * utils/format.js.
 */
function withGmt(time) {
  const value = (time ?? '').trim();
  if (!value) return '';
  return /\bgmt\b/i.test(value) ? value : `${value} GMT`;
}

function eventDate(event) {
  try {
    return new Date(event.startDate).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return '';
  }
}

/** "Saturday 17 October 2026 at 5:00 PM GMT" */
function eventWhen(event) {
  return [eventDate(event), withGmt(event.timeGmt)].filter(Boolean).join(' at ');
}

function eventWhere(event) {
  if (event.isOnline) return event.joinLink ? `Online — ${event.joinLink}` : 'Online';
  return event.venue || '';
}

/** Facts every message about an event repeats. */
function eventFacts(event) {
  return { when: eventWhen(event), where: eventWhere(event) };
}

// ─── Registration confirmation ────────────────────────────────────────────────

function confirmationHtml(event, rsvp) {
  const { when, where } = eventFacts(event);
  const rows = [
    ['When',  when],
    ['Where', where],
    ...(event.isOnline && rsvp.attendance ? [['Attending', rsvp.attendance === 'online' ? 'Online' : 'In person']] : []),
  ].filter(([, v]) => v);

  return `
    <p>Dear ${escapeHtml(rsvp.name)},</p>
    <p>Your place at <strong>${escapeHtml(event.title)}</strong> is reserved. We look forward to seeing you.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px">
      ${rows.map(([label, value]) => `
        <tr>
          <td style="padding:4px 16px 4px 0;color:#6B6B8A">${escapeHtml(label)}</td>
          <td style="padding:4px 0;color:#1A0E30"><strong>${escapeHtml(value)}</strong></td>
        </tr>`).join('')}
    </table>
    <p>If your plans change, simply reply to this email to let us know.</p>
    <p>God bless you.</p>
    <p><strong>HPC Global — Hopepress Chapel</strong><br>Klagon Junction, Accra, Ghana</p>
  `;
}

function confirmationSms(event, rsvp) {
  const { when } = eventFacts(event);
  const firstName = String(rsvp.name || '').trim().split(/\s+/)[0] || 'Friend';
  return `HPC Global: Hi ${firstName}, your place at "${event.title}" is reserved. ${when}. See you there!`;
}

/**
 * Tell a new registrant their place is reserved.
 *
 * Never throws — a provider outage must not lose a registration that is already
 * saved. Returns what happened on each channel so the caller can surface it.
 *
 * @returns {Promise<{email: string, sms: string}>} each 'sent' | 'failed' | 'skipped'
 */
async function notifyRegistrant(event, rsvp) {
  const result = { email: 'skipped', sms: 'skipped' };

  const jobs = [];
  if (rsvp.email) {
    jobs.push(
      withTimeout(
        emailService.sendEventRsvpConfirmation({
          to:      rsvp.email,
          subject: `Your place is reserved — ${event.title}`,
          html:    confirmationHtml(event, rsvp),
          // One confirmation per registration, however many times this runs.
          idempotencyKey: `rsvp-${rsvp.id}`,
        }),
        'RSVP confirmation email'
      )
        // A transport that is not configured returns {skipped:true} rather
        // than throwing; reporting that as "sent" would tell the office a
        // message went out when nothing did.
        .then((r) => { result.email = r && r.skipped ? 'not configured' : 'sent'; })
        .catch((err) => {
          result.email = 'failed';
          console.error('RSVP confirmation email failed:', err.message);
        })
    );
  }

  if (rsvp.phone) {
    jobs.push(
      withTimeout(sendSms(rsvp.phone, confirmationSms(event, rsvp)), 'RSVP confirmation SMS')
        .then((r) => { result.sms = r && r.skipped ? 'not configured' : 'sent'; })
        .catch((err) => {
          result.sms = 'failed';
          console.error('RSVP confirmation SMS failed:', err.message);
        })
    );
  }

  await Promise.all(jobs);
  return result;
}

module.exports = { notifyRegistrant, eventFacts, eventWhen, eventWhere, withGmt, confirmationSms };
