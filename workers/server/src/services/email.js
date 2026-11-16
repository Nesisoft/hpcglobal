/**
 * Outgoing email, through Resend — the same provider and verified domain as
 * the website, but with this app's own API key, so the two can be told apart
 * (and one revoked) in Resend's dashboard.
 *
 * The only email this app sends is the password-reset code, and only to
 * approved accounts: sign-up is approved by a head of department instead of
 * confirmed by email, so an address typed at sign-up is never written to
 * until someone who knows the person has approved it. A daily cap
 * (claimEmail) keeps the app well inside the Resend allowance it shares with
 * the website.
 *
 * Without RESEND_API_KEY on a developer's machine, the message is printed to
 * the console instead, so the reset flow can be tried locally. On Vercel a
 * missing key is an error, never a silent print.
 */

const RESEND_BASE_URL = (process.env.RESEND_BASE_URL || 'https://api.resend.com').replace(/\/$/, '');

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const fromHeader = () => process.env.MAIL_FROM || 'HPC Workers <no-reply@hpcglobal.org>';

// At most this many emails a day from this app (EMAILS_PER_DAY to change
// it), and from any one sender's address (EMAILS_PER_ADDRESS_PER_DAY) — so
// spending the church's allowance would take many addresses as well as many
// approved accounts.
const dailyLimit   = () => Math.max(1, Number.parseInt(process.env.EMAILS_PER_DAY, 10) || 40);
const addressLimit = () => Math.max(1, Number.parseInt(process.env.EMAILS_PER_ADDRESS_PER_DAY, 10) || 10);

const today = () => new Date().toISOString().slice(0, 10);
const allKey = (day) => `all:${day}`;
const addressKey = (day, address) => `address:${day}:${address}`;

/**
 * Whether an email could still go today — for the app, and for requests from
 * `address` — asked before anyone's account is looked at, so the answer is
 * the same for every email typed.
 */
async function emailsLeftToday(address) {
  const prisma = require('../lib/prisma');
  const day = today();
  const [all, mine] = await Promise.all([
    prisma.emailCount.findUnique({ where: { key: allKey(day) } }),
    prisma.emailCount.findUnique({ where: { key: addressKey(day, address) } }),
  ]);
  return (all?.sent ?? 0) < dailyLimit() && (mine?.sent ?? 0) < addressLimit();
}

/** Take one from `key`'s count if it is below `limit`. The row is made first if needed, quietly. */
async function take(prisma, key, day, limit) {
  await prisma.emailCount.createMany({ data: [{ key, day }], skipDuplicates: true });
  const taken = await prisma.emailCount.updateMany({ where: { key, sent: { lt: limit } }, data: { sent: { increment: 1 } } });
  return taken.count === 1;
}

async function giveBack(prisma, key) {
  await prisma.emailCount.updateMany({ where: { key, sent: { gt: 0 } }, data: { sent: { decrement: 1 } } }).catch(() => {});
}

/**
 * Take one of today's emails for a request from `address`, or say there are
 * none left (for the app, or for that address). The counts are in the
 * database, so they hold across every server instance; each increment is
 * conditional, so two requests can't both take the last one. Returns a
 * receipt for releaseEmail, or null.
 */
async function claimEmail(address) {
  const prisma = require('../lib/prisma');
  const day = today();
  const mine = addressKey(day, address);
  if (!(await take(prisma, mine, day, addressLimit()))) return null;
  if (!(await take(prisma, allKey(day), day, dailyLimit()))) {
    await giveBack(prisma, mine);
    return null;
  }
  return { day, mine };
}

/** Give back an email that was claimed but not sent. */
async function releaseEmail(receipt) {
  if (!receipt) return;
  const prisma = require('../lib/prisma');
  await Promise.all([giveBack(prisma, receipt.mine), giveBack(prisma, allKey(receipt.day))]);
}

async function sendMail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
      console.log(`\n[email — not sent, RESEND_API_KEY is not set]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
      return;
    }
    throw new Error('Email is not set up: RESEND_API_KEY is missing.');
  }

  const response = await fetch(`${RESEND_BASE_URL}/emails`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${key}`,
      'Content-Type': 'application/json',
      'User-Agent':   'hpc-workers',
    },
    body:   JSON.stringify({ from: fromHeader(), to: [to], subject, text, html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    // Never let the key reach a log line: only Resend's own message.
    throw new Error(`Resend: ${body.message || body.name || response.status}`);
  }
}

// Nothing a person typed goes into the email — not even their name — so the
// app's address can't be used to put someone else's words in an inbox.
function sendResetCode({ to, code }) {
  const app = process.env.APP_URL || 'https://workers.hpcglobal.org';
  const text = [
    'Hello,',
    '',
    `Your code to reset your HPC Workers password is ${code}.`,
    '',
    'It works for 15 minutes. If you did not ask for it, you can ignore this email — your password has not changed.',
    '',
    app,
  ].join('\n');
  const html = `
<div style="font-family:Arial,sans-serif;color:#1A0E30;max-width:480px">
  <p>Hello,</p>
  <p>Your code to reset your HPC Workers password is:</p>
  <p style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#3B1278;margin:16px 0">${escapeHtml(code)}</p>
  <p>It works for 15 minutes. If you did not ask for it, you can ignore this email — your password has not changed.</p>
  <p style="color:#888;font-size:12px">${escapeHtml(app)}</p>
</div>`;
  return sendMail({ to, subject: `${code} is your HPC Workers reset code`, text, html });
}

module.exports = { sendMail, sendResetCode, claimEmail, releaseEmail, emailsLeftToday };
