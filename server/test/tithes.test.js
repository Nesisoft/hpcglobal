/**
 * Admin → Tithes: the tithers' register, the payments recorded against it and
 * the acknowledgement SMS that follows each one.
 *
 * A fake Hubtel listens on a local port and keeps every message the app sends
 * it, so a test can say exactly who was texted and what the text said. It can
 * also fail on request — an HTTP 500, or Hubtel's "rejected inside a 2xx" —
 * so the failure path is exercised for real and lands in Delivery Problems
 * the way it would in production. Nothing here can message anyone.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const zlib   = require('zlib');
const { randomUUID } = require('crypto');
const { pathToFileURL } = require('url');

const { loadApp, startServer, tokenFor, TEST_ENV } = require('./helpers');
// Pure and dependency-free, so it can be loaded before the app is.
const { readTable, parseCsv, SpreadsheetError } = require('../src/lib/spreadsheet');

// lib/tithe pulls in services/sms, which fixes the Hubtel URL the first time
// it is required — so it, and the app, are loaded in `before`, once the fake
// Hubtel has a port.
let tithe, app, prisma, server;
let superAdmin, editor, mediaManager, hod;

// ─── A fake Hubtel ────────────────────────────────────────────────────────────

const hubtel = {
  /** Every POST received: { url, body: { From, To, Content, RegisteredDelivery } }. */
  requests: [],
  /** 'accept' | 'reject' (a business failure inside a 2xx) | 'down' (HTTP 500). */
  mode: 'accept',
  /** An MSISDN to refuse while everything else is accepted — half of a couple. */
  rejectTo: null,
  /** MSISDN → milliseconds to wait before answering, so replies can arrive out of order. */
  delay: {},
  /** The MSISDN of each reply, in the order the replies went out. */
  answered: [],
  server: null,
};

function startHubtel() {
  return new Promise((resolve) => {
    hubtel.server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        const body = JSON.parse(raw);
        hubtel.requests.push({ url: req.url, body });
        const answer = () => {
          hubtel.answered.push(body.To);
          if (hubtel.mode === 'down') {
            res.writeHead(500, { 'content-type': 'text/plain' });
            return res.end('Service unavailable');
          }
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify(hubtel.mode === 'reject' || hubtel.rejectTo === body.To
            ? { status: 101, Message: 'Payment required on account' }
            : { status: 0 }));
        };
        const wait = hubtel.delay[body.To];
        if (wait) setTimeout(answer, wait); else answer();
      });
    });
    hubtel.server.listen(0, '127.0.0.1', () => resolve(hubtel.server.address().port));
  });
}

test.before(async () => {
  const port = await startHubtel();
  TEST_ENV.HUBTEL_SMS_BASE_URL = `http://127.0.0.1:${port}/v1/messages`;
  ({ app, prisma } = loadApp('tithes'));
  tithe  = require('../src/lib/tithe');
  server = await startServer(app);

  const admin = (role, name) => prisma.adminUser.create({
    data: { name, email: `${role.toLowerCase()}@tithes.test`, passwordHash: 'not-a-real-hash', role },
  });
  superAdmin   = tokenFor(await admin('SUPER_ADMIN', 'Efua Asante'));
  editor       = tokenFor(await admin('CONTENT_EDITOR', 'Editor'));
  mediaManager = tokenFor(await admin('MEDIA_MANAGER', 'Media'));
  hod          = tokenFor(await admin('HOD', 'Head'));
});

test.after(async () => {
  await server?.close();
  hubtel.server?.closeAllConnections();
  await new Promise((resolve) => (hubtel.server ? hubtel.server.close(resolve) : resolve()));
  await prisma?.$disconnect();
});

// Every test starts with an empty register, the default template and a quiet
// Hubtel, so what it counts and reads is its own.
test.beforeEach(async () => {
  await prisma.tithePayment.deleteMany();    // first: a tither with payments cannot be deleted
  await prisma.tither.deleteMany();
  await prisma.deliveryFailure.deleteMany();
  await prisma.titheSettings.deleteMany();   // back to the default template, sending on
  hubtel.requests = [];
  hubtel.answered = [];
  hubtel.mode = 'accept';
  hubtel.rejectTo = null;
  hubtel.delay = {};
});

// ─── Shared bits ──────────────────────────────────────────────────────────────

const api = (method, url, body) => server.call(method, url, body, { token: superAdmin });

const KOFI   = { number: 'HPC021', type: 'INDIVIDUAL', name: 'Kofi Mensah', phone: '0244123456' };
const COUPLE = { number: 'HPC022', type: 'COUPLE', name: 'Kofi Mensah', phone: '0244123456', spouseName: 'Ama Mensah', spousePhone: '0201234567' };
// A fixed past date keeps the SMS wording exact without depending on today.
const PAYMENT = { amount: 150, month: '2026-11', paidOn: '2026-11-11' };

async function addTither(body) {
  const res = await api('POST', '/admin/tithes/tithers', body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

const record = (titherId, extra) => api('POST', '/admin/tithes/payments', { titherId, ...PAYMENT, ...extra });

/** Straight into the table, for tests about reading rather than recording. */
const seedPayment = (titherId, amount, month, paidOn = `${month}-01`) =>
  prisma.tithePayment.create({ data: { titherId, amount, month, paidOn: new Date(`${paidOn}T00:00:00Z`) } });

/** POST a file the way the browser does: the raw bytes, with the name in a header. */
async function upload(content, filename) {
  const response = await fetch(`${server.base}/admin/tithes/tithers/import/preview`, {
    method:  'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-file-name': filename, authorization: `Bearer ${superAdmin}` },
    body:    content,
  });
  return { status: response.status, body: await response.json() };
}

/** GET something that is not JSON — the CSVs. */
async function download(url) {
  const response = await fetch(`${server.base}${url}`, { headers: { authorization: `Bearer ${superAdmin}` } });
  // From the bytes, not response.text(): the Fetch spec strips a leading BOM,
  // and whether the file starts with one is part of what is being checked.
  const text = Buffer.from(await response.arrayBuffer()).toString('utf8');
  return { status: response.status, headers: response.headers, text };
}

const numbers = (res) => res.body.tithers.map((t) => t.number);

const importRow = ({ number, name, type, phone, spouseName, spousePhone }) => ({ number, name, type, phone, spouseName, spousePhone });

const FIXTURE = path.join(__dirname, 'fixtures', 'tithers.xlsx');

// ─── Access ───────────────────────────────────────────────────────────────────

test('only super admins can use the tithes endpoints; without a token they are 401', async () => {
  // Money against named people: the content roles have no reason to see it.
  const calls = [
    ['GET',  '/admin/tithes/tithers'],
    ['POST', '/admin/tithes/payments', { titherId: randomUUID(), ...PAYMENT }],
    ['GET',  '/admin/tithes/summary'],
    ['GET',  '/admin/tithes/settings'],
    ['GET',  '/admin/tithes/payments'],
    ['POST', '/admin/tithes/tithers', KOFI],
  ];
  for (const [method, url, body] of calls) {
    const anonymous = await server.call(method, url, body);
    assert.equal(anonymous.status, 401, `${method} ${url} without a token`);

    for (const [role, token] of Object.entries({ CONTENT_EDITOR: editor, MEDIA_MANAGER: mediaManager, HOD: hod })) {
      const res = await server.call(method, url, body, { token });
      assert.equal(res.status, 403, `${role} ${method} ${url}`);
      assert.equal(res.body.tithers, undefined, `${role} must not see the register`);
    }
  }
  assert.equal(await prisma.tither.count(), 0);
  assert.equal(await prisma.tithePayment.count(), 0);

  const allowed = await api('GET', '/admin/tithes/tithers');
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body, { tithers: [], total: 0 });
});

// ─── The register ─────────────────────────────────────────────────────────────

test('creating a tither stores the number and phones in their canonical forms', async () => {
  const res = await api('POST', '/admin/tithes/tithers', {
    number: 'hpc 21', type: 'INDIVIDUAL', name: '  Kofi   Mensah ', phone: '024 412 3456', spouseName: '', spousePhone: '', notes: '',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.number, 'HPC021');
  assert.equal(res.body.phone, '233244123456');
  assert.equal(res.body.name, 'Kofi Mensah');
  assert.equal(res.body.type, 'INDIVIDUAL');
  assert.equal(res.body.isActive, true);
  assert.equal(res.body.spouseName, null);
  assert.equal(res.body.spousePhone, null);
  assert.equal(res.body.notes, null);
  assert.ok(res.body.id && res.body.createdAt && res.body.updatedAt);

  // Stored that way, not just shown that way.
  const stored = await prisma.tither.findUnique({ where: { id: res.body.id } });
  assert.equal(stored.number, 'HPC021');
  assert.equal(stored.phone, '233244123456');

  // A couple's phones, typed with +233 and with a hyphen in the number.
  const couple = await api('POST', '/admin/tithes/tithers', {
    number: 'HPC-022', type: 'COUPLE', name: 'Yaw Boateng', phone: '+233 20 123 4567', spouseName: 'Abena Boateng', spousePhone: '055-123-4567', notes: 'Pays quarterly',
  });
  assert.equal(couple.status, 201);
  assert.equal(couple.body.number, 'HPC022');
  assert.equal(couple.body.phone, '233201234567');
  assert.equal(couple.body.spousePhone, '233551234567');
  assert.equal(couple.body.spouseName, 'Abena Boateng');
  assert.equal(couple.body.notes, 'Pays quarterly');

  // The detail shows the same, with no payments yet.
  const detail = await api('GET', `/admin/tithes/tithers/${couple.body.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.number, 'HPC022');
  assert.deepEqual(detail.body.payments, []);
  assert.deepEqual(detail.body.stats, { total: 0, count: 0, yearTotal: 0, yearCount: 0 });
});

test('a taken number, an unusable phone and a couple without a spouse are refused with a reason', async () => {
  const kofi = await addTither(KOFI);

  // The same number written another way is still the same number.
  const taken = await api('POST', '/admin/tithes/tithers', { ...KOFI, number: 'hpc-21', name: 'Someone Else' });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.message, "HPC021 is already Kofi Mensah's number.");

  // Renumbering another account onto it is refused the same way.
  const esi = await addTither({ number: 'HPC030', name: 'Esi Owusu' });
  const renumber = await api('PUT', `/admin/tithes/tithers/${esi.id}`, { number: 'HPC021', name: 'Esi Owusu' });
  assert.equal(renumber.status, 409);
  assert.equal(renumber.body.message, "HPC021 is already Kofi Mensah's number.");
  assert.equal((await prisma.tither.findUnique({ where: { id: esi.id } })).number, 'HPC030');

  const refused = [
    [{ number: 'HPC031', name: 'Yaw Boateng', phone: 'call me' },                        '"call me" is not a usable phone number.'],
    [{ number: 'HPC031', name: 'Yaw Boateng', phone: '12345' },                          '"12345" is not a usable phone number.'],
    [{ number: 'HPC031', type: 'COUPLE', name: 'Yaw Boateng', spouseName: '   ' },       "A couple needs the spouse's name."],
    [{ number: 'HPC031', type: 'COUPLE', name: 'Yaw Boateng', spouseName: 'Abena', spousePhone: 'none' }, '"none" is not a usable phone number.'],
    [{ number: '???', name: 'Yaw Boateng' },                                             '"???" is not a tithe number. Use letters then digits, like HPC021.'],
    [{ number: '', name: 'Yaw Boateng' },                                                'Please enter a tithe number'],
    [{ number: 'HPC031', name: '  ' },                                                   'Please enter the name'],
    [{ number: 'HPC031', name: 'Yaw Boateng', type: 'FAMILY' },                          'Type must be Individual or Couple'],
  ];
  for (const [body, message] of refused) {
    const res = await api('POST', '/admin/tithes/tithers', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.message, message, JSON.stringify(body));
  }

  assert.equal(await prisma.tither.count(), 2);
  assert.equal((await prisma.tither.findUnique({ where: { id: kofi.id } })).name, 'Kofi Mensah');
});

test('next-number suggests HPC001 for an empty register, then one past the highest HPC number', async () => {
  assert.deepEqual((await api('GET', '/admin/tithes/tithers/next-number')).body, { number: 'HPC001' });

  // Gaps are not filled in, numbers from an older scheme are ignored, and so
  // is anything that starts with HPC but is not HPC plus digits.
  for (const number of ['HPC007', 'HPC021', 'T-00123', 'HPCX5']) {
    await addTither({ number, name: `Holder of ${number}` });
  }
  assert.deepEqual((await api('GET', '/admin/tithes/tithers/next-number')).body, { number: 'HPC022' });

  // An archived account keeps its number.
  const top = await prisma.tither.findUnique({ where: { number: 'HPC021' } });
  const archived = await api('PUT', `/admin/tithes/tithers/${top.id}`, { number: 'HPC021', name: top.name, isActive: false });
  assert.equal(archived.status, 200);
  assert.deepEqual((await api('GET', '/admin/tithes/tithers/next-number')).body, { number: 'HPC022' });
});

test('converting an individual to a couple keeps the id and number; converting back clears the spouse', async () => {
  const kofi = await addTither(KOFI);

  const couple = await api('PUT', `/admin/tithes/tithers/${kofi.id}`, {
    ...KOFI, type: 'COUPLE', spouseName: ' Ama  Mensah ', spousePhone: '020 123 4567',
  });
  assert.equal(couple.status, 200);
  assert.equal(couple.body.id, kofi.id);
  assert.equal(couple.body.number, 'HPC021');
  assert.equal(couple.body.type, 'COUPLE');
  assert.equal(couple.body.name, 'Kofi Mensah');
  assert.equal(couple.body.spouseName, 'Ama Mensah');
  assert.equal(couple.body.spousePhone, '233201234567');
  assert.equal(couple.body.phone, '233244123456');

  // Back to an individual: the spouse's details are dropped even though the
  // form still sent them.
  const single = await api('PUT', `/admin/tithes/tithers/${kofi.id}`, {
    ...KOFI, type: 'INDIVIDUAL', spouseName: 'Ama Mensah', spousePhone: '0201234567',
  });
  assert.equal(single.status, 200);
  assert.equal(single.body.id, kofi.id);
  assert.equal(single.body.type, 'INDIVIDUAL');
  assert.equal(single.body.spouseName, null);
  assert.equal(single.body.spousePhone, null);
  assert.equal(single.body.phone, '233244123456');

  assert.equal(await prisma.tither.count(), 1);
  const missing = await api('PUT', `/admin/tithes/tithers/${randomUUID()}`, KOFI);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.message, 'That tither no longer exists.');
});

test('the list searches by name, number or phone however they are typed, and filters by payment month and status', async () => {
  const kofi = await addTither(KOFI);                                                     // HPC021, 024 412 3456
  await addTither({ number: 'HPC007', name: 'Ama Owusu', phone: '0201234567' });
  await addTither({ number: 'HPC022', type: 'COUPLE', name: 'Yaw Boateng', phone: '0551234567', spouseName: 'Abena Boateng', spousePhone: '0271234567' });
  const old = await addTither({ number: 'HPC003', name: 'Old Member' });
  await api('PUT', `/admin/tithes/tithers/${old.id}`, { number: 'HPC003', name: 'Old Member', isActive: false });
  await seedPayment(kofi.id, 100, '2026-10', '2026-10-05');

  const list = (query) => api('GET', `/admin/tithes/tithers?${query}`);

  // Active only, in number order, with each one's last payment.
  const all = await list('');
  assert.equal(all.status, 200);
  assert.deepEqual(numbers(all), ['HPC007', 'HPC021', 'HPC022']);
  assert.equal(all.body.total, 3);
  const kofiRow = all.body.tithers.find((t) => t.number === 'HPC021');
  assert.equal(kofiRow.paymentCount, 1);
  assert.deepEqual(kofiRow.lastPayment, { amount: 100, month: '2026-10', paidOn: '2026-10-05', smsStatus: null });
  const amaRow = all.body.tithers.find((t) => t.number === 'HPC007');
  assert.equal(amaRow.paymentCount, 0);
  assert.equal(amaRow.lastPayment, null);

  // Search.
  assert.deepEqual(numbers(await list('q=MENS')),   ['HPC021'], 'a name fragment, whatever its case');
  assert.deepEqual(numbers(await list('q=hpc21')),  ['HPC021'], 'a number typed without its zeros');
  assert.deepEqual(numbers(await list('q=0244')),   ['HPC021'], 'a phone typed with its leading zero');
  assert.deepEqual(numbers(await list('q=abena')),  ['HPC022'], "a spouse's name");
  assert.deepEqual(numbers(await list('q=0271')),   ['HPC022'], "a spouse's phone");
  assert.deepEqual(numbers(await list('q=nobody')), []);

  // Type and payment-month filters.
  assert.deepEqual(numbers(await list('type=COUPLE')),     ['HPC022']);
  assert.deepEqual(numbers(await list('type=INDIVIDUAL')), ['HPC007', 'HPC021']);
  assert.deepEqual(numbers(await list('paid=2026-10')),    ['HPC021']);
  assert.deepEqual(numbers(await list('unpaid=2026-10')),  ['HPC007', 'HPC022']);
  assert.deepEqual(numbers(await list('paid=2026-09')),    []);
  assert.deepEqual(numbers(await list('unpaid=2026-09')),  ['HPC007', 'HPC021', 'HPC022']);

  // Archived accounts are hidden unless asked for.
  assert.deepEqual(numbers(await list('status=archived')), ['HPC003']);
  const everyone = await list('status=all');
  assert.deepEqual(numbers(everyone), ['HPC003', 'HPC007', 'HPC021', 'HPC022']);
  assert.equal(everyone.body.total, 4);

  // Pages, with the total across all pages.
  const page2 = await list('limit=2&page=2');
  assert.deepEqual(numbers(page2), ['HPC022']);
  assert.equal(page2.body.total, 3);
});

// ─── Recording a payment ──────────────────────────────────────────────────────

test('recording a payment stores it as given, names who recorded it and texts the tither', async () => {
  const kofi = await addTither(KOFI);

  const res = await record(kofi.id, { note: 'Cash, Sunday service' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { payment, sms } = res.body;

  assert.equal(payment.titherId, kofi.id);
  assert.equal(payment.amount, 150);
  assert.equal(payment.currency, 'GHS');
  assert.equal(payment.month, '2026-11');
  assert.equal(payment.paidOn, '2026-11-11');
  assert.equal(payment.note, 'Cash, Sunday service');
  assert.equal(payment.recordedBy, 'Efua Asante');
  assert.deepEqual(payment.tither, { id: kofi.id, number: 'HPC021', name: 'Kofi Mensah', type: 'INDIVIDUAL', spouseName: null, isActive: true });

  const text = 'Dear Kofi Mensah, we acknowledge receipt of your tithe of GHS 150.00 for November 2026, paid on 11 Nov 2026. Tithe No. HPC021. Thank you and God bless you. - HPC Global';
  assert.equal(payment.smsStatus, 'SENT');
  assert.deepEqual(payment.smsTo, ['024 412 3456']);
  assert.equal(payment.smsError, null);
  assert.ok(payment.smsSentAt);
  assert.deepEqual(sms, { status: 'SENT', to: ['024 412 3456'], error: null, text });

  // Exactly one text, to the stored number, saying what the template says.
  assert.equal(hubtel.requests.length, 1);
  const [{ url, body }] = hubtel.requests;
  assert.equal(url, '/v1/messages/send');
  assert.equal(body.To, '233244123456');
  assert.equal(body.Content, text);
  assert.equal(body.RegisteredDelivery, true);
  assert.equal(typeof body.From, 'string');

  // The date is kept as a date, not shifted by a timezone.
  const stored = await prisma.tithePayment.findUnique({ where: { id: payment.id } });
  assert.equal(stored.paidOn.toISOString().slice(0, 10), '2026-11-11');
  assert.equal(stored.smsTo, '233244123456');
  assert.equal(await prisma.deliveryFailure.count(), 0);

  const detail = await api('GET', `/admin/tithes/tithers/${kofi.id}`);
  assert.equal(detail.body.payments.length, 1);
  assert.equal(detail.body.payments[0].id, payment.id);
  assert.equal(detail.body.stats.total, 150);
  assert.equal(detail.body.stats.count, 1);
});

test("a couple's payment texts both numbers and addresses them together", async () => {
  const pair = await addTither(COUPLE);

  const res = await record(pair.id);
  assert.equal(res.status, 201);
  assert.equal(res.body.sms.status, 'SENT');
  // The account holder's number first, then the spouse's.
  assert.deepEqual(res.body.sms.to, ['024 412 3456', '020 123 4567']);
  assert.deepEqual(res.body.payment.smsTo, ['024 412 3456', '020 123 4567']);

  assert.equal(hubtel.requests.length, 2);
  assert.deepEqual(hubtel.requests.map((r) => r.body.To).sort(), ['233201234567', '233244123456']);
  for (const { body } of hubtel.requests) {
    assert.ok(body.Content.startsWith('Dear Kofi Mensah & Ama Mensah, '), body.Content);
    assert.equal(body.Content, res.body.sms.text);
  }

  // A couple who share one phone get one text, not the same one twice.
  hubtel.requests = [];
  const shared = await addTither({ ...COUPLE, number: 'HPC023', spousePhone: '+233244123456' });
  const once = await record(shared.id);
  assert.equal(once.status, 201);
  assert.deepEqual(once.body.sms.to, ['024 412 3456']);
  assert.equal(hubtel.requests.length, 1);
});

test('the SMS is skipped, with the reason kept, when switched off, when there is no phone, or when automatic sending is off', async () => {
  const kofi = await addTither(KOFI);

  const off = await record(kofi.id, { sendSms: false });
  assert.equal(off.status, 201);
  assert.deepEqual(off.body.sms, { status: 'SKIPPED', to: [], error: 'Switched off for this payment.', text: null });
  assert.equal(off.body.payment.smsStatus, 'SKIPPED');
  assert.equal(off.body.payment.smsError, 'Switched off for this payment.');
  assert.deepEqual(off.body.payment.smsTo, []);
  assert.equal(off.body.payment.smsSentAt, null);

  const esi = await addTither({ number: 'HPC030', name: 'Esi Owusu' });
  const noPhone = await record(esi.id);
  assert.equal(noPhone.status, 201);
  assert.equal(noPhone.body.sms.status, 'SKIPPED');
  assert.equal(noPhone.body.sms.error, 'No phone number on the account.');
  assert.deepEqual(noPhone.body.sms.to, []);
  assert.equal(noPhone.body.payment.smsStatus, 'SKIPPED');
  assert.equal(noPhone.body.payment.smsError, 'No phone number on the account.');

  // Automatic sending switched off under SMS Template.
  const settings = await api('PUT', '/admin/tithes/settings', { smsTemplate: tithe.DEFAULT_SMS_TEMPLATE, smsEnabled: false });
  assert.equal(settings.status, 200);
  const automatic = await record(kofi.id, { month: '2026-10', paidOn: '2026-10-05' });
  assert.equal(automatic.status, 201);
  assert.equal(automatic.body.sms.status, 'SKIPPED');
  assert.equal(automatic.body.sms.error, 'Automatic acknowledgements are switched off under SMS Template.');
  assert.equal(automatic.body.payment.smsStatus, 'SKIPPED');

  assert.equal(hubtel.requests.length, 0, 'nothing was sent');
  assert.equal(await prisma.deliveryFailure.count(), 0, 'a skipped SMS is not a delivery problem');
  assert.equal(await prisma.tithePayment.count(), 3, 'every payment was still recorded');

  // Automatic sending off, but the office switched it on for this payment:
  // that is the by-hand path, and it goes.
  const chosen = await record(kofi.id, { sendSms: true, month: '2026-09', paidOn: '2026-09-07' });
  assert.equal(chosen.status, 201);
  assert.equal(chosen.body.sms.status, 'SENT');
  assert.deepEqual(chosen.body.sms.to, ['024 412 3456']);
  assert.equal(chosen.body.payment.smsStatus, 'SENT');
  assert.equal(hubtel.requests.length, 1);
  hubtel.requests = [];

  // Asked for by hand, it still goes.
  const byHand = await api('POST', `/admin/tithes/payments/${automatic.body.payment.id}/sms`);
  assert.equal(byHand.status, 200);
  assert.equal(byHand.body.sms.status, 'SENT');
  assert.deepEqual(byHand.body.sms.to, ['024 412 3456']);
  assert.equal(byHand.body.payment.smsStatus, 'SENT');
  assert.equal(byHand.body.payment.smsError, null);
  assert.ok(byHand.body.payment.smsSentAt);
  assert.equal(hubtel.requests.length, 1);
  assert.equal(hubtel.requests[0].body.To, '233244123456');
  assert.match(hubtel.requests[0].body.Content, /for October 2026, paid on 5 Oct 2026/);

  // But not to someone with no number.
  const still = await api('POST', `/admin/tithes/payments/${noPhone.body.payment.id}/sms`);
  assert.equal(still.status, 200);
  assert.equal(still.body.sms.status, 'SKIPPED');
  assert.equal(still.body.sms.error, 'No phone number on the account.');
  assert.equal(hubtel.requests.length, 1);
});

test('when Hubtel fails the payment is still saved, marked FAILED, and the failure lands in Delivery Problems', async () => {
  const kofi = await addTither(KOFI);

  hubtel.mode = 'down';
  const res = await record(kofi.id);
  assert.equal(res.status, 201, 'a provider outage must not lose the payment');
  assert.equal(res.body.payment.smsStatus, 'FAILED');
  assert.equal(res.body.sms.status, 'FAILED');
  assert.deepEqual(res.body.sms.to, [], 'it reached nobody');
  assert.deepEqual(res.body.payment.smsTo, []);
  assert.equal(res.body.payment.smsSentAt, null);
  // Which number, and that it was Hubtel's send that failed.
  assert.match(res.body.payment.smsError, /^024 412 3456: Hubtel send: /);
  assert.equal(res.body.sms.error, res.body.payment.smsError);
  assert.equal(hubtel.requests.length, 1);

  const failures = await prisma.deliveryFailure.findMany();
  assert.equal(failures.length, 1);
  assert.equal(failures[0].channel, 'SMS');
  assert.equal(failures[0].context, 'Tithe from Kofi Mensah (HPC021)');
  assert.equal(failures[0].label, 'acknowledgement SMS');
  assert.equal(failures[0].recipient, '233244123456');
  assert.ok(failures[0].error.length > 0);
  assert.equal(failures[0].resolvedAt, null);

  // Hubtel can also refuse inside a 2xx — an empty prepaid wallet does.
  hubtel.mode = 'reject';
  const rejected = await record(kofi.id, { month: '2026-10', paidOn: '2026-10-05' });
  assert.equal(rejected.status, 201);
  assert.equal(rejected.body.payment.smsStatus, 'FAILED');
  assert.equal(rejected.body.payment.smsError, '024 412 3456: Hubtel rejected the message: status 101 — Payment required on account');
  assert.equal(await prisma.deliveryFailure.count(), 2);

  // For a couple, each number's failure is recorded on its own.
  hubtel.mode = 'down';
  const pair = await addTither(COUPLE);
  const both = await record(pair.id);
  assert.equal(both.status, 201);
  assert.equal(both.body.payment.smsStatus, 'FAILED');
  assert.match(both.body.payment.smsError, /024 412 3456: Hubtel send: .* \| 020 123 4567: Hubtel send: /);
  const forPair = await prisma.deliveryFailure.findMany({ where: { context: 'Tithe from Kofi Mensah & Ama Mensah (HPC022)' }, orderBy: { label: 'asc' } });
  assert.deepEqual(forPair.map((f) => [f.label, f.recipient]), [
    ['acknowledgement SMS',          '233244123456'],
    ['acknowledgement SMS (spouse)', '233201234567'],
  ]);

  // One of a couple's phones can be refused while the other is reached: the
  // payment says who got the text, and the error names who did not.
  hubtel.mode = 'accept';
  hubtel.rejectTo = '233201234567';
  const half = await record(pair.id, { month: '2026-10', paidOn: '2026-10-05' });
  assert.equal(half.status, 201);
  assert.equal(half.body.sms.status, 'FAILED');
  assert.deepEqual(half.body.sms.to, ['024 412 3456']);
  assert.deepEqual(half.body.payment.smsTo, ['024 412 3456']);
  assert.equal(half.body.payment.smsError, '020 123 4567: Hubtel rejected the message: status 101 — Payment required on account');
  hubtel.rejectTo = null;

  assert.equal(await prisma.tithePayment.count(), 4);
});

test('sending the SMS again after a failure marks the payment SENT', async () => {
  const kofi = await addTither(KOFI);
  hubtel.mode = 'down';
  const failed = await record(kofi.id);
  assert.equal(failed.body.payment.smsStatus, 'FAILED');
  const id = failed.body.payment.id;

  hubtel.mode = 'accept';
  hubtel.requests = [];
  const res = await api('POST', `/admin/tithes/payments/${id}/sms`);
  assert.equal(res.status, 200);
  assert.equal(res.body.sms.status, 'SENT');
  assert.equal(res.body.sms.error, null);
  assert.equal(res.body.payment.id, id);
  assert.equal(res.body.payment.smsStatus, 'SENT');
  assert.equal(res.body.payment.smsError, null);
  assert.ok(res.body.payment.smsSentAt);
  assert.deepEqual(res.body.payment.smsTo, ['024 412 3456']);
  assert.equal(hubtel.requests.length, 1);
  assert.equal(hubtel.requests[0].body.Content, res.body.sms.text);

  const stored = await prisma.tithePayment.findUnique({ where: { id } });
  assert.equal(stored.smsStatus, 'SENT');
  assert.equal(stored.smsError, null);
  assert.notEqual(stored.smsSentAt, null);

  // The office fixes a wrong number, then presses Send again: the text goes
  // to the number on the account now, not the one it failed on.
  await api('PUT', `/admin/tithes/tithers/${kofi.id}`, { ...KOFI, phone: '0551112222' });
  hubtel.requests = [];
  const again = await api('POST', `/admin/tithes/payments/${id}/sms`);
  assert.equal(again.status, 200);
  assert.deepEqual(again.body.sms.to, ['055 111 2222']);
  assert.equal(hubtel.requests[0].body.To, '233551112222');

  const missing = await api('POST', `/admin/tithes/payments/${randomUUID()}/sms`);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.message, 'That payment no longer exists.');
});

test('a payment is refused, with a plain reason, for a bad amount, month, date or tither', async () => {
  const kofi = await addTither(KOFI);

  const refused = [
    [{ amount: 0 },               'The amount must be more than zero'],
    [{ amount: -5 },              'The amount must be more than zero'],
    [{ amount: undefined },       'Please enter the amount'],
    [{ amount: 'fifty' },         'Please enter the amount'],
    [{ amount: 20_000_000 },      'That amount is too large'],
    [{ month: '2026-13' },        'Please choose the month the tithe is for'],
    [{ month: 'November' },       'Please choose the month the tithe is for'],
    [{ month: undefined },        'Please choose the month the tithe is for'],
    [{ paidOn: 'tomorrow' },      'Please choose the date it was paid'],
    [{ paidOn: '2026-02-30' },    'Please choose the date it was paid'],
    [{ paidOn: '2099-01-01' },    'That date is in the future'],
    [{ paidOn: undefined },       'Please choose the date it was paid'],
    [{ titherId: undefined },     'Please choose who the payment is from'],
  ];
  for (const [change, message] of refused) {
    const res = await api('POST', '/admin/tithes/payments', { titherId: kofi.id, ...PAYMENT, ...change });
    assert.equal(res.status, 400, JSON.stringify(change));
    assert.equal(res.body.message, message, JSON.stringify(change));
  }

  const unknown = await record(randomUUID());
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.message, 'That tither no longer exists.');

  await api('PUT', `/admin/tithes/tithers/${kofi.id}`, { ...KOFI, isActive: false });
  const archived = await record(kofi.id);
  assert.equal(archived.status, 409);
  assert.equal(archived.body.message, "Kofi Mensah's account is archived. Restore it first, then record the payment.");

  assert.equal(await prisma.tithePayment.count(), 0, 'nothing was recorded');
  assert.equal(hubtel.requests.length, 0, 'nobody was texted');
});

test('editing a payment changes what was recorded without sending another SMS', async () => {
  const kofi = await addTither(KOFI);
  const { payment } = (await record(kofi.id)).body;
  assert.equal(hubtel.requests.length, 1);

  const res = await api('PUT', `/admin/tithes/payments/${payment.id}`, { amount: '175.50', month: '2026-10', paidOn: '2026-10-28', note: 'Corrected' });
  assert.equal(res.status, 200);
  assert.equal(res.body.payment.id, payment.id);
  assert.equal(res.body.payment.amount, 175.5);
  assert.equal(res.body.payment.month, '2026-10');
  assert.equal(res.body.payment.paidOn, '2026-10-28');
  assert.equal(res.body.payment.note, 'Corrected');
  // What was sent stays on the record as it was.
  assert.equal(res.body.payment.smsStatus, 'SENT');
  assert.deepEqual(res.body.payment.smsTo, ['024 412 3456']);
  assert.equal(res.body.payment.recordedBy, 'Efua Asante');
  assert.equal(hubtel.requests.length, 1, 'editing sends nothing');

  const bad = await api('PUT', `/admin/tithes/payments/${payment.id}`, { amount: 0, month: '2026-10', paidOn: '2026-10-28', note: '' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.message, 'The amount must be more than zero');
  assert.equal((await prisma.tithePayment.findUnique({ where: { id: payment.id } })).amount, 175.5);

  const missing = await api('PUT', `/admin/tithes/payments/${randomUUID()}`, { amount: 10, month: '2026-10', paidOn: '2026-10-28' });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.message, 'That payment no longer exists.');
});

test('the payments list filters by month, tither, dates and SMS status, totals what it shows, and exports as CSV', async () => {
  const kofi = await addTither(KOFI);
  const ama  = await addTither({ number: 'HPC007', name: 'Ama Owusu', phone: '0201234567' });

  const sent    = (await record(kofi.id)).body.payment;                                                       // 150, Nov, 11 Nov, SENT
  const skipped = (await record(ama.id,  { amount: 200, paidOn: '2026-11-08', sendSms: false })).body.payment; // 200, Nov, 8 Nov, SKIPPED
  hubtel.mode = 'down';
  const failed  = (await record(kofi.id, { amount: 100, month: '2026-10', paidOn: '2026-10-05' })).body.payment; // 100, Oct, FAILED
  assert.equal(failed.smsStatus, 'FAILED');

  const list = async (query) => {
    const res = await api('GET', `/admin/tithes/payments?${query}`);
    assert.equal(res.status, 200);
    return { ids: res.body.payments.map((p) => p.id), total: res.body.total, sum: res.body.sum };
  };

  // Newest paid first, totalled.
  assert.deepEqual(await list(''), { ids: [sent.id, skipped.id, failed.id], total: 3, sum: 450 });
  assert.deepEqual(await list('month=2026-11'),                   { ids: [sent.id, skipped.id], total: 2, sum: 350 });
  assert.deepEqual(await list(`titherId=${kofi.id}`),             { ids: [sent.id, failed.id],  total: 2, sum: 250 });
  assert.deepEqual(await list('from=2026-11-01&to=2026-11-10'),   { ids: [skipped.id],          total: 1, sum: 200 });
  assert.deepEqual(await list('from=2026-11-11'),                 { ids: [sent.id],             total: 1, sum: 150 });
  assert.deepEqual(await list('sms=FAILED'),                      { ids: [failed.id],           total: 1, sum: 100 });
  assert.deepEqual(await list('sms=SKIPPED'),                     { ids: [skipped.id],          total: 1, sum: 200 });
  assert.deepEqual(await list('sms=SENT'),                        { ids: [sent.id],             total: 1, sum: 150 });
  assert.deepEqual(await list('month=2026-09'),                   { ids: [],                    total: 0, sum: 0 });
  // The total and sum cover every page, not just the one shown.
  assert.deepEqual(await list('limit=2&page=2'),                  { ids: [failed.id],           total: 3, sum: 450 });

  const full = await api('GET', '/admin/tithes/payments');
  const row  = full.body.payments.find((p) => p.id === sent.id);
  assert.deepEqual(row.tither, { id: kofi.id, number: 'HPC021', name: 'Kofi Mensah', type: 'INDIVIDUAL', spouseName: null, isActive: true });
  assert.equal(row.paidOn, '2026-11-11');

  // The export has the same rows as the list, worded for a spreadsheet.
  const csv = await download('/admin/tithes/payments/export?month=2026-11');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /^text\/csv/);
  assert.equal(csv.headers.get('content-disposition'), 'attachment; filename="tithes-2026-11.csv"');
  assert.equal(csv.text.charCodeAt(0), 0xfeff, 'a BOM, so Excel reads the accents');
  assert.deepEqual(csv.text.slice(1).split('\n'), [
    '"Date paid","Month for","Tithe number","Name","Type","Amount","Currency","Note","SMS","Recorded by"',
    '"2026-11-11","November 2026","HPC021","Kofi Mensah","INDIVIDUAL","150.00","GHS","","SENT","Efua Asante"',
    '"2026-11-08","November 2026","HPC007","Ama Owusu","INDIVIDUAL","200.00","GHS","","SKIPPED","Efua Asante"',
  ]);
  const everything = await download('/admin/tithes/payments/export');
  assert.match(everything.headers.get('content-disposition'), /^attachment; filename="tithes-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.equal(everything.text.split('\n').length, 4);
});

// ─── The SMS template ─────────────────────────────────────────────────────────

test('the SMS template: its defaults, what is refused, and that a saved template is what gets sent', async () => {
  const get = await api('GET', '/admin/tithes/settings');
  assert.equal(get.status, 200);
  assert.equal(get.body.smsTemplate, tithe.DEFAULT_SMS_TEMPLATE);
  assert.equal(get.body.defaultTemplate, tithe.DEFAULT_SMS_TEMPLATE);
  assert.equal(get.body.smsEnabled, true);
  assert.equal(get.body.maxLength, 600);
  assert.equal(get.body.church, 'HPC Global');
  assert.equal(get.body.sms, 'hubtel');
  assert.ok(get.body.updatedAt);
  assert.deepEqual(get.body.placeholders.map((p) => p.key), ['name', 'firstName', 'number', 'amount', 'month', 'date', 'church']);
  for (const p of get.body.placeholders) {
    assert.ok(p.label && p.description && p.sample, `{${p.key}} needs a label, description and sample for the editor`);
  }

  const refused = [
    [{ smsTemplate: 'Dear {nmae}, thank you.' }, '{nmae} is not a placeholder. Use one of: {name}, {firstName}, {number}, {amount}, {month}, {date}, {church}.'],
    [{ smsTemplate: '   ' },                     'The message cannot be empty.'],
    [{},                                         'The message cannot be empty.'],
    [{ smsTemplate: 'x'.repeat(601) },           'Keep the message under 600 characters — it is sent as an SMS.'],
  ];
  for (const [body, message] of refused) {
    const res = await api('PUT', '/admin/tithes/settings', body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal(res.body.message, message);
  }
  assert.equal((await api('GET', '/admin/tithes/settings')).body.smsTemplate, tithe.DEFAULT_SMS_TEMPLATE, 'a refused template changes nothing');

  // A custom template, with spaces inside a placeholder, trimmed on save.
  const custom = '  {firstName}, {church} received {amount} ({number}) for { month }. ';
  const put = await api('PUT', '/admin/tithes/settings', { smsTemplate: custom, smsEnabled: true });
  assert.equal(put.status, 200);
  assert.deepEqual(Object.keys(put.body).sort(), ['smsEnabled', 'smsTemplate', 'updatedAt']);
  assert.equal(put.body.smsTemplate, custom.trim());
  assert.equal(put.body.smsEnabled, true);
  assert.equal((await api('GET', '/admin/tithes/settings')).body.smsTemplate, custom.trim());

  const pair = await addTither(COUPLE);
  const res = await record(pair.id);
  assert.equal(res.status, 201);
  assert.equal(res.body.sms.text, 'Kofi & Ama, HPC Global received GHS 150.00 (HPC022) for November 2026.');
  assert.equal(hubtel.requests.length, 2);
  assert.equal(hubtel.requests[0].body.Content, 'Kofi & Ama, HPC Global received GHS 150.00 (HPC022) for November 2026.');
});

// ─── Uploading a list ─────────────────────────────────────────────────────────

test('a CSV upload is previewed row by row: what is new, what is already there and what is wrong', async () => {
  const kofi = await addTither(KOFI);   // HPC021, 024 412 3456

  const csv = '﻿' + [
    'Tithe Number,Name,Phone,Type,Spouse Name,Spouse Phone',
    'HPC001,"Mensah, Kofi",244555666,,,',                           // line 2: a quoted name; Excel dropped the zero
    'HPC002,Ama Owusu,2.44E+08,Individual,,',                        // line 3: Excel threw digits away
    'HPC003,Yaw Boateng,0201234567,Couple,Abena Boateng,0551234567', // line 4
    'hpc-3,Yaw Again,0201234567,,,',                                 // line 5: the same number as line 4
    'HPC005,,0551112222,,,',                                         // line 6: no name
    'HPC021,Kofi Mensah,0244123456,,,',                              // line 7: already on the register
    'HPC006,Esi Owusu,0244123456,,,',                                // line 8: Kofi's phone
  ].join('\r\n') + '\r\n';

  const res = await upload(Buffer.from(csv, 'utf8'), 'tithers.csv');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.filename, 'tithers.csv');
  assert.equal(res.body.hadHeader, true);
  assert.deepEqual(res.body.summary, { total: 7, new: 3, update: 1, error: 3 });

  const rows = Object.fromEntries(res.body.rows.map((r) => [r.line, r]));
  assert.deepEqual(Object.keys(rows).map(Number), [2, 3, 4, 5, 6, 7, 8]);

  assert.deepEqual(rows[2], {
    line: 2, number: 'HPC001', name: 'Mensah, Kofi', type: 'INDIVIDUAL', phone: '233244555666', spouseName: '', spousePhone: '',
    keepType: false, problems: [], warnings: [], status: 'new', existing: null,
  });
  assert.equal(rows[3].status, 'error');
  assert.deepEqual(rows[3].problems, ['The phone was saved by Excel as 2.44E+08 and digits were lost. Format that column as Text, or save the file as .xlsx.']);
  assert.equal(rows[3].phone, '');

  assert.equal(rows[4].status, 'new');
  assert.equal(rows[4].type, 'COUPLE');
  assert.equal(rows[4].spouseName, 'Abena Boateng');
  assert.equal(rows[4].spousePhone, '233551234567');
  assert.deepEqual(rows[4].problems, []);

  assert.equal(rows[5].status, 'error');
  assert.equal(rows[5].number, 'HPC003');
  assert.deepEqual(rows[5].problems, ['HPC003 is also on row 4.']);

  assert.equal(rows[6].status, 'error');
  assert.deepEqual(rows[6].problems, ['No name.']);
  assert.deepEqual(rows[6].warnings, []);

  assert.equal(rows[7].status, 'update');
  assert.deepEqual(rows[7].existing, { id: kofi.id, name: 'Kofi Mensah', type: 'INDIVIDUAL', isActive: true });
  assert.deepEqual(rows[7].problems, []);
  assert.deepEqual(rows[7].warnings, [], "his own number is not 'also' his");

  assert.equal(rows[8].status, 'new');
  assert.deepEqual(rows[8].warnings, ['024 412 3456 is also on row 7.', "024 412 3456 is also Kofi Mensah's number (HPC021)."]);
  assert.deepEqual(rows[8].problems, []);

  // Previewing writes nothing.
  assert.equal(await prisma.tither.count(), 1);

  // A file with nothing usable in it.
  const empty = await upload(Buffer.from('Tithe Number,Name,Phone\r\n\r\n', 'utf8'), 'blank.csv');
  assert.equal(empty.status, 400);
  assert.equal(empty.body.message, 'No tithers found in that file. The first row should name the columns: Tithe Number, Name, Phone, Type, Spouse Name, Spouse Phone.');
});

test('an Excel workbook uploads: dropped leading zeros come back and "couple" in lower case is understood', async () => {
  const res = await upload(fs.readFileSync(FIXTURE), 'tithers.xlsx');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.filename, 'tithers.xlsx');
  assert.equal(res.body.hadHeader, true);
  assert.deepEqual(res.body.summary, { total: 3, new: 3, update: 0, error: 0 });

  const [kofi, yaw, esi] = res.body.rows;
  assert.deepEqual(kofi, {
    line: 2, number: 'HPC001', name: 'Kofi Mensah', type: 'INDIVIDUAL', phone: '233244123456', spouseName: '', spousePhone: '',
    keepType: false, problems: [], warnings: [], status: 'new', existing: null,
  });
  assert.deepEqual(yaw, {
    line: 3, number: 'HPC002', name: 'Yaw Boateng', type: 'COUPLE', phone: '233201234567', spouseName: 'Abena Boateng', spousePhone: '233551234567',
    keepType: false, problems: [], warnings: [], status: 'new', existing: null,
  });
  assert.deepEqual(esi, {
    line: 4, number: 'HPC003', name: 'Esi Owusu', type: 'INDIVIDUAL', phone: '', spouseName: '', spousePhone: '',
    keepType: false, problems: [], warnings: ['No phone number, so no SMS can be sent.'], status: 'new', existing: null,
  });

  // The rows go back as they came and are imported as previewed.
  const imported = await api('POST', '/admin/tithes/tithers/import', { rows: res.body.rows.map(importRow), updateExisting: false });
  assert.equal(imported.status, 200);
  assert.deepEqual(imported.body, { created: 3, updated: 0, skipped: [] });
  const stored = await prisma.tither.findMany({ orderBy: { number: 'asc' }, select: { number: true, name: true, type: true, phone: true, spouseName: true, spousePhone: true } });
  assert.deepEqual(stored, [
    { number: 'HPC001', name: 'Kofi Mensah', type: 'INDIVIDUAL', phone: '233244123456', spouseName: null, spousePhone: null },
    { number: 'HPC002', name: 'Yaw Boateng', type: 'COUPLE',     phone: '233201234567', spouseName: 'Abena Boateng', spousePhone: '233551234567' },
    { number: 'HPC003', name: 'Esi Owusu',   type: 'INDIVIDUAL', phone: null,           spouseName: null, spousePhone: null },
  ]);

  // Files that are not a CSV or an .xlsx are refused in words the office can act on.
  const xls = await upload(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]), 'tithers.xls');
  assert.equal(xls.status, 400);
  assert.equal(xls.body.message, 'That is an old-style .xls file. In Excel, choose Save As and pick "Excel Workbook (.xlsx)" or "CSV", then upload that.');

  const picture = await upload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]), 'photo.png');
  assert.equal(picture.status, 400);
  assert.equal(picture.body.message, 'photo.png is not a CSV or .xlsx spreadsheet.');

  const nothing = await upload(Buffer.alloc(0), 'nothing.csv');
  assert.equal(nothing.status, 400);
  assert.equal(nothing.body.message, 'That file is empty.');

  const broken = await upload(Buffer.from('PK\u0003\u0004 not really a workbook, just the signature of one'), 'broken.xlsx');
  assert.equal(broken.status, 400);
  assert.equal(broken.body.message, 'That file is not a valid .xlsx workbook.');
});

test('the template the office downloads uploads back without a single problem', async () => {
  const template = await download('/admin/tithes/tithers/template.csv');
  assert.equal(template.status, 200);
  assert.match(template.headers.get('content-type'), /^text\/csv/);
  assert.equal(template.headers.get('content-disposition'), 'attachment; filename="tithers-template.csv"');
  assert.equal(template.text.charCodeAt(0), 0xfeff);
  assert.equal(template.text.slice(1).split('\r\n')[0], 'Tithe Number,Name,Phone,Type,Spouse Name,Spouse Phone');

  const res = await upload(Buffer.from(template.text, 'utf8'), 'tithers-template.csv');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.hadHeader, true);
  assert.deepEqual(res.body.summary, { total: 2, new: 2, update: 0, error: 0 });
  assert.deepEqual(res.body.rows.map((r) => [r.number, r.name, r.type, r.phone, r.spouseName, r.spousePhone, r.problems, r.warnings]), [
    ['HPC001', 'Kofi Mensah', 'INDIVIDUAL', '233244123456', '', '', [], []],
    ['HPC002', 'Yaw Boateng', 'COUPLE',     '233201234567', 'Abena Boateng', '233551234567', [], []],
  ]);
});

test('importing adds new tithers, leaves existing ones alone unless asked, and reports what it skipped', async () => {
  const kofi = await addTither(KOFI);   // HPC021 Kofi Mensah, 024 412 3456

  const rows = [
    { number: 'HPC001', name: 'Ama Owusu',      type: 'INDIVIDUAL', phone: '0201234567', spouseName: '', spousePhone: '' },
    { number: 'hpc 21', name: 'Kofi K. Mensah', type: 'COUPLE',     phone: '0244999999', spouseName: 'Ama Mensah', spousePhone: '' },
    { number: '???',    name: 'Nobody',         type: 'INDIVIDUAL', phone: '',           spouseName: '', spousePhone: '' },
    { number: 'HPC-001', name: 'Ama Twice',     type: 'INDIVIDUAL', phone: '',           spouseName: '', spousePhone: '' },
    { number: 'HPC009', name: 'Esi Owusu',      type: 'COUPLE',     phone: '0551112222', spouseName: '', spousePhone: '' },
    { number: 'HPC010', name: 'Yaw Boateng',    type: 'INDIVIDUAL', phone: '2.44E+08',   spouseName: '', spousePhone: '' },
  ];

  const first = await api('POST', '/admin/tithes/tithers/import', { rows, updateExisting: false });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body, {
    created: 1,
    updated: 0,
    skipped: [
      { row: 3, number: '???',    reason: '"???" is not a tithe number. Use letters then digits, like HPC021.' },
      { row: 4, number: 'HPC001', reason: 'Listed twice in the upload.' },
      { row: 5, number: 'HPC009', reason: "A couple needs the spouse's name." },
      { row: 6, number: 'HPC010', reason: '"2.44E+08" is not a usable phone number.' },
      { number: 'HPC021', reason: 'Already on the register (left unchanged).' },
    ],
  });
  assert.deepEqual(
    (await prisma.tither.findMany({ orderBy: { number: 'asc' }, select: { number: true, name: true } })),
    [{ number: 'HPC001', name: 'Ama Owusu' }, { number: 'HPC021', name: 'Kofi Mensah' }],
  );
  const untouched = await prisma.tither.findUnique({ where: { id: kofi.id } });
  assert.equal(untouched.phone, '233244123456');
  assert.equal(untouched.type, 'INDIVIDUAL');

  // Asked to update: the register's details are replaced by the file's, the
  // id stays, and an archived account stays archived.
  await prisma.tither.update({ where: { id: kofi.id }, data: { isActive: false } });
  const second = await api('POST', '/admin/tithes/tithers/import', { rows: [rows[1]], updateExisting: true });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.deepEqual(second.body, { created: 0, updated: 1, skipped: [] });
  const updated = await prisma.tither.findUnique({ where: { id: kofi.id } });
  assert.equal(updated.number, 'HPC021');
  assert.equal(updated.name, 'Kofi K. Mensah');
  assert.equal(updated.type, 'COUPLE');
  assert.equal(updated.phone, '233244999999');
  assert.equal(updated.spouseName, 'Ama Mensah');
  assert.equal(updated.isActive, false);
  assert.equal(await prisma.tither.count(), 2);

  const nothing = await api('POST', '/admin/tithes/tithers/import', { rows: [], updateExisting: true });
  assert.equal(nothing.status, 400);
  assert.equal(nothing.body.message, 'There is nothing to import.');
});

// ─── Deleting and archiving ───────────────────────────────────────────────────

test('a tither with payments cannot be deleted, only archived; one without can; deleting a payment drops the stats', async () => {
  const kofi = await addTither(KOFI);
  const first  = (await record(kofi.id, { sendSms: false })).body.payment;
  const second = (await record(kofi.id, { sendSms: false, amount: 50, month: '2026-10', paidOn: '2026-10-05' })).body.payment;

  const del = await api('DELETE', `/admin/tithes/tithers/${kofi.id}`);
  assert.equal(del.status, 409);
  assert.equal(del.body.message, 'This account has 2 payments recorded. Archive it instead so the records are kept.');
  assert.equal((await api('GET', `/admin/tithes/tithers/${kofi.id}`)).status, 200);

  const archived = await api('PUT', `/admin/tithes/tithers/${kofi.id}`, { ...KOFI, isActive: false });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.isActive, false);
  assert.deepEqual((await api('GET', '/admin/tithes/tithers')).body, { tithers: [], total: 0 });
  assert.deepEqual(numbers(await api('GET', '/admin/tithes/tithers?status=archived')), ['HPC021']);

  let detail = await api('GET', `/admin/tithes/tithers/${kofi.id}`);
  assert.equal(detail.body.isActive, false);
  assert.equal(detail.body.stats.total, 200);
  assert.equal(detail.body.stats.count, 2);
  assert.deepEqual(detail.body.payments.map((p) => p.id), [first.id, second.id], 'newest first');

  const gone = await api('DELETE', `/admin/tithes/payments/${second.id}`);
  assert.deepEqual(gone, { status: 200, body: { ok: true } });
  detail = await api('GET', `/admin/tithes/tithers/${kofi.id}`);
  assert.equal(detail.body.stats.total, 150);
  assert.equal(detail.body.stats.count, 1);
  assert.deepEqual(detail.body.payments.map((p) => p.id), [first.id]);
  assert.equal((await api('DELETE', `/admin/tithes/payments/${second.id}`)).status, 404);

  const stillKept = await api('DELETE', `/admin/tithes/tithers/${kofi.id}`);
  assert.equal(stillKept.status, 409);
  assert.equal(stillKept.body.message, 'This account has 1 payment recorded. Archive it instead so the records are kept.');

  // Restored, it is back on the list.
  await api('PUT', `/admin/tithes/tithers/${kofi.id}`, { ...KOFI, isActive: true });
  assert.deepEqual(numbers(await api('GET', '/admin/tithes/tithers')), ['HPC021']);

  // Nothing recorded: deleting is allowed, and it is really gone.
  const esi = await addTither({ number: 'HPC030', name: 'Esi Owusu' });
  assert.deepEqual(await api('DELETE', `/admin/tithes/tithers/${esi.id}`), { status: 200, body: { ok: true } });
  const missing = await api('GET', `/admin/tithes/tithers/${esi.id}`);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.message, 'That tither no longer exists.');
  assert.equal((await api('DELETE', `/admin/tithes/tithers/${esi.id}`)).status, 404);
  assert.equal(await prisma.tither.count(), 1);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

test('the summary adds up this month, this year and who has not paid', async () => {
  // Worked out the way the route works it out.
  const month = new Date().toISOString().slice(0, 7);
  const [year, m] = month.split('-').map(Number);
  const lastMonth = m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
  const lastMonthSameYear = lastMonth.startsWith(`${year}-`);

  const kofi = await addTither(KOFI);
  const ama  = await addTither({ number: 'HPC007', name: 'Ama Owusu', phone: '0201234567' });
  await addTither({ number: 'HPC022', type: 'COUPLE', name: 'Yaw Boateng', spouseName: 'Abena Boateng' });
  const old = await addTither({ number: 'HPC003', name: 'Old Member' });
  await api('PUT', `/admin/tithes/tithers/${old.id}`, { number: 'HPC003', name: 'Old Member', isActive: false });

  await seedPayment(kofi.id, 150, month);
  await seedPayment(kofi.id, 50,  month);        // twice this month: counts twice, one tither
  await seedPayment(ama.id,  200, month);
  await seedPayment(kofi.id, 100, lastMonth);
  await seedPayment(old.id,  75,  lastMonth);    // given before the account was archived

  const now = await api('GET', '/admin/tithes/summary');
  assert.equal(now.status, 200);
  assert.deepEqual(now.body, {
    month,
    monthTotal:    400,
    monthCount:    3,
    monthTithers:  2,
    yearTotal:     400 + (lastMonthSameYear ? 175 : 0),
    yearCount:     3   + (lastMonthSameYear ? 2   : 0),
    activeTithers: 3,
    unpaid:        1,     // Yaw & Abena: active, nothing this month; the archived account is not chased
    sms:           'hubtel',
  });

  const before = await api('GET', `/admin/tithes/summary?month=${lastMonth}`);
  assert.equal(before.body.month, lastMonth);
  assert.equal(before.body.monthTotal, 175);
  assert.equal(before.body.monthCount, 2);
  assert.equal(before.body.monthTithers, 2);
  assert.equal(before.body.unpaid, 2, 'Ama and Yaw & Abena gave nothing last month');
  assert.equal(before.body.activeTithers, 3);

  // A month that is not a month falls back to this one.
  assert.equal((await api('GET', '/admin/tithes/summary?month=soon')).body.month, month);
});

// ─── Archiving and searching ──────────────────────────────────────────────────

test('archive and restore change isActive alone; an edit that leaves isActive out keeps an archived account archived', async () => {
  const pair   = await addTither({ ...COUPLE, notes: 'Joint account' });
  const before = await prisma.tither.findUnique({ where: { id: pair.id } });
  const details = ({ isActive, updatedAt, ...rest }) => rest;
  const active  = (body) => api('PUT', `/admin/tithes/tithers/${pair.id}/active`, body);

  const archived = await active({ isActive: false });
  assert.equal(archived.status, 200, JSON.stringify(archived.body));
  assert.equal(archived.body.isActive, false);
  assert.deepEqual(Object.keys(archived.body).sort(), Object.keys(pair).sort(), 'the same shape as an edit answers with');
  let stored = await prisma.tither.findUnique({ where: { id: pair.id } });
  assert.equal(stored.isActive, false);
  assert.deepEqual(details(stored), details(before), 'nothing else changed');

  const restored = await active({ isActive: true });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.isActive, true);
  stored = await prisma.tither.findUnique({ where: { id: pair.id } });
  assert.deepEqual(details(stored), details(before));

  for (const body of [{}, { isActive: 'no' }, { isActive: null }, { isActive: 0 }]) {
    const bad = await active(body);
    assert.equal(bad.status, 400, JSON.stringify(body));
    assert.equal(bad.body.message, 'Say whether the account should be archived or restored.', JSON.stringify(body));
  }
  const missing = await api('PUT', `/admin/tithes/tithers/${randomUUID()}/active`, { isActive: false });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.message, 'That tither no longer exists.');

  // The edit form does not send isActive: saving it must not restore the account.
  await active({ isActive: false });
  const edited = await api('PUT', `/admin/tithes/tithers/${pair.id}`, { ...COUPLE, name: 'Kofi K. Mensah', notes: 'Joint account' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.name, 'Kofi K. Mensah');
  assert.equal(edited.body.isActive, false);
  assert.deepEqual(numbers(await api('GET', '/admin/tithes/tithers?status=archived')), ['HPC022']);
});

test('a phone search finds the account when the number is typed with +233 or as stored', async () => {
  await addTither(KOFI);                                                  // 024 412 3456
  await addTither({ number: 'HPC007', name: 'Ama Owusu', phone: '0201234567' });
  for (const q of ['+233 24 412 3456', '233244123456', '+233244123456', '024 412 3456', '244123456', '00233 24 412 3456', '+233 (0)24 412 3456']) {
    const res = await api('GET', `/admin/tithes/tithers?q=${encodeURIComponent(q)}`);
    assert.equal(res.status, 200);
    assert.deepEqual(numbers(res), ['HPC021'], q);
  }
});

// ─── Uploading: updating what is there ────────────────────────────────────────

test('an import that updates the register keeps notes, archived status and any phone the file leaves blank', async () => {
  const kofi = await addTither({ ...KOFI, notes: 'Pays by MoMo' });
  assert.equal((await api('PUT', `/admin/tithes/tithers/${kofi.id}/active`, { isActive: false })).status, 200);
  await addTither({ ...COUPLE, notes: 'Joint account' });

  const blank = { phone: '', spouseName: '', spousePhone: '' };
  const res = await api('POST', '/admin/tithes/tithers/import', { updateExisting: true, rows: [
    { ...blank, number: 'HPC021', name: 'Kofi K. Mensah', type: 'INDIVIDUAL' },                                      // phone left blank
    { ...blank, number: 'HPC022', name: 'Kofi Mensah', type: 'COUPLE', phone: '0551112222', spouseName: 'Ama K. Mensah' }, // a new phone; spouse phone blank
    { ...blank, number: 'HPC040', name: 'Esi Owusu', type: 'INDIVIDUAL', phone: '0271234567' },                     // new
  ] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { created: 1, updated: 2, skipped: [] });

  const after = (number) => prisma.tither.findUnique({ where: { number } });
  const k = await after('HPC021');
  assert.equal(k.name, 'Kofi K. Mensah');
  assert.equal(k.phone, '233244123456', 'a blank cell does not delete the stored phone');
  assert.equal(k.notes, 'Pays by MoMo', 'a file has no notes column, so notes are kept');
  assert.equal(k.isActive, false, 'an archived account stays archived');

  const p = await after('HPC022');
  assert.equal(p.phone, '233551112222', 'a phone the file does give replaces the stored one');
  assert.equal(p.spouseName, 'Ama K. Mensah');
  assert.equal(p.spousePhone, '233201234567', "the spouse's stored phone is kept too");
  assert.equal(p.notes, 'Joint account');
  assert.equal(p.isActive, true);

  const e = await after('HPC040');
  assert.equal(e.isActive, true, 'imported tithers are active');
  assert.equal(e.phone, '233271234567');
  assert.equal(e.notes, null);

  // An individual row over a couple makes it an individual and drops the
  // spouse — what the preview warns about.
  const single = await api('POST', '/admin/tithes/tithers/import', { updateExisting: true, rows: [{ ...blank, number: 'HPC022', name: 'Kofi Mensah', type: 'INDIVIDUAL' }] });
  assert.deepEqual(single.body, { created: 0, updated: 1, skipped: [] });
  const s = await after('HPC022');
  assert.equal(s.type, 'INDIVIDUAL');
  assert.equal(s.spouseName, null);
  assert.equal(s.spousePhone, null);
  assert.equal(s.phone, '233551112222');
  assert.equal(s.notes, 'Joint account');
});

test('the preview warns when a couple would become an individual, lists the columns it did not read, and shows an archived account as archived', async () => {
  const pair = await addTither(COUPLE);                                         // HPC022
  const esi  = await addTither({ number: 'HPC030', name: 'Esi Owusu' });
  await api('PUT', `/admin/tithes/tithers/${esi.id}/active`, { isActive: false });

  const csv = [
    'Tithe Number,Name,Phone,Type,Email,Date joined',
    'HPC022,Kofi Mensah,0244123456,Individual,kofi@example.com,2019',   // line 2: the couple, as an individual
    'HPC030,Esi Owusu,,,,',                                             // line 3: archived
    'HPC031,Yaw Boateng,0271234567,,,',                                 // line 4: new
  ].join('\r\n');
  const res = await upload(Buffer.from(csv, 'utf8'), 'tithers.csv');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.ignoredColumns, ['Email', 'Date joined']);
  assert.deepEqual(res.body.summary, { total: 3, new: 1, update: 2, error: 0 });

  const rows = Object.fromEntries(res.body.rows.map((r) => [r.line, r]));
  assert.deepEqual(rows[2].existing, { id: pair.id, name: 'Kofi Mensah & Ama Mensah', type: 'COUPLE', isActive: true });
  assert.deepEqual(rows[2].warnings, ['On the register as a couple (Kofi Mensah & Ama Mensah). Updating from this file makes it an individual account and removes the spouse.']);
  assert.deepEqual(rows[3].existing, { id: esi.id, name: 'Esi Owusu', type: 'INDIVIDUAL', isActive: false });
  assert.deepEqual(rows[4].warnings, []);

  // A list with no Type or Spouse column cannot say who is a couple: no
  // warning, and the rows go back marked to leave the type alone.
  const plain = await upload(Buffer.from('Tithe Number,Name,Phone\r\nHPC022,Kofi Mensah,0244123456\r\n', 'utf8'), 'plain.csv');
  assert.equal(plain.status, 200, JSON.stringify(plain.body));
  assert.deepEqual(plain.body.rows[0].warnings, []);
  assert.equal(plain.body.rows[0].keepType, true);

  // No header row, so no column names to leave out.
  const bare = await upload(Buffer.from('HPC031,Yaw Boateng,0271234567\r\n', 'utf8'), 'bare.csv');
  assert.equal(bare.status, 200);
  assert.equal(bare.body.hadHeader, false);
  assert.deepEqual(bare.body.ignoredColumns, []);
});

test('an upload finds the column names under a title, takes a second Phone column as the spouse\'s, and refuses names too long to save', async () => {
  const long = 'K'.repeat(121);
  const csv = [
    'HPC Global — Tithers 2026',
    'Printed 12/11/2026',
    '',
    'No.,Tithe No,Name,Phone,Spouse,Phone,Type',                            // line 4: a serial column left of the tithe number
    '1,HPC/021,Kofi Mensah,0244123456,Ama Mensah,0201234567,Mr & Mrs',
    `2,HPC022,${long},0551112222,,,`,
    `3,HPC023,Yaw Boateng,0271234567,${long},0261234567,Couple`,
    '4,HPC024,Esi Owusu,0541234567,,0501234567,Individual',
  ].join('\r\n');
  const res = await upload(Buffer.from(csv, 'utf8'), 'register.csv');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.hadHeader, true);
  assert.deepEqual(res.body.ignoredColumns, ['No.']);
  assert.deepEqual(res.body.summary, { total: 4, new: 2, update: 0, error: 2 });

  const rows = Object.fromEntries(res.body.rows.map((r) => [r.line, r]));
  assert.deepEqual(Object.keys(rows).map(Number), [5, 6, 7, 8]);
  assert.deepEqual(rows[5], {
    line: 5, number: 'HPC021', name: 'Kofi Mensah', type: 'COUPLE', phone: '233244123456', spouseName: 'Ama Mensah', spousePhone: '233201234567',
    keepType: false, problems: [], warnings: [], status: 'new', existing: null,
  });
  assert.equal(rows[6].status, 'error');
  assert.deepEqual(rows[6].problems, ['The name is longer than 120 characters.']);
  assert.equal(rows[7].status, 'error');
  assert.deepEqual(rows[7].problems, ['The spouse name is longer than 120 characters.']);
  assert.equal(rows[8].status, 'new');
  assert.equal(rows[8].spousePhone, '');
  assert.deepEqual(rows[8].problems, []);
  assert.deepEqual(rows[8].warnings, ['The spouse phone is ignored because the type is Individual — put "Couple" in the type column to keep it.']);
});

// ─── Payments: dates, settings and the export ─────────────────────────────────

test("a payment dated tomorrow (UTC) is accepted — the office may be a timezone ahead — but not the day after", async () => {
  const kofi = await addTither(KOFI);
  const utcDay = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const today = await record(kofi.id, { paidOn: utcDay(0), sendSms: false });
  assert.equal(today.status, 201, JSON.stringify(today.body));
  const tomorrow = await record(kofi.id, { paidOn: utcDay(1), sendSms: false });
  assert.equal(tomorrow.status, 201, JSON.stringify(tomorrow.body));
  assert.equal(tomorrow.body.payment.paidOn, utcDay(1));

  const later = await record(kofi.id, { paidOn: utcDay(2), sendSms: false });
  assert.equal(later.status, 400);
  assert.equal(later.body.message, 'That date is in the future');
  assert.equal(await prisma.tithePayment.count(), 2);
});

test('saving the wording alone keeps the automatic-sending choice, a 600-character template is accepted, and sendSms left out follows the setting', async () => {
  const template = 'Thank you, {firstName}.';

  // A first save with smsEnabled left out takes the default: on.
  const first = await api('PUT', '/admin/tithes/settings', { smsTemplate: template });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.smsEnabled, true);

  assert.equal((await api('PUT', '/admin/tithes/settings', { smsTemplate: template, smsEnabled: false })).body.smsEnabled, false);
  const reworded = await api('PUT', '/admin/tithes/settings', { smsTemplate: 'Thanks, {name}.' });
  assert.equal(reworded.status, 200);
  assert.equal(reworded.body.smsTemplate, 'Thanks, {name}.');
  assert.equal(reworded.body.smsEnabled, false, 'saving the wording must not switch sending back on');
  assert.equal((await api('GET', '/admin/tithes/settings')).body.smsEnabled, false);

  const kofi  = await addTither(KOFI);
  const quiet = await record(kofi.id);
  assert.equal(quiet.status, 201);
  assert.equal(quiet.body.sms.status, 'SKIPPED');
  assert.equal(quiet.body.sms.error, 'Automatic acknowledgements are switched off under SMS Template.');
  assert.equal(hubtel.requests.length, 0);

  const longest = 'x'.repeat(600);
  const saved = await api('PUT', '/admin/tithes/settings', { smsTemplate: longest, smsEnabled: true });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.smsTemplate, longest);

  const loud = await record(kofi.id, { month: '2026-10', paidOn: '2026-10-05' });
  assert.equal(loud.body.sms.status, 'SENT');
  assert.equal(hubtel.requests.length, 1);
  assert.equal(hubtel.requests[0].body.Content, longest);
});

test('the CSV export cannot carry a formula into a spreadsheet, and quotes commas and line breaks', async () => {
  const sly  = await addTither({ number: 'HPC031', name: '=HYPERLINK("http://x","Click")' });
  const pair = await addTither({ number: 'HPC032', type: 'COUPLE', name: 'Mensah, Kofi', spouseName: 'Mensah, Ama' });

  await record(sly.id,  { sendSms: false, paidOn: '2026-11-11', note: '+233 paid by MoMo' });
  await record(pair.id, { sendSms: false, paidOn: '2026-11-10', note: 'Cash, Sunday\nsecond service' });
  await record(sly.id,  { sendSms: false, paidOn: '2026-11-09', note: '@SUM(A1)' });
  await record(sly.id,  { sendSms: false, paidOn: '2026-11-08', note: '-1+2' });
  await record(sly.id,  { sendSms: false, paidOn: '2026-11-07', note: '=1+1' });

  const csv = await download('/admin/tithes/payments/export?month=2026-11');
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes(`"'=HYPERLINK(""http://x"",""Click"")"`), csv.text);

  // Read back the way a spreadsheet would.
  const rows = parseCsv(Buffer.from(csv.text, 'utf8'));
  assert.equal(rows.length, 6);
  for (const row of rows) assert.equal(row.length, 10, JSON.stringify(row));
  const formula = '\'=HYPERLINK("http://x","Click")';
  assert.deepEqual(rows.slice(1).map((r) => [r[3], r[7]]), [
    [formula,                      "'+233 paid by MoMo"],
    ['Mensah, Kofi & Mensah, Ama', 'Cash, Sunday\nsecond service'],
    [formula,                      "'@SUM(A1)"],
    [formula,                      "'-1+2"],
    [formula,                      "'=1+1"],
  ]);
});

test('an export of more than 50,000 payments is refused with the count and what to do instead', async () => {
  const kofi = await addTither(KOFI);
  const paidOn = new Date('2026-11-01T00:00:00Z');
  await prisma.tithePayment.createMany({
    data: Array.from({ length: 50_001 }, (_, i) => ({ titherId: kofi.id, amount: 1, month: i === 0 ? '2026-10' : '2026-11', paidOn })),
  });

  const all = await api('GET', '/admin/tithes/payments/export');
  assert.equal(all.status, 400);
  assert.equal(all.body.message, 'There are 50001 payments to export. Choose a month or a date range and export that instead.');

  // A month on its own is well under the cap.
  const october = await download('/admin/tithes/payments/export?month=2026-10');
  assert.equal(october.status, 200);
  assert.equal(october.text.split('\n').length, 2);
});

// ─── The acknowledgement SMS: resends and odd cases ───────────────────────────

test("resending after one of a couple's phones missed out texts only that phone, and the payment ends SENT to both", async () => {
  const pair = await addTither(COUPLE);
  hubtel.rejectTo = '233201234567';
  const half = await record(pair.id);
  assert.equal(half.body.payment.smsStatus, 'FAILED');
  assert.deepEqual(half.body.payment.smsTo, ['024 412 3456']);
  const id = half.body.payment.id;

  hubtel.rejectTo = null;
  hubtel.requests = [];
  const res = await api('POST', `/admin/tithes/payments/${id}/sms`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(hubtel.requests.map((r) => r.body.To), ['233201234567'], 'Kofi already has it and is not texted twice');
  assert.equal(res.body.sms.status, 'SENT');
  assert.equal(res.body.sms.error, null);
  assert.deepEqual(res.body.sms.to, ['024 412 3456', '020 123 4567']);
  assert.equal(res.body.payment.smsStatus, 'SENT');
  assert.equal(res.body.payment.smsError, null);
  assert.ok(res.body.payment.smsSentAt);
  assert.deepEqual(res.body.payment.smsTo, ['024 412 3456', '020 123 4567']);
  assert.equal((await prisma.tithePayment.findUnique({ where: { id } })).smsTo, '233244123456,233201234567');

  // Sent to both: pressing Send again goes to everyone, as asked.
  hubtel.requests = [];
  const again = await api('POST', `/admin/tithes/payments/${id}/sms`);
  assert.equal(again.body.sms.status, 'SENT');
  assert.deepEqual(hubtel.requests.map((r) => r.body.To).sort(), ['233201234567', '233244123456']);
});

test('a resend that cannot go (the phone has since been removed) keeps the record of the text that did go', async () => {
  const kofi = await addTither(KOFI);
  const sent = (await record(kofi.id)).body.payment;
  const before = await prisma.tithePayment.findUnique({ where: { id: sent.id } });
  assert.equal(before.smsStatus, 'SENT');

  const noPhone = await api('PUT', `/admin/tithes/tithers/${kofi.id}`, { ...KOFI, phone: '' });
  assert.equal(noPhone.body.phone, null);
  const res = await api('POST', `/admin/tithes/payments/${sent.id}/sms`);
  assert.equal(res.status, 200);
  assert.equal(res.body.sms.status, 'SKIPPED');
  assert.equal(res.body.sms.error, 'No phone number on the account.');
  assert.equal(res.body.payment.smsStatus, 'SENT');
  assert.deepEqual(res.body.payment.smsTo, ['024 412 3456']);
  assert.deepEqual(await prisma.tithePayment.findUnique({ where: { id: sent.id } }), before, 'the stored record is untouched');
  assert.equal(hubtel.requests.length, 1, 'only the original text');

  // The same for a partly failed send: who was reached stays on the record.
  const pair = await addTither(COUPLE);
  hubtel.rejectTo = '233201234567';
  const half = (await record(pair.id)).body.payment;
  hubtel.rejectTo = null;
  await api('PUT', `/admin/tithes/tithers/${pair.id}`, { ...COUPLE, phone: '', spousePhone: '' });
  const halfBefore = await prisma.tithePayment.findUnique({ where: { id: half.id } });
  const skipped = await api('POST', `/admin/tithes/payments/${half.id}/sms`);
  assert.equal(skipped.body.sms.status, 'SKIPPED');
  assert.equal(skipped.body.payment.smsStatus, 'FAILED');
  assert.deepEqual(skipped.body.payment.smsTo, ['024 412 3456']);
  assert.deepEqual(await prisma.tithePayment.findUnique({ where: { id: half.id } }), halfBefore);
});

test("a couple's failure names the account holder first even when the spouse's reply comes back first", async () => {
  const pair = await addTither(COUPLE);
  hubtel.mode  = 'down';
  hubtel.delay = { '233244123456': 200 };
  const both = await record(pair.id);
  assert.deepEqual(hubtel.answered, ['233201234567', '233244123456'], "the spouse's reply really did come first");
  assert.equal(both.body.sms.status, 'FAILED');
  assert.deepEqual(both.body.sms.to, []);
  assert.match(both.body.sms.error, /^024 412 3456: Hubtel send: .* \| 020 123 4567: Hubtel send: /);

  // Only the account holder refused, and answered last: `to` and the error still line up.
  hubtel.mode     = 'accept';
  hubtel.rejectTo = '233244123456';
  hubtel.answered = [];
  const half = await record(pair.id, { month: '2026-10', paidOn: '2026-10-05' });
  assert.deepEqual(hubtel.answered, ['233201234567', '233244123456']);
  assert.equal(half.body.sms.status, 'FAILED');
  assert.deepEqual(half.body.sms.to, ['020 123 4567']);
  assert.equal(half.body.sms.error, '024 412 3456: Hubtel rejected the message: status 101 — Payment required on account');
});

test('the church name from Settings fills {church} in the SMS', async () => {
  await prisma.siteSettings.upsert({
    where:  { id: 'singleton' },
    update: { churchName: 'Harvest Praise Chapel' },
    create: { id: 'singleton', churchName: 'Harvest Praise Chapel' },
  });
  try {
    assert.equal((await api('PUT', '/admin/tithes/settings', { smsTemplate: '{church}: thank you, {firstName}.' })).status, 200);
    assert.equal((await api('GET', '/admin/tithes/settings')).body.church, 'Harvest Praise Chapel');
    const kofi = await addTither(KOFI);
    const res = await record(kofi.id);
    assert.equal(res.body.sms.text, 'Harvest Praise Chapel: thank you, Kofi.');
    assert.equal(hubtel.requests[0].body.Content, 'Harvest Praise Chapel: thank you, Kofi.');

    // And on a resend.
    hubtel.requests = [];
    await api('POST', `/admin/tithes/payments/${res.body.payment.id}/sms`);
    assert.equal(hubtel.requests[0].body.Content, 'Harvest Praise Chapel: thank you, Kofi.');
  } finally {
    await prisma.siteSettings.deleteMany();   // the other tests expect the default name
  }
});

test('with Hubtel not set up the payment is recorded and its SMS is SKIPPED with that reason', async () => {
  const saved = { id: process.env.HUBTEL_SMS_CLIENT_ID, secret: process.env.HUBTEL_SMS_CLIENT_SECRET };
  delete process.env.HUBTEL_SMS_CLIENT_ID;
  delete process.env.HUBTEL_SMS_CLIENT_SECRET;
  try {
    const kofi = await addTither(KOFI);
    const res  = await record(kofi.id);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const reason = 'SMS is not set up — the Hubtel credentials are missing in Vercel.';
    assert.equal(res.body.sms.status, 'SKIPPED');
    assert.equal(res.body.sms.error, reason);
    assert.equal(res.body.payment.smsStatus, 'SKIPPED');
    assert.equal(res.body.payment.smsError, reason);
    assert.equal(res.body.payment.smsSentAt, null);
    assert.deepEqual(res.body.sms.to, [], 'nobody has the text');
    assert.deepEqual(res.body.payment.smsTo, []);
    assert.equal(hubtel.requests.length, 0);
    assert.equal(await prisma.deliveryFailure.count(), 0, 'not set up is not a delivery problem');
    assert.equal((await api('GET', '/admin/tithes/summary')).body.sms, 'none');
  } finally {
    process.env.HUBTEL_SMS_CLIENT_ID     = saved.id;
    process.env.HUBTEL_SMS_CLIENT_SECRET = saved.secret;
  }
});

test('a payment whose SMS outcome cannot be saved still answers 201, so the office does not record it again', async () => {
  const kofi = await addTither(KOFI);
  const update = prisma.tithePayment.update;
  prisma.tithePayment.update = () => Promise.reject(new Error('connection lost while saving the SMS outcome'));
  let res;
  try {
    res = await record(kofi.id);
  } finally {
    prisma.tithePayment.update = update;
  }
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body.sms.status, 'SENT', 'the real result of the send');
  assert.deepEqual(res.body.sms.to, ['024 412 3456']);
  assert.equal(res.body.payment.smsStatus, null, 'the payment as it stood before the send');
  assert.equal(hubtel.requests.length, 1);
  assert.equal(await prisma.tithePayment.count(), 1);
});

// ─── lib/tithe ────────────────────────────────────────────────────────────────

// Shared with the client copy in client/src/utils/tithe.js, which must agree.
const NUMBER_CASES = [
  ['HPC-021', 'HPC021'], ['hpc21', 'HPC021'], ['hpc 21', 'HPC021'], ['HPC021', 'HPC021'],
  // HPC numbers are three digits: a zero too many is the same number.
  ['hpc_0021', 'HPC021'], ['HPC0021', 'HPC021'],
  ['T-00123', 'T00123'], ['hpc1000', 'HPC1000'],
  // Not prefix-plus-digits: accepted as typed within reason (an older scheme),
  // as long as there is a digit in it somewhere.
  ['AB12CD', 'AB12CD'],
  // Digits alone are an HPC number with the prefix left off, so a list
  // numbered 1 … 150 lands on HPC001 … HPC150 rather than beside them.
  ['21', 'HPC021'], ['1', 'HPC001'], ['150', 'HPC150'], ['21.0', 'HPC021'], ['1234567', ''],
  ['', ''], ['   ', ''], ['???', ''], ['A', ''], ['HPC', ''], ['HPC 21/2', ''], [null, ''], [undefined, ''],
  // One slash between the letters and the digits is a separator.
  ['HPC/021', 'HPC021'], ['hpc / 21', 'HPC021'], ['HPC//21', ''],
  // Invisible characters copied along with the number.
  ['​HPC​021﻿', 'HPC021'], ['HPC­021', 'HPC021'],
  // Nine digits in a row is a phone number in the wrong column.
  ['0244123456', ''], ['HPC0244123456', ''], ['HPC12345678', 'HPC12345678'],
];

test('lib/tithe: numbers, phones, names, the template and its labels', () => {
  const { normalizeTitheNumber, nextTitheNumber, formatPhone, canonicalPhone, renderTemplate, templateProblem, monthLabel, dateLabel, amountLabel, templateValues, displayName, displayFirstName, smsRecipients, parseType } = tithe;

  for (const [typed, stored] of NUMBER_CASES) {
    assert.equal(normalizeTitheNumber(typed), stored, JSON.stringify(typed));
  }

  assert.equal(nextTitheNumber([]), 'HPC001');
  assert.equal(nextTitheNumber(['HPC007', 'HPC021', 'T00123', 'HPCX005']), 'HPC022');
  assert.equal(nextTitheNumber(['HPC999']), 'HPC1000');
  // Seven digits or more is a slip, not a number the office counted up to.
  assert.equal(nextTitheNumber(['HPC021', 'HPC0244123', 'HPC12345678']), 'HPC022');

  assert.equal(formatPhone('233244123456'), '024 412 3456');
  assert.equal(formatPhone('447911123456'), '+447911123456');
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone(null), '');
  for (const typed of ['024 412 3456', '0244123456', '+233 24 412 3456', '233244123456', '244123456', '00233244123456', '024-412-3456']) {
    assert.equal(canonicalPhone(typed), '233244123456', typed);
  }
  assert.equal(canonicalPhone('2.44E+08'), '');
  assert.equal(canonicalPhone('12345'), '');

  // The same Ghanaian number as it turns up in real lists.
  for (const typed of [
    '+233 (0)24 412 3456', '233 0244123456', '+2330244123456', '244123456.0', '(024) 412-3456',
    '024‎412​3456‬', '﻿0244123456', '024­412⁠3456',
  ]) {
    assert.equal(canonicalPhone(typed), '233244123456', JSON.stringify(typed));
  }
  // Another country's number is kept as given, without the 0 dialled at home.
  assert.equal(canonicalPhone('+447911123456'), '447911123456');
  assert.equal(canonicalPhone('+44 (0)7911 123456'), '447911123456');
  assert.equal(canonicalPhone('0044 7911 123456'), '447911123456');
  // A digit missing or one too many, a stray prefix, or two numbers in one cell.
  for (const typed of ['1234567', '02441234567', '024412345', '2330244123', '+23324412345', '+0244123456', '024 412 3456 / 020 123 4567', '+233', '00']) {
    assert.equal(canonicalPhone(typed), '', JSON.stringify(typed));
  }

  const couple = { number: 'HPC022', type: 'COUPLE', name: 'Kofi Mensah', phone: '233244123456', spouseName: 'Ama Mensah', spousePhone: '233201234567' };
  assert.equal(displayName(couple), 'Kofi Mensah & Ama Mensah');
  assert.equal(displayName({ ...couple, type: 'INDIVIDUAL' }), 'Kofi Mensah', 'a spouse name left behind is not shown for an individual');
  assert.equal(displayFirstName(couple), 'Kofi & Ama');
  assert.deepEqual(smsRecipients(couple), ['233244123456', '233201234567']);
  assert.deepEqual(smsRecipients({ ...couple, spousePhone: '0244123456' }), ['233244123456'], 'one phone between them is texted once');
  assert.deepEqual(smsRecipients({ ...couple, type: 'INDIVIDUAL' }), ['233244123456']);
  assert.deepEqual(smsRecipients({ ...couple, phone: null, spousePhone: null }), []);

  assert.equal(renderTemplate('Dear {name}, {unknown} {amount}', { name: 'Kofi', amount: 'GHS 5.00' }), 'Dear Kofi, {unknown} GHS 5.00');
  assert.equal(renderTemplate('Dear { name }!', { name: 'Kofi' }), 'Dear Kofi!');
  assert.equal(renderTemplate('{name}', { name: null }), '');
  assert.equal(renderTemplate(null, {}), '');

  assert.equal(templateProblem(''), 'The message cannot be empty.');
  assert.equal(templateProblem('  \n '), 'The message cannot be empty.');
  assert.equal(templateProblem('x'.repeat(601)), 'Keep the message under 600 characters — it is sent as an SMS.');
  assert.equal(templateProblem('Dear {nmae}'), '{nmae} is not a placeholder. Use one of: {name}, {firstName}, {number}, {amount}, {month}, {date}, {church}.');
  assert.equal(templateProblem('Dear { name }, {firstName} {number} {amount} {month} {date} {church}'), null);
  assert.equal(templateProblem(tithe.DEFAULT_SMS_TEMPLATE), null);

  assert.equal(monthLabel('2026-11'), 'November 2026');
  assert.equal(monthLabel('2026-01'), 'January 2026');
  assert.equal(monthLabel('soon'), 'soon');
  assert.equal(dateLabel(new Date('2026-11-11T00:00:00Z')), '11 Nov 2026');
  assert.equal(dateLabel('2026-11-11'), '11 Nov 2026');
  assert.equal(dateLabel('2026-10-05'), '5 Oct 2026');
  assert.equal(dateLabel('whenever'), 'whenever');
  assert.equal(amountLabel(150), 'GHS 150.00');
  assert.equal(amountLabel(1500.5), 'GHS 1,500.50');
  assert.equal(amountLabel(undefined), 'GHS 0.00');

  assert.deepEqual(templateValues(couple, { amount: 150, currency: 'GHS', month: '2026-11', paidOn: new Date('2026-11-11T00:00:00Z') }, { church: 'Harvest Praise' }), {
    name: 'Kofi Mensah & Ama Mensah', firstName: 'Kofi & Ama', number: 'HPC022', amount: 'GHS 150.00', month: 'November 2026', date: '11 Nov 2026', church: 'Harvest Praise',
  });

  for (const [typed, type] of [['', 'INDIVIDUAL'], ['couple', 'COUPLE'], ['Couple', 'COUPLE'], ['C', 'COUPLE'], ['Mr & Mrs', 'COUPLE'], ['joint', 'COUPLE'], ['Individual', 'INDIVIDUAL'], ['single', 'INDIVIDUAL'], ['family', 'COUPLE'], ['group', null]]) {
    assert.equal(parseType(typed, ''), type, typed);
  }
  assert.equal(parseType('', 'Ama Mensah'), 'COUPLE', 'a spouse name with no type means a couple');

  for (const [typed, type] of [
    ['Mr. & Mrs.', 'COUPLE'], ['Mr and Mrs', 'COUPLE'], ['Mr/Mrs', 'COUPLE'], ['Couple.', 'COUPLE'], ['Married couple', 'COUPLE'], ['Married', 'COUPLE'], ['MR + MRS', 'COUPLE'],
    ['Indiv', 'INDIVIDUAL'], ['Individual.', 'INDIVIDUAL'], ['Single person', 'INDIVIDUAL'], [' INDIVIDUAL ', 'INDIVIDUAL'],
    ['Group', null], ['1', null], ['yes', null], ['n/a', null],
  ]) {
    assert.equal(parseType(typed, ''), type, typed);
  }
  // Punctuation alone is as good as blank.
  assert.equal(parseType('-', ''), 'INDIVIDUAL');
  assert.equal(parseType('-', 'Ama Mensah'), 'COUPLE');
});

test('lib/tithe: the client copy of normalizeTitheNumber agrees with the server on every case', async () => {
  const client = await import(pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'tithe.js')).href);
  for (const [typed, stored] of NUMBER_CASES) {
    assert.equal(client.normalizeTitheNumber(typed), stored, `client: ${JSON.stringify(typed)}`);
    assert.equal(client.normalizeTitheNumber(typed), tithe.normalizeTitheNumber(typed), JSON.stringify(typed));
  }
  // And it shows a stored phone the same way.
  for (const stored of ['233244123456', '447911123456', '']) {
    assert.equal(client.formatPhone(stored), tithe.formatPhone(stored), stored);
  }
});

test('lib/tithe: header spellings, a title above the headers, and the columns left unread', () => {
  const { matchHeaders, readTitherRows } = tithe;

  // A serial-number column left of the real one does not take its place, and
  // the second Phone column is the spouse's.
  assert.deepEqual(matchHeaders(['No.', 'Tithe No', 'Name', 'Phone', 'Spouse', 'Phone']), { number: 1, name: 2, phone: 3, spouseName: 4, spousePhone: 5 });
  assert.deepEqual(matchHeaders(['S/N', '#', 'Full Name', 'Mobile No.', 'Spouse Mobile']), { number: 1, name: 2, phone: 3, spousePhone: 4 });
  assert.deepEqual(matchHeaders(['ID', 'Tithe #', 'Name of Tither', 'Telephone', 'Wife', "Wife's Phone"]), { number: 1, name: 2, phone: 3, spouseName: 4, spousePhone: 5 });
  // "Partner" is not a spouse: the church's partners' programme uses the word.
  assert.deepEqual(matchHeaders(['Number', 'Tithe Card No', 'Tither', 'WhatsApp', 'Partner', 'Spouse Contact', 'Type']), { number: 1, name: 2, phone: 3, spousePhone: 5, type: 6 });
  // Without a spouse column a second phone is the same person's other number.
  assert.deepEqual(matchHeaders(['Member ID', 'Full Name', 'Mobile Number', 'Phone 1']), { number: 0, name: 1, phone: 2 });
  assert.deepEqual(matchHeaders(['Tithe No', 'Name', 'Phone', 'WhatsApp']), { number: 0, name: 1, phone: 2 });
  // "Second Name" is a surname, not a spouse; "Tithe" alone may head the amounts.
  assert.deepEqual(matchHeaders(['Tithe No', 'Name', 'Second Name', 'Phone']), { number: 0, name: 1, phone: 3 });
  assert.deepEqual(matchHeaders(['No', 'Name', 'Phone', 'Tithe']), { number: 0, name: 1, phone: 2 });
  assert.deepEqual(matchHeaders(['Tithe', 'Name', 'Phone']), { number: 0, name: 1, phone: 2 });
  assert.deepEqual(matchHeaders(['Envelope No', "Husband's Name", 'Name', 'Category', 'Phone 2', 'Contact']), { number: 0, spouseName: 1, name: 2, type: 3, spousePhone: 4, phone: 5 });
  // Copied with an invisible character in front.
  assert.deepEqual(matchHeaders(['﻿Tithe No', 'Name​', 'Phone']), { number: 0, name: 1, phone: 2 });

  // A title, a blank line and a printed date above the column names.
  const titled = readTitherRows([
    ['HPC Global — Tithers 2026'],
    [],
    ['Printed 12/11/2026', ''],
    ['S/N', 'Tithe No', 'Name', 'Phone', 'Spouse', 'Phone', 'Email'],
    ['1', 'HPC/021', 'Kofi Mensah', '0244123456', '', '0201234567', ''],
  ]);
  assert.equal(titled.hadHeader, true);
  assert.equal(titled.headerLine, 4);
  assert.deepEqual(titled.ignored, ['S/N', 'Email']);
  assert.equal(titled.rows.length, 1);
  assert.deepEqual(titled.rows[0], {
    line: 5, number: 'HPC021', name: 'Kofi Mensah', type: 'INDIVIDUAL', phone: '233244123456', spouseName: '', spousePhone: '',
    keepType: false, problems: [], warnings: ['The spouse phone is ignored because the type is Individual — put "Couple" in the type column to keep it.'],
  });

  // A tither's row above a later header row stops the search, so it is not skipped.
  const early = readTitherRows([['HPC001', 'Kofi Mensah', '0244123456'], ['Tithe No', 'Name', 'Phone'], ['HPC002', 'Ama Owusu', '0201234567']]);
  assert.equal(early.hadHeader, false);
  assert.equal(early.headerLine, 0);
  assert.deepEqual(early.ignored, []);
  assert.deepEqual(early.rows.map((r) => [r.line, r.number]), [[1, 'HPC001'], [2, 'Tithe No'], [3, 'HPC002']]);

  // The header is looked for in the first ten rows with something in them.
  const notes = (n) => Array.from({ length: n }, (_, i) => [`Note ${i + 1}`]);
  const tenth = readTitherRows([...notes(9), ['Tithe No', 'Name', 'Phone'], ['HPC001', 'Kofi', '0244123456']]);
  assert.equal(tenth.hadHeader, true);
  assert.equal(tenth.headerLine, 10);
  const eleventh = readTitherRows([...notes(10), ['Tithe No', 'Name', 'Phone'], ['HPC001', 'Kofi', '0244123456']]);
  assert.equal(eleventh.hadHeader, false);

  // An Individual with a spouse name and phone: one warning for both, and a
  // bad spouse phone is no problem because it is dropped anyway.
  const individual = readTitherRows([
    ['HPC010', 'Kofi Mensah', '0244123456', 'Individual', 'Ama Mensah', '0201234567'],
    ['HPC011', 'Yaw Boateng', '0271234567', 'Individual', '', '12'],
    ['HPC012', 'Esi Owusu', '0261234567', 'Individual', 'X'.repeat(121), ''],
    ['HPC013', 'Akua Asante', '0541234567', '', '', '0244123456'],
  ]);
  assert.deepEqual(individual.rows.map((r) => [r.problems, r.warnings, r.spouseName, r.spousePhone]), [
    [[], ['The spouse name and phone are ignored because the type is Individual — put "Couple" in the type column to keep them.'], '', ''],
    [[], ['The spouse phone is ignored because the type is Individual — put "Couple" in the type column to keep it.'], '', ''],
    [[], ['The spouse name is ignored because the type is Individual — put "Couple" in the type column to keep it.'], '', ''],
    // Kofi's number as an ignored spouse phone is not "also on row 1".
    [[], ['The spouse phone is ignored because the type is Individual — put "Couple" in the type column to keep it.'], '', ''],
  ]);

  // Names too long to save are a problem here, not a refusal on import.
  const long = readTitherRows([
    ['HPC020', 'K'.repeat(121), '0244123456'],
    ['HPC021', 'K'.repeat(120), '0201234567'],
    ['HPC022', 'Yaw Boateng', '0271234567', 'Couple', 'A'.repeat(121)],
  ]);
  assert.deepEqual(long.rows.map((r) => r.problems), [
    ['The name is longer than 120 characters.'],
    [],
    ['The spouse name is longer than 120 characters.'],
  ]);

  // A couple reached only through the spouse's phone can still be texted.
  const spouseOnly = readTitherRows([['HPC030', 'Yaw Boateng', '', 'Couple', 'Abena Boateng', '0551234567']]);
  assert.deepEqual(spouseOnly.rows[0].warnings, []);

  // Rows of spaces or invisible characters are blank.
  assert.deepEqual(readTitherRows([[' ', '​'], ['HPC001', 'Kofi', '0244123456']]).rows.map((r) => r.line), [2]);
});

test('lib/tithe: an uploaded list is read with or without a header row, whatever the headers are called', () => {
  // No header row: columns are taken in the template's order, blank lines skipped.
  const bare = tithe.readTitherRows([
    ['HPC001', 'Kofi Mensah', '0244123456'],
    ['', '', ''],
    ['hpc 2', 'Yaw Boateng', '0201234567', 'Couple', 'Abena Boateng', '0551234567'],
    ['HPC003', 'Esi Owusu', '', '', 'Kwame Owusu'],
    ['HPC004', 'Akua Asante', '0551112222', 'Individual', 'Someone Else'],
  ]);
  assert.equal(bare.hadHeader, false);
  assert.deepEqual(bare.columns, { number: 0, name: 1, phone: 2, type: 3, spouseName: 4, spousePhone: 5 });
  assert.deepEqual(bare.rows.map((r) => [r.line, r.number, r.name, r.type, r.phone, r.spouseName, r.spousePhone]), [
    [1, 'HPC001', 'Kofi Mensah', 'INDIVIDUAL', '233244123456', '', ''],
    [3, 'HPC002', 'Yaw Boateng', 'COUPLE',     '233201234567', 'Abena Boateng', '233551234567'],
    [4, 'HPC003', 'Esi Owusu',   'COUPLE',     '',             'Kwame Owusu', ''],
    [5, 'HPC004', 'Akua Asante', 'INDIVIDUAL', '233551112222', '', ''],
  ]);
  assert.deepEqual(bare.rows.map((r) => r.problems), [[], [], [], []]);
  assert.deepEqual(bare.rows[2].warnings, ['No phone number, so no SMS can be sent.']);
  assert.deepEqual(bare.rows[3].warnings, ['The spouse name is ignored because the type is Individual — put "Couple" in the type column to keep it.']);

  // Headers as people actually write them, in any order, with a column we do not use.
  const headed = tithe.readTitherRows([
    ['', '', ''],
    ['Account Type', 'Tithe No.', 'PHONE NUMBER', 'Name', 'Email', "Spouse's Name", "Spouse's Phone"],
    ['Couple', 'hpc-7', '0201234567', 'Yaw Boateng', 'yaw@example.com', 'Abena Boateng', '0551234567'],
    ['', 'HPC008', '244123456', 'Kofi Mensah', '', '', ''],
    ['Group', 'HPC009', '', 'Esi Owusu', '', '', ''],
  ]);
  assert.equal(headed.hadHeader, true);
  assert.deepEqual(headed.columns, { type: 0, number: 1, phone: 2, name: 3, spouseName: 5, spousePhone: 6 });
  assert.deepEqual(headed.rows.map((r) => [r.line, r.number, r.name, r.type, r.phone, r.spouseName, r.spousePhone, r.problems]), [
    [3, 'HPC007', 'Yaw Boateng', 'COUPLE',     '233201234567', 'Abena Boateng', '233551234567', []],
    [4, 'HPC008', 'Kofi Mensah', 'INDIVIDUAL', '233244123456', '', '', []],
    [5, 'HPC009', 'Esi Owusu',   '',           '',             '', '', ['Type should be "Individual" or "Couple", not "Group".']],
  ]);

  // Other spellings that must be recognised as a header row.
  for (const header of [
    ['Tithe Number', 'Name', 'Phone'],
    ['tithe_number', 'Full Name', 'Mobile'],
    ['No', 'Member', 'Contact'],
    ['Member No.', 'Names', 'Tel'],
    ['ID', 'Tither', 'MoMo Number'],
  ]) {
    assert.ok(tithe.matchHeaders(header), header.join(' | '));
  }
  // A row of data is not mistaken for one.
  assert.equal(tithe.matchHeaders(['HPC001', 'Kofi Mensah', '0244123456']), null);

  // The same phone on two rows is pointed out; a couple sharing one phone is not.
  const reused = tithe.readTitherRows([
    ['HPC010', 'Kofi Mensah', '0244123456'],
    ['HPC011', 'Yaw Boateng', '0201234567', 'Couple', 'Abena Boateng', '0201234567'],
    ['HPC012', 'Esi Owusu',   '024 412 3456'],
  ]);
  assert.deepEqual(reused.rows.map((r) => r.warnings), [[], [], ['024 412 3456 is also on row 1.']]);

  // A phone Excel mangled is a problem; it is not also "no phone".
  const mangled = tithe.readTitherRows([['HPC013', 'Ama Darko', '2.44E+08']]);
  assert.equal(mangled.rows[0].problems.length, 1);
  assert.deepEqual(mangled.rows[0].warnings, []);

  // headerLine and ignored are always there, so the preview can show them.
  assert.deepEqual(tithe.readTitherRows([]), { columns: {}, hadHeader: false, headerLine: 0, ignored: [], rows: [] });
  assert.deepEqual(tithe.readTitherRows([['', ''], ['']]).rows, []);
});

// ─── lib/spreadsheet ──────────────────────────────────────────────────────────

/** A zip of stored (uncompressed) members: enough to stand in for an .xlsx. */
function zipStored(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data    = Buffer.from(text, 'utf8');
    const crc     = zlib.crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);               // version needed
    local.writeUInt16LE(0, 8);                // method: stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);             // method: stored
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const count = Object.keys(files).length;
  const eocd  = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centrals.reduce((n, b) => n + b.length, 0), 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

test('lib/spreadsheet: CSV dialects, refused files, and workbooks with inline or shared strings', () => {
  // Semicolons, CRLF, quoted fields with the delimiter, a doubled quote and a newline inside.
  assert.deepEqual(parseCsv(Buffer.from('No;Name;Note\r\nHPC001;"Mensah; Kofi";"says ""hi""\r\nand more"\r\n')), [
    ['No', 'Name', 'Note'],
    ['HPC001', 'Mensah; Kofi', 'says "hi"\r\nand more'],
  ]);
  assert.deepEqual(parseCsv(Buffer.from('a\tb\n1\t2\n')), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv(Buffer.from('﻿a,b\n1,2')), [['a', 'b'], ['1', '2']], 'the BOM is not part of the first header');
  assert.deepEqual(parseCsv(Buffer.from('a,b\r\n')), [['a', 'b']], 'a final newline is not a row');
  assert.deepEqual(parseCsv(Buffer.from('')), []);

  // readTable trims cells and drops trailing empty rows; an empty line in
  // the middle stays, as a one-cell row.
  assert.deepEqual(readTable(Buffer.from(' a , b \n\n 1 ,2\n,\n\n')), [['a', 'b'], [''], ['1', '2']]);

  const refuses = (buffer, message) => assert.throws(() => readTable(buffer, 'list.xyz'), (err) => err instanceof SpreadsheetError && err.message === message);
  refuses(Buffer.alloc(0), 'That file is empty.');
  refuses('not a buffer', 'That file is empty.');
  refuses(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]), 'That is an old-style .xls file. In Excel, choose Save As and pick "Excel Workbook (.xlsx)" or "CSV", then upload that.');
  refuses(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), 'list.xyz is not a CSV or .xlsx spreadsheet.');
  refuses(Buffer.from('PK\u0003\u0004 and then nothing that a zip has'), 'That file is not a valid .xlsx workbook.');
  refuses(zipStored({ 'mimetype': 'application/epub+zip' }), 'That file is not a valid .xlsx workbook.');
  refuses(zipStored({ '[Content_Types].xml': '<Types/>' }), 'That workbook has no worksheet to read.');

  // What openpyxl wrote: every string inline, phones as numbers, blank cells left out.
  assert.deepEqual(readTable(fs.readFileSync(FIXTURE), 'tithers.xlsx'), [
    ['Tithe Number', 'Name', 'Phone', 'Type', 'Spouse Name', 'Spouse Phone'],
    ['HPC001', 'Kofi Mensah', '244123456', 'Individual'],
    ['HPC002', 'Yaw Boateng', '201234567', 'couple', 'Abena Boateng', '0551234567'],
    ['HPC003', 'Esi Owusu'],
  ]);

  // What Excel itself writes: a shared-strings table (with rich-text runs and
  // entities), the first sheet found through the relationships rather than by
  // name, numbers with float noise, a formula result, a boolean and a gap.
  const excel = zipStored({
    '[Content_Types].xml':        '<Types/>',
    'xl/workbook.xml':            '<workbook><sheets><sheet name="Tithers" sheetId="1" r:id="rId3"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="styles.xml"/><Relationship Id="rId3" Target="worksheets/sheet7.xml"/></Relationships>',
    'xl/sharedStrings.xml':       '<sst count="3" uniqueCount="3"><si><t>Tithe Number</t></si><si><t xml:space="preserve">Name </t></si><si><r><t>Mensah</t></r><r><rPr><b/></rPr><t> &amp; Sons</t></r></si></sst>',
    'xl/worksheets/sheet1.xml':   '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>WRONG SHEET</t></is></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet7.xml':   '<worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Phone</t></is></c></row>'
      + '<row r="2"><c r="A2" t="str"><f>CONCAT("HPC",1)</f><v>HPC001</v></c><c r="B2" t="s"><v>2</v></c><c r="C2"><v>2.44123456E8</v></c></row>'
      + '<row r="3"><c r="A3" t="s"><v>0</v></c><c r="C3" s="1"/><c r="D3" t="b"><v>1</v></c></row>'
      + '<row r="4"/>'
      + '</sheetData></worksheet>',
  });
  assert.deepEqual(readTable(excel, 'excel.xlsx'), [
    ['Tithe Number', 'Name', 'Phone'],
    ['HPC001', 'Mensah & Sons', '244123456'],
    ['Tithe Number', '', '', 'TRUE'],
  ]);
});

const SHARED_STRINGS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings';
const inlineCell = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
const sheetOf    = (rows) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`;
/** The smallest workbook that reads: one sheet at the usual path, plus any other members. */
const oneSheet   = (rows, extra = {}) => zipStored({ '[Content_Types].xml': '<Types/>', 'xl/worksheets/sheet1.xml': sheetOf(rows), ...extra });
const refusedWith = (fn, message) => assert.throws(fn, (err) => err instanceof SpreadsheetError && err.message === message);

test('lib/spreadsheet: a crafted workbook cannot blow up the reader', () => {
  // A cell at the far right edge (XFD = column 16,384) is ignored, not padded
  // out to; column 100 (CV) is the last one kept.
  const wide = readTable(oneSheet(`<row r="1">${inlineCell('A1', 'HPC001')}${inlineCell('CV1', 'last kept')}${inlineCell('XFD1', 'far right')}</row>`));
  assert.equal(wide.length, 1);
  assert.equal(wide[0].length, 100);
  assert.equal(wide[0][0], 'HPC001');
  assert.equal(wide[0][99], 'last kept');
  assert.ok(!wide[0].includes('far right'));
  // The same cap for a CSV.
  assert.equal(parseCsv(Buffer.from(`${Array.from({ length: 150 }, (_, i) => `c${i}`).join(',')}\n`))[0].length, 100);

  // One giant shared string used by every row: each cell keeps 1,000 characters.
  const rows = Array.from({ length: 5000 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="s"><v>0</v></c></row>`).join('');
  const giant = readTable(oneSheet(rows, { 'xl/sharedStrings.xml': `<sst><si><t>${'G'.repeat(100_000)}</t></si></sst>` }));
  assert.equal(giant.length, 5000);
  assert.ok(giant.every((row) => row.length === 1 && row[0].length === 1000));

  // More shared text than a tither list could need is refused outright.
  refusedWith(
    () => readTable(oneSheet(rows, { 'xl/sharedStrings.xml': `<sst>${`<si><t>${'s'.repeat(999)}</t></si>`.repeat(5100)}</sst>` })),
    'That workbook has too much text to read. Copy just the tither list into a new workbook and upload that.',
  );

  // 40,000 <row> tags that are never closed: read in one pass, not one search per tag.
  const malformed = oneSheet(`<row r="1">${inlineCell('A1', 'ok')}</row>${'<row>'.repeat(40_000)}`);
  const started = performance.now();
  assert.deepEqual(readTable(malformed), [['ok']]);
  const took = performance.now() - started;
  assert.ok(took < 1000, `took ${Math.round(took)}ms`);

  // A row far down the sheet is refused rather than padded out to.
  refusedWith(() => readTable(oneSheet(`<row r="50001">${inlineCell('A50001', 'x')}</row>`)), 'That sheet is too big — keep it under 5000 rows.');
});

test('lib/spreadsheet: rows sit at their row numbers, and only rows with text count toward the limit', () => {
  // r="4" is row 4, whatever came before; a row without r="" follows on.
  const gappy = oneSheet(`<row r="1">${inlineCell('A1', '1')}</row><row r="4">${inlineCell('A4', '4')}</row><row>${inlineCell('A5', '5')}</row>`);
  assert.deepEqual(readTable(gappy), [['1'], [], [], ['4'], ['5']]);

  // A register pre-formatted down to row 9,002: the empty rows cost nothing.
  const formatted = oneSheet(`<row r="1">${inlineCell('A1', 'Tithe No')}</row><row r="2">${inlineCell('A2', 'HPC001')}</row>`
    + Array.from({ length: 9000 }, (_, i) => `<row r="${i + 3}"><c r="A${i + 3}" s="1"/><c r="B${i + 3}" s="1"/></row>`).join(''));
  assert.deepEqual(readTable(formatted), [['Tithe No'], ['HPC001']]);

  const filled = (n) => Array.from({ length: n }, (_, i) => `<row r="${i + 1}">${inlineCell(`A${i + 1}`, `HPC${i + 1}`)}</row>`).join('');
  assert.equal(readTable(oneSheet(filled(5000))).length, 5000);
  refusedWith(() => readTable(oneSheet(filled(5001))), 'That sheet is too big — keep it under 5000 rows.');

  // The same for a CSV: blank lines in the middle do not count.
  const lines = (n, from = 0) => Array.from({ length: n }, (_, i) => `HPC${from + i},Name`).join('\n');
  const spaced = readTable(Buffer.from(`${lines(2500)}\n${',,\n'.repeat(20_000)}${lines(2500, 2500)}\n`));
  assert.equal(spaced.length, 25_000);
  assert.deepEqual(spaced[2500], ['']);
  refusedWith(() => readTable(Buffer.from(lines(5001))), 'That file is too big — keep it under 5000 rows.');
});

test('lib/spreadsheet: CSVs in the encodings Excel saves, the delimiter, and an unclosed quote', () => {
  // "CSV (Comma delimited)" is Windows-1252: curly quotes, a curly apostrophe and É.
  const cp1252 = Buffer.concat([
    Buffer.from('HPC001,'), Buffer.from([0xc9]), Buffer.from('sa Owusu,'),
    Buffer.from([0x93]), Buffer.from('Hi'), Buffer.from([0x94, 0x92]), Buffer.from('\r\n'),
  ]);
  assert.deepEqual(readTable(cp1252), [['HPC001', 'Ésa Owusu', '“Hi”’']]);
  // Valid UTF-8 without a BOM is still UTF-8.
  assert.deepEqual(readTable(Buffer.from('HPC001,Ésa Owusu\n', 'utf8')), [['HPC001', 'Ésa Owusu']]);

  // "Unicode Text" is UTF-16 with a byte-order mark, and tabs.
  const text = 'No\tName\r\nHPC001\tKwame Ɛsi\r\n';
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  assert.deepEqual(readTable(le, 'list.txt'), [['No', 'Name'], ['HPC001', 'Kwame Ɛsi']]);
  const be = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]);
  assert.deepEqual(readTable(be, 'list.txt'), [['No', 'Name'], ['HPC001', 'Kwame Ɛsi']]);

  // The delimiter comes from the first line with something on it.
  assert.deepEqual(readTable(Buffer.from('\n\r\n  \nNo;Name\nHPC1;Kofi, Jr\n')), [[''], [''], [''], ['No', 'Name'], ['HPC1', 'Kofi, Jr']]);

  // A quote in the middle of a field is just a character.
  assert.deepEqual(parseCsv(Buffer.from('a,5" pipe,c\n')), [['a', '5" pipe', 'c']]);

  // One that opens a field and is never closed would swallow the rest of the file.
  refusedWith(
    () => readTable(Buffer.from('a,b\nc,"never\nclosed\nd,e\n')),
    'The quote mark (") that starts on line 2 is never closed, so the rest of the file cannot be read. Fix that line and upload the file again.',
  );
  // Lines inside an earlier, closed quoted field are counted too.
  refusedWith(
    () => readTable(Buffer.from('a,"b\nc"\nd,"e\n')),
    'The quote mark (") that starts on line 3 is never closed, so the rest of the file cannot be read. Fix that line and upload the file again.',
  );
});

test('lib/spreadsheet: workbooks as other programs write them', () => {
  // A self-closing <si/> keeps its place in the shared strings.
  const strings = '<sst><si><t>a</t></si><si/><si><t>c</t></si></sst>';
  const byIndex = '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>';
  assert.deepEqual(readTable(oneSheet(byIndex, { 'xl/sharedStrings.xml': strings })), [['a', '', 'c']]);

  // Shared strings found through the relationships, the sheet through an
  // absolute Target, and hidden sheets ahead of it skipped.
  const viaRels = zipStored({
    '[Content_Types].xml':        '<Types/>',
    'xl/workbook.xml':            '<workbook><sheets>'
      + '<sheet name="Lookup" sheetId="1" state="hidden" r:id="rId1"/>'
      + '<sheet name="Old" sheetId="2" state="veryHidden" r:id="rId2"/>'
      + '<sheet name="Tithers" sheetId="3" r:id="rId3"/>'
      + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships>'
      + '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/>'
      + '<Relationship Id="rId3" Target="/xl/worksheets/data.xml"/>'
      + `<Relationship Id="rId9" Type="${SHARED_STRINGS}" Target="strings/shared.xml"/>`
      + '</Relationships>',
    'xl/strings/shared.xml':      strings,
    'xl/sharedStrings.xml':       '<sst><si><t>WRONG</t></si><si><t>WRONG</t></si><si><t>WRONG</t></si></sst>',
    'xl/worksheets/sheet1.xml':   sheetOf(`<row r="1">${inlineCell('A1', 'HIDDEN')}</row>`),
    'xl/worksheets/sheet2.xml':   sheetOf(`<row r="1">${inlineCell('A1', 'VERY HIDDEN')}</row>`),
    'xl/worksheets/data.xml':     sheetOf(byIndex),
  });
  assert.deepEqual(readTable(viaRels, 'rels.xlsx'), [['a', '', 'c']]);

  // Every element in an x: namespace, and the relationship id under another prefix.
  const prefixed = zipStored({
    '[Content_Types].xml':        '<Types/>',
    'xl/workbook.xml':            '<x:workbook xmlns:x="main" xmlns:ns2="rel"><x:sheets><x:sheet name="T" sheetId="1" ns2:id="rId1"/></x:sheets></x:workbook>',
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Target="worksheets/tithers.xml"/><Relationship Id="rId2" Type="${SHARED_STRINGS}" Target="sharedStrings.xml"/></Relationships>`,
    'xl/sharedStrings.xml':       '<x:sst><x:si><x:t>Kofi Mensah</x:t></x:si></x:sst>',
    'xl/worksheets/tithers.xml':  '<x:worksheet><x:sheetData><x:row r="1">'
      + '<x:c r="A1" t="inlineStr"><x:is><x:t>HPC001</x:t></x:is></x:c><x:c r="B1" t="s"><x:v>0</x:v></x:c><x:c r="C1"><x:v>244123456</x:v></x:c>'
      + '</x:row></x:sheetData></x:worksheet>',
  });
  assert.deepEqual(readTable(prefixed, 'prefixed.xlsx'), [['HPC001', 'Kofi Mensah', '244123456']]);

  // Phonetic guides above a Japanese name are not part of it.
  const phonetic = oneSheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>', {
    'xl/sharedStrings.xml': '<sst><si><t>山田</t><rPh sb="0" eb="2"><t>ヤマダ</t></rPh></si></sst>',
  });
  assert.deepEqual(readTable(phonetic), [['山田']]);

  // The other programs' files, named so the office knows what to do.
  const ods     = 'That looks like a LibreOffice (.ods) file. Save it as Excel (.xlsx) or CSV and upload that.';
  const appleNumbers = 'That looks like an Apple Numbers file. Save it as Excel (.xlsx) or CSV and upload that.';
  refusedWith(() => readTable(zipStored({ mimetype: 'application/vnd.oasis.opendocument.spreadsheet', 'content.xml': '<x/>' }), 'tithers.xlsx'), ods);
  refusedWith(() => readTable(zipStored({ 'content.xml': '<x/>' }), 'tithers.ods'), ods);
  refusedWith(() => readTable(zipStored({ 'Index/Document.iwa': 'x' }), 'tithers.xlsx'), appleNumbers);
  refusedWith(() => readTable(zipStored({ 'preview.jpg': 'x' }), 'Tithers.numbers'), appleNumbers);
  refusedWith(() => readTable(zipStored({ mimetype: 'application/epub+zip' }), 'book.xlsx'), 'That file is not a valid .xlsx workbook.');
});

// ─── Second review: what the fixes themselves got wrong ──────────────────────

test('a tither abroad keeps their number, gets the text, and uploads without a hitch', async () => {
  // Every stored phone reads back as itself: the SMS and the upload both run
  // stored phones through canonicalPhone again.
  for (const typed of ['0244123456', '244123456', '+233 (0)24 412 3456', '00233 24 412 3456', '+44 7911 123456', '0044 7911 123456', '447911123456', '+1 (555) 123-4567']) {
    const stored = tithe.canonicalPhone(typed);
    assert.ok(stored, typed);
    assert.equal(tithe.canonicalPhone(stored), stored, `${typed} → ${stored} must read back as itself`);
  }
  // Still refused: a Ghana number a digit short, and short foreign numbers
  // that could be a Ghana number with digits missing.
  for (const typed of ['24412345', '2330244123', '1234567', '+44 7911']) assert.equal(tithe.canonicalPhone(typed), '', typed);

  const abroad = await addTither({ number: 'HPC040', name: 'Abena Owusu', phone: '+44 7911 123456' });
  assert.equal(abroad.phone, '447911123456');
  const paid = await record(abroad.id);
  assert.equal(paid.status, 201);
  assert.equal(paid.body.sms.status, 'SENT', JSON.stringify(paid.body.sms));
  assert.deepEqual(paid.body.sms.to, ['+447911123456']);
  assert.equal(hubtel.requests.length, 1);
  assert.equal(hubtel.requests[0].body.To, '447911123456');

  // An upload carries the stored form back for the confirm step; it must pass.
  const preview = await upload(Buffer.from('Tithe Number,Name,Phone\r\nHPC041,Kwame Boateng,+44 7700 900123\r\n', 'utf8'), 'abroad.csv');
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.deepEqual(preview.body.rows[0].problems, []);
  assert.equal(preview.body.rows[0].phone, '447700900123');
  const done = await api('POST', '/admin/tithes/tithers/import', { rows: preview.body.rows.map(importRow), updateExisting: false });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.deepEqual(done.body, { created: 1, updated: 0, skipped: [] });
});

test('a resend that fails after the text went keeps the record of the text that went', async () => {
  const kofi = await addTither(KOFI);
  const sent = (await record(kofi.id)).body.payment;
  assert.equal(sent.smsStatus, 'SENT');
  const stored = await prisma.tithePayment.findUnique({ where: { id: sent.id } });

  hubtel.mode = 'down';
  const again = await api('POST', `/admin/tithes/payments/${sent.id}/sms`);
  assert.equal(again.status, 200);
  assert.equal(again.body.sms.status, 'FAILED', 'the office is told this attempt failed');
  assert.equal(again.body.payment.smsStatus, 'SENT', 'but the payment still says it was sent');
  assert.deepEqual(await prisma.tithePayment.findUnique({ where: { id: sent.id } }), stored);
});

test('a couple whose text reached one phone keeps the time it went', async () => {
  const pair = await addTither(COUPLE);
  hubtel.rejectTo = '233201234567';
  const half = (await record(pair.id)).body.payment;
  assert.equal(half.smsStatus, 'FAILED');
  assert.ok(half.smsSentAt, 'the account holder has the text, so it went');
});

test('the database refuses to delete a tither who has payments, whatever the route checked first', async () => {
  const kofi = await addTither(KOFI);
  await record(kofi.id, { sendSms: false });
  await assert.rejects(prisma.tither.delete({ where: { id: kofi.id } }), /violates RESTRICT setting of foreign key/);
  assert.equal(await prisma.tithePayment.count({ where: { titherId: kofi.id } }), 1);

  // The route answers that refusal in words, as when a payment lands between
  // its own check and the delete: make the check see none, then let the
  // database refuse.
  const findUnique = prisma.tither.findUnique;
  prisma.tither.findUnique = () => Promise.resolve({ _count: { payments: 0 } });
  let res;
  try {
    res = await api('DELETE', `/admin/tithes/tithers/${kofi.id}`);
  } finally {
    prisma.tither.findUnique = findUnique;
  }
  assert.equal(res.status, 409);
  assert.equal(res.body.message, 'A payment has just been recorded for this account. Archive it instead so the records are kept.');
  assert.equal(await prisma.tithePayment.count({ where: { titherId: kofi.id } }), 1);
});

test('an upload with no Type or Spouse column leaves couples as couples when it updates them', async () => {
  const pair = await addTither(COUPLE);                                         // HPC022
  const preview = await upload(Buffer.from('Tithe Number,Name,Phone\r\nHPC022,Kofi Mensah,0271234567\r\n', 'utf8'), 'plain.csv');
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const [row] = preview.body.rows;
  assert.equal(row.status, 'update');
  assert.equal(row.keepType, true);
  assert.deepEqual(row.warnings, [], 'no warning that the couple would become an individual');

  // What the browser sends back (TitherImport keeps keepType with the row).
  const done = await api('POST', '/admin/tithes/tithers/import', { rows: [{ ...importRow(row), keepType: true }], updateExisting: true });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.updated, 1);
  const after = await prisma.tither.findUnique({ where: { id: pair.id } });
  assert.equal(after.type, 'COUPLE');
  assert.equal(after.spouseName, 'Ama Mensah');
  assert.equal(after.spousePhone, '233201234567');
  assert.equal(after.phone, '233271234567', 'the phone the file gives still replaces the old one');
});

test('a list numbered 1, 2, 3 … lands on the HPC numbers already on the register', async () => {
  await addTither(KOFI);                                                        // HPC021
  const preview = await upload(Buffer.from('Tithe No,Name,Phone\r\n21,Kofi Mensah,0244123456\r\n22,Ama Owusu,0201234567\r\n', 'utf8'), 'numbered.csv');
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.deepEqual(preview.body.rows.map((r) => [r.number, r.status]), [['HPC021', 'update'], ['HPC022', 'new']]);
});

test('a church letterhead with a phone number above the column names does not hide them', async () => {
  const csv = 'HPC Global Church,\r\nAccra,0302123456\r\nName,Tithe No,Phone\r\nKofi Mensah,HPC021,0244123456\r\n';
  const preview = await upload(Buffer.from(csv, 'utf8'), 'letterhead.csv');
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.hadHeader, true);
  assert.deepEqual(preview.body.rows.map((r) => [r.line, r.number, r.name, r.phone, r.problems]), [[4, 'HPC021', 'Kofi Mensah', '233244123456', []]]);
});

test('a spouse column saying "No" or "N/A" means no spouse, not a couple', () => {
  const read = tithe.readTitherRows([
    ['Tithe No', 'Name', 'Spouse', 'Phone'],
    ['HPC021', 'Kofi Mensah', 'No', '0244123456'],
    ['HPC022', 'Esi Owusu', 'N/A', '0201234567'],
    ['HPC023', 'Yaw Boateng', 'Abena Boateng', '0271234567'],
  ]);
  assert.deepEqual(read.rows.map((r) => [r.number, r.type, r.spouseName, r.problems]), [
    ['HPC021', 'INDIVIDUAL', '', []],
    ['HPC022', 'INDIVIDUAL', '', []],
    ['HPC023', 'COUPLE', 'Abena Boateng', []],
  ]);
});

test('an amount that rounds to nothing is refused', async () => {
  const kofi = await addTither(KOFI);
  const res = await record(kofi.id, { amount: 0.004 });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'The amount must be more than zero');
  assert.equal(await prisma.tithePayment.count(), 0);
});

test('lib/spreadsheet: a shared-string cell with no value is empty, not the first string', () => {
  const book = zipStored({
    '[Content_Types].xml':  '<Types/>',
    'xl/sharedStrings.xml': '<sst><si><t>Tithe Number</t></si><si><t>Kofi</t></si></sst>',
    'xl/worksheets/sheet1.xml': sheetOf('<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"/><c r="B2" t="s"><v>1</v></c></row>'),
  });
  assert.deepEqual(readTable(book, 'blank.xlsx'), [['Tithe Number'], ['', 'Kofi']]);
});
