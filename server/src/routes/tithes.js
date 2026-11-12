/**
 * Admin → Tithes: the tithers' register, the payments recorded against it and
 * the acknowledgement SMS that follows each one.
 *
 * Super admins only. Like Giving, this is money against named people, which
 * the content roles have no reason to see.
 */
const express = require('express');
const router  = express.Router();
const { z }   = require('zod');

const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/adminOnly');
const { validate }    = require('../middleware/validate');

const prisma = require('../lib/prisma');
const { withDbRetry, isRetryable } = require('../lib/dbRetry');
const { readTable, SpreadsheetError, MAX_ROWS } = require('../lib/spreadsheet');
const tithe = require('../lib/tithe');
const { sendAcknowledgement } = require('../services/titheSms');
const { smsTransportName }    = require('../services/sms');

router.use(verifyToken, requireRole('SUPER_ADMIN'));

const dbStatus  = (err) => (isRetryable(err) ? 503 : 500);
const dbMessage = (err) =>
  (isRetryable(err)
    ? 'The database is busy right now. Please try again in a moment.'
    : 'Server error');

const MAX_UPLOAD = '5mb';
const MAX_AMOUNT = 10_000_000;

// ─── Shared bits ──────────────────────────────────────────────────────────────

// A field the form may leave blank, or not send at all.
const text = (max) => z.preprocess((v) => (v == null ? '' : v), z.string().trim().max(max, `Keep that under ${max} characters`));

const titherSchema = z.object({
  number:      z.preprocess((v) => (v == null ? '' : v), z.string().trim().min(1, 'Please enter a tithe number').max(30, 'Keep the tithe number under 30 characters')),
  type:        z.enum(['INDIVIDUAL', 'COUPLE'], { error: 'Type must be Individual or Couple' }).default('INDIVIDUAL'),
  name:        z.preprocess((v) => (v == null ? '' : v), z.string().trim().min(1, 'Please enter the name').max(120, 'Keep the name under 120 characters')),
  phone:       text(40),
  spouseName:  text(120),
  spousePhone: text(40),
  notes:       text(1000),
  isActive:    z.boolean().optional(),
});

/**
 * The stored form of a tither from a validated body — or the first thing wrong
 * with it. Numbers and phones are normalised here so the register never holds
 * the same person written two ways.
 */
function cleanTither(body) {
  const number = tithe.normalizeTitheNumber(body.number);
  if (!number) return { problem: `"${body.number}" is not a tithe number. Use letters then digits, like HPC021.` };

  const data = {
    number,
    type:  body.type,
    name:  body.name.replace(/\s+/g, ' '),
    notes: body.notes || null,
    phone: null, spouseName: null, spousePhone: null,
  };
  if (body.phone) {
    data.phone = tithe.canonicalPhone(body.phone);
    if (!data.phone) return { problem: `"${body.phone}" is not a usable phone number.` };
  }
  if (body.type === 'COUPLE') {
    data.spouseName = body.spouseName.replace(/\s+/g, ' ');
    if (!data.spouseName) return { problem: 'A couple needs the spouse\'s name.' };
    if (body.spousePhone) {
      data.spousePhone = tithe.canonicalPhone(body.spousePhone);
      if (!data.spousePhone) return { problem: `"${body.spousePhone}" is not a usable phone number.` };
    }
  }
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  return { data };
}

/** "HPC021 is already Kofi Mensah's number" — for a unique violation. */
async function takenMessage(number) {
  const other = await prisma.tither.findUnique({ where: { number }, select: { name: true, spouseName: true, type: true } });
  return other ? `${number} is already ${tithe.displayName(other)}'s number.` : `${number} is already taken.`;
}

async function settings() {
  return prisma.titheSettings.upsert({
    where:  { id: 'singleton' },
    update: {},
    create: { id: 'singleton', smsTemplate: tithe.DEFAULT_SMS_TEMPLATE },
  });
}

async function churchName() {
  const site = await prisma.siteSettings.findUnique({ where: { id: 'singleton' }, select: { churchName: true } });
  return site?.churchName || 'HPC Global';
}

const titherSelect = {
  id: true, number: true, type: true, name: true, phone: true, spouseName: true, spousePhone: true,
  notes: true, isActive: true, createdAt: true, updatedAt: true,
};

/** What the browser shows for a payment: the row plus who it was for. */
const paymentInclude = {
  tither: { select: { id: true, number: true, name: true, type: true, spouseName: true, isActive: true } },
};

const ymd = (date) => new Date(date).toISOString().slice(0, 10);

function presentPayment(p) {
  return { ...p, paidOn: ymd(p.paidOn), smsTo: p.smsTo ? p.smsTo.split(',').map(tithe.formatPhone) : [] };
}

const thisMonth = () => new Date().toISOString().slice(0, 7);
const monthRe   = /^\d{4}-(0[1-9]|1[0-2])$/;

// ─── Summary ──────────────────────────────────────────────────────────────────

router.get('/summary', async (req, res) => {
  try {
    const month = monthRe.test(String(req.query.month)) ? String(req.query.month) : thisMonth();
    const year  = month.slice(0, 4);

    const [forMonth, forYear, activeTithers, unpaid] = await withDbRetry(() => Promise.all([
      prisma.tithePayment.findMany({ where: { month }, select: { amount: true, titherId: true } }),
      prisma.tithePayment.aggregate({ where: { month: { startsWith: `${year}-` } }, _sum: { amount: true }, _count: true }),
      prisma.tither.count({ where: { isActive: true } }),
      prisma.tither.count({ where: { isActive: true, payments: { none: { month } } } }),
    ]), { label: 'tithe summary' });

    res.json({
      month,
      monthTotal:   forMonth.reduce((s, p) => s + p.amount, 0),
      monthCount:   forMonth.length,
      monthTithers: new Set(forMonth.map((p) => p.titherId)).size,
      yearTotal:    forYear._sum.amount ?? 0,
      yearCount:    forYear._count,
      activeTithers,
      unpaid,
      sms: smsTransportName(),
    });
  } catch (err) {
    console.error('Tithe summary error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// ─── Tithers ──────────────────────────────────────────────────────────────────

router.get('/tithers', async (req, res) => {
  try {
    const { q = '', type, status = 'active', paid, unpaid } = req.query;
    const take = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const skip = (Math.max(Number(req.query.page) || 1, 1) - 1) * take;

    const where = {};
    if (status === 'archived') where.isActive = false;
    else if (status !== 'all') where.isActive = true;
    if (type === 'INDIVIDUAL' || type === 'COUPLE') where.type = type;
    if (monthRe.test(String(paid)))   where.payments = { some: { month: String(paid) } };
    if (monthRe.test(String(unpaid))) where.payments = { none: { month: String(unpaid) } };

    const query = String(q).trim().slice(0, 60);
    if (query) {
      const or = [
        { name:       { contains: query, mode: 'insensitive' } },
        { spouseName: { contains: query, mode: 'insensitive' } },
      ];
      const number = tithe.normalizeTitheNumber(query);
      if (number) or.push({ number: { contains: number } });
      or.push({ number: { contains: query.toUpperCase().replace(/[\s\-_.]/g, '') } });
      // Phones are stored as 233…, so a search typed as 024… has to lose its zero.
      const digits = query.replace(/\D/g, '').replace(/^0/, '');
      if (digits.length >= 3) or.push({ phone: { contains: digits } }, { spousePhone: { contains: digits } });
      // A whole number typed any way people write one (00233…, +233 (0)24…).
      const whole = tithe.canonicalPhone(query);
      if (whole) or.push({ phone: whole }, { spousePhone: whole });
      where.OR = or;
    }

    const [rows, total] = await withDbRetry(() => Promise.all([
      prisma.tither.findMany({
        where, skip, take,
        orderBy: [{ number: 'asc' }],
        select: {
          ...titherSelect,
          _count:   { select: { payments: true } },
          payments: { orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }], take: 1, select: { amount: true, month: true, paidOn: true, smsStatus: true } },
        },
      }),
      prisma.tither.count({ where }),
    ]), { label: 'tithers list' });

    res.json({
      tithers: rows.map(({ _count, payments, ...t }) => ({
        ...t,
        paymentCount: _count.payments,
        lastPayment:  payments[0] ? { ...payments[0], paidOn: ymd(payments[0].paidOn) } : null,
      })),
      total,
    });
  } catch (err) {
    console.error('Tithers list error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

router.get('/tithers/next-number', async (_req, res) => {
  try {
    const taken = await prisma.tither.findMany({
      where:  { number: { startsWith: tithe.NUMBER_PREFIX } },
      select: { number: true },
    });
    res.json({ number: tithe.nextTitheNumber(taken.map((t) => t.number)) });
  } catch (err) {
    console.error('Next tithe number error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// A blank template people can fill in and upload. Served here rather than as
// a static file so its columns can never drift from what the import reads.
router.get('/tithers/template.csv', (_req, res) => {
  const csv = [
    'Tithe Number,Name,Phone,Type,Spouse Name,Spouse Phone',
    'HPC001,Kofi Mensah,0244123456,Individual,,',
    'HPC002,Yaw Boateng,0201234567,Couple,Abena Boateng,0551234567',
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="tithers-template.csv"');
  res.send(`﻿${csv}\r\n`);
});

router.get('/tithers/:id', async (req, res) => {
  try {
    const row = await prisma.tither.findUnique({
      where:   { id: req.params.id },
      select:  { ...titherSelect, payments: { orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }] } },
    });
    if (!row) return res.status(404).json({ message: 'That tither no longer exists.' });

    const year  = new Date().getUTCFullYear();
    const stats = { total: 0, count: row.payments.length, yearTotal: 0, yearCount: 0 };
    for (const p of row.payments) {
      stats.total += p.amount;
      if (p.month.startsWith(`${year}-`)) { stats.yearTotal += p.amount; stats.yearCount += 1; }
    }
    res.json({ ...row, payments: row.payments.map(presentPayment), stats });
  } catch (err) {
    console.error('Tither detail error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

router.post('/tithers', validate(titherSchema), async (req, res) => {
  const { data, problem } = cleanTither(req.body);
  if (problem) return res.status(400).json({ message: problem });
  try {
    const row = await prisma.tither.create({ data, select: titherSelect });
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: await takenMessage(data.number) });
    console.error('Tither create error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// Editing covers converting an individual account to a couple's (and back):
// the type changes, the spouse's details are added, the number stays.
router.put('/tithers/:id', validate(titherSchema), async (req, res) => {
  const { data, problem } = cleanTither(req.body);
  if (problem) return res.status(400).json({ message: problem });
  try {
    const row = await prisma.tither.update({ where: { id: req.params.id }, data, select: titherSelect });
    res.json(row);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'That tither no longer exists.' });
    if (err.code === 'P2002') return res.status(409).json({ message: await takenMessage(data.number) });
    console.error('Tither update error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

const activeSchema = z.object({
  isActive: z.boolean({ error: 'Say whether the account should be archived or restored.' }),
});

// Archive and restore change that one flag and nothing else, so a page opened
// before someone else's edit cannot put the old details back.
router.put('/tithers/:id/active', validate(activeSchema), async (req, res) => {
  try {
    const row = await prisma.tither.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive }, select: titherSelect });
    res.json(row);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'That tither no longer exists.' });
    console.error('Tither archive error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// The database refusing to delete a tither because payments point at it.
// Prisma 5 has no code for a RESTRICT refusal (Postgres 23001): it arrives as
// an unknown-request error, recognisable only by its message.
const paymentsBlockDelete = (err) =>
  err?.code === 'P2003' || err?.code === 'P2014' || /\b23001\b|violates RESTRICT setting of foreign key/.test(String(err?.message));

// Only a tither with nothing recorded can be deleted; one with payments is
// archived instead, so the church's records stay whole.
router.delete('/tithers/:id', async (req, res) => {
  try {
    const row = await prisma.tither.findUnique({ where: { id: req.params.id }, select: { _count: { select: { payments: true } } } });
    if (!row) return res.status(404).json({ message: 'That tither no longer exists.' });
    if (row._count.payments > 0) {
      return res.status(409).json({
        message: `This account has ${row._count.payments} payment${row._count.payments === 1 ? '' : 's'} recorded. Archive it instead so the records are kept.`,
      });
    }
    // Payments cannot be deleted along with the account (onDelete: Restrict),
    // so one recorded since the count above makes this fail rather than vanish.
    await prisma.tither.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'That tither no longer exists.' });
    if (paymentsBlockDelete(err)) {
      return res.status(409).json({ message: 'A payment has just been recorded for this account. Archive it instead so the records are kept.' });
    }
    console.error('Tither delete error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// ─── Upload ───────────────────────────────────────────────────────────────────
//
// Two steps. The file is read and checked first and the office sees exactly
// what would be added, updated or refused; only when they confirm are rows
// written. The rows are sent back as JSON for the second step and validated
// again as if each were typed in.

const rawFile = express.raw({ type: () => true, limit: MAX_UPLOAD });

router.post('/tithers/import/preview', rawFile, async (req, res) => {
  let filename = '';
  try { filename = decodeURIComponent(req.get('x-file-name') || ''); } catch { /* unreadable header: no name */ }

  let table;
  try {
    table = readTable(req.body, filename);
  } catch (err) {
    const message = err instanceof SpreadsheetError ? err.message : `Could not read ${filename || 'that file'}. Upload a .csv or .xlsx file.`;
    return res.status(400).json({ message });
  }

  const read = tithe.readTitherRows(table);
  if (!read.rows.length) {
    return res.status(400).json({ message: 'No tithers found in that file. The first row should name the columns: Tithe Number, Name, Phone, Type, Spouse Name, Spouse Phone.' });
  }

  try {
    const numbers = read.rows.map((r) => r.number).filter(Boolean);
    const phones  = read.rows.flatMap((r) => [r.phone, r.spousePhone]).filter(Boolean);
    const [existing, samePhone] = await withDbRetry(() => Promise.all([
      prisma.tither.findMany({ where: { number: { in: numbers } }, select: { id: true, number: true, name: true, spouseName: true, type: true, isActive: true } }),
      phones.length
        ? prisma.tither.findMany({ where: { OR: [{ phone: { in: phones } }, { spousePhone: { in: phones } }] }, select: { number: true, name: true, phone: true, spousePhone: true } })
        : [],
    ]), { label: 'tither import preview' });

    const byNumber = new Map(existing.map((t) => [t.number, t]));
    const byPhone  = new Map();
    for (const t of samePhone) for (const p of [t.phone, t.spousePhone]) if (p) byPhone.set(p, t);

    const rows = read.rows.map((row) => {
      const current  = byNumber.get(row.number) || null;
      const warnings = [...row.warnings];
      for (const p of [row.phone, row.spousePhone]) {
        const other = p && byPhone.get(p);
        if (other && other.number !== row.number) warnings.push(`${tithe.formatPhone(p)} is also ${other.name}'s number (${other.number}).`);
      }
      // Updating from a row with no spouse would quietly drop one — say so.
      // (A list with no Type or Spouse column leaves the type alone.)
      if (current?.type === 'COUPLE' && row.type === 'INDIVIDUAL' && !row.keepType) {
        warnings.push(`On the register as a couple (${tithe.displayName(current)}). Updating from this file makes it an individual account and removes the spouse.`);
      }
      return {
        ...row, warnings,
        status:   row.problems.length ? 'error' : current ? 'update' : 'new',
        existing: current && { id: current.id, name: tithe.displayName(current), type: current.type, isActive: current.isActive },
      };
    });
    const summary = { total: rows.length, new: 0, update: 0, error: 0 };
    for (const r of rows) summary[r.status] += 1;

    res.json({ filename, hadHeader: read.hadHeader, ignoredColumns: read.ignored ?? [], rows, summary });
  } catch (err) {
    console.error('Tither import preview error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

const importSchema = z.object({
  updateExisting: z.boolean().default(false),
  rows: z.array(titherSchema.omit({ isActive: true, notes: true }).extend({ keepType: z.boolean().optional() }), { error: 'Send the rows to import' })
    .min(1, 'There is nothing to import.')
    .max(MAX_ROWS, `Import at most ${MAX_ROWS} rows at a time.`),
});

/**
 * What an upload may change on a tither already on the register. A file has
 * no notes column and no archived flag, so neither is touched; and a phone
 * cell left blank means "not in this file", not "delete the number we have".
 * The type and names do come from the file — an individual row turns a couple
 * back into an individual and drops the spouse, as the preview warns — unless
 * the file has no Type or Spouse column at all (keepType), when it cannot say.
 */
function importUpdate(row, keepType) {
  if (keepType) {
    const data = { name: row.name };
    if (row.phone) data.phone = row.phone;
    return data;
  }
  const data = { type: row.type, name: row.name, spouseName: row.spouseName };
  if (row.phone) data.phone = row.phone;
  if (row.type === 'COUPLE') {
    if (row.spousePhone) data.spousePhone = row.spousePhone;
  } else {
    data.spousePhone = null;
  }
  return data;
}

router.post('/tithers/import', validate(importSchema), async (req, res) => {
  const { updateExisting } = req.body;
  const skipped = [];
  const cleaned = [];
  const seen    = new Set();
  for (const [i, row] of req.body.rows.entries()) {
    const { keepType, ...fields } = row;
    const { data, problem } = cleanTither(fields);
    if (problem) { skipped.push({ row: i + 1, number: row.number, reason: problem }); continue; }
    if (seen.has(data.number)) { skipped.push({ row: i + 1, number: data.number, reason: 'Listed twice in the upload.' }); continue; }
    seen.add(data.number);
    cleaned.push({ data, keepType: Boolean(keepType) });
  }

  try {
    const existing = new Set((await prisma.tither.findMany({
      where: { number: { in: cleaned.map((r) => r.data.number) } }, select: { number: true },
    })).map((t) => t.number));

    const fresh   = cleaned.filter((r) => !existing.has(r.data.number)).map((r) => r.data);
    const updates = cleaned.filter((r) => existing.has(r.data.number));

    let created = 0;
    if (fresh.length) ({ count: created } = await prisma.tither.createMany({ data: fresh, skipDuplicates: true }));

    let updated = 0;
    if (updateExisting) {
      // Few in practice, and each is its own statement; bounded batches keep
      // the pooled connection from being asked for hundreds at once.
      for (let i = 0; i < updates.length; i += 20) {
        const batch = updates.slice(i, i + 20).map(({ data, keepType }) =>
          prisma.tither.update({ where: { number: data.number }, data: importUpdate(data, keepType) }));
        updated += (await prisma.$transaction(batch)).length;
      }
    } else {
      for (const { data } of updates) skipped.push({ number: data.number, reason: 'Already on the register (left unchanged).' });
    }

    res.json({ created, updated, skipped });
  } catch (err) {
    console.error('Tither import error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// express.raw's own rejection of an oversized upload, worded for the office.
router.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ message: `That file is too big. Uploads are limited to ${MAX_UPLOAD.toUpperCase()}.` });
  next(err);
});

// ─── Payments ─────────────────────────────────────────────────────────────────

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (s) => new Date(`${s}T00:00:00.000Z`);
const validYmd = (s) => dateRe.test(s) && !Number.isNaN(asDate(s).getTime()) && asDate(s).toISOString().slice(0, 10) === s;

const paymentFields = {
  amount: z.coerce.number({ error: 'Please enter the amount' })
    .positive('The amount must be more than zero')
    .max(MAX_AMOUNT, 'That amount is too large')
    .transform((n) => Math.round(n * 100) / 100)
    // 0.004 is more than zero but rounds to nothing.
    .refine((n) => n > 0, 'The amount must be more than zero'),
  month:  z.string({ error: 'Please choose the month the tithe is for' }).regex(monthRe, 'Please choose the month the tithe is for'),
  paidOn: z.string({ error: 'Please choose the date it was paid' }).refine(validYmd, 'Please choose the date it was paid')
    // Tomorrow's date (UTC) is allowed: the office may be a timezone ahead of
    // the server. Anything later is refused. YYYY-MM-DD strings sort as dates.
    .refine((s) => !validYmd(s) || s <= ymd(Date.now() + 24 * 60 * 60 * 1000), 'That date is in the future'),
  note:   text(300),
};

const paymentCreateSchema = z.object({
  ...paymentFields,
  titherId: z.string({ error: 'Please choose who the payment is from' }).min(1, 'Please choose who the payment is from'),
  // Left out, the SMS Template setting decides.
  sendSms:  z.boolean().optional(),
});
const paymentUpdateSchema = z.object(paymentFields);

function paymentFilter(query) {
  const where = {};
  if (monthRe.test(String(query.month))) where.month = String(query.month);
  if (query.titherId) where.titherId = String(query.titherId);
  if (validYmd(String(query.from)) || validYmd(String(query.to))) {
    where.paidOn = {};
    if (validYmd(String(query.from))) where.paidOn.gte = asDate(String(query.from));
    if (validYmd(String(query.to)))   where.paidOn.lte = asDate(String(query.to));
  }
  if (query.sms === 'FAILED' || query.sms === 'SENT' || query.sms === 'SKIPPED') where.smsStatus = query.sms;
  return where;
}

router.get('/payments', async (req, res) => {
  try {
    const where = paymentFilter(req.query);
    const take  = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const skip  = (Math.max(Number(req.query.page) || 1, 1) - 1) * take;

    const [rows, total, sum] = await withDbRetry(() => Promise.all([
      prisma.tithePayment.findMany({ where, skip, take, orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }], include: paymentInclude }),
      prisma.tithePayment.count({ where }),
      prisma.tithePayment.aggregate({ where, _sum: { amount: true } }),
    ]), { label: 'tithe payments list' });

    res.json({ payments: rows.map(presentPayment), total, sum: sum._sum.amount ?? 0 });
  } catch (err) {
    console.error('Tithe payments list error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// Beyond this one file gets too big to build in one go; a month or a date
// range is what the office would open in a spreadsheet anyway.
const MAX_EXPORT = 50_000;

// A cell starting with one of these is run as a formula by Excel and Sheets,
// so a name typed as "=HYPERLINK(…)" would become a live link. The apostrophe
// makes the spreadsheet show it as plain text.
const FORMULA_START = /^[=+\-@\t\r]/;
const csvCell = (v) => {
  const value = String(v ?? '');
  return `"${(FORMULA_START.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
};

router.get('/payments/export', async (req, res) => {
  try {
    const where = paymentFilter(req.query);
    const count = await withDbRetry(() => prisma.tithePayment.count({ where }), { label: 'tithe payments export count' });
    if (count > MAX_EXPORT) {
      return res.status(400).json({ message: `There are ${count} payments to export. Choose a month or a date range and export that instead.` });
    }
    const rows  = await withDbRetry(
      () => prisma.tithePayment.findMany({ where, orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }], include: paymentInclude }),
      { label: 'tithe payments export' },
    );
    const columns = [
      ['Date paid',    (p) => ymd(p.paidOn)],
      ['Month for',    (p) => tithe.monthLabel(p.month)],
      ['Tithe number', (p) => p.tither.number],
      ['Name',         (p) => tithe.displayName(p.tither)],
      ['Type',         (p) => p.tither.type],
      ['Amount',       (p) => p.amount.toFixed(2)],
      ['Currency',     (p) => p.currency],
      ['Note',         (p) => p.note],
      ['SMS',          (p) => p.smsStatus || ''],
      ['Recorded by',  (p) => p.recordedBy],
    ];
    const csv = [columns.map(([label]) => csvCell(label)).join(','), ...rows.map((p) => columns.map(([, value]) => csvCell(value(p))).join(','))].join('\n');
    const name = where.month ? `tithes-${where.month}.csv` : `tithes-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(`﻿${csv}`);
  } catch (err) {
    console.error('Tithe payments export error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

/** A payment loaded with its whole tither, trimmed to what the browser is shown. */
function asShown(payment) {
  const keys = Object.keys(paymentInclude.tither.select);
  return { ...payment, tither: Object.fromEntries(keys.map((k) => [k, payment.tither[k]])) };
}

/**
 * Send (or resend) the acknowledgement and keep the outcome on the payment.
 *
 * Everything that can fail before the text goes out is the caller's to fetch
 * first. Once a text has gone, this does not throw: answering with an error
 * then would have the office record the payment, or press Send, a second time
 * — and text the tither twice. If the outcome cannot be saved it is logged and
 * the payment is answered as it stood.
 */
async function acknowledge(payment, tither, { template, church }) {
  // A resend after a partly failed send finishes the job: the phones the text
  // already reached are not texted again, and stay on the record as reached.
  // A resend of one that went through goes to everyone, as asked.
  const before = payment.smsStatus === 'FAILED' && payment.smsTo ? payment.smsTo.split(',') : [];
  const result = await sendAcknowledgement({ tither, payment, template, church, skip: before });

  const to  = result.status === 'SKIPPED' ? result.to : [...new Set([...result.to, ...before])];
  const sms = { status: result.status, to: to.map(tithe.formatPhone), error: result.error, text: result.text };

  // A resend that did not get through — nothing went (say the phone has since
  // been removed), or Hubtel failed — must not overwrite the record of a text
  // that did go. The office still sees this attempt's outcome in `sms`.
  const keepRecord = (result.status === 'SKIPPED' && (payment.smsStatus === 'SENT' || before.length))
    || (result.status !== 'SENT' && payment.smsStatus === 'SENT');
  if (keepRecord) return { payment: presentPayment(payment), sms };
  // When the text last reached a phone: now, if this attempt reached one.
  const reachedNow = result.to.some((p) => !before.includes(p));

  try {
    const updated = await withDbRetry(() => prisma.tithePayment.update({
      where: { id: payment.id },
      data: {
        smsStatus: result.status,
        smsTo:     to.join(',') || null,
        smsError:  result.error,
        smsSentAt: reachedNow ? new Date() : payment.smsSentAt ?? null,
      },
      include: paymentInclude,
    }), { label: 'tithe SMS outcome' });
    return { payment: presentPayment(updated), sms };
  } catch (err) {
    console.error(`Tithe payment ${payment.id}: the SMS outcome (${result.status}) could not be saved:`, err);
    return { payment: presentPayment(payment), sms };
  }
}

router.post('/payments', validate(paymentCreateSchema), async (req, res) => {
  const { titherId, amount, month, paidOn, note, sendSms } = req.body;
  try {
    const tither = await prisma.tither.findUnique({ where: { id: titherId } });
    if (!tither) return res.status(404).json({ message: 'That tither no longer exists.' });
    if (!tither.isActive) return res.status(409).json({ message: `${tithe.displayName(tither)}'s account is archived. Restore it first, then record the payment.` });

    // Read before the payment is saved: a failure after it would answer an
    // error for a payment that is in fact recorded, inviting a second one.
    const [config, church] = await withDbRetry(() => Promise.all([settings(), churchName()]), { label: 'tithe payment settings' });
    // The office's choice for this payment wins — switching the toggle on is
    // how a text is sent by hand while automatic sending is off.
    const wanted  = typeof sendSms === 'boolean' ? sendSms : config.smsEnabled;
    const reason  = wanted ? null
      : sendSms === false ? 'Switched off for this payment.'
      : 'Automatic acknowledgements are switched off under SMS Template.';

    const payment = await prisma.tithePayment.create({
      data: {
        titherId, amount, month, note: note || null,
        paidOn:     asDate(paidOn),
        recordedBy: req.user.name || req.user.email || null,
        ...(reason && { smsStatus: 'SKIPPED', smsError: reason }),
      },
      include: paymentInclude,
    });

    if (reason) {
      return res.status(201).json({ payment: presentPayment(payment), sms: { status: 'SKIPPED', to: [], error: reason, text: null } });
    }
    // Sent before responding — on Vercel nothing is guaranteed to run after.
    res.status(201).json(await acknowledge(payment, tither, { template: config.smsTemplate, church }));
  } catch (err) {
    console.error('Tithe payment create error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

router.put('/payments/:id', validate(paymentUpdateSchema), async (req, res) => {
  const { amount, month, paidOn, note } = req.body;
  try {
    const payment = await prisma.tithePayment.update({
      where: { id: req.params.id },
      data:  { amount, month, paidOn: asDate(paidOn), note: note || null },
      include: paymentInclude,
    });
    res.json({ payment: presentPayment(payment) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'That payment no longer exists.' });
    console.error('Tithe payment update error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

router.delete('/payments/:id', async (req, res) => {
  try {
    await prisma.tithePayment.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'That payment no longer exists.' });
    console.error('Tithe payment delete error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// Asked for by hand, so it goes even while automatic sending is switched off.
router.post('/payments/:id/sms', async (req, res) => {
  try {
    const found = await prisma.tithePayment.findUnique({ where: { id: req.params.id }, include: { tither: true } });
    if (!found) return res.status(404).json({ message: 'That payment no longer exists.' });
    const [config, church] = await withDbRetry(() => Promise.all([settings(), churchName()]), { label: 'tithe SMS resend settings' });
    res.json(await acknowledge(asShown(found), found.tither, { template: config.smsTemplate, church }));
  } catch (err) {
    console.error('Tithe SMS resend error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// ─── The SMS template ─────────────────────────────────────────────────────────

router.get('/settings', async (_req, res) => {
  try {
    const config = await settings();
    res.json({
      smsTemplate:     config.smsTemplate,
      smsEnabled:      config.smsEnabled,
      updatedAt:       config.updatedAt,
      defaultTemplate: tithe.DEFAULT_SMS_TEMPLATE,
      placeholders:    tithe.PLACEHOLDERS,
      maxLength:       tithe.MAX_TEMPLATE_LENGTH,
      church:          await churchName(),
      sms:             smsTransportName(),
    });
  } catch (err) {
    console.error('Tithe settings error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

const settingsSchema = z.object({
  smsTemplate: z.string({ error: 'The message cannot be empty.' }),
  // Left out, the stored choice stands — saving the wording alone must not
  // switch automatic sending back on.
  smsEnabled:  z.boolean().optional(),
});

router.put('/settings', validate(settingsSchema), async (req, res) => {
  const smsTemplate = req.body.smsTemplate.trim();
  const problem = tithe.templateProblem(smsTemplate);
  if (problem) return res.status(400).json({ message: problem });
  const enabled = typeof req.body.smsEnabled === 'boolean' ? { smsEnabled: req.body.smsEnabled } : {};
  try {
    const config = await prisma.titheSettings.upsert({
      where:  { id: 'singleton' },
      update: { smsTemplate, ...enabled },
      create: { id: 'singleton', smsTemplate, ...enabled },
    });
    res.json({ smsTemplate: config.smsTemplate, smsEnabled: config.smsEnabled, updatedAt: config.updatedAt });
  } catch (err) {
    console.error('Tithe settings update error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

module.exports = router;
