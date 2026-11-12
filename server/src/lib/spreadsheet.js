/**
 * Read a CSV or .xlsx file into rows of text, for the tither upload.
 *
 * Deliberately dependency-free: the npm `xlsx` package has had open security
 * advisories for years and the alternatives pull in a dozen packages to read
 * what is, for us, a four-column list. An .xlsx is a zip of XML files, and the
 * handful we need — the first visible worksheet and its shared-strings table —
 * are simple enough to read directly. Excel, Google Sheets and LibreOffice all
 * write them the same way.
 *
 * Cells come back as strings, as the person would see them typed, with one
 * exception: a number is rendered the way JavaScript renders it, so a phone
 * number Excel stored as 244123456 comes back as "244123456" (the caller puts
 * the leading zero back) and never as "2.44123456E8".
 *
 * Row i of the result is line i + 1 of the sheet as Excel numbers it, so a
 * problem reported on "row 12" is on the row the office sees as 12.
 *
 * Anyone signed in as a super admin can upload, so a crafted file must not be
 * able to run the server out of memory or keep it busy: every limit below is
 * there for that, and the XML is scanned with indexOf in one pass rather than
 * with regular expressions that backtrack over malformed input.
 */
const zlib = require('zlib');

const MAX_ROWS        = 5000;                // rows with something in them
const MAX_ROW_NUMBER  = MAX_ROWS * 10;       // how far down the sheet those rows may sit
const MAX_COLUMNS     = 100;                 // cells further right are ignored
const MAX_CELL_TEXT   = 1000;                // characters kept from any one cell
const MAX_TABLE_TEXT  = 10 * 1000 * 1000;    // characters in all the kept cells together
const MAX_SHARED_TEXT = 5 * 1000 * 1000;     // characters in the shared-strings table
const MAX_CELL_TAGS   = 1000 * 1000;         // cells scanned, empty or not (keeps a crafted sheet to a fraction of a second)
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;    // a 5 MB upload must not inflate past this

class SpreadsheetError extends Error {}

const NOT_XLSX = 'That file is not a valid .xlsx workbook.';
const tooBig   = (noun) => new SpreadsheetError(`That ${noun} is too big — keep it under ${MAX_ROWS} rows.`);

// ─── Rows ─────────────────────────────────────────────────────────────────────

/**
 * Collects rows at their place in the sheet. Rows with nothing in them are
 * only filled in (with `blank()`) ahead of a later row that has text, so a
 * register pre-formatted with borders down to row 10,000 costs nothing and
 * does not count toward the row limit.
 */
function rowList(noun, blank) {
  const rows = [];
  let filled = 0;
  let text   = 0;
  return {
    rows,
    place(index, row) {
      let any = false;
      let length = 0;
      for (const cell of row) {
        length += cell.length;
        if (!any && cell.trim() !== '') any = true;
      }
      if (!any) return;
      if (index >= MAX_ROW_NUMBER || ++filled > MAX_ROWS) throw tooBig(noun);
      if ((text += length) > MAX_TABLE_TEXT) {
        throw new SpreadsheetError(`That ${noun} has too much text to read. Upload just the tither list.`);
      }
      while (rows.length < index) rows.push(blank());
      rows[index] = row;
    },
  };
}

// ─── Zip ──────────────────────────────────────────────────────────────────────

/** The members of a zip file we care about, by name, read lazily. */
function readZip(buffer) {
  if (buffer.length < 22) throw new SpreadsheetError('That file is empty or not a spreadsheet.');

  // The end-of-central-directory record sits at the end, after an optional
  // comment of up to 65535 bytes.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new SpreadsheetError(NOT_XLSX);

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset       = buffer.readUInt32LE(eocd + 16);
  const entries    = new Map();

  for (let n = 0; n < entryCount; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new SpreadsheetError(NOT_XLSX);
    }
    const method        = buffer.readUInt16LE(offset + 10);
    const compressed    = buffer.readUInt32LE(offset + 20);
    const uncompressed  = buffer.readUInt32LE(offset + 24);
    const nameLength    = buffer.readUInt16LE(offset + 28);
    const extraLength   = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset   = buffer.readUInt32LE(offset + 42);
    const name          = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.set(name, { method, compressed, uncompressed, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  function read(name) {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.uncompressed > MAX_ENTRY_BYTES) throw new SpreadsheetError('That workbook is too large to read.');

    const local = entry.localOffset;
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) {
      throw new SpreadsheetError(NOT_XLSX);
    }
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data  = buffer.subarray(start, start + entry.compressed);

    if (entry.method === 0) return data.toString('utf8');
    if (entry.method === 8) {
      // The size in the directory can lie; the cap on the output cannot.
      try {
        return zlib.inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }).toString('utf8');
      } catch (err) {
        if (err?.code === 'ERR_BUFFER_TOO_LARGE') throw new SpreadsheetError('That workbook is too large to read.');
        throw new SpreadsheetError(NOT_XLSX);
      }
    }
    throw new SpreadsheetError('That workbook uses a compression this site cannot read.');
  }

  return { has: (name) => entries.has(name), names: () => [...entries.keys()], read };
}

// ─── XML bits ─────────────────────────────────────────────────────────────────

function decodeEntities(text) {
  if (!text.includes('&')) return text;
  return text
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, hex) => codePoint(parseInt(hex, 16), m))
    .replace(/&#(\d{1,7});/g,         (m, dec) => codePoint(Number(dec), m))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// An out-of-range character reference is left as typed rather than throwing.
const codePoint = (n, original) => (n <= 0x10ffff ? String.fromCodePoint(n) : original);

/** Raw XML text as a cell's value: decoded, and no longer than a cell may be. */
function cellText(raw) {
  // Cut before decoding too, so a huge value is never decoded whole; an
  // entity is at most a dozen characters, so this keeps enough to fill a cell.
  if (raw.length > MAX_CELL_TEXT * 12) raw = raw.slice(0, MAX_CELL_TEXT * 12);
  const text = decodeEntities(raw);
  return text.length > MAX_CELL_TEXT ? text.slice(0, MAX_CELL_TEXT) : text;
}

const attrPatterns = new Map();
function attr(tag, name) {
  let re = attrPatterns.get(name);
  if (!re) {
    re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
    attrPatterns.set(name, re);
  }
  const m = re.exec(tag);
  return m ? decodeEntities(m[1] ?? m[2]) : undefined;
}

/** A relationship id, whatever prefix the namespace was given (r:id, ns2:id). */
function relId(tag) {
  const m = /(?:^|\s)[\w.-]+:id\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(tag);
  return m ? decodeEntities(m[1] ?? m[2]) : attr(tag, 'id');
}

/**
 * Some writers put every element in a prefixed namespace (<x:row>, <x:c>).
 * Drop element prefixes so the rest of the code sees plain names; attribute
 * prefixes (r:id) are left alone.
 */
function stripPrefixes(xml) {
  return xml.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1');
}

const isNameEnd = (code) => code === 62 /* > */ || code === 47 /* / */ || code === 32 || code === 9 || code === 10 || code === 13;

/**
 * Each <name …>…</name> or <name …/> in xml, in order, as { attrs, inner,
 * start, end }. Found with indexOf from where the last one ended, so the
 * whole string is read once; an element that is never closed ends the scan
 * there instead of being searched for again from every later position.
 * Elements of the same name are not expected to nest (rows, cells, strings).
 */
function* elements(xml, name) {
  const open  = `<${name}`;
  const close = `</${name}>`;
  let pos = 0;
  while ((pos = xml.indexOf(open, pos)) !== -1) {
    const nameEnd = pos + open.length;
    if (!isNameEnd(xml.charCodeAt(nameEnd))) { pos = nameEnd; continue; }   // <rowBreaks>, <col>…
    const gt = xml.indexOf('>', nameEnd);
    if (gt === -1) return;
    if (xml.charCodeAt(gt - 1) === 47) {
      yield { attrs: xml.slice(nameEnd, gt - 1), inner: '', start: pos, end: gt + 1 };
      pos = gt + 1;
      continue;
    }
    const end = xml.indexOf(close, gt + 1);
    if (end === -1) return;
    yield { attrs: xml.slice(nameEnd, gt), inner: xml.slice(gt + 1, end), start: pos, end: end + close.length };
    pos = end + close.length;
  }
}

function firstElement(xml, name) {
  for (const el of elements(xml, name)) return el;
  return null;
}

/** The text of every <t> inside a run of rich-text or inline-string XML, joined. */
function textRuns(xml) {
  // Phonetic guides (<rPh>, the small kana above Japanese names) are not part
  // of what the cell shows.
  if (xml.includes('<rPh')) {
    let kept = '';
    let from = 0;
    for (const ph of elements(xml, 'rPh')) { kept += xml.slice(from, ph.start); from = ph.end; }
    xml = kept + xml.slice(from);
  }
  let out = '';
  for (const t of elements(xml, 't')) {
    out += cellText(t.inner);
    if (out.length >= MAX_CELL_TEXT) return out.slice(0, MAX_CELL_TEXT);
  }
  return out;
}

/** "AB12" → 27: the 0-based column of a cell reference, -1 when it has none, Infinity when far right. */
function columnIndex(ref) {
  let n = 0;
  let i = 0;
  for (; i < ref.length; i++) {
    const code = ref.charCodeAt(i) & ~32;   // upper-case
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
    if (n > MAX_COLUMNS) return Infinity;
  }
  return i === 0 ? -1 : n - 1;
}

// ─── XLSX ─────────────────────────────────────────────────────────────────────

/** A relationship's Target as a path inside the zip; targets are relative to xl/ unless they start with /. */
function resolveTarget(target) {
  const parts = (target.startsWith('/') ? target.slice(1) : `xl/${target}`).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

function workbookRels(zip) {
  const xml = zip.read('xl/_rels/workbook.xml.rels');
  if (!xml) return [];
  return [...elements(stripPrefixes(xml), 'Relationship')].map((rel) => ({
    id:     attr(rel.attrs, 'Id'),
    type:   attr(rel.attrs, 'Type') || '',
    target: attr(rel.attrs, 'Target') || '',
  }));
}

/** The first sheet the person can see; a hidden one (lookup lists, old data) is skipped. */
function firstSheetPath(zip, rels) {
  const workbook = zip.read('xl/workbook.xml');
  if (workbook && rels.length) {
    const sheets = [];
    for (const sheet of elements(stripPrefixes(workbook), 'sheet')) {
      const id    = relId(sheet.attrs);
      const state = attr(sheet.attrs, 'state');
      if (id) sheets.push({ id, hidden: state === 'hidden' || state === 'veryHidden' });
    }
    // Excel insists on one visible sheet, but fall back to a hidden one
    // rather than to a guessed file name.
    const pick = sheets.find((s) => !s.hidden) || sheets[0];
    const rel  = pick && rels.find((r) => r.id === pick.id);
    if (rel?.target) return resolveTarget(rel.target);
  }
  return 'xl/worksheets/sheet1.xml';
}

function sharedStrings(zip, rels) {
  const rel = rels.find((r) => r.type.endsWith('/sharedStrings') && r.target);
  const xml = zip.read(rel ? resolveTarget(rel.target) : 'xl/sharedStrings.xml')
    ?? (rel ? zip.read('xl/sharedStrings.xml') : null);
  if (!xml) return [];
  const out = [];
  let total = 0;
  // A self-closing <si/> is an empty string and must still take its place,
  // or every later string lands on the wrong cell.
  for (const si of elements(stripPrefixes(xml), 'si')) {
    const text = si.inner ? textRuns(si.inner) : '';
    total += text.length + 1;
    if (total > MAX_SHARED_TEXT) {
      throw new SpreadsheetError('That workbook has too much text to read. Copy just the tither list into a new workbook and upload that.');
    }
    out.push(text);
  }
  return out;
}

/** A cell's <v> as a person would read it: numbers without float noise. */
function numberText(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  // 1e21 and up render in exponent form; nothing in a tither list is that big.
  return String(n);
}

/** Recognise the other spreadsheet programs' files, so the office is told what to do. */
function otherWorkbook(zip, filename) {
  let mimetype = '';
  if (zip.has('mimetype')) {
    try { mimetype = zip.read('mimetype') || ''; } catch { /* unreadable: not one of these */ }
  }
  if (mimetype.includes('application/vnd.oasis.opendocument.spreadsheet') || /\.ods$/i.test(filename)) {
    return 'a LibreOffice (.ods)';
  }
  if (/\.numbers$/i.test(filename) || zip.names().some((name) => name.startsWith('Index/'))) {
    return 'an Apple Numbers';
  }
  return null;
}

function parseXlsx(buffer, filename = '') {
  const zip = readZip(buffer);
  if (!zip.has('[Content_Types].xml')) {
    const kind = otherWorkbook(zip, filename);
    if (kind) throw new SpreadsheetError(`That looks like ${kind} file. Save it as Excel (.xlsx) or CSV and upload that.`);
    throw new SpreadsheetError(NOT_XLSX);
  }

  const rels     = workbookRels(zip);
  const sheetXml = zip.read(firstSheetPath(zip, rels));
  if (!sheetXml) throw new SpreadsheetError('That workbook has no worksheet to read.');
  const strings = sharedStrings(zip, rels);

  const list  = rowList('sheet', () => []);
  let next    = 0;   // where a row without r="" goes
  let tags    = 0;
  for (const rowEl of elements(stripPrefixes(sheetXml), 'row')) {
    // r="" is the row number Excel shows; rows left out in between are blank.
    const r     = Number(attr(rowEl.attrs, 'r'));
    const index = Number.isInteger(r) && r >= 1 ? Math.max(r - 1, next) : next;
    next = index + 1;
    if (!rowEl.inner) continue;

    const row = [];
    for (const c of elements(rowEl.inner, 'c')) {
      if (++tags > MAX_CELL_TAGS) throw tooBig('sheet');
      const ref = attr(c.attrs, 'r');
      let col   = ref ? columnIndex(ref) : -1;
      if (col < 0) col = row.length;
      if (col >= MAX_COLUMNS) continue;

      const type = attr(c.attrs, 't');
      let value  = '';
      if (type === 'inlineStr') {
        const is = firstElement(c.inner, 'is');
        value = textRuns(is ? is.inner : c.inner);
      } else {
        const v   = c.inner ? firstElement(c.inner, 'v') : null;
        const raw = v ? cellText(v.inner) : '';
        // No <v> at all is an empty cell — Number('') would be 0, the first string.
        if (type === 's')      value = raw === '' ? '' : strings[Number(raw)] ?? '';
        else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'str' || type === 'e' || type === 'd') value = raw;
        else                   value = raw === '' ? '' : numberText(raw);
      }
      while (row.length < col) row.push('');
      row[col] = value;
    }
    list.place(index, row);
  }
  return list.rows;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

// Windows-1252 differs from Latin-1 only in 0x80–0x9F, where Excel keeps its
// curly quotes, dashes and the euro sign. (Node's TextDecoder treats the two
// as the same, so this is done by hand.) The five unused bytes stay as they are.
const CP1252_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f'
                  + '\u0090‘’“”•–—˜™š›œ\u009džŸ';

const hasUtf16Bom = (buffer) => buffer.length >= 2
  && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff));

/**
 * The text of a CSV, in whichever encoding it was saved. Excel's
 * "CSV (Comma delimited)" is Windows-1252, "CSV UTF-8" has a byte-order mark,
 * and "Unicode Text" is UTF-16 with a mark (and tabs between the columns).
 */
function decodeText(buffer) {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return buffer.toString('utf8', 3);
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le', 2, 2 + ((buffer.length - 2) & ~1));
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2, 2 + ((buffer.length - 2) & ~1)));
    return swapped.swap16().toString('utf16le');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return buffer.toString('latin1').replace(/[\x80-\x9f]/g, (ch) => CP1252_HIGH[ch.charCodeAt(0) - 0x80]);
  }
}

/** The first line with something on it — a file may start with blank lines. */
function firstFilledLine(text) {
  const at = text.search(/\S/);
  if (at < 0) return '';
  const start = Math.max(text.lastIndexOf('\n', at), text.lastIndexOf('\r', at)) + 1;
  const eol   = /[\r\n]/g;
  eol.lastIndex = at;
  const m = eol.exec(text);
  return text.slice(start, m ? m.index : text.length);
}

function detectDelimiter(line) {
  const counts = [',', ';', '\t'].map((d) => [d, line.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function parseCsv(buffer) {
  let text = decodeText(buffer);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);   // a mark the decoder left in
  const delimiter = detectDelimiter(firstFilledLine(text));

  const list = rowList('file', () => ['']);
  let record = 0;
  let row = [], field = '';
  let quoted = false, atStart = true;
  let line = 1, quoteLine = 0;

  const add = (ch) => { if (field.length < MAX_CELL_TEXT) field += ch; };
  const endField = () => {
    if (row.length < MAX_COLUMNS) row.push(field);
    field = '';
    atStart = true;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { add('"'); i++; }
        else quoted = false;
      } else {
        if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++;
        add(ch);
      }
    } else if (ch === '"' && atStart) {
      // Only a quote at the very start of a field opens a quoted field; one
      // in the middle (5" pipe) is just a character.
      quoted = true;
      atStart = false;
      quoteLine = line;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line++;
      endField();
      list.place(record++, row);
      row = [];
    } else {
      add(ch);
      atStart = false;
    }
  }
  if (quoted) {
    throw new SpreadsheetError(`The quote mark (") that starts on line ${quoteLine} is never closed, so the rest of the file cannot be read. Fix that line and upload the file again.`);
  }
  if (field !== '' || row.length) { endField(); list.place(record, row); }
  return list.rows;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const isZip    = (buffer) => buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
const isOleDoc = (buffer) => buffer.length > 8 && buffer.readUInt32BE(0) === 0xd0cf11e0;   // legacy .xls, .doc

/**
 * Rows of cells, as strings, from a CSV or .xlsx upload. Trailing empty rows
 * are dropped; cells are trimmed.
 *
 * @param {Buffer} buffer
 * @param {string} [filename]  only used to word the error for a wrong type
 */
function readTable(buffer, filename = '') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new SpreadsheetError('That file is empty.');
  if (isOleDoc(buffer)) throw new SpreadsheetError('That is an old-style .xls file. In Excel, choose Save As and pick "Excel Workbook (.xlsx)" or "CSV", then upload that.');

  let rows;
  if (isZip(buffer)) {
    rows = parseXlsx(buffer, filename);
  } else {
    // Binary content that isn't a workbook won't survive as text; catch the
    // common case of the wrong file picked. UTF-16 text is full of zero bytes,
    // so a file that starts with its mark is let through.
    if (!hasUtf16Bom(buffer) && buffer.subarray(0, 512).includes(0)) {
      throw new SpreadsheetError(`${filename || 'That file'} is not a CSV or .xlsx spreadsheet.`);
    }
    rows = parseCsv(buffer);
  }

  rows = rows.map((row) => row.map((cell) => String(cell ?? '').trim()));
  while (rows.length && rows[rows.length - 1].every((cell) => cell === '')) rows.pop();
  return rows;
}

module.exports = { readTable, parseCsv, parseXlsx, SpreadsheetError, MAX_ROWS };
