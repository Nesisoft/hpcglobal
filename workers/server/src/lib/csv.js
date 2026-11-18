/**
 * CSV for spreadsheets. A cell starting with = + - @ (or a tab or return) is
 * a formula to Excel and Google Sheets, so such text gets a leading
 * apostrophe — the same rule as the website's exports — and a name typed as
 * "=HYPERLINK(...)" stays just text.
 */
const esc = (v) => {
  const s = String(v ?? '');
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Rows of values (the first is the header) as CSV text, with a BOM so Excel reads it as UTF-8. */
const toCsv = (rows) => `﻿${rows.map((r) => r.map(esc).join(',')).join('\r\n')}\r\n`;

function sendCsv(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
  res.send(toCsv(rows));
}

module.exports = { toCsv, sendCsv, esc };
