const axios = require('axios');
require('dotenv').config();

/**
 * SMS via Hubtel.
 *
 * Notes that cost real money or real delivery if ignored:
 *  - Auth is HTTP Basic with the Client ID and Client Secret, not a bearer key.
 *  - The JSON field names are PascalCase (From, To, Content).
 *  - HTTP 201 means Hubtel accepted the message, not that it was delivered, and
 *    a business failure can arrive inside a 2xx body as a numeric status — an
 *    empty prepaid wallet reports "Payment required on account" that way. So the
 *    body is checked, not just the status code.
 *  - The host is configurable because Hubtel's own material disagrees with
 *    itself: sms.hubtel.com is the only host observed to serve both the single
 *    and the batch paths, so it is the default, but smsc.hubtel.com appears in
 *    Hubtel's FAQ and in most existing Ghanaian code. Settle it with one live
 *    send on the church's own account before a campaign goes out.
 */

const BASE_URL   = (process.env.HUBTEL_SMS_BASE_URL || 'https://sms.hubtel.com/v1/messages').replace(/\/+$/, '');
const SENDER_ID  = process.env.HUBTEL_SENDER_ID || 'HPCGlobal';
const TIMEOUT_MS = 15000;

function configured() {
  return Boolean(process.env.HUBTEL_SMS_CLIENT_ID && process.env.HUBTEL_SMS_CLIENT_SECRET);
}

function smsTransportName() {
  return configured() ? 'hubtel' : 'none';
}

function authHeader() {
  const token = Buffer
    .from(`${process.env.HUBTEL_SMS_CLIENT_ID}:${process.env.HUBTEL_SMS_CLIENT_SECRET}`)
    .toString('base64');
  return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
}

/**
 * Ghanaian numbers are typed every which way — 024 123 4567, +233 24 123 4567,
 * 233241234567. Hubtel's own pages disagree on whether it wants E.164 or a bare
 * MSISDN, so everything is normalised to the MSISDN form (233…) which both the
 * send and batch references accept.
 */
function normalizePhone(raw) {
  let v = String(raw ?? '').replace(/[\s()\-.]/g, '');
  if (!v) return '';
  if (v.startsWith('+')) v = v.slice(1);
  if (v.startsWith('00')) v = v.slice(2);
  // A local 0XXXXXXXXX becomes 233XXXXXXXXX.
  if (v.startsWith('0') && v.length === 10) v = `233${v.slice(1)}`;
  // Nine digits with no prefix is a Ghanaian number missing its leading zero.
  else if (/^\d{9}$/.test(v)) v = `233${v}`;
  return /^\d{7,15}$/.test(v) ? v : '';
}

/** GSM-7 fits 160 per segment; anything outside it drops the segment to 70. */
function smsSegments(text) {
  const value = String(text ?? '');
  if (!value) return 0;
  const unicode = /[^\u0000-\u007F£¥èéùìòÇØøÅåÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]/.test(value);
  const per = unicode ? 70 : 160;
  const perConcat = unicode ? 67 : 153;
  return value.length <= per ? 1 : Math.ceil(value.length / perConcat);
}

/**
 * Hubtel reports some failures inside an HTTP 2xx. A numeric status at or above
 * 100 is a rejection; 0 (and the string forms Hubtel also returns) is accepted.
 */
function assertAccepted(data, label) {
  if (data && typeof data === 'object') {
    const status = data.Status ?? data.status;
    if (status !== undefined && status !== null) {
      const numeric = Number(status);
      if (Number.isFinite(numeric) && numeric >= 100) {
        throw new Error(`Hubtel rejected ${label}: status ${numeric}${data.Message ? ` — ${data.Message}` : ''}`);
      }
    }
  }
  return data;
}

function hubtelError(err, label) {
  const data = err?.response?.data;
  const detail = (data && (data.Message || data.message)) || err?.message || 'unknown error';
  // Never let the Basic credential reach a log line.
  return new Error(`Hubtel ${label}: ${detail}`);
}

/** Send one SMS. */
async function sendSms(to, message) {
  if (!configured()) {
    console.warn('Hubtel credentials not set — skipping SMS');
    return { skipped: true };
  }
  const To = normalizePhone(to);
  if (!To) throw new Error(`Unusable phone number: ${to}`);

  try {
    const { data } = await axios.post(
      `${BASE_URL}/send`,
      { From: SENDER_ID, To, Content: String(message), RegisteredDelivery: true },
      { headers: authHeader(), timeout: TIMEOUT_MS },
    );
    return assertAccepted(data, 'the message');
  } catch (err) {
    if (err.message?.startsWith('Hubtel rejected')) throw err;
    throw hubtelError(err, 'send');
  }
}

/**
 * One body to many numbers, in a single call.
 *
 * Hubtel's per-endpoint rate limit is low enough that looping single sends
 * across a congregation would be throttled, so campaigns go through here.
 * Returns the numbers that were unusable so the caller can report them.
 */
async function sendBulkSms(recipients, message) {
  if (!configured()) {
    console.warn('Hubtel credentials not set — skipping bulk SMS');
    return { skipped: true, accepted: 0, invalid: [] };
  }

  const invalid = [];
  const Recipients = [];
  for (const r of recipients) {
    const n = normalizePhone(r);
    if (n) Recipients.push(n);
    else invalid.push(r);
  }
  if (!Recipients.length) return { accepted: 0, invalid, data: null };

  try {
    const { data } = await axios.post(
      `${BASE_URL}/batch/simple/send`,
      { From: SENDER_ID, Content: String(message), Recipients },
      { headers: authHeader(), timeout: 30000 },
    );
    assertAccepted(data, 'the batch');
    return { accepted: Recipients.length, invalid, data };
  } catch (err) {
    if (err.message?.startsWith('Hubtel rejected')) throw err;
    throw hubtelError(err, 'batch send');
  }
}

async function sendWhatsApp(to, message) {
  // Not wired up: WhatsApp Business messaging is a separate Hubtel product with
  // its own template approval. Logged rather than silently dropped.
  console.log(`[WhatsApp not configured] To: ${to} | ${message}`);
}

module.exports = {
  sendSms, sendBulkSms, sendWhatsApp,
  normalizePhone, smsSegments, smsTransportName,
};
