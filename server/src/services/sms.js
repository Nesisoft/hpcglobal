const axios = require('axios');
require('dotenv').config();

// Arkesel SMS / WhatsApp API
async function sendSms(to, message) {
  if (!process.env.ARKESEL_API_KEY) {
    console.warn('ARKESEL_API_KEY not set — skipping SMS');
    return;
  }
  await axios.get('https://sms.arkesel.com/sms/api', {
    params: {
      action:  'send-sms',
      api_key: process.env.ARKESEL_API_KEY,
      to,
      from:    'HPCGlobal',
      sms:     message,
    },
  });
}

async function sendWhatsApp(to, message) {
  // Placeholder — implement with Hubtel or Arkesel WhatsApp Business API
  console.log(`[WhatsApp] To: ${to} | Message: ${message}`);
}

module.exports = { sendSms, sendWhatsApp };
