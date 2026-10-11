const prisma = require('../lib/prisma');
const { escapeHtml } = require('../lib/html');
const { eventFacts } = require('./eventNotify');
const {
  sendMail, sendBatchViaResend, emailTransportName, RESEND_BATCH_MAX,
} = require('./email');
const {
  sendBulkSms, normalizePhone, smsSegments, smsTransportName,
} = require('./sms');

/**
 * Bulk messages from an event to the people registered for it.
 *
 * Two things shape this module.
 *
 * It runs inside a serverless function with a hard wall-clock limit, and a
 * congregation can be larger than one invocation can get through. So sending
 * is chunked, bounded by a time budget, and records how far it got. Running
 * out of time leaves the campaign PARTIAL with a cursor, and resuming carries
 * on from there — restarting instead would message everyone a second time,
 * which is the one outcome worse than a slow send.
 *
 * And delivery failures are normal here, not exceptional: these addresses and
 * phone numbers were typed by the public into a registration form, so some of
 * them are wrong. One bad address must never stop the other nine hundred, so
 * failures are collected and reported rather than thrown.
 */

// Leaves room to write the result row before the platform kills the function.
// vercel.json raises api/index.js to maxDuration 60, which is the ceiling on
// Vercel's Hobby plan; the default without it is 10s, far too short for a send
// of any size. Stopping at 45 means a cut-short run still gets its cursor
// saved, which is the whole point of having one. Lower it if the deployment's
// limit is lower.
const TIME_BUDGET_MS = Number(process.env.CAMPAIGN_TIME_BUDGET_MS) || 45_000;

// One Hubtel call carries the whole congregation comfortably; chunking is to
// bound the request body, not to work around a documented cap.
const SMS_CHUNK = 500;

/** Registrants in a stable order, so a cursor means the same thing on resume. */
const RECIPIENT_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }];

function audienceWhere(eventId, audience) {
  const attendance =
    audience === 'IN_PERSON' ? 'in-person'
      : audience === 'ONLINE' ? 'online'
        : null;
  return { eventId, ...(attendance ? { attendance } : {}) };
}

/**
 * Who this campaign would reach, split by channel.
 *
 * Email and phone are each optional on a registration, so the two lists are
 * different people, not the same people twice. Addresses are de-duplicated:
 * a household that registered three times should get one email, not three.
 */
async function resolveRecipients(eventId, audience) {
  const rsvps = await prisma.eventRsvp.findMany({
    where:   audienceWhere(eventId, audience),
    orderBy: RECIPIENT_ORDER,
    select:  { id: true, name: true, email: true, phone: true },
  });

  const emails = [];
  const seenEmail = new Set();
  const phones = [];
  const seenPhone = new Set();

  for (const r of rsvps) {
    const email = (r.email || '').trim().toLowerCase();
    if (email && !seenEmail.has(email)) {
      seenEmail.add(email);
      emails.push({ name: r.name, email });
    }
    // De-duplicate on the normalised number so 0244… and +233244… count once.
    const normalized = normalizePhone(r.phone);
    if (normalized && !seenPhone.has(normalized)) {
      seenPhone.add(normalized);
      phones.push({ name: r.name, phone: r.phone, normalized });
    }
  }

  return { emails, phones, registrants: rsvps.length };
}

// ─── Composition ──────────────────────────────────────────────────────────────

/**
 * Wrap the admin's HTML in a branded shell.
 *
 * Email clients ignore stylesheets and most of CSS, so this is a table with
 * inline styles — ugly to read, but the only thing Outlook and Gmail both
 * render the same way.
 */
function wrapHtml(event, bodyHtml) {
  const { when, where } = eventFacts(event);
  const detail = [when, where].filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F4EF">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EF;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
  <tr><td style="background:#210A4A;padding:20px 24px">
    <div style="color:#ffffff;font-size:18px;font-weight:bold">${escapeHtml(event.title)}</div>
    ${detail ? `<div style="color:#C9BEDC;font-size:13px;margin-top:4px">${escapeHtml(detail)}</div>` : ''}
  </td></tr>
  <tr><td style="padding:24px;color:#1A0E30;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
  <tr><td style="padding:16px 24px;background:#F7F4EF;color:#6B6B8A;font-size:12px;line-height:1.5">
    You are receiving this because you registered for this event at HPC Global.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** A plain-text twin of the HTML, for clients that will not render it. */
function htmlToText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Pull the per-recipient errors out of a permissive Resend batch response.
 *
 * Permissive validation is what lets one malformed address through without
 * failing the batch, and it reports the casualties in errors[]. The shape has
 * moved before, so index, email and message are each read defensively.
 */
function batchFailures(response, batch) {
  const errors = response?.errors;
  if (!Array.isArray(errors) || !errors.length) return [];
  return errors.map((e, i) => {
    const at = Number.isInteger(e?.index) ? e.index : i;
    return {
      channel: 'email',
      to: e?.email || batch[at]?.to || 'unknown',
      reason: e?.message || e?.error || 'rejected by the email provider',
    };
  });
}

// Worded as the composer words its own warning, since these are read there.
const NO_EMAIL_SERVICE = 'No email service is configured';
const NO_SMS_SERVICE   = 'No SMS service is configured';

/**
 * Finish a channel whose provider is not set up.
 *
 * Without credentials the senders skip quietly instead of throwing — right for
 * a one-off confirmation, wrong here, where it would read as everyone having
 * been messaged. Nobody was, and no retry will change that until someone sets
 * the provider up, so everyone still waiting is recorded as failed and the
 * channel counts as finished. Leaving it unfinished would park the campaign as
 * PARTIAL, and every "Continue sending" would fail the same way again. One
 * line covers them all, so a single cause does not use up the failures cap.
 */
function noTransport({ channel, reason, recipients, at, sent, failures }) {
  const left = recipients.length - at;
  failures.push({ channel, to: `${left} ${left === 1 ? 'recipient' : 'recipients'}`, reason });
  return { sent, cursor: recipients.length, failures, finished: true };
}

/**
 * Email every recipient from `cursor` onwards, until done or out of time.
 * @returns {{sent: number, cursor: number, failures: Array, finished: boolean}}
 */
async function deliverEmail({ event, subject, bodyHtml, recipients, cursor, deadline }) {
  const html = wrapHtml(event, bodyHtml);
  const text = htmlToText(bodyHtml);
  const pending = recipients.slice(cursor);
  const failures = [];
  let sent = 0;
  let at = cursor;

  const transport = emailTransportName();
  if (transport === 'none') {
    return noTransport({ channel: 'email', reason: NO_EMAIL_SERVICE, recipients, at, sent, failures });
  }

  const viaResend = transport === 'resend';
  // SMTP opens a connection per message, so it gets much smaller chunks — the
  // deadline check between chunks is only useful if chunks are short.
  const size = viaResend ? RESEND_BATCH_MAX : 10;

  for (const group of chunk(pending, size)) {
    if (Date.now() > deadline) return { sent, cursor: at, failures, finished: false };

    const batch = group.map((r) => ({ to: r.email, subject, html, text }));
    try {
      if (viaResend) {
        const response = await sendBatchViaResend(batch);
        const failed = batchFailures(response, batch);
        failures.push(...failed);
        sent += batch.length - failed.length;
      } else {
        // No batch endpoint on SMTP, so these go one at a time, in parallel
        // within the chunk. allSettled because a rejection here is one bad
        // address, not a reason to abandon the rest.
        const results = await Promise.allSettled(batch.map((m) => sendMail(m)));
        results.forEach((res, i) => {
          if (res.status === 'rejected') {
            failures.push({ channel: 'email', to: batch[i].to, reason: res.reason?.message || 'send failed' });
          } else if (res.value?.skipped) {
            // sendMail resolves rather than throws when it has no transport,
            // so fulfilled is not the same as sent.
            failures.push({ channel: 'email', to: batch[i].to, reason: NO_EMAIL_SERVICE });
          } else {
            sent += 1;
          }
        });
      }
    } catch (err) {
      // The whole chunk failed — the provider is down or the key is wrong.
      // Record it against the chunk and stop: the next chunk would fail too,
      // and the cursor stays put so a resume retries exactly these people.
      failures.push({ channel: 'email', to: `${group.length} recipients`, reason: err.message || 'batch failed' });
      return { sent, cursor: at, failures, finished: false };
    }
    at += group.length;
  }

  return { sent, cursor: at, failures, finished: true };
}

/** SMS every recipient from `cursor` onwards, until done or out of time. */
async function deliverSms({ body, recipients, cursor, deadline }) {
  const pending = recipients.slice(cursor);
  const failures = [];
  let sent = 0;
  let at = cursor;

  for (const group of chunk(pending, SMS_CHUNK)) {
    if (Date.now() > deadline) return { sent, cursor: at, failures, finished: false };
    try {
      const result = await sendBulkSms(group.map((r) => r.normalized), body);
      if (result.skipped) {
        return noTransport({ channel: 'sms', reason: NO_SMS_SERVICE, recipients, at, sent, failures });
      }
      for (const bad of result.invalid || []) {
        failures.push({ channel: 'sms', to: bad, reason: 'not a usable phone number' });
      }
      sent += result.accepted || 0;
    } catch (err) {
      failures.push({ channel: 'sms', to: `${group.length} recipients`, reason: err.message || 'batch failed' });
      return { sent, cursor: at, failures, finished: false };
    }
    at += group.length;
  }

  return { sent, cursor: at, failures, finished: true };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

function statusFor({ wantsEmail, wantsSms, emailDone, smsDone, failures, emailSent, smsSent }) {
  const allDone = (!wantsEmail || emailDone) && (!wantsSms || smsDone);
  if (!allDone) return 'PARTIAL';
  // A channel with no provider finishes with nobody sent and a failure on
  // record, so a campaign that reached no one lands here rather than as SENT.
  if (failures.length && emailSent + smsSent === 0) return 'FAILED';
  return 'SENT';
}

/**
 * Run (or resume) a campaign, updating its row as it goes.
 *
 * The campaign row is the source of truth for progress, so it is written
 * whether the run finished or ran out of time. Returns the updated row.
 */
async function runCampaign(messageId) {
  const message = await prisma.eventMessage.findUnique({
    where:   { id: messageId },
    include: { event: true },
  });
  if (!message) throw new Error('Campaign not found');

  const deadline = Date.now() + TIME_BUDGET_MS;
  const { emails, phones } = await resolveRecipients(message.eventId, message.audience);

  const wantsEmail = message.channel === 'EMAIL' || message.channel === 'BOTH';
  const wantsSms   = message.channel === 'SMS'   || message.channel === 'BOTH';

  // Previous failures are kept: a resume adds to the record, it does not erase
  // what went wrong the first time round. Cursors are read the same way, which
  // is what makes this safe to call on a campaign the platform killed mid-run:
  // whatever the last completed chunk recorded is where it picks up.
  const failures = safeParseFailures(message.failures);

  let emailResult = { sent: 0, cursor: message.emailCursor, failures: [], finished: true };
  let smsResult   = { sent: 0, cursor: message.smsCursor,   failures: [], finished: true };

  if (wantsEmail && emails.length > message.emailCursor) {
    emailResult = await deliverEmail({
      event:     message.event,
      subject:   message.subject || message.event.title,
      bodyHtml:  message.bodyHtml || '',
      recipients: emails,
      cursor:    message.emailCursor,
      deadline,
    });
    failures.push(...emailResult.failures);
  }

  if (wantsSms && phones.length > message.smsCursor) {
    smsResult = await deliverSms({
      body:       message.bodySms || '',
      recipients: phones,
      cursor:     message.smsCursor,
      deadline,
    });
    failures.push(...smsResult.failures);
  }

  const emailSent = message.emailSent + emailResult.sent;
  const smsSent   = message.smsSent   + smsResult.sent;
  const status = statusFor({
    wantsEmail, wantsSms,
    emailDone: emailResult.finished,
    smsDone:   smsResult.finished,
    failures, emailSent, smsSent,
  });

  return prisma.eventMessage.update({
    where: { id: messageId },
    data: {
      status,
      emailTotal: wantsEmail ? emails.length : 0,
      smsTotal:   wantsSms   ? phones.length : 0,
      emailSent,
      smsSent,
      emailCursor: emailResult.cursor,
      smsCursor:   smsResult.cursor,
      // Bounded: a thousand identical "invalid number" lines help nobody, and
      // the column should not grow without limit.
      failures: failures.length ? JSON.stringify(failures.slice(0, 200)) : null,
      completedAt: status === 'PARTIAL' ? null : new Date(),
    },
  });
}

function safeParseFailures(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  resolveRecipients, runCampaign, wrapHtml, htmlToText, safeParseFailures,
  smsSegments, smsTransportName, emailTransportName,
};
