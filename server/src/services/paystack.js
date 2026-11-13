const axios  = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// The base URL can be pointed elsewhere so the tests run against a fake
// Paystack, the way HUBTEL_SMS_BASE_URL does for SMS.
const client = axios.create({
  baseURL: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  timeout: 20000,
});

// `amount` is in pesewas. Paystack wants a whole number, and 19.99 * 100 is
// 1998.9999999999998 in JavaScript.
async function initializePayment({ amount, email, reference, metadata, channels, callback_url }) {
  const { data } = await client.post('/transaction/initialize', {
    amount: Math.round(amount), email, reference, metadata, channels, callback_url,
    currency: 'GHS',
  });
  return data;
}

async function verifyPayment(reference) {
  const { data } = await client.get(`/transaction/verify/${encodeURIComponent(reference)}`);
  return data;
}

/**
 * Whether a webhook really came from Paystack: they sign the raw request body
 * with HMAC-SHA512, keyed with our secret key, in the x-paystack-signature
 * header. The body must be the exact bytes received — parsed and re-encoded
 * JSON would not match.
 */
function validSignature(rawBody, header) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !header || !Buffer.isBuffer(rawBody)) return false;
  const expected = Buffer.from(crypto.createHmac('sha512', secret).update(rawBody).digest('hex'));
  const given    = Buffer.from(String(header));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

module.exports = { initializePayment, verifyPayment, validSignature };
