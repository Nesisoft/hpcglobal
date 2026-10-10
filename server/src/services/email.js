const nodemailer = require('nodemailer');
const axios      = require('axios');
require('dotenv').config();
const { escapeHtml } = require('../lib/html');

/**
 * Outgoing email.
 *
 * Every message goes through sendMail(), which picks a transport at call time:
 * Resend when RESEND_API_KEY is configured, otherwise the SMTP account. Having
 * one primitive is what lets the bulk sender reuse exactly the path a single
 * confirmation takes, and what keeps the choice of provider out of the dozen
 * message templates below.
 */

const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;

let smtpTransport = null;
function smtp() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { rejectUnauthorized: false },
    });
  }
  return smtpTransport;
}

const FROM      = process.env.SMTP_FROM || 'noreply@hpcglobal.org';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'HPC Global';
const fromHeader = () => `${FROM_NAME} <${FROM}>`;

/** Which transport is live, for the admin to see without exposing keys. */
function emailTransportName() {
  return process.env.RESEND_API_KEY ? 'resend' : (process.env.SMTP_HOST ? 'smtp' : 'none');
}

const RESEND_ENDPOINT       = 'https://api.resend.com/emails';
const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';
/** Resend's batch endpoint caps a single request; we chunk to stay under it. */
const RESEND_BATCH_MAX = 100;

function resendHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
    // A request without a User-Agent is reported to be refused outright.
    'User-Agent': 'hpcglobal-server',
    ...extra,
  };
}

/** Resend reports failures in the body, so a 2xx alone is not success. */
function resendError(err) {
  const data = err?.response?.data;
  const detail = data?.message || data?.name || err?.message || 'unknown error';
  // Never let the key reach a log line.
  return new Error(`Resend: ${detail}`);
}

async function sendViaResend({ to, subject, html, text, replyTo, idempotencyKey }) {
  try {
    const { data } = await axios.post(
      RESEND_ENDPOINT,
      {
        from:    fromHeader(),
        to:      Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      },
      {
        // Keyed to the thing being confirmed, so a retry or a double submit
        // cannot send the same person the same message twice.
        headers: resendHeaders(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        timeout: 15000,
      },
    );
    return data;
  } catch (err) {
    throw resendError(err);
  }
}

/**
 * Send many distinct messages in one call. Each recipient gets their own
 * message — nobody can see who else was written to.
 * @param {Array<{to: string, subject: string, html: string}>} messages
 */
async function sendBatchViaResend(messages) {
  const payload = messages.map((m) => ({
    from:    fromHeader(),
    to:      [m.to],
    subject: m.subject,
    html:    m.html,
    ...(m.text ? { text: m.text } : {}),
  }));
  try {
    const { data } = await axios.post(RESEND_BATCH_ENDPOINT, payload, {
      // Strict validation is the default and fails the WHOLE batch over one
      // malformed address. These addresses were typed by the public into a
      // registration form, so permissive is the only workable setting: the bad
      // ones come back in errors[] and the rest still go out.
      headers: resendHeaders({ 'x-batch-validation': 'permissive' }),
      timeout: 20000,
    });
    return data;
  } catch (err) {
    throw resendError(err);
  }
}

/**
 * Send one message. The single path every template and the bulk sender use.
 * @param {{to: string, subject: string, html: string, text?: string, replyTo?: string}} msg
 */
async function sendMail({ to, subject, html, text, replyTo, idempotencyKey }) {
  if (!to) throw new Error('sendMail: no recipient');

  const transport = emailTransportName();
  if (transport === 'none') {
    console.warn(`No email transport configured — skipping "${subject}" to ${to}`);
    return { skipped: true };
  }
  if (transport === 'resend') return sendViaResend({ to, subject, html, text, replyTo, idempotencyKey });

  return smtp().sendMail({ from: fromHeader(), to, subject, html, text, replyTo });
}

async function sendAutoReply(toEmail, toName) {
  return sendMail({
    to:      toEmail,
    subject: 'We received your message — HPC Global',
    html: `
      <p>Dear ${escapeHtml(toName)},</p>
      <p>Thank you for reaching out to HPC Global. We have received your message and will respond within 24 hours.</p>
      <p>God bless you.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong><br>
      Klagon Junction, Accra, Ghana</p>
    `,
  });
}

async function notifyOffice(msg) {
  const to = process.env.OFFICE_EMAIL || FROM;
  return sendMail({
    to,
    subject: `New contact message: ${msg.type} — ${msg.name}`,
    html: `
      <p><strong>From:</strong> ${escapeHtml(msg.name)} (${escapeHtml(msg.email)})</p>
      <p><strong>Phone:</strong> ${escapeHtml(msg.phone || 'N/A')}</p>
      <p><strong>Type:</strong> ${escapeHtml(msg.type)}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(msg.message)}</p>
    `,
  });
}

async function sendPasswordReset(toEmail, resetUrl) {
  return sendMail({
    to:      toEmail,
    subject: 'Reset your admin password — HPC Global',
    html: `
      <p>You requested a password reset for your HPC Global admin account.</p>
      <p><a href="${resetUrl}" style="background:#7E5BAC;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block">Reset Password</a></p>
      <p>This link expires in <strong>1 hour</strong>. If you did not request this, ignore this email.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong></p>
    `,
  });
}

async function sendPartnerApplicationConfirmation(toEmail, firstName) {
  return sendMail({
    to:      toEmail,
    subject: 'Your Partnership Application — HPC Global',
    html: `
      <p>Dear ${escapeHtml(firstName)},</p>
      <p>Thank you for applying to partner with Prophet Clottey and HPC Global.</p>
      <p>Your application is under review. Once verified, we will create your partner account and send your login credentials to this email address.</p>
      <p>God bless you for your commitment to the ministry.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong><br>Klagon Junction, Accra, Ghana</p>
    `,
  });
}

async function sendPartnerActivation(toEmail, firstName, password) {
  const appUrl = process.env.APP_URL || 'https://www.hpcglobal.org';
  return sendMail({
    to:      toEmail,
    subject: 'Your HPC Global Partner Account is Ready',
    html: `
      <p>Dear ${escapeHtml(firstName)},</p>
      <p>Your HPC Global partner account has been activated. You can now log in to the partner portal.</p>
      <p>
        <strong>Login URL:</strong> <a href="${appUrl}/partner/login">${appUrl}/partner/login</a><br>
        <strong>Email:</strong> ${toEmail}<br>
        <strong>Temporary Password:</strong> <code style="background:#f4f4f4;padding:2px 6px;border-radius:4px">${password}</code>
      </p>
      <p>Please change your password after your first login (you can do this from your profile settings).</p>
      <p>As a partner you now have access to:</p>
      <ul>
        <li>Exclusive one-on-one Zoom meetings with the prophet</li>
        <li>Spiritual instructions and guidance</li>
        <li>Monthly payment portal</li>
      </ul>
      <p>God bless you. We look forward to this journey together.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong></p>
    `,
  });
}

/**
 * The event RSVP confirmation. The message body is composed in
 * services/eventNotify.js, which owns what the church says about an event.
 */
async function sendEventRsvpConfirmation({ to, subject, html, idempotencyKey }) {
  return sendMail({ to, subject, html, idempotencyKey });
}

async function sendPrayerConfirmation(toEmail, name) {
  return sendMail({
    to:      toEmail,
    subject: 'We are praying with you — HPC Global',
    html: `
      <p>Dear ${escapeHtml(name || 'Beloved')},</p>
      <p>We have received your prayer request and our prayer team is standing with you in agreement.</p>
      <p>Be encouraged — God hears and answers prayer.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong><br>Klagon Junction, Accra, Ghana</p>
    `,
  });
}

async function sendAppointmentConfirmation(toEmail, name, whenLabel, reason) {
  return sendMail({
    to:      toEmail,
    subject: 'Your Appointment Request — HPC Global',
    html: `
      <p>Dear ${escapeHtml(name)},</p>
      <p>We have received your request to book an appointment with the Prophet for <strong>${escapeHtml(whenLabel)}</strong>.</p>
      <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
      <p>Your request is pending confirmation. We will notify you once it is confirmed.</p>
      <p>God bless you.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong><br>Klagon Junction, Accra, Ghana</p>
    `,
  });
}

async function sendAppointmentStatus(toEmail, name, whenLabel, statusWord) {
  return sendMail({
    to:      toEmail,
    subject: `Your Appointment is ${statusWord === 'confirmed' ? 'Confirmed' : 'Cancelled'} — HPC Global`,
    html: `
      <p>Dear ${escapeHtml(name)},</p>
      <p>Your appointment with the Prophet for <strong>${escapeHtml(whenLabel)}</strong> has been <strong>${statusWord}</strong>.</p>
      ${statusWord === 'confirmed'
        ? '<p>We look forward to seeing you. Please arrive a few minutes early.</p>'
        : '<p>If you would like to reschedule, please book another slot or contact the office.</p>'}
      <p>God bless you.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong></p>
    `,
  });
}

async function notifyPrayerRequest(prayer) {
  const to = process.env.OFFICE_EMAIL || FROM;
  return sendMail({
    to,
    subject: `New prayer request: ${prayer.category}`,
    html: `
      <p><strong>Category:</strong> ${escapeHtml(prayer.category)}</p>
      ${prayer.name ? `<p><strong>From:</strong> ${escapeHtml(prayer.name)}</p>` : '<p><em>Anonymous</em></p>'}
      ${prayer.phone ? `<p><strong>Phone:</strong> ${escapeHtml(prayer.phone)}${prayer.wantsCall ? ' (wants a call)' : ''}</p>` : ''}
      <p><strong>Request:</strong></p>
      <p>${escapeHtml(prayer.request)}</p>
    `,
  });
}

module.exports = { sendMail, sendBatchViaResend, emailTransportName, RESEND_BATCH_MAX, sendAutoReply, notifyOffice, sendPasswordReset, notifyPrayerRequest, sendPartnerApplicationConfirmation, sendPartnerActivation, sendEventRsvpConfirmation, sendPrayerConfirmation, sendAppointmentConfirmation, sendAppointmentStatus };
