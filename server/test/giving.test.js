/**
 * The Give page and online tithes: a tithe paid on the website is checked with
 * Paystack — by the giver coming back, or by Paystack's webhook, whichever is
 * first — and lands on the tithe register for the month the giver chose. One
 * that cannot (no number, a number nobody holds, an archived account) waits
 * under Admin → Tithes → Online tithes for the office.
 *
 * A fake Paystack answers from a table of transactions the test fills in, and
 * a fake Hubtel keeps every text, so a test can say exactly what was asked of
 * Paystack and who was texted. Nothing here can reach either for real.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const { loadApp, startServer, tokenFor, TEST_ENV } = require('./helpers');
const { startFakePaystack, startFakeHubtel, sign } = require('./fakes');

// paystack.js and sms.js fix their URLs the first time they are required, so
// the app is loaded in `before`, once the fakes have ports.
let app, prisma, server, paystack, hubtel, tithe;
let superAdmin, editor, mediaManager, hod;

test.before(async () => {
  [paystack, hubtel] = await Promise.all([startFakePaystack(), startFakeHubtel()]);
  TEST_ENV.PAYSTACK_BASE_URL   = paystack.url;
  TEST_ENV.HUBTEL_SMS_BASE_URL = hubtel.url;
  ({ app, prisma } = loadApp('giving'));
  tithe  = require('../src/lib/tithe');
  server = await startServer(app);

  const admin = (role, name) => prisma.adminUser.create({
    data: { name, email: `${role.toLowerCase()}@giving.test`, passwordHash: 'not-a-real-hash', role },
  });
  superAdmin   = tokenFor(await admin('SUPER_ADMIN', 'Efua Asante'));
  editor       = tokenFor(await admin('CONTENT_EDITOR', 'Editor'));
  mediaManager = tokenFor(await admin('MEDIA_MANAGER', 'Media'));
  hod          = tokenFor(await admin('HOD', 'Head'));
});

test.after(async () => {
  await server?.close();
  await paystack?.close();
  await hubtel?.close();
  await prisma?.$disconnect();
});

test.beforeEach(async () => {
  await prisma.tithePayment.deleteMany();    // first: payments hold on to their gift and tither
  await prisma.givingRecord.deleteMany();
  await prisma.tither.deleteMany();
  await prisma.deliveryFailure.deleteMany();
  await prisma.titheSettings.deleteMany();   // back to the default template, sending on
  paystack.reset();
  hubtel.reset();
});

// ─── Shared bits ──────────────────────────────────────────────────────────────

// Every visitor request comes from an address of its own, so the per-visitor
// limits (20 gifts started, 60 checks) never decide a test by accident.
let visitors = 0;
const nextIp = () => { visitors += 1; return `10.${(visitors >> 16) & 255}.${(visitors >> 8) & 255}.${visitors & 255}`; };

const admin = (method, url, body, token = superAdmin) => server.call(method, url, body, { token });

function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}
const THIS_MONTH = new Date().toISOString().slice(0, 7);
const LAST_MONTH = addMonths(THIS_MONTH, -1);

// Yesterday mid-morning UTC: in the past, so the office may edit around it.
const PAID_ON = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const PAID_AT = `${PAID_ON}T09:30:00.000Z`;

const KOFI   = { number: 'HPC021', type: 'INDIVIDUAL', name: 'Kofi Mensah', phone: '0244123456' };
const COUPLE = { number: 'HPC022', type: 'COUPLE', name: 'Kofi Mensah', phone: '0244123456', spouseName: 'Ama Mensah', spousePhone: '0201234567' };

const TITHE = {
  email: 'kofi@example.com', amount: 150, category: 'TITHE', method: 'MTN_MOMO',
  name: 'Kofi Mensah', phone: '024 412 3456', titheMonth: LAST_MONTH, titheNumber: 'hpc-21',
};

const give = (body) => server.call('POST', '/give', body, { ip: nextIp() });

/** Start a tithe on the Give page; its gift id (the Paystack reference). */
async function startGift(extra = {}) {
  const res = await give({ ...TITHE, ...extra });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.reference;
}

/** What Paystack's verify answers for `reference`, as a successful charge. */
function paid(reference, pesewas = 15000, extra = {}) {
  paystack.transactions.set(reference, { status: 'success', reference, currency: 'GHS', amount: pesewas, paid_at: PAID_AT, ...extra });
}

const verify = (ref) => server.call('GET', `/give/verify/${ref}`, undefined, { ip: nextIp() });

/**
 * POST a webhook as Paystack does: raw bytes, signed. `signature: null` sends
 * none; `body` sends those exact bytes instead of the event.
 */
async function webhook(event, { signature, body, ip = nextIp() } = {}) {
  const raw = body ?? JSON.stringify(event);
  const response = await fetch(`${server.base}/paystack/webhook`, {
    method:  'POST',
    headers: {
      'content-type':    'application/json',
      'x-forwarded-for': ip,
      ...(signature !== null && { 'x-paystack-signature': signature ?? sign(raw) }),
    },
    body: raw,
  });
  return response.status;
}
const charged = (reference, extra = {}) => ({ event: 'charge.success', data: { reference, status: 'success', ...extra } });

async function addTither(body) {
  const res = await admin('POST', '/admin/tithes/tithers', body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

const gift      = (id) => prisma.givingRecord.findUnique({ where: { id } });
const payments  = () => prisma.tithePayment.findMany({ orderBy: { createdAt: 'asc' } });
const waiting   = async () => (await admin('GET', '/admin/tithes/online/count')).body.needsMatch;
const listed    = async (query = '') => {
  const res = await admin('GET', `/admin/tithes/online${query}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

const ackText = (name, number, amount, month) =>
  `Dear ${name}, we acknowledge receipt of your tithe of ${amount} for ${tithe.monthLabel(month)}, paid on ${tithe.dateLabel(PAID_ON)}. Tithe No. ${number}. Thank you and God bless you. - HPC Global`;

// ─── Starting a gift ──────────────────────────────────────────────────────────

test('a tithe needs a phone and a month; the tithe number is optional but must look like one', async () => {
  const refused = async (extra, field, message) => {
    const res = await give({ ...TITHE, ...extra });
    assert.equal(res.status, 400, JSON.stringify(extra));
    assert.deepEqual(res.body, { message, field }, JSON.stringify(extra));
  };

  const noPhone  = 'Please enter your phone number.';
  const badPhone = "That phone number doesn't look right. Enter it like 024 412 3456, or with the country code (+233…).";
  const noMonth  = 'Please choose the month this tithe is for.';

  await refused({ phone: undefined }, 'phone', noPhone);
  await refused({ phone: '   ' }, 'phone', noPhone);
  await refused({ phone: '12345' }, 'phone', badPhone);
  await refused({ phone: '024 412 345' }, 'phone', badPhone);
  await refused({ titheMonth: undefined }, 'titheMonth', noMonth);
  await refused({ titheMonth: '2026-13' }, 'titheMonth', noMonth);
  await refused({ titheMonth: 'November 2026' }, 'titheMonth', noMonth);
  // The form offers twelve months back to two ahead; one more each way is
  // allowed for a page left open over the turn of a month, and no further.
  await refused({ titheMonth: addMonths(THIS_MONTH, -14) }, 'titheMonth', noMonth);
  await refused({ titheMonth: addMonths(THIS_MONTH, 4) }, 'titheMonth', noMonth);
  await refused({ titheNumber: '0244123456' }, 'titheNumber', `"0244123456" isn't a tithe number. Tithe numbers look like HPC021 — or leave it blank.`);
  await refused({ titheNumber: '???' }, 'titheNumber', `"???" isn't a tithe number. Tithe numbers look like HPC021 — or leave it blank.`);

  // Nothing was saved and Paystack was never asked.
  assert.equal(await prisma.givingRecord.count(), 0);
  assert.equal(paystack.initialized.length, 0);

  // The general checks still answer the way they always have.
  const noAmount = await give({ ...TITHE, amount: undefined });
  assert.equal(noAmount.status, 400);
  assert.equal(noAmount.body.message, 'Please enter the amount');
  assert.ok(noAmount.body.errors.amount);

  for (const titheMonth of [addMonths(THIS_MONTH, -13), addMonths(THIS_MONTH, 3), THIS_MONTH]) {
    await startGift({ titheMonth });
  }
  // A blank number is no number.
  const blank = await gift(await startGift({ titheNumber: '   ' }));
  assert.equal(blank.titheNumber, null);
  const left  = await gift(await startGift({ titheNumber: undefined }));
  assert.equal(left.titheNumber, null);
});

test('a tithe is stored with its phone and number in their stored forms, in cedis, and sent to Paystack in whole pesewas', async () => {
  const res = await give({ ...TITHE, amount: 19.99, currency: 'USD', phone: '+233 (0)24 412 3456', titheNumber: 'hpc 21' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.url, `https://checkout.paystack.test/${res.body.reference}`);

  const row = await gift(res.body.reference);
  assert.equal(row.amount, 19.99);
  assert.equal(row.currency, 'GHS', 'always cedis, whatever was sent');
  assert.equal(row.phone, '233244123456');
  assert.equal(row.titheNumber, 'HPC021');
  assert.equal(row.titheMonth, LAST_MONTH);
  assert.equal(row.name, 'Kofi Mensah');
  assert.equal(row.status, 'PENDING');
  assert.equal(row.titheStatus, null, 'nothing is decided until Paystack confirms it');
  assert.equal(row.paidAt, null);

  assert.equal(paystack.initialized.length, 1);
  const [init] = paystack.initialized;
  assert.equal(init.amount, 1999, '19.99 * 100 is 1998.9999999999998 in JavaScript');
  assert.equal(init.currency, 'GHS');
  assert.equal(init.reference, row.id);
  assert.deepEqual(init.channels, ['mobile_money']);
  assert.equal(init.metadata.titheNumber, 'HPC021');
  assert.equal(init.metadata.titheMonth, LAST_MONTH);
  assert.equal(init.metadata.givingRecordId, row.id);
});

test('other gifts keep none of the tithe details, whatever was sent', async () => {
  const res = await give({ ...TITHE, category: 'OFFERING', method: 'CARD' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const row = await gift(res.body.reference);
  assert.equal(row.category, 'OFFERING');
  assert.equal(row.phone, null);
  assert.equal(row.titheMonth, null);
  assert.equal(row.titheNumber, null);
  assert.deepEqual(paystack.initialized[0].channels, ['card']);
  assert.equal('titheNumber' in paystack.initialized[0].metadata, false);
  assert.equal('titheMonth' in paystack.initialized[0].metadata, false);

  // No phone needed for an offering, and a building-fund gift still needs a name.
  assert.equal((await give({ ...TITHE, category: 'OFFERING', phone: undefined, titheMonth: undefined })).status, 200);
  const nameless = await give({ ...TITHE, category: 'BUILDING_FUND', name: undefined });
  assert.equal(nameless.status, 400);
  assert.equal(nameless.body.message, 'Name is required');
});

// ─── Recorded automatically ───────────────────────────────────────────────────

test("a tithe with an active tither's number is recorded for the chosen month and texted, once", async () => {
  const kofi = await addTither(KOFI);
  const id   = await startGift();
  paid(id);

  const res = await verify(id);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  // Public, so it names nobody: only whether this gift went on the register.
  assert.deepEqual(res.body, {
    status: 'COMPLETED', source: 'GIVING', category: 'TITHE', amount: 150, currency: 'GHS',
    tithe: { month: LAST_MONTH, number: 'HPC021', recorded: true },
  });
  assert.deepEqual(paystack.verified, [id]);

  const row = await gift(id);
  assert.equal(row.status, 'COMPLETED');
  assert.equal(row.paidAt.toISOString(), PAID_AT);
  assert.equal(row.reference, id);
  assert.equal(row.titheStatus, 'RECORDED');

  const [payment, ...more] = await payments();
  assert.equal(more.length, 0);
  assert.equal(payment.titherId, kofi.id);
  assert.equal(payment.amount, 150);
  assert.equal(payment.currency, 'GHS');
  assert.equal(payment.month, LAST_MONTH, 'the month the giver chose, not the month it was paid');
  assert.equal(payment.paidOn.toISOString().slice(0, 10), PAID_ON);
  assert.equal(payment.recordedBy, 'Online giving');
  assert.equal(payment.note, 'Paid online (MTN MoMo) from 024 412 3456');
  assert.equal(payment.givingRecordId, id);
  assert.equal(payment.smsStatus, 'SENT');
  assert.equal(payment.smsTo, '233244123456');

  const text = ackText('Kofi Mensah', 'HPC021', 'GHS 150.00', LAST_MONTH);
  assert.equal(hubtel.requests.length, 1);
  assert.equal(hubtel.requests[0].To, '233244123456');
  assert.equal(hubtel.requests[0].Content, text);

  // Coming back again asks Paystack nothing and changes nothing.
  assert.equal((await verify(id)).body.tithe.recorded, true);
  assert.deepEqual(paystack.verified, [id]);
  assert.equal((await payments()).length, 1);
  assert.equal(hubtel.requests.length, 1);

  // The office sees where it came from, on the payments list and the account.
  const online = { giftId: id, method: 'MTN_MOMO', name: 'Kofi Mensah', phone: '024 412 3456', paidAt: PAID_AT };
  const list = await admin('GET', '/admin/tithes/payments');
  assert.deepEqual(list.body.payments[0].online, online);
  const detail = await admin('GET', `/admin/tithes/tithers/${kofi.id}`);
  assert.deepEqual(detail.body.payments[0].online, online);
  assert.equal(await waiting(), 0);
  assert.deepEqual((await listed()).gifts, []);

  // Added rows are history, with no complaint: the number given was right.
  const added = await listed('?status=RECORDED');
  assert.equal(added.total, 1);
  assert.equal(added.gifts[0].issue, null);
  assert.deepEqual(added.gifts[0].payment, {
    id: payment.id, month: LAST_MONTH,
    tither: { id: kofi.id, number: 'HPC021', type: 'INDIVIDUAL', name: 'Kofi Mensah', spouseName: null, phone: '233244123456', spousePhone: null, isActive: true },
  });

  // The payments export and the giving export say so too.
  const csv = await fetch(`${server.base}/admin/tithes/payments/export`, { headers: { authorization: `Bearer ${superAdmin}` } });
  const [header, line] = (await csv.text()).replace(/^﻿/, '').split('\n');
  assert.match(header, /,"Source"$/);
  assert.match(line, /,"Online"$/);
  const giving = await fetch(`${server.base}/admin/giving/export`, { headers: { authorization: `Bearer ${superAdmin}` } });
  const [gHeader, gLine] = (await giving.text()).split('\n');
  assert.match(gHeader, /"Paid At","Tithe Number","Tithe Month","Tithe Register"$/);
  assert.ok(gLine.endsWith(`"${PAID_AT.slice(0, 19).replace('T', ' ')}","HPC021","${LAST_MONTH}","Added"`), gLine);
});

test("a couple's online tithe texts both phones, and the note flags a giver's phone that is not on the account", async () => {
  await addTither(COUPLE);

  // Ama paying from her own phone: one of the account's.
  const fromAma = await startGift({ titheNumber: 'HPC022', phone: '020 123 4567' });
  paid(fromAma);
  assert.equal((await verify(fromAma)).body.tithe.recorded, true);
  assert.deepEqual(hubtel.requests.map((r) => r.To).sort(), ['233201234567', '233244123456']);
  assert.equal(hubtel.requests[0].Content, ackText('Kofi Mensah & Ama Mensah', 'HPC022', 'GHS 150.00', LAST_MONTH));

  // Someone else's phone — perhaps a typo in the number that hit this account.
  // It is still recorded, the note says so, and only the account is texted.
  hubtel.reset();
  const stranger = await startGift({ titheNumber: 'HPC022', phone: '055 111 2222', method: 'TELECEL' });
  paid(stranger);
  assert.equal((await verify(stranger)).body.tithe.recorded, true);
  const notes = (await payments()).map((p) => p.note);
  assert.deepEqual(notes, [
    'Paid online (MTN MoMo) from 020 123 4567',
    'Paid online (Telecel) from 055 111 2222 — not a number on this account',
  ]);
  assert.deepEqual(hubtel.requests.map((r) => r.To).sort(), ['233201234567', '233244123456']);
});

test("an account without a phone is not texted on the phone a giver typed — only the office may, by resending", async () => {
  // The typed phone is anyone's: texting it automatically would tell a
  // stranger a member's name and tithe number for the price of a small gift.
  const yaw = await addTither({ number: 'HPC023', name: 'Yaw Boateng' });
  const id  = await startGift({ titheNumber: 'HPC023', name: 'Yaw Boateng', phone: '055 111 2222' });
  paid(id);
  assert.equal((await verify(id)).body.tithe.recorded, true);

  const [payment] = await payments();
  assert.equal(payment.titherId, yaw.id);
  assert.equal(payment.smsStatus, 'SKIPPED');
  assert.equal(payment.smsError, 'No phone number on the account.');
  assert.equal(hubtel.requests.length, 0);

  hubtel.reset();
  const resend = await admin('POST', `/admin/tithes/payments/${payment.id}/sms`);
  assert.equal(resend.status, 200, JSON.stringify(resend.body));
  assert.equal(resend.body.sms.status, 'SENT');
  assert.deepEqual(resend.body.sms.to, ['055 111 2222']);
  assert.deepEqual(hubtel.requests.map((r) => r.To), ['233551112222']);
});

test('with SMS Template switched off an online tithe is still recorded, but nobody is texted', async () => {
  await addTither(KOFI);
  const off = await admin('PUT', '/admin/tithes/settings', { smsTemplate: tithe.DEFAULT_SMS_TEMPLATE, smsEnabled: false });
  assert.equal(off.status, 200, JSON.stringify(off.body));

  const id = await startGift();
  paid(id);
  assert.equal((await verify(id)).body.tithe.recorded, true);

  const [payment] = await payments();
  assert.equal(payment.smsStatus, 'SKIPPED');
  assert.equal(payment.smsError, 'Automatic acknowledgements are switched off under SMS Template.');
  assert.equal(hubtel.requests.length, 0);
});

// ─── Waiting for the office ───────────────────────────────────────────────────

test('no number, an unknown number and an archived account wait for the office, with what is wrong and who might it be', async () => {
  const kofi     = await addTither(KOFI);
  const archived = await addTither({ number: 'HPC030', name: 'Esi Owusu', phone: '0244123456' });
  await prisma.tither.update({ where: { id: archived.id }, data: { isActive: false } });

  // Paid in this order, a minute apart, so the oldest leads the list.
  const cases = [
    { titheNumber: undefined, phone: '024 412 3456', name: undefined },
    { titheNumber: 'hpc999',  phone: '020 999 8888', amount: 75.5 },
    { titheNumber: 'HPC030',  phone: '024 412 3456' },
  ];
  const ids = [];
  for (const [i, extra] of cases.entries()) {
    const id = await startGift(extra);
    paid(id, Math.round((extra.amount ?? 150) * 100), { paid_at: `${PAID_ON}T09:3${i}:00.000Z` });
    ids.push(id);
  }
  // Checked newest first: the list order is the payment's, not the check's.
  const answers = [];
  for (const id of [...ids].reverse()) answers.unshift((await verify(id)).body);

  assert.deepEqual(answers.map((a) => [a.status, a.tithe]), [
    ['COMPLETED', { month: LAST_MONTH, number: null,     recorded: false }],
    ['COMPLETED', { month: LAST_MONTH, number: 'HPC999', recorded: false }],
    ['COMPLETED', { month: LAST_MONTH, number: 'HPC030', recorded: false }],
  ]);
  assert.equal((await payments()).length, 0);
  assert.equal(hubtel.requests.length, 0);
  for (const id of ids) assert.equal((await gift(id)).titheStatus, 'NEEDS_MATCH');
  assert.equal(await waiting(), 3);

  const lite = (t, isActive = true) => ({ id: t.id, number: t.number, type: 'INDIVIDUAL', name: t.name, spouseName: null, phone: '233244123456', spousePhone: null, isActive });
  const { gifts, total, sum } = await listed();
  assert.equal(total, 3);
  assert.equal(sum, 375.5);
  assert.deepEqual(gifts.map((g) => g.id), ids, 'oldest payment first');
  assert.deepEqual(gifts.map((g) => [g.titheNumber, g.issue]), [[null, 'NO_NUMBER'], ['HPC999', 'NOT_FOUND'], ['HPC030', 'ARCHIVED']]);
  assert.deepEqual(gifts.map((g) => g.holder), [null, null, lite(archived, false)]);
  // The same phone as someone on the register: the active account first.
  assert.deepEqual(gifts[0].suggestions, [lite(kofi), lite(archived, false)]);
  assert.deepEqual(gifts[1].suggestions, []);
  assert.equal(gifts[0].phone, '024 412 3456');
  assert.equal(gifts[0].name, null);
  assert.equal(gifts[1].amount, 75.5);
  assert.equal(gifts[1].paidAt, `${PAID_ON}T09:31:00.000Z`);
  assert.equal(gifts[0].payment, null);
  assert.equal(gifts[0].titheStatus, 'NEEDS_MATCH');

  // Once the office adds HPC999, the row says so.
  const added = await addTither({ number: 'HPC999', name: 'Kwame Asare' });
  const again = await listed();
  assert.equal(again.gifts[1].issue, 'NOW_ON_REGISTER');
  assert.equal(again.gifts[1].holder.id, added.id);

  // Paging keeps the total and the sum of the whole list.
  const page2 = await listed('?page=2&limit=2');
  assert.deepEqual(page2.gifts.map((g) => g.id), [ids[2]]);
  assert.equal(page2.total, 3);
  assert.equal(page2.sum, 375.5);
});

test('verifying twice at once, or racing the webhook, records one payment and sends one text', async () => {
  await addTither(KOFI);

  const twice = await startGift();
  paid(twice);
  const both = await Promise.all([verify(twice), verify(twice)]);
  assert.deepEqual(both.map((r) => r.body.tithe.recorded), [true, true]);
  assert.equal((await payments()).length, 1);
  assert.equal(hubtel.requests.length, 1);

  const raced = await startGift();
  paid(raced);
  const [page, hook] = await Promise.all([verify(raced), webhook(charged(raced))]);
  assert.equal(page.status, 200);
  assert.equal(page.body.status, 'COMPLETED');
  assert.equal(page.body.tithe.recorded, true);
  assert.equal(hook, 200);
  const all = await payments();
  assert.equal(all.length, 2);
  assert.equal(all.filter((p) => p.givingRecordId === raced).length, 1);
  assert.equal(hubtel.requests.length, 2);
});

// ─── The webhook ──────────────────────────────────────────────────────────────

test('the webhook settles a gift the giver never came back for; anything unsigned or beside the point changes nothing', async () => {
  await addTither(KOFI);
  const id = await startGift();
  paid(id);

  // Unsigned, or signed with something else: refused before anything is read.
  assert.equal(await webhook(charged(id), { signature: null }), 401);
  assert.equal(await webhook(charged(id), { signature: sign('{"event":"charge.success"}') }), 401);
  assert.equal(await webhook(charged(id), { signature: 'abc' }), 401);
  // Signed, but not JSON.
  assert.equal(await webhook(null, { body: '{"event": "charge.success", "data":' }), 400);
  // Signed events that are not a successful charge, or name no gift of ours.
  assert.equal(await webhook({ event: 'transfer.success', data: { reference: id } }), 200);
  assert.equal(await webhook({ event: 'charge.success', data: {} }), 200);
  assert.equal(await webhook(charged(randomUUID())), 200);
  assert.equal(await webhook(charged('../../transaction/totals')), 200);
  assert.deepEqual(paystack.verified, [], 'none of those asked Paystack anything');
  assert.equal((await gift(id)).status, 'PENDING');

  // The real thing. Only the reference is taken from the event: what Paystack
  // says when asked is what counts, not the amount the event claims.
  assert.equal(await webhook(charged(id, { amount: 1, currency: 'USD' })), 200);
  assert.deepEqual(paystack.verified, [id]);
  assert.equal((await gift(id)).status, 'COMPLETED');
  const [payment] = await payments();
  assert.equal(payment.amount, 150);
  assert.equal(hubtel.requests.length, 1);

  // Paystack sends every webhook from a few addresses: none of them is limited.
  const ip = '52.31.139.75';
  const statuses = [];
  for (let i = 0; i < 25; i++) statuses.push(await webhook(charged(id), { ip }));
  assert.deepEqual(new Set(statuses), new Set([200]));
  assert.equal((await payments()).length, 1);
  assert.equal(hubtel.requests.length, 1);
});

test('when Paystack cannot be reached the webhook asks to be retried and the page asks the giver to try again', async () => {
  await addTither(KOFI);
  const id = await startGift();
  paid(id);
  paystack.down = true;

  assert.equal(await webhook(charged(id)), 500);
  const res = await verify(id);
  assert.equal(res.status, 502);
  assert.deepEqual(res.body, { message: "We couldn't confirm your payment just now. Please try again in a moment." });
  assert.equal((await gift(id)).status, 'PENDING');

  paystack.down = false;
  assert.equal(await webhook(charged(id)), 200);
  assert.equal((await gift(id)).titheStatus, 'RECORDED');
});

test('Paystack rate-limiting the check is not "no such payment": the webhook asks to be retried', async () => {
  // Only 400/404 mean Paystack has no transaction. A 429 (or 401/403) says
  // nothing about the payment, and answering 200 would leave a paid gift
  // pending for good once the giver has closed the page.
  await addTither(KOFI);
  const id = await startGift();
  paid(id);

  for (const status of [429, 401, 403]) {
    paystack.failWith = status;
    assert.equal(await webhook(charged(id)), 500, `Paystack ${status}`);
    assert.equal((await verify(id)).status, 502, `Paystack ${status}`);
    assert.equal((await gift(id)).status, 'PENDING');
  }

  paystack.failWith = null;
  assert.equal(await webhook(charged(id)), 200);
  assert.equal((await gift(id)).titheStatus, 'RECORDED');
  assert.equal((await payments()).length, 1);
});

// ─── What Paystack says ───────────────────────────────────────────────────────

test('a payment for less than the gift, in another currency or under another reference stays pending; fees on top still complete', async () => {
  await addTither(KOFI);

  const short = await startGift();
  for (const data of [{ amount: 14999 }, { currency: 'USD' }, { reference: randomUUID() }, { amount: 15200, requested_amount: 14900 }]) {
    paid(short, 15000, data);
    const res = await verify(short);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'PENDING', JSON.stringify(data));
    assert.equal(res.body.stage, 'mismatch', JSON.stringify(data));
  }
  const left = await gift(short);
  assert.equal(left.status, 'PENDING');
  assert.equal(left.titheStatus, null);
  assert.equal((await payments()).length, 0);
  assert.equal(hubtel.requests.length, 0);

  // Paystack's fee passed on to the giver: more was charged than was asked.
  const fees = await startGift();
  paid(fees, 15300, { requested_amount: 15000 });
  const res = await verify(fees);
  assert.equal(res.body.status, 'COMPLETED');
  assert.equal(res.body.tithe.recorded, true);
  assert.equal((await payments())[0].amount, 150, 'the gift, not the fee');
});

test('an unfinished payment stays pending with its stage; a failed one can still complete later', async () => {
  await addTither(KOFI);
  const id = await startGift();

  // Paystack has never heard of it — a giver who closed the checkout at once.
  const unknown = await verify(id);
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.status, 'PENDING');
  assert.equal('stage' in unknown.body, false);

  for (const stage of ['ongoing', 'send_otp', 'abandoned']) {
    paid(id, 15000, { status: stage });
    const res = await verify(id);
    assert.equal(res.body.status, 'PENDING');
    assert.equal(res.body.stage, stage);
  }
  assert.equal((await gift(id)).status, 'PENDING');

  paid(id, 15000, { status: 'failed' });
  assert.equal((await verify(id)).body.status, 'FAILED');
  assert.equal((await gift(id)).status, 'FAILED');

  // The giver tried again on the same checkout and it went through.
  paid(id);
  assert.equal(await webhook(charged(id)), 200);
  const row = await gift(id);
  assert.equal(row.status, 'COMPLETED');
  assert.equal(row.titheStatus, 'RECORDED');
  assert.equal((await payments()).length, 1);
  assert.equal(hubtel.requests.length, 1);
});

test('an unknown or malformed reference is 404 without asking Paystack', async () => {
  for (const ref of [randomUUID(), 'not-a-gift', '..%2F..%2Ftransaction%2Ftotals', encodeURIComponent(' ')]) {
    const res = await verify(ref);
    assert.equal(res.status, 404, ref);
    assert.deepEqual(res.body, { message: 'We could not find that payment.' }, ref);
  }
  assert.deepEqual(paystack.verified, []);
});

test('gifts that are not online tithes are settled without touching the register', async () => {
  await addTither(KOFI);

  // A tithe started before this change: no month, so it is left alone.
  const old = await prisma.givingRecord.create({
    data: { email: 'kofi@example.com', amount: 150, category: 'TITHE', method: 'MTN_MOMO', titheNumber: 'HPC021', phone: '0244123456' },
  });
  // A partner's monthly gift.
  const partner = await prisma.givingRecord.create({
    data: { name: 'Ama Owusu', phone: '0201234567', amount: 200, category: 'PASTORAL', method: 'MTN_MOMO', source: 'PARTNER' },
  });
  // An offering from the Give page.
  const offering = (await give({ ...TITHE, category: 'OFFERING' })).body.reference;

  paid(old.id);
  paid(partner.id, 20000);
  paid(offering);
  for (const [id, source, category] of [[old.id, 'GIVING', 'TITHE'], [partner.id, 'PARTNER', 'PASTORAL'], [offering, 'GIVING', 'OFFERING']]) {
    const res = await verify(id);
    assert.equal(res.body.status, 'COMPLETED', id);
    assert.equal(res.body.source, source);
    assert.equal(res.body.category, category);
    assert.equal(res.body.tithe, null);
    const row = await gift(id);
    assert.equal(row.titheStatus, null);
    assert.equal(row.paidAt.toISOString(), PAID_AT);
  }
  assert.equal((await payments()).length, 0);
  assert.equal(hubtel.requests.length, 0);
  assert.equal(await waiting(), 0);
  for (const status of ['NEEDS_MATCH', 'RECORDED', 'DISMISSED']) assert.equal((await listed(`?status=${status}`)).total, 0);
});

// ─── The office's part ────────────────────────────────────────────────────────

/** A tithe paid with no number, now waiting for the office. */
async function waitingGift(extra = {}) {
  const id = await startGift({ titheNumber: undefined, ...extra });
  paid(id);
  assert.equal((await verify(id)).body.tithe.recorded, false);
  return id;
}

test("once the office has added it, the giver's page says the number and month actually recorded", async () => {
  // The giver typed HPC099 for this month; the office put it on HPC021 for
  // last month. Revisiting the thank-you page must not repeat the typo.
  const kofi = await addTither(KOFI);
  const id   = await waitingGift({ titheNumber: 'HPC099' });
  const res  = await admin('POST', `/admin/tithes/online/${id}/assign`, { titherId: kofi.id, month: LAST_MONTH, sendSms: false });
  assert.equal(res.status, 201, JSON.stringify(res.body));

  const page = await verify(id);
  assert.equal(page.status, 200);
  assert.deepEqual(page.body.tithe, { month: LAST_MONTH, number: 'HPC021', recorded: true });
});

test('the giving export cannot carry a formula typed on the public site into a spreadsheet', async () => {
  const id = await startGift({ titheNumber: undefined, name: '=HYPERLINK("http://x","Click")' });
  paid(id);
  await verify(id);
  const res = await fetch(`${server.base}/admin/giving/export`, { headers: { authorization: `Bearer ${superAdmin}` } });
  assert.equal(res.status, 200);
  const csv = await res.text();
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"",""Click"")"`), csv.split('\n')[1]);
});

test('the office adds a waiting tithe to an account: the amount and date from the gift, the month its own', async () => {
  const kofi = await addTither(KOFI);
  const id   = await waitingGift();
  const month = addMonths(THIS_MONTH, -2);

  const res = await admin('POST', `/admin/tithes/online/${id}/assign`, { titherId: kofi.id, month });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { payment, sms } = res.body;
  assert.equal(payment.titherId, kofi.id);
  assert.equal(payment.amount, 150);
  assert.equal(payment.paidOn, PAID_ON);
  assert.equal(payment.month, month);
  assert.equal(payment.recordedBy, 'Efua Asante');
  assert.equal(payment.note, 'Paid online (MTN MoMo) from 024 412 3456');
  assert.equal(payment.givingRecordId, id);
  assert.deepEqual(payment.online, { giftId: id, method: 'MTN_MOMO', name: 'Kofi Mensah', phone: '024 412 3456', paidAt: PAID_AT });
  assert.equal('givingRecord' in payment, false);
  assert.equal(sms.status, 'SENT');
  assert.equal(sms.text, ackText('Kofi Mensah', 'HPC021', 'GHS 150.00', month));
  assert.deepEqual(hubtel.requests.map((r) => r.To), ['233244123456']);

  assert.equal((await gift(id)).titheStatus, 'RECORDED');
  assert.equal(await waiting(), 0);
  // The giver checking again now hears it is on the register.
  assert.equal((await verify(id)).body.tithe.recorded, true);

  // A second click, or a second admin, finds it done.
  const again = await admin('POST', `/admin/tithes/online/${id}/assign`, { titherId: kofi.id, month });
  assert.equal(again.status, 409);
  assert.equal(again.body.message, 'This online tithe has already been added to the register.');
  assert.equal((await payments()).length, 1);

  const added = await listed('?status=RECORDED');
  assert.equal(added.gifts[0].payment.id, payment.id);
  assert.equal(added.gifts[0].payment.tither.id, kofi.id);
  assert.equal(added.gifts[0].issue, 'NO_NUMBER', 'kept for context');
});

test('adding to an archived, missing or wrong account is refused; switching the text off is honoured', async () => {
  const kofi     = await addTither(KOFI);
  const archived = await addTither({ number: 'HPC030', name: 'Esi Owusu' });
  await prisma.tither.update({ where: { id: archived.id }, data: { isActive: false } });
  const id = await waitingGift();
  const assign = (body, giftId = id) => admin('POST', `/admin/tithes/online/${giftId}/assign`, { month: LAST_MONTH, ...body });

  const toArchived = await assign({ titherId: archived.id });
  assert.equal(toArchived.status, 409);
  assert.equal(toArchived.body.message, "Esi Owusu's account is archived. Restore it first, then record the payment.");
  assert.equal((await assign({ titherId: randomUUID() })).status, 404);
  assert.equal((await assign({ titherId: kofi.id }, randomUUID())).status, 404);
  assert.equal((await assign({ titherId: kofi.id }, 'not-a-gift')).status, 404);
  assert.equal((await assign({ titherId: kofi.id, month: '2026-13' })).status, 400);
  assert.equal((await assign({ month: LAST_MONTH })).status, 400);

  // A gift that is not an online tithe cannot be put on the register this way.
  const offering = (await give({ ...TITHE, category: 'OFFERING' })).body.reference;
  paid(offering);
  await verify(offering);
  assert.equal((await assign({ titherId: kofi.id }, offering)).status, 409);

  assert.equal((await payments()).length, 0);
  assert.equal(await waiting(), 1);

  const quiet = await assign({ titherId: kofi.id, note: 'Kofi at the 9am service', sendSms: false });
  assert.equal(quiet.status, 201, JSON.stringify(quiet.body));
  assert.equal(quiet.body.payment.note, 'Kofi at the 9am service');
  assert.equal(quiet.body.payment.smsStatus, 'SKIPPED');
  assert.equal(quiet.body.payment.smsError, 'Switched off for this payment.');
  assert.equal(hubtel.requests.length, 0);
});

test("an account without a phone, added by the office, is texted on the giver's phone", async () => {
  const yaw = await addTither({ number: 'HPC023', name: 'Yaw Boateng' });
  const id  = await waitingGift({ phone: '055 111 2222' });
  const res = await admin('POST', `/admin/tithes/online/${id}/assign`, { titherId: yaw.id, month: LAST_MONTH });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.payment.note, 'Paid online (MTN MoMo) from 055 111 2222 — not a number on this account');
  assert.deepEqual(res.body.sms.to, ['055 111 2222']);
  assert.deepEqual(hubtel.requests.map((r) => r.To), ['233551112222']);
});

test('dismissing needs a reason, takes the tithe off the count, and can be undone', async () => {
  const kofi = await addTither(KOFI);
  const id   = await waitingGift();
  const dismiss = (body) => admin('POST', `/admin/tithes/online/${id}/dismiss`, body);
  const restore = () => admin('POST', `/admin/tithes/online/${id}/restore`);

  for (const body of [{}, { note: '' }, { note: '   ' }, { note: 'x'.repeat(301) }]) {
    const res = await dismiss(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(res.body.message);
  }
  assert.equal(await waiting(), 1);

  const res = await dismiss({ note: '  Duplicate ' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.gift.id, id);
  assert.equal(res.body.gift.titheStatus, 'DISMISSED');
  assert.equal(res.body.gift.titheNote, 'Duplicate');
  assert.equal(res.body.gift.titheReviewedBy, 'Efua Asante');
  assert.equal(await waiting(), 0);
  assert.deepEqual((await listed('?status=DISMISSED')).gifts.map((g) => g.id), [id]);
  // The gift itself stays: the money was received.
  assert.equal((await gift(id)).status, 'COMPLETED');

  const twice = await dismiss({ note: 'Duplicate' });
  assert.equal(twice.status, 409);
  assert.equal(twice.body.message, 'This online tithe has already been dismissed.');
  const assign = await admin('POST', `/admin/tithes/online/${id}/assign`, { titherId: kofi.id, month: LAST_MONTH });
  assert.equal(assign.status, 409);
  assert.equal(assign.body.message, 'This online tithe was dismissed. Restore it first.');

  const back = await restore();
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(back.body.gift.titheStatus, 'NEEDS_MATCH');
  assert.equal(back.body.gift.titheNote, null);
  assert.equal(await waiting(), 1);
  assert.equal((await restore()).status, 409);

  assert.equal((await admin('POST', `/admin/tithes/online/${randomUUID()}/dismiss`, { note: 'Duplicate' })).status, 404);
  assert.equal((await admin('POST', '/admin/tithes/online/not-a-gift/restore')).status, 404);
});

test("an online payment's amount and date cannot be edited, and deleting it sends it back to Online tithes", async () => {
  const kofi = await addTither(KOFI);
  const id   = await startGift();
  paid(id);
  await verify(id);
  const [payment] = await payments();
  const edit = (body) => admin('PUT', `/admin/tithes/payments/${payment.id}`, { amount: 150, month: LAST_MONTH, paidOn: PAID_ON, ...body });

  const locked = 'The amount and date of an online tithe come from the payment itself. Delete it to send it back to Online tithes.';
  for (const body of [{ amount: 200 }, { amount: 150.01 }, { paidOn: '2026-01-01' }]) {
    const res = await edit(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.message, locked);
  }
  // The month and the note are the office's.
  const moved = await edit({ amount: '150.00', month: THIS_MONTH, note: 'Meant for this month' });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.payment.month, THIS_MONTH);
  assert.equal(moved.body.payment.note, 'Meant for this month');
  assert.equal(moved.body.payment.amount, 150);
  assert.equal(moved.body.payment.online.giftId, id);

  const removed = await admin('DELETE', `/admin/tithes/payments/${payment.id}`);
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.deepEqual(removed.body, { ok: true, returnedToQueue: true });
  assert.equal((await payments()).length, 0);
  const row = await gift(id);
  assert.equal(row.status, 'COMPLETED');
  assert.equal(row.titheStatus, 'NEEDS_MATCH');
  assert.equal(await waiting(), 1);
  const { gifts } = await listed();
  assert.equal(gifts[0].issue, 'NOW_ON_REGISTER');
  assert.equal(gifts[0].holder.id, kofi.id);

  // An office payment still deletes as before.
  const office = await admin('POST', '/admin/tithes/payments', { titherId: kofi.id, amount: 50, month: LAST_MONTH, paidOn: PAID_ON, sendSms: false });
  assert.equal(office.status, 201);
  assert.deepEqual((await admin('DELETE', `/admin/tithes/payments/${office.body.payment.id}`)).body, { ok: true });
  assert.equal(office.body.payment.online, null);
});

// ─── Who may, and how often ───────────────────────────────────────────────────

test('only super admins can see or act on online tithes; without a token they are 401', async () => {
  const id = randomUUID();
  const routes = [
    ['GET',  '/admin/tithes/online/count'],
    ['GET',  '/admin/tithes/online'],
    ['POST', `/admin/tithes/online/${id}/assign`, { titherId: id, month: LAST_MONTH }],
    ['POST', `/admin/tithes/online/${id}/dismiss`, { note: 'Duplicate' }],
    ['POST', `/admin/tithes/online/${id}/restore`],
  ];
  for (const [method, url, body] of routes) {
    assert.equal((await server.call(method, url, body)).status, 401, `${method} ${url} without a token`);
    for (const token of [editor, mediaManager, hod]) {
      assert.equal((await admin(method, url, body, token)).status, 403, `${method} ${url}`);
    }
  }
  assert.equal((await admin('GET', '/admin/tithes/online/count')).status, 200);
});

test('starting gifts is limited to 20 per visitor; checking one has its own, looser limit', async () => {
  const ip = '198.51.100.20';
  const starts = [];
  for (let i = 0; i < 21; i++) starts.push((await server.call('POST', '/give', { ...TITHE, phone: undefined }, { ip })).status);
  assert.deepEqual(starts.slice(0, 20), Array(20).fill(400));
  assert.equal(starts[20], 429);

  // The same visitor can still check a payment: a separate counter.
  const checks = [];
  for (let i = 0; i < 61; i++) checks.push((await server.call('GET', `/give/verify/${randomUUID()}`, undefined, { ip })).status);
  assert.deepEqual(checks.slice(0, 60), Array(60).fill(404));
  assert.equal(checks[60], 429);
});
