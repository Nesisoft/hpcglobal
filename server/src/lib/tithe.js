/**
 * The rules behind Admin → Tithes that are pure functions: how a tithe number
 * is written, how a phone is stored, what the acknowledgement SMS may say and
 * how an uploaded list is read. Nothing here touches the database or a
 * provider, so all of it is unit-tested directly.
 *
 * The client mirrors the number, phone and template helpers in
 * client/src/utils/tithe.js so what is previewed is what is sent — change
 * them together.
 */
const { normalizePhone } = require('../services/sms');

const NUMBER_PREFIX = 'HPC';
const NUMBER_DIGITS = 3;   // HPC001 … HPC999, then HPC1000

// Characters that cannot be seen but come along when text is copied from
// WhatsApp, a web page or Word: zero-width spaces and joiners, direction marks,
// the byte-order mark and soft hyphens. "024 412 3456" with one of these inside
// looks right and matches nothing.
const INVISIBLE = /[­​-‏‪-‮⁠﻿]/g;
const stripInvisible = (raw) => String(raw ?? '').replace(INVISIBLE, '');

// ─── Tithe numbers ────────────────────────────────────────────────────────────

/**
 * "hpc 21", "HPC-021", "HPC/021" and "HPC021" are the same number. Letters are
 * upper-cased, spaces and hyphens dropped, and the digits padded to three so a
 * list typed by hand and one exported from a spreadsheet agree. Returns '' for
 * anything that cannot be a tithe number.
 */
function normalizeTitheNumber(raw) {
  const value = stripInvisible(raw).trim()
    .replace(/^(\d+)\.0+$/, '$1')   // 21.0 — a number cell read as a decimal
    .toUpperCase().replace(/[\s\-_.]/g, '')
    // One slash between the letters and the digits is a separator; any other
    // slash ("HPC 21/2") is something else and is refused below.
    .replace(/^([A-Z]{1,6})\/(?=\d+$)/, '$1');
  if (!value) return '';
  // Nine digits in a row is a phone number in the wrong column. Accepting it
  // would also make it the highest number, and so set the next one offered.
  if (/\d{9}/.test(value)) return '';
  // Digits alone are an HPC number with the prefix left off: a list numbered
  // 1, 2 … 150 must land on HPC001 … HPC150, not beside them as new accounts.
  if (/^\d+$/.test(value)) return value.length <= 6 ? NUMBER_PREFIX + String(Number(value)).padStart(NUMBER_DIGITS, '0') : '';
  const m = /^([A-Z]{1,6})(\d{1,8})$/.exec(value);
  if (m) {
    // HPC numbers are padded to three digits, so HPC0021 is HPC021 written
    // with a zero too many. Other schemes keep their zeros as typed.
    const digits = m[1] === NUMBER_PREFIX ? String(Number(m[2])) : m[2];
    return m[1] + digits.padStart(NUMBER_DIGITS, '0');
  }
  // Not prefix+digits (e.g. an older scheme). Accepted as typed, within
  // reason — but a bare "HPC" is a prefix someone forgot to finish, not a number.
  return /^(?=.*\d)[A-Z0-9]{2,20}$/.test(value) ? value : '';
}

/** The next unused HPC number, given every number already taken. */
function nextTitheNumber(existing) {
  // More than six digits is a slip, not a number the office counted up to;
  // it must not decide what comes next.
  const pattern = new RegExp(`^${NUMBER_PREFIX}(\\d{1,6})$`);
  let max = 0;
  for (const number of existing) {
    const m = pattern.exec(number);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return NUMBER_PREFIX + String(max + 1).padStart(NUMBER_DIGITS, '0');
}

// ─── Phones ───────────────────────────────────────────────────────────────────

/**
 * Stored form: what Hubtel is sent (233244123456), or '' if unusable. Ghanaian
 * numbers typed with or without the leading zero, with +233, or with spaces
 * and dashes all land on the same string, so the same number cannot be
 * recorded two ways.
 *
 * Stricter than sms.js normalizePhone, which takes any 7 to 15 digits: the
 * register is kept for years, so a Ghanaian number with a digit missing or one
 * too many is refused here, where the office can see the row and fix it.
 */
function canonicalPhone(raw) {
  const v = stripInvisible(raw).trim()
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
    stored = `233${v}`;                      // 244123456 — Excel dropped the zero
  } else if (/^233[1-9]\d{8}$/.test(v)) {
    stored = v;                              // 233244123456
  } else if (/^2330[1-9]\d{8}$/.test(v)) {
    stored = `233${v.slice(4)}`;             // 233 0244123456
  } else if (/^[1-9]\d{9,14}$/.test(v) && !v.startsWith('233')) {
    // Another country's number without its +: 447911123456. This is also
    // how such a number is stored, so a stored phone always reads back as
    // itself — the SMS and the upload both run stored phones through here.
    stored = v;
  }
  // What is stored is exactly what sms.js will send.
  return stored && normalizePhone(stored) === stored ? stored : '';
}

/** "233244123456" → "024 412 3456", the way people in Ghana write it. */
function formatPhone(stored) {
  const v = String(stored ?? '');
  if (!v) return '';
  if (/^233\d{9}$/.test(v)) {
    const local = `0${v.slice(3)}`;
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return `+${v}`;
}

/** Excel turns a long number into 2.44123E+8 and throws the digits away. */
const looksMangledByExcel = (raw) => /^\d(\.\d+)?E\+?\d+$/i.test(String(raw ?? '').trim());

// ─── Names ────────────────────────────────────────────────────────────────────

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/** "Kofi Mensah & Ama Mensah" for a couple, the one name otherwise. */
function displayName(tither) {
  const names = [tither.name, tither.type === 'COUPLE' && tither.spouseName].filter(Boolean).map((n) => String(n).trim());
  return names.join(' & ');
}

function displayFirstName(tither) {
  const names = [tither.name, tither.type === 'COUPLE' && tither.spouseName].filter(Boolean).map(firstName).filter(Boolean);
  return names.join(' & ');
}

/** Every number the acknowledgement goes to, deduplicated and in order. */
function smsRecipients(tither) {
  const phones = [tither.phone, tither.type === 'COUPLE' && tither.spousePhone].filter(Boolean);
  return [...new Set(phones.map(canonicalPhone).filter(Boolean))];
}

// ─── The acknowledgement template ─────────────────────────────────────────────

const DEFAULT_SMS_TEMPLATE =
  'Dear {name}, we acknowledge receipt of your tithe of {amount} for {month}, paid on {date}. Tithe No. {number}. Thank you and God bless you. - HPC Global';

// The page gets this list from GET /settings; keep the values in step with
// templateValues() in client/src/utils/tithe.js, which previews them.
const PLACEHOLDERS = [
  { key: 'name',      label: 'Name',         description: 'Full name; both names for a couple',          sample: 'Kofi Mensah & Ama Mensah' },
  { key: 'firstName', label: 'First name',   description: 'Just the first name(s)',                      sample: 'Kofi & Ama' },
  { key: 'number',    label: 'Tithe number', description: 'e.g. HPC021',                                  sample: 'HPC021' },
  { key: 'amount',    label: 'Amount',       description: 'With the currency, e.g. GHS 150.00',          sample: 'GHS 150.00' },
  { key: 'month',     label: 'Month',        description: 'The month the tithe is for, e.g. November 2026', sample: 'November 2026' },
  { key: 'date',      label: 'Date paid',    description: 'e.g. 11 Nov 2026',                             sample: '11 Nov 2026' },
  { key: 'church',    label: 'Church name',  description: 'From Settings',                                sample: 'HPC Global' },
];
const PLACEHOLDER_KEYS = new Set(PLACEHOLDERS.map((p) => p.key));

const MAX_TEMPLATE_LENGTH = 600;   // about four SMS segments; longer is a mistake

/** `{name}` → value. Spaces inside the braces are tolerated; unknown ones are left as typed. */
function renderTemplate(template, values) {
  return String(template ?? '').replace(/\{\s*([A-Za-z_]+)\s*\}/g, (match, key) =>
    (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : match));
}

/** Why a template cannot be saved, or null. */
function templateProblem(template) {
  const value = String(template ?? '');
  if (!value.trim()) return 'The message cannot be empty.';
  if (value.length > MAX_TEMPLATE_LENGTH) return `Keep the message under ${MAX_TEMPLATE_LENGTH} characters — it is sent as an SMS.`;
  const unknown = [...value.matchAll(/\{\s*([A-Za-z_]+)\s*\}/g)].map((m) => m[1]).filter((k) => !PLACEHOLDER_KEYS.has(k));
  if (unknown.length) {
    return `{${unknown[0]}} is not a placeholder. Use one of: ${PLACEHOLDERS.map((p) => `{${p.key}}`).join(', ')}.`;
  }
  return null;
}

// ─── Formatting the facts of a payment ────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11" → "November 2026". */
function monthLabel(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''));
  if (!m) return String(month ?? '');
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** A date-only value (stored at UTC midnight) → "11 Nov 2026". */
function dateLabel(date) {
  const d = date instanceof Date ? date : new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(date ?? '');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function amountLabel(amount, currency = 'GHS') {
  return `${currency} ${Number(amount ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The placeholder values for one payment. */
function templateValues(tither, payment, { church = 'HPC Global' } = {}) {
  return {
    name:      displayName(tither),
    firstName: displayFirstName(tither) || displayName(tither),
    number:    tither.number,
    amount:    amountLabel(payment.amount, payment.currency),
    month:     monthLabel(payment.month),
    date:      dateLabel(payment.paidOn),
    church,
  };
}

/** What the SMS will say for this payment. */
function acknowledgementText(template, tither, payment, options) {
  return renderTemplate(template, templateValues(tither, payment, options));
}

// ─── Reading an uploaded list ─────────────────────────────────────────────────

// Header spellings people use, after lower-casing and dropping everything but
// letters and digits ("#" reads as "no"). "Tithe No.", "Tithe #" and
// "tithe_no" all become titheno.
//
// Each field has specific spellings and generic ones. A generic one ("No",
// "ID", "Number") is used only when no column has a specific spelling for that
// field — otherwise a serial-number column on the left would take the tithe
// number's place ahead of the real "Tithe No" column beside it.
const PHONE_WORDS = [
  'phone', 'phonenumber', 'phoneno', 'telephone', 'telephonenumber', 'telephoneno', 'tel', 'telno',
  'mobile', 'mobilenumber', 'mobileno', 'mobilephone', 'cell', 'cellphone', 'cellno', 'cellnumber',
  'contact', 'contactnumber', 'contactno', 'momo', 'momonumber', 'momono', 'whatsapp', 'whatsappnumber', 'whatsappno',
];
// The possessive keeps its s: "Spouse's Name" squashes to spousesname.
// Not "Partner": the church runs a partners' programme, so a Partner column
// is as likely to say Yes or No as to name a husband or wife.
const SPOUSE_WORDS = ['spouse', 'spouses', 'wife', 'wifes', 'husband', 'husbands'];
const joined = (starts, ends) => starts.flatMap((s) => ends.map((e) => s + e));

const HEADERS = {
  number: {
    specific: [
      'tithenumber', 'tithenum', 'titheno', 'titheid', 'tithecode', 'tithecard', 'tithecardno', 'tithecardnumber',
      'tithersno', 'tithersnumber', 'tithernumber', 'titherno', 'titherid',
      'memberno', 'membernumber', 'memberid', 'membershipno', 'membershipnumber', 'membershipid',
      'envelope', 'envelopeno', 'envelopenumber', 'accountnumber', 'accountno', 'cardno', 'cardnumber',
    ],
    // "Tithe" alone may just as well head the amounts, so it is only taken
    // when nothing else names the number ("Tithe #" squashes to titheno).
    generic: ['number', 'no', 'num', 'id', 'code', 'account', 'tithe'],
  },
  name: {
    specific: ['name', 'names', 'fullname', 'fullnames', 'member', 'membername', 'membersname', 'tither', 'tithername', 'tithersname', 'nameoftither', 'nameofmember'],
    generic: ['person', 'firstperson'],
  },
  phone: {
    specific: PHONE_WORDS,
    generic: ['phone1', 'number1', 'contact1', 'mobile1', 'tel1'],
  },
  type: {
    specific: ['type', 'accounttype', 'tithertype', 'tithetype', 'individualcouple', 'individualorcouple', 'coupleorindividual', 'singlecouple', 'singleorcouple'],
    generic: ['category', 'kind'],
  },
  spouseName: {
    // Nothing vaguer than a spouse word: "Second Name" is a surname in many
    // registers, and a spouse column turns every row with a value into a couple.
    specific: [...SPOUSE_WORDS, ...joined(SPOUSE_WORDS, ['name', 'names', 'fullname']), 'nameofspouse'],
    generic: [],
  },
  spousePhone: {
    specific: [...joined(SPOUSE_WORDS, [...PHONE_WORDS, 'number', 'no', 'num']), ...PHONE_WORDS.map((p) => `${p}ofspouse`)],
    generic: ['phone2', 'number2', 'contact2', 'mobile2', 'tel2', 'secondphone', 'secondcontact', 'secondnumber', 'otherphone'],
  },
};
const FIELD_ORDER = ['number', 'name', 'phone', 'type', 'spouseName', 'spousePhone'];
const ALIASES = Object.fromEntries(Object.entries(HEADERS).map(([field, { specific, generic }]) =>
  [field, { specific: new Set(specific), generic: new Set(generic) }]));
const isPhoneHeader = (key) => ALIASES.phone.specific.has(key) || ALIASES.phone.generic.has(key);

const squash = (header) => stripInvisible(header).toLowerCase().replace(/#/g, 'no').replace(/[^a-z0-9]/g, '');

/**
 * Which column holds which field. Returns null when the row does not look
 * like a header row — then columns are taken in the template's order.
 */
function matchHeaders(row) {
  const keys    = row.map(squash);
  const columns = {};
  const used    = new Set();
  for (const kind of ['specific', 'generic']) {
    keys.forEach((key, i) => {
      if (!key || used.has(i)) return;
      const field = FIELD_ORDER.find((f) => columns[f] === undefined && ALIASES[f][kind].has(key));
      if (field) { columns[field] = i; used.add(i); }
    });
  }
  // "Name, Phone, Spouse, Phone": a phone column after the spouse's name is
  // the spouse's. Without a spouse column a second phone ("WhatsApp") is the
  // same person's other number, and is left out.
  if (columns.spousePhone === undefined && columns.phone !== undefined && columns.spouseName !== undefined) {
    const i = keys.findIndex((key, j) => j > columns.spouseName && !used.has(j) && isPhoneHeader(key));
    if (i >= 0) columns.spousePhone = i;
  }
  // A header row names at least the person and either their number or phone.
  return columns.name !== undefined && (columns.number !== undefined || columns.phone !== undefined) ? columns : null;
}

// After lower-casing, "&" read as "and" and punctuation as spaces, so
// "Mr. & Mrs." is "mr and mrs" and "Couple." is "couple".
const COUPLE_TYPES = new Set([
  'c', 'couple', 'couples', 'a couple', 'married', 'married couple', 'joint', 'family',
  'mr and mrs', 'mr mrs', 'husband and wife', 'husband wife', 'wife and husband',
]);
const INDIVIDUAL_TYPES = new Set([
  'i', 'ind', 'indiv', 'indv', 'individual', 'individuals', 'an individual', 'single', 'single person',
  'person', 'one person', 'member', 'personal', 'self',
]);

function parseType(raw, spouseName) {
  const value = stripInvisible(raw).toLowerCase().replace(/[&+]/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  if (!value) return spouseName ? 'COUPLE' : 'INDIVIDUAL';
  if (COUPLE_TYPES.has(value)) return 'COUPLE';
  if (INDIVIDUAL_TYPES.has(value)) return 'INDIVIDUAL';
  return null;
}

// Keep in step with titherSchema in routes/tithes.js: a longer name passes the
// preview and is then refused when the office confirms.
const MAX_NAME = 120;

// How far down the sheet a header row is looked for, past a title or a note.
const HEADER_SEARCH_ROWS = 10;

const isBlank  = (value) => stripInvisible(value).trim() === '';
const hasData  = (row) => row.some((value) => !isBlank(value));

/** The header row's index and columns, or null when the list has none. */
function findHeader(rows) {
  let tried = 0;
  for (let i = 0; i < rows.length && tried < HEADER_SEARCH_ROWS; i++) {
    if (!hasData(rows[i])) continue;
    tried += 1;
    const columns = matchHeaders(rows[i]);
    if (columns) return { index: i, columns };
    // A tithe number and a phone on one row means the tithers have started
    // and there is no header — looking further down would skip them. A phone
    // alone may be the church's own, in a letterhead above the column names.
    if (looksLikeTither(rows[i])) return null;
  }
  return null;
}

/** "HPC021 … 0244123456": a written-out tithe number and a phone in one row. */
function looksLikeTither(row) {
  return row.some((value) => /^[A-Za-z]{1,6}[\s\-_./]*\d{1,8}$/.test(stripInvisible(value).trim()) && normalizeTitheNumber(value))
    && row.some((value) => canonicalPhone(value));
}

// What people put in a spouse column for "nobody".
const NO_SPOUSE = /^(no|none|nil|n\/?a|not applicable|yes|single|-+|\.+)$/i;

/**
 * Turn the rows of an uploaded sheet into tither records with their problems.
 * Does not look at the database — the route adds whether each number exists.
 *
 * @param {string[][]} rows  from lib/spreadsheet readTable
 * @returns {{ columns: Object<string, number>, hadHeader: boolean, headerLine: number, ignored: string[], rows: Array<{line:number, number:string, name:string, phone:string, type:string, spouseName:string, spousePhone:string, problems:string[], warnings:string[]}> }}
 *   headerLine is the sheet row the column names were read from (0 for none);
 *   ignored lists the named columns that were not used, so the office can see
 *   a column was not picked up.
 */
function readTitherRows(rows) {
  const first = rows.findIndex(hasData);
  if (first < 0) return { columns: {}, hadHeader: false, headerLine: 0, ignored: [], rows: [] };

  const header    = findHeader(rows);
  const hadHeader = Boolean(header);
  const columns   = header ? header.columns : Object.fromEntries(FIELD_ORDER.map((field, i) => [field, i]));
  const used      = new Set(Object.values(columns));
  const ignored   = header
    ? rows[header.index].map((value, i) => (used.has(i) ? '' : stripInvisible(value).trim().replace(/\s+/g, ' '))).filter(Boolean)
    : [];

  const cell = (row, field) => (columns[field] === undefined ? '' : stripInvisible(row[columns[field]]).trim());
  // A list with no Type or Spouse column cannot say who is a couple, so when
  // it updates the register it must leave each account's type alone.
  const keepType = !['type', 'spouseName', 'spousePhone'].some((field) => columns[field] !== undefined);
  const seen      = new Map();   // number → line it first appeared on
  const phoneRows = new Map();   // stored phone → line it first appeared on
  const out       = [];

  for (let i = hadHeader ? header.index + 1 : first; i < rows.length; i++) {
    const row = rows[i];
    if (!hasData(row)) continue;
    const line     = i + 1;
    const problems = [];
    const warnings = [];

    const rawNumber = cell(row, 'number');
    const number    = normalizeTitheNumber(rawNumber);
    if (!rawNumber) problems.push('No tithe number.');
    else if (!number) problems.push(`"${rawNumber}" is not a tithe number (expected something like HPC021).`);
    else if (seen.has(number)) problems.push(`${number} is also on row ${seen.get(number)}.`);
    else seen.set(number, line);

    const name = cell(row, 'name').replace(/\s+/g, ' ');
    if (!name) problems.push('No name.');
    else if (name.length > MAX_NAME) problems.push(`The name is longer than ${MAX_NAME} characters.`);

    const spouseCell     = cell(row, 'spouseName').replace(/\s+/g, ' ');
    const spouseName     = NO_SPOUSE.test(spouseCell) ? '' : spouseCell;
    const rawSpousePhone = cell(row, 'spousePhone');
    const type = parseType(cell(row, 'type'), spouseName);
    if (!type) problems.push(`Type should be "Individual" or "Couple", not "${cell(row, 'type')}".`);
    else if (type === 'COUPLE' && !spouseName) problems.push('A couple needs the spouse\'s name.');
    else if (type === 'COUPLE' && spouseName.length > MAX_NAME) problems.push(`The spouse name is longer than ${MAX_NAME} characters.`);
    else if (type === 'INDIVIDUAL' && spouseName && rawSpousePhone) warnings.push('The spouse name and phone are ignored because the type is Individual — put "Couple" in the type column to keep them.');
    else if (type === 'INDIVIDUAL' && spouseName) warnings.push('The spouse name is ignored because the type is Individual — put "Couple" in the type column to keep it.');
    else if (type === 'INDIVIDUAL' && rawSpousePhone) warnings.push('The spouse phone is ignored because the type is Individual — put "Couple" in the type column to keep it.');

    // An individual's spouse phone is dropped (and said so above), so a typo in
    // it is no reason to refuse the row.
    const phones = { phone: '', spousePhone: '' };
    let phoneProblem = false;
    for (const field of type === 'INDIVIDUAL' ? ['phone'] : ['phone', 'spousePhone']) {
      const raw = cell(row, field);
      if (!raw) continue;
      if (looksMangledByExcel(raw)) {
        problems.push(`The ${field === 'phone' ? 'phone' : 'spouse phone'} was saved by Excel as ${raw} and digits were lost. Format that column as Text, or save the file as .xlsx.`);
        phoneProblem = true;
        continue;
      }
      const stored = canonicalPhone(raw);
      if (!stored) { problems.push(`"${raw}" is not a usable phone number.`); phoneProblem = true; }
      else phones[field] = stored;
    }
    // The phones that are kept: a spouse phone only for a couple.
    const kept = [phones.phone, type === 'COUPLE' ? phones.spousePhone : ''];
    // A phone problem already says there is no usable number — once is enough.
    if (!kept.some(Boolean) && !phoneProblem && type !== null) warnings.push('No phone number, so no SMS can be sent.');
    // The same phone on two rows is usually a copy-paste slip (a couple
    // sharing one phone is on one row, and is fine).
    for (const stored of kept) {
      if (!stored) continue;
      const earlier = phoneRows.get(stored);
      if (earlier === undefined) phoneRows.set(stored, line);
      else if (earlier !== line) warnings.push(`${formatPhone(stored)} is also on row ${earlier}.`);
    }

    out.push({
      line, number: number || rawNumber, name, type: type || '',
      phone: phones.phone, spouseName: type === 'COUPLE' ? spouseName : '', spousePhone: kept[1],
      keepType, problems, warnings,
    });
  }
  return { columns, hadHeader, headerLine: hadHeader ? header.index + 1 : 0, ignored, rows: out };
}

module.exports = {
  NUMBER_PREFIX, normalizeTitheNumber, nextTitheNumber,
  canonicalPhone, formatPhone, looksMangledByExcel,
  displayName, displayFirstName, smsRecipients,
  DEFAULT_SMS_TEMPLATE, PLACEHOLDERS, MAX_TEMPLATE_LENGTH, renderTemplate, templateProblem,
  monthLabel, dateLabel, amountLabel, templateValues, acknowledgementText,
  readTitherRows, matchHeaders, parseType,
};
