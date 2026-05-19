const nodemailer = require('nodemailer');
require('dotenv').config();

const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
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

async function sendPasswordReset(toEmail, resetUrl) {
  await transporter.sendMail({
    from:    `HPC Global <${FROM}>`,
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

async function notifyPrayerRequest(prayer) {
  const to = process.env.OFFICE_EMAIL || FROM;
  await transporter.sendMail({
    from:    `HPC Website <${FROM}>`,
    to,
    subject: `New prayer request: ${prayer.category}`,
    html: `
      <p><strong>Category:</strong> ${prayer.category}</p>
      ${prayer.name ? `<p><strong>From:</strong> ${prayer.name}</p>` : '<p><em>Anonymous</em></p>'}
      ${prayer.phone ? `<p><strong>Phone:</strong> ${prayer.phone}${prayer.wantsCall ? ' (wants a call)' : ''}</p>` : ''}
      <p><strong>Request:</strong></p>
      <p>${prayer.request}</p>
    `,
  });
}

module.exports = { sendAutoReply, notifyOffice, sendPasswordReset, notifyPrayerRequest };
