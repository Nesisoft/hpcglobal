/**
 * Phone numbers as people in Ghana type them: 024 412 3456, 0244123456,
 * +233 24 412 3456, 233244123456. All land on one stored form, the number as
 * dialled internationally (233244123456), so the same phone can't be recorded
 * two ways. Another country's number is accepted with its + or 00.
 *
 * Returns '' for anything that isn't a usable number.
 */
function canonicalPhone(raw) {
  const v = String(raw ?? '').normalize('NFKC')
    .replace(/[​-‍⁠﻿]/g, '')
    .trim()
    .replace(/\(0\)/g, '')          // +233 (0)24 …: that 0 is only dialled at home
    .replace(/[\s()\-.]/g, '');
  if (!v) return '';

  const international = /^(?:\+|00)(\d+)$/.exec(v);
  if (international) {
    const digits = international[1];
    if (digits.startsWith('233')) {
      const rest = digits.slice(3).replace(/^0/, '');
      return /^[1-9]\d{8}$/.test(rest) ? `233${rest}` : '';
    }
    return /^[1-9]\d{9,14}$/.test(digits) ? digits : '';
  }
  if (/^0[1-9]\d{8}$/.test(v)) return `233${v.slice(1)}`;
  if (/^233[1-9]\d{8}$/.test(v)) return v;
  if (/^2330[1-9]\d{8}$/.test(v)) return `233${v.slice(4)}`;
  return '';
}

/** "233244123456" → "024 412 3456", the way it is written locally. */
function formatPhone(stored) {
  const v = String(stored ?? '');
  if (!v) return '';
  if (/^233\d{9}$/.test(v)) {
    const local = `0${v.slice(3)}`;
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return `+${v}`;
}

module.exports = { canonicalPhone, formatPhone };
