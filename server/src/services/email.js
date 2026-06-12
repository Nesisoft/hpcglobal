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

async function sendPartnerApplicationConfirmation(toEmail, firstName) {
  await transporter.sendMail({
    from:    `HPC Global <${FROM}>`,
    to:      toEmail,
    subject: 'Your Partnership Application — HPC Global',
    html: `
      <p>Dear ${firstName},</p>
      <p>Thank you for applying to partner with Prophet Clottey and HPC Global.</p>
      <p>Your application is under review. Once verified, we will create your partner account and send your login credentials to this email address.</p>
      <p>God bless you for your commitment to the ministry.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong><br>Klagon Junction, Accra, Ghana</p>
    `,
  });
}

async function sendPartnerActivation(toEmail, firstName, password) {
  const appUrl = process.env.APP_URL || 'https://www.hpcglobal.org';
  await transporter.sendMail({
    from:    `HPC Global <${FROM}>`,
    to:      toEmail,
    subject: 'Your HPC Global Partner Account is Ready',
    html: `
      <p>Dear ${firstName},</p>
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

async function sendEventRsvpConfirmation(toEmail, name, eventTitle, attendance) {
  await transporter.sendMail({
    from:    `HPC Global <${FROM}>`,
    to:      toEmail,
    subject: `Your seat is reserved — ${eventTitle}`,
    html: `
      <p>Dear ${name},</p>
      <p>Your seat for <strong>${eventTitle}</strong> has been reserved${attendance ? ` (${attendance})` : ''}. We look forward to seeing you there.</p>
      <p>If your plans change, simply reply to this email to let us know.</p>
      <p>God bless you.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong><br>Klagon Junction, Accra, Ghana</p>
    `,
  });
}

async function sendPrayerConfirmation(toEmail, name) {
  await transporter.sendMail({
    from:    `HPC Global <${FROM}>`,
    to:      toEmail,
    subject: 'We are praying with you — HPC Global',
    html: `
      <p>Dear ${name || 'Beloved'},</p>
      <p>We have received your prayer request and our prayer team is standing with you in agreement.</p>
      <p>Be encouraged — God hears and answers prayer.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong><br>Klagon Junction, Accra, Ghana</p>
    `,
  });
}

async function sendAppointmentConfirmation(toEmail, name, whenLabel, reason) {
  await transporter.sendMail({
    from:    `HPC Global <${FROM}>`,
    to:      toEmail,
    subject: 'Your Appointment Request — HPC Global',
    html: `
      <p>Dear ${name},</p>
      <p>We have received your request to book an appointment with the Prophet for <strong>${whenLabel}</strong>.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>Your request is pending confirmation. We will notify you once it is confirmed.</p>
      <p>God bless you.</p>
      <p><strong>HPC Global — Hopepress Chapel</strong><br>Klagon Junction, Accra, Ghana</p>
    `,
  });
}

async function sendAppointmentStatus(toEmail, name, whenLabel, statusWord) {
  await transporter.sendMail({
    from:    `HPC Global <${FROM}>`,
    to:      toEmail,
    subject: `Your Appointment is ${statusWord === 'confirmed' ? 'Confirmed' : 'Cancelled'} — HPC Global`,
    html: `
      <p>Dear ${name},</p>
      <p>Your appointment with the Prophet for <strong>${whenLabel}</strong> has been <strong>${statusWord}</strong>.</p>
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

module.exports = { sendAutoReply, notifyOffice, sendPasswordReset, notifyPrayerRequest, sendPartnerApplicationConfirmation, sendPartnerActivation, sendEventRsvpConfirmation, sendPrayerConfirmation, sendAppointmentConfirmation, sendAppointmentStatus };
