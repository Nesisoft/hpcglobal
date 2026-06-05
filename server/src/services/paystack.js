const axios = require('axios');
require('dotenv').config();

const client = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
});

async function initializePayment({ amount, email, reference, metadata, channels, callback_url }) {
  const { data } = await client.post('/transaction/initialize', {
    amount, email, reference, metadata, channels, callback_url,
    currency: 'GHS',
  });
  return data;
}

async function verifyPayment(reference) {
  const { data } = await client.get(`/transaction/verify/${reference}`);
  return data;
}

module.exports = { initializePayment, verifyPayment };
