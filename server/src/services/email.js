const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || 'noreply@hpcglobal.org';

async function sendAutoReply(toEmail, toName) {
  await transporter.sendMail({
    from:    `HPC Global <${FROM}>`,
    to:      toEmail,
    subject: 'We received your message — HPC Global',
    html: `
      <p>Dear ${toName},</p>
      <p>Thank you for reaching out to HPC Global. We have received your message and will respond within 24 hours.</p>
      <p>God bless you.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong><br>
      Klagon Junction, Accra, Ghana</p>
    `,
  });
}

async function notifyOffice(msg) {
  const settings = await require('../prisma/schema')?.churchEmail?.catch?.(() => null);
  const to = process.env.OFFICE_EMAIL || FROM;
  await transporter.sendMail({
    from:    `HPC Website <${FROM}>`,
    to,
    subject: `New contact message: ${msg.type} — ${msg.name}`,
    html: `
      <p><strong>From:</strong> ${msg.name} (${msg.email})</p>
      <p><strong>Phone:</strong> ${msg.phone || 'N/A'}</p>
      <p><strong>Type:</strong> ${msg.type}</p>
      <p><strong>Message:</strong></p>
      <p>${msg.message}</p>
    `,
  });
}

module.exports = { sendAutoReply, notifyOffice };
