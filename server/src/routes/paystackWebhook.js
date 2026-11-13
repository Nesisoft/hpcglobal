/**
 * Paystack's webhook: told when a payment succeeds, so a gift is settled —
 * and an online tithe recorded — even when the giver closes the page before
 * coming back to the site (common with mobile money, approved on the phone).
 *
 * Mounted ahead of express.json in app.js: the signature is over the exact
 * bytes Paystack sent, so the body must reach here unparsed.
 *
 * Only the reference is taken from the event. settleGiving asks Paystack
 * about it again, so a forged or replayed event can at most make us check a
 * real payment one more time.
 */
const express  = require('express');
const router   = express.Router();
const paystack = require('../services/paystack');
const { settleGiving } = require('../services/onlineGiving');

router.post('/webhook', express.raw({ type: () => true, limit: '1mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body)) {
    // Something parsed the body before us. On Vercel that is its Node
    // helpers: setting NODEJS_HELPERS=0 in the project's environment stops it.
    console.error('Paystack webhook: raw body unavailable, so the signature cannot be checked.');
    return res.status(400).json({ message: 'Raw body unavailable' });
  }
  if (!paystack.validSignature(req.body, req.get('x-paystack-signature'))) {
    return res.status(401).json({ message: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ message: 'Invalid JSON' });
  }

  const reference = event?.data?.reference;
  if (event?.event !== 'charge.success' || !reference) return res.sendStatus(200);

  try {
    // An unknown reference or a mismatched amount also answers 200: sending
    // the same event again would not change the answer.
    await settleGiving(reference);
    res.sendStatus(200);
  } catch (err) {
    // The database or Paystack is out of reach — a 500 makes Paystack retry.
    console.error(`Paystack webhook: could not settle ${reference}:`, err);
    res.sendStatus(500);
  }
});

module.exports = router;
