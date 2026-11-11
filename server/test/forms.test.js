/**
 * The public forms: what stops them being used to book fake appointments,
 * to message strangers from the church's domain, or to slip markup into the
 * emails the office and visitors receive — plus the password rules.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');

const { loadApp, startServer, tokenFor } = require('./helpers');

// First, before anything under server/src: the Prisma client reads
// DATABASE_URL once, when it is created.
const { app, prisma } = loadApp('forms');

const axios = require('axios');
const email = require('../src/services/email');
const { policy, evaluatePassword, firstProblem } = require('../src/lib/passwordPolicy');

let server;
let admin;

// Every test gets its own visitor address, so the form limit (20 POSTs per
// visitor, shared across the forms) only trips in the test that is about it.
let lastIp = 0;
const nextIp = () => `203.0.113.${++lastIp}`;

// ─── Dates, worked out the way the booking code works them out ──────────────
//
// GET /slots and isOfferedSlot both build the horizon from local midnight plus
// 1..21 days, label each day with toISOString().slice(0, 10), and take its
// weekday from the local date. Doing the same here keeps these dates valid in
// whatever timezone the server runs in.
const DAYS_AHEAD = 21; // routes/appointments.js

function horizon() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 1; i <= DAYS_AHEAD; i++) {
    const day = new Date(start); day.setDate(day.getDate() + i);
    days.push({ ymd: day.toISOString().slice(0, 10), weekday: day.getDay() });
  }
  return days;
}

const HORIZON = horizon();
const DAYS    = HORIZON.map((d) => d.ymd);
// The weekday whose availability windows apply to a day in the horizon.
const offeredWeekday = (ymd) => HORIZON.find((d) => d.ymd === ymd).weekday;
// Any date string's weekday, for checking that shifting a date by whole weeks
// keeps it on the same day.
const weekdayOf = (ymd) => new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
const addDays   = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00.000Z`) + n * 86400000).toISOString().slice(0, 10);

// The day after tomorrow rather than tomorrow, so a run that straddles
// midnight still finds it inside the horizon.
const OPEN   = DAYS[1];
// A different weekday in the horizon, whose only window is switched off.
const CLOSED = DAYS.find((d) => offeredWeekday(d) !== offeredWeekday(OPEN));

const booking = (fields = {}) => ({
  name:   'Ama Mensah',
  email:  'ama@example.com',
  phone:  '0241234567',
  date:   OPEN,
  time:   '09:00',
  reason: 'Counselling',
  ...fields,
});

const bookingsAt = (date, time) =>
  prisma.appointment.count({ where: { date: new Date(`${date}T00:00:00.000Z`), time } });

test.before(async () => {
  server = await startServer(app);
  admin = await prisma.adminUser.create({
    data: { name: 'Office', email: 'office-admin@example.com', passwordHash: 'not-used', role: 'SUPER_ADMIN' },
  });
  // 09:00–12:00 in 30-minute slots: 09:00, 09:30 … 11:30.
  await prisma.appointmentAvailability.createMany({
    data: [
      { dayOfWeek: offeredWeekday(OPEN),   startTime: '09:00', endTime: '12:00', slotMinutes: 30 },
      { dayOfWeek: offeredWeekday(CLOSED), startTime: '09:00', endTime: '12:00', slotMinutes: 30, isActive: false },
    ],
  });
});

test.after(async () => {
  await server?.close();
  await prisma.$disconnect();
});

// ─── 1. Appointment booking ───────────────────────────────────────────────────

test('a slot the booking page offers can be booked', async () => {
  // GET /slots and the booking check must agree on which days and times are
  // open; when they worked out the weekday differently, slots the page showed
  // were refused on servers east of UTC.
  const listed = await server.call('GET', '/appointments/slots');
  assert.equal(listed.status, 200);
  const day = listed.body.days.find((d) => d.date === OPEN);
  assert.ok(day, `GET /slots should list ${OPEN}`);
  assert.ok(!listed.body.days.some((d) => d.date === CLOSED), 'a day whose window is switched off is not listed');

  const time = day.slots[day.slots.length - 1];
  const res = await server.call('POST', '/appointments', booking({ time }), { ip: nextIp() });
  assert.equal(res.status, 201, JSON.stringify(res.body));
});

test('an offered slot can be booked', async () => {
  const res = await server.call('POST', '/appointments', booking({ time: '09:30' }), { ip: nextIp() });
  assert.equal(res.status, 201, res.body.message);
  assert.ok(res.body.id);

  const saved = await prisma.appointment.findUnique({ where: { id: res.body.id } });
  assert.equal(saved.date.toISOString(), `${OPEN}T00:00:00.000Z`);
  assert.equal(saved.time, '09:30');
});

test('the same slot cannot be booked twice', async () => {
  // The unique index on (date, time) is what stops a double booking, and a
  // second request for a taken slot is told so rather than given a 500.
  const ip = nextIp();
  const first = await server.call('POST', '/appointments', booking({ time: '10:00' }), { ip });
  assert.equal(first.status, 201, first.body.message);

  const second = await server.call('POST', '/appointments', booking({ time: '10:00', name: 'Kofi Boateng' }), { ip });
  assert.equal(second.status, 409);
  assert.match(second.body.message, /just taken/);
  assert.equal(await bookingsAt(OPEN, '10:00'), 1);
});

test('times that are not on the slot grid are refused', async () => {
  // Without isOfferedSlot the time is whatever the request says, so a script
  // could create endless distinct bookings, each one emailing and texting the
  // contact details it supplied.
  const ip = nextIp();
  for (const [time, why] of [
    ['09:15', 'between two slots'],
    ['12:00', 'would run past the end of the window'],
    ['13:00', 'after the window'],
    ['08:30', 'before the window opens'],
  ]) {
    const res = await server.call('POST', '/appointments', booking({ time }), { ip });
    assert.equal(res.status, 409, `${time} (${why}) should be refused`);
    assert.match(res.body.message, /not available/);
    assert.equal(await bookingsAt(OPEN, time), 0);
  }
});

test('dates outside the booking horizon are refused', async () => {
  // Each date falls on the open weekday, so only the horizon can refuse it.
  const ip = nextIp();
  for (const [date, why] of [
    [addDays(OPEN, 28), 'beyond the three-week horizon'],
    [addDays(OPEN, -7), 'in the past'],
  ]) {
    assert.equal(weekdayOf(date), weekdayOf(OPEN));
    const res = await server.call('POST', '/appointments', booking({ date }), { ip });
    assert.equal(res.status, 409, `${date} (${why}) should be refused`);
    assert.match(res.body.message, /not available/);
    assert.equal(await bookingsAt(date, '09:00'), 0);
  }
});

test('a weekday whose window is switched off takes no bookings', async () => {
  const res = await server.call('POST', '/appointments', booking({ date: CLOSED }), { ip: nextIp() });
  assert.equal(res.status, 409);
  assert.equal(await bookingsAt(CLOSED, '09:00'), 0);
});

test('free-text dates and times are rejected before anything else runs', async () => {
  const ip = nextIp();
  for (const [field, value] of [
    ['date', 'next Tuesday'],
    ['date', `${OPEN}T09:00:00Z`],
    ['time', 'morning'],
    ['time', '9am'],
  ]) {
    const res = await server.call('POST', '/appointments', booking({ [field]: value }), { ip });
    assert.equal(res.status, 400, `${field} "${value}" should be rejected`);
    assert.ok(res.body.errors?.[field], `the complaint should be about ${field}`);
  }
});

test('an over-long name is rejected', async () => {
  // The name goes into the confirmation email and SMS, so it is kept to a name.
  const res = await server.call('POST', '/appointments', booking({ name: 'x'.repeat(101), time: '11:00' }), { ip: nextIp() });
  assert.equal(res.status, 400);
  assert.ok(res.body.errors?.name);
  assert.equal(await bookingsAt(OPEN, '11:00'), 0);
});

// ─── 2. Rate limiting on the public forms ────────────────────────────────────

// Bodies the forms reject (or, for forgot-password, quietly ignore), so the
// test creates nothing and sends nothing — the limiter counts them anyway.
const FORMS = [
  ['/contact/message',           400],
  ['/prayer',                    400],
  ['/appointments',              400],
  ['/partner/apply',             400],
  ['/events/no-such-event/rsvp', 400],
  ['/auth/forgot-password',      200],
];

test('one visitor gets 20 form submissions per window, counted across every form', async () => {
  // These forms email and text whatever address and number they are given;
  // without a cap a script could message anyone from the church's domain.
  const ip = nextIp();
  for (let i = 0; i < 20; i++) {
    const [path, expected] = FORMS[i % FORMS.length];
    const res = await server.call('POST', path, {}, { ip });
    assert.equal(res.status, expected, `submission ${i + 1} to ${path} should be let through`);
  }

  // The 21st is refused on every form, not only the ones used most: the
  // counter is shared, so spreading a run across forms does not get round it.
  for (const [path] of FORMS) {
    const res = await server.call('POST', path, {}, { ip });
    assert.equal(res.status, 429, `${path} should be limited`);
    assert.match(res.body.message, /Too many requests/);
  }

  // Counted per visitor: someone else is not held up by it.
  const other = await server.call('POST', '/prayer', {}, { ip: nextIp() });
  assert.equal(other.status, 400);

  // POST only: the admin listings on the same paths still answer the office,
  // even from the address that hit the limit.
  const token = tokenFor(admin);
  for (const path of ['/prayer', '/appointments']) {
    const res = await server.call('GET', path, undefined, { ip, token });
    assert.equal(res.status, 200, `GET ${path} should not be form-limited`);
  }

  // Its own counter: filling in forms does not use up sign-in attempts.
  const login = await server.call('POST', '/auth/login', {}, { ip });
  assert.notEqual(login.status, 429);
});

// ─── 3. Email templates escape what visitors typed ───────────────────────────

// A link and a script in every field a visitor fills in. Each field is tagged
// so a template that forgets to escape just one of them is caught.
const markup  = (field) => `<a href="https://evil.example">${field}</a><script>alert('${field}')</script>`;
const escaped = (field) =>
  `&lt;a href=&quot;https://evil.example&quot;&gt;${field}&lt;/a&gt;&lt;script&gt;alert(&#39;${field}&#39;)&lt;/script&gt;`;

test('email templates escape markup in visitor input', async (t) => {
  // Resend, with axios stubbed, so the html each template builds can be read.
  // email.js picks the transport per call and uses this same axios module.
  const realPost = axios.post;
  const sent = [];
  process.env.RESEND_API_KEY = 're_test';
  axios.post = async (url, body) => { sent.push({ url, body }); return { data: { id: 'x' } }; };
  t.after(() => {
    axios.post = realPost;
    delete process.env.RESEND_API_KEY;
  });

  const to = 'visitor@example.com';
  const cases = [
    ['sendAppointmentConfirmation', ['name', 'reason'],
      () => email.sendAppointmentConfirmation(to, markup('name'), 'Friday, 13 November 2026 at 09:00 GMT', markup('reason'))],
    ['sendPrayerConfirmation', ['name'],
      () => email.sendPrayerConfirmation(to, markup('name'))],
    ['notifyPrayerRequest', ['category', 'name', 'phone', 'request'],
      () => email.notifyPrayerRequest({
        category: markup('category'), name: markup('name'), phone: markup('phone'),
        request: markup('request'), wantsCall: true,
      })],
    ['notifyOffice', ['name', 'email', 'phone', 'type', 'message'],
      () => email.notifyOffice({
        name: markup('name'), email: markup('email'), phone: markup('phone'),
        type: markup('type'), message: markup('message'),
      })],
    ['sendAutoReply', ['name'],
      () => email.sendAutoReply(to, markup('name'))],
    ['sendPartnerApplicationConfirmation', ['firstName'],
      () => email.sendPartnerApplicationConfirmation(to, markup('firstName'))],
  ];

  for (const [name, fields, send] of cases) {
    await t.test(name, async () => {
      sent.length = 0;
      await send();
      assert.equal(sent.length, 1, 'one message through Resend');
      const { html } = sent[0].body;
      for (const field of fields) {
        assert.ok(html.includes(escaped(field)), `${field} should appear escaped`);
      }
      assert.doesNotMatch(html, /<script|<a[\s>]|href="https:\/\/evil/i);
    });
  }
});

// ─── 4. Password policy ───────────────────────────────────────────────────────

const failedIds = (password) => evaluatePassword(password).failed.map((r) => r.id);

test('the server checks passwords against the shared rules file', () => {
  // The client draws its live checklist from the same file; one copy is what
  // keeps the two from drifting apart.
  assert.equal(policy, require('../../shared/passwordPolicy.json'));
});

test('a strong password passes', () => {
  const result = evaluatePassword('Hope-Press7');
  assert.equal(result.ok, true);
  assert.deepEqual(result.failed, []);
  assert.equal(firstProblem('Hope-Press7'), null);
});

test('each password rule fails on its own', async (t) => {
  // Every password breaks exactly one rule, so each rule has to be doing the
  // refusing itself.
  const cases = [
    ['length',      'Hop-Pre7s'],
    ['lowercase',   'HOPE-PRESS7'],
    ['uppercase',   'hope-press7'],
    ['number',      'Hope-Press!'],
    ['symbol',      'HopePress77'],
    ['notRepeated', 'Aa1!Aa1!Aa1!'],
  ];
  assert.deepEqual(cases.map(([id]) => id).sort(), policy.rules.map((r) => r.id).sort(), 'a case for every rule');

  for (const [id, password] of cases) {
    await t.test(id, () => {
      const result = evaluatePassword(password);
      assert.equal(result.ok, false);
      assert.deepEqual(failedIds(password), [id]);
      assert.equal(firstProblem(password), policy.rules.find((r) => r.id === id).label);
    });
  }
});

test('a password over the maximum length is refused', () => {
  // The upper limit is in the same file as the rules, and holds at exactly
  // maxLength: the longest allowed password still passes.
  const longest = 'Hope-Press7' + 'x'.repeat(policy.maxLength - 'Hope-Press7'.length);
  assert.equal(longest.length, policy.maxLength);
  assert.equal(evaluatePassword(longest).ok, true);

  const tooLong = longest + 'x';
  assert.equal(evaluatePassword(tooLong).ok, false);
  assert.equal(firstProblem(tooLong), `Password must be at most ${policy.maxLength} characters`);
});

test('a missing password fails', () => {
  for (const value of ['', undefined, null, 12345678901]) {
    assert.equal(evaluatePassword(value).ok, false);
    assert.equal(firstProblem(value), 'Enter a password');
  }
});
