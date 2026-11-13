/**
 * Helpers for Admin → Tithes. The number, phone and template rules mirror
 * server/src/lib/tithe.js so that what the page previews is what the server
 * stores and sends — change them together.
 */

// Characters that cannot be seen but come along when text is copied from
// WhatsApp, a web page or Word (zero-width spaces, direction marks, the
// byte-order mark, soft hyphens).
const INVISIBLE = /[­​-‏‪-‮⁠﻿]/g;

/** "hpc 21" or "HPC/021" → "HPC021"; '' when it cannot be a tithe number. */
export function normalizeTitheNumber(raw) {
  const value = String(raw ?? '').replace(INVISIBLE, '').trim()
    .replace(/^(\d+)\.0+$/, '$1')   // 21.0 — a number cell read as a decimal
    .toUpperCase().replace(/[\s\-_.]/g, '')
    // One slash between the letters and the digits is a separator; any other is refused.
    .replace(/^([A-Z]{1,6})\/(?=\d+$)/, '$1');
  if (!value) return '';
  // Nine digits in a row is a phone number typed in the wrong box.
  if (/\d{9}/.test(value)) return '';
  // Digits alone are an HPC number with the prefix left off.
  if (/^\d+$/.test(value)) return value.length <= 6 ? `HPC${String(Number(value)).padStart(3, '0')}` : '';
  const m = /^([A-Z]{1,6})(\d{1,8})$/.exec(value);
  // HPC numbers are padded to three digits, so HPC0021 is HPC021.
  if (m) return m[1] + (m[1] === 'HPC' ? String(Number(m[2])) : m[2]).padStart(3, '0');
  return /^(?=.*\d)[A-Z0-9]{2,20}$/.test(value) ? value : '';
}

// sms.js normalizePhone, copied so canonicalPhone below can make the same
// final check the server does.
function normalizePhone(raw) {
  let v = String(raw ?? '').replace(/[\s()\-.]/g, '');
  if (!v) return '';
  if (v.startsWith('+')) v = v.slice(1);
  if (v.startsWith('00')) v = v.slice(2);
  if (v.startsWith('0') && v.length === 10) v = `233${v.slice(1)}`;
  else if (/^\d{9}$/.test(v)) v = `233${v}`;
  return /^\d{7,15}$/.test(v) ? v : '';
}

/**
 * The stored form of a phone (233244123456), or '' when the server would
 * refuse it. Same rules as canonicalPhone in server/src/lib/tithe.js, so the
 * give page can say "that doesn't look right" before the giver is sent away.
 */
export function canonicalPhone(raw) {
  const v = String(raw ?? '').replace(INVISIBLE, '').trim()
    .replace(/^(\d+)\.0+$/, '$1')   // 244123456.0 — a number cell read as a decimal
    .replace(/\(0\)/g, '')          // +233 (0)24 …: that 0 is only dialled at home
    .replace(/[\s()\-.]/g, '');
  if (!v) return '';

  let stored = '';
  const international = /^(?:\+|00)(\d+)$/.exec(v);
  if (international) {
    const digits = international[1];
    if (digits.startsWith('233')) {
      // Ghana: exactly nine digits after 233, once a stray 0 is dropped.
      const rest = digits.slice(3).replace(/^0/, '');
      if (/^[1-9]\d{8}$/.test(rest)) stored = `233${rest}`;
    } else if (/^[1-9]\d{9,14}$/.test(digits)) {
      stored = digits;                       // another country, taken as given
    }
  } else if (/^0[1-9]\d{8}$/.test(v)) {
    stored = `233${v.slice(1)}`;             // 0244123456
  } else if (/^[1-9]\d{8}$/.test(v)) {
    stored = `233${v}`;                      // 244123456 — the zero left off
  } else if (/^233[1-9]\d{8}$/.test(v)) {
    stored = v;                              // 233244123456
  } else if (/^2330[1-9]\d{8}$/.test(v)) {
    stored = `233${v.slice(4)}`;             // 233 0244123456
  } else if (/^[1-9]\d{9,14}$/.test(v) && !v.startsWith('233')) {
    stored = v;                              // another country's number without its +
  }
  return stored && normalizePhone(stored) === stored ? stored : '';
}

/** Stored phones are 233…; show them the way people in Ghana write them. */
export function formatPhone(stored) {
  const v = String(stored ?? '');
  if (!v) return '';
  if (/^233\d{9}$/.test(v)) {
    const local = `0${v.slice(3)}`;
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return v.startsWith('+') ? v : `+${v}`;
}

/** "Kofi Mensah & Ama Mensah" for a couple, the one name otherwise. */
export function displayName(tither) {
  if (!tither) return '';
  return [tither.name, tither.type === 'COUPLE' && tither.spouseName].filter(Boolean).join(' & ');
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
export function displayFirstName(tither) {
  if (!tither) return '';
  return [tither.name, tither.type === 'COUPLE' && tither.spouseName].filter(Boolean).map(firstName).filter(Boolean).join(' & ');
}

/** `{name}` → value; unknown placeholders are left as typed, like the server. */
export function renderTemplate(template, values) {
  return String(template ?? '').replace(/\{\s*([A-Za-z_]+)\s*\}/g, (match, key) =>
    (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : match));
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11" → "November 2026". */
export function monthLabel(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''));
  if (!m) return String(month ?? '');
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** "2026-11-11" (or an ISO moment) → "11 Nov 2026". */
export function dateLabel(date) {
  if (!date) return '';
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function amountLabel(amount, currency = 'GHS') {
  return `${currency} ${Number(amount ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The placeholder values for a payment, the way the server fills them in. */
export function templateValues(tither, payment, church = 'HPC Global') {
  return {
    name:      displayName(tither),
    firstName: displayFirstName(tither) || displayName(tither),
    number:    tither?.number ?? '',
    amount:    amountLabel(payment?.amount, payment?.currency || 'GHS'),
    month:     monthLabel(payment?.month),
    date:      dateLabel(payment?.paidOn),
    church,
  };
}

/** Today's date and month in the office's own calendar, as "YYYY-MM-DD" / "YYYY-MM". */
export function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const thisMonth = () => todayYmd().slice(0, 7);

/** "2026-11" shifted by n months. */
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The SMS statuses a payment can carry, with how the page words them. */
export const SMS_STATUS = {
  SENT:    { label: 'SMS sent',    className: 'bg-green-50 text-green-700' },
  FAILED:  { label: 'SMS failed',  className: 'bg-red-50 text-red-600' },
  SKIPPED: { label: 'No SMS',      className: 'bg-ink/5 text-ink/50' },
};
