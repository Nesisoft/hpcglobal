/**
 * Part 3: leave, the head of department's registers and marking, and the
 * report numbers — expected, attended, excused, absent and the rate — on a
 * fixed set of services, so every count can be checked by hand.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, startServer, makeWorker, makeDepartment, signIn } = require('./helpers');

let api, prisma;
let choir, media, hod, m1, m2, m3, other, admin, newcomer;
let hodToken, m1Token, m3Token, otherHodToken, adminToken;
let otherHod;
const S = {};   // sessions by name

const { todayKey, addDays, at, dateOnly } = require('../src/lib/time');
const { esc, toCsv } = require('../src/lib/csv');
const { parsePeriod, weekOf } = require('../src/lib/reports');

const today = todayKey();
const day = (n) => addDays(today, n);   // day(-3): three days ago

const as = (token) => ({
  get:  (url) => api.call('GET', url, undefined, { token }),
  post: (url, body) => api.call('POST', url, body ?? {}, { token }),
});

async function service(name, expected = true) {
  return prisma.service.create({
    data: { name, recurrence: 'NONE', active: true, startTime: '07:30', endTime: '09:30', expected },
  });
}
const sessionOn = (svc, key, fields = {}) => prisma.serviceSession.create({
  data:    { serviceId: svc.id, date: dateOnly(key), startsAt: at(key, '07:30'), endsAt: at(key, '09:30'), custom: true, ...fields },
  include: { service: true },
});
const attend = (worker, session, fields = {}) => prisma.attendance.create({
  data: {
    workerId: worker.id, sessionId: session.id, method: 'GPS', clockInAt: session.startsAt, status: 'ON_TIME',
    clockOutAt: session.endsAt, minutesPresent: 120, ...fields,
  },
});

test.before(async () => {
  const loaded = loadApp('reports');
  prisma = loaded.prisma;
  api = await startServer(loaded.app);

  choir = await makeDepartment(prisma, 'Choir');
  media = await makeDepartment(prisma, 'Media');
  hod = await makeWorker(prisma, { departmentId: choir.id, isHod: true, firstName: 'Hannah' });
  m1 = await makeWorker(prisma, { departmentId: choir.id, firstName: 'Ama' });
  m2 = await makeWorker(prisma, { departmentId: choir.id, firstName: 'Bea' });
  m3 = await makeWorker(prisma, { departmentId: choir.id, firstName: 'Cee' });
  other = await makeWorker(prisma, { departmentId: media.id, firstName: 'Dan' });
  otherHod = await makeWorker(prisma, { departmentId: media.id, isHod: true, firstName: 'Eve' });
  admin = await makeWorker(prisma, { role: 'ADMIN', firstName: 'Fred' });
  // Everyone approved a month ago, except a newcomer approved five days ago.
  await prisma.worker.updateMany({ data: { approvedAt: new Date(`${day(-30)}T12:00:00Z`) } });
  newcomer = await makeWorker(prisma, { departmentId: choir.id, firstName: 'Gina' });
  await prisma.worker.update({ where: { id: newcomer.id }, data: { approvedAt: new Date(`${day(-5)}T12:00:00Z`) } });
  // Someone still waiting for approval isn't counted at all.
  await makeWorker(prisma, { departmentId: choir.id, status: 'PENDING', firstName: 'Hope' });

  [hodToken, m1Token, m3Token, otherHodToken, adminToken] = await Promise.all(
    [hod, m1, m3, otherHod, admin].map((w) => signIn(api.call, w.email)),
  );

  const sunday = await service('Test Sunday');
  const optional = await service('Optional Prayer', false);
  S.d10 = await sessionOn(sunday, day(-10));
  S.d7 = await sessionOn(sunday, day(-7));
  S.d5cancelled = await sessionOn(sunday, day(-5), { cancelled: true });
  S.d3 = await sessionOn(sunday, day(-3));
  S.opt = await sessionOn(optional, day(-7));
  S.old = await sessionOn(sunday, day(-20));

  // m1: every time — on time, late, very late.
  await attend(m1, S.d10);
  await attend(m1, S.d7, { status: 'LATE', lateMinutes: 20 });
  await attend(m1, S.d3, { status: 'VERY_LATE', lateMinutes: 45, clockOutAt: null, minutesPresent: null, autoClockedOut: true });
  // m2: once, leaving early.
  await attend(m2, S.d10, { leftEarlyMinutes: 20, minutesPresent: 100 });
  // m3: never, but on approved leave for the last two.
  await prisma.leaveRequest.create({
    data: { workerId: m3.id, type: 'TRAVEL', startDate: dateOnly(day(-8)), endDate: dateOnly(day(-2)), reason: 'Funeral in Kumasi', status: 'APPROVED' },
  });
  // ...and a rejected request, which excuses nothing.
  await prisma.leaveRequest.create({
    data: { workerId: m2.id, type: 'PERSONAL', startDate: dateOnly(day(-3)), endDate: dateOnly(day(-3)), reason: 'Busy', status: 'REJECTED' },
  });
  // the HOD: only the optional service. The Media worker: the Sunday.
  await attend(hod, S.opt);
  await attend(other, S.d3);
  // The newcomer came on day -3, the only Sunday since joining.
  await attend(newcomer, S.d3);
});
test.after(async () => { await api.close(); await prisma.$disconnect(); });

// ─── The numbers ──────────────────────────────────────────────────────────────

test('the department report: expected, attended, excused, absent and the rate, worker by worker', async () => {
  const res = await as(hodToken).get(`/hod/report?from=${day(-12)}&to=${day(-1)}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const r = res.body;
  assert.equal(r.sessions, 3, 'three Sundays: the cancelled one and the optional service don’t count');
  const row = (w) => r.rows.find((x) => x.worker.id === w.id);

  assert.deepEqual(
    (({ expected, attended, onTime, late, veryLate, excused, absent, noClockOut, rate }) => ({ expected, attended, onTime, late, veryLate, excused, absent, noClockOut, rate }))(row(m1)),
    { expected: 3, attended: 3, onTime: 1, late: 1, veryLate: 1, excused: 0, absent: 0, noClockOut: 1, rate: 100 },
  );
  assert.equal(row(m2).attended, 1);
  assert.equal(row(m2).leftEarly, 1);
  assert.equal(row(m2).absent, 2, 'rejected leave excuses nothing');
  assert.equal(row(m2).rate, 33.3);
  assert.equal(row(m3).excused, 2, 'approved leave covers two of the three');
  assert.equal(row(m3).absent, 1);
  assert.equal(row(m3).rate, 0);
  assert.equal(row(hod).expected, 3);
  assert.equal(row(hod).optional, 1, 'the optional service is shown on its own');
  assert.equal(row(hod).absent, 3);
  assert.equal(row(newcomer).expected, 1, 'only the Sundays since they were approved');
  assert.equal(row(newcomer).rate, 100);

  assert.equal(r.rows.length, 5, 'the five active Choir members — not Media, not the one still waiting');
  assert.ok(!r.rows.some((x) => x.worker.id === other.id));
  assert.equal(r.rows[0].rate, 0, 'lowest attendance first, so the HOD sees who to follow up');

  assert.deepEqual(
    (({ expected, attended, excused, absent, rate }) => ({ expected, attended, excused, absent, rate }))(r.totals),
    { expected: 13, attended: 5, excused: 2, absent: 6, rate: 45.5 },
  );
  assert.equal(r.weeks.reduce((n, w) => n + w.expected, 0), 13);
  assert.deepEqual(r.services.map((s) => [s.name, s.sessions]), [['Test Sunday', 3]]);
});

test('a period is checked: the end before the start, or longer than a year, is refused', async () => {
  assert.equal((await as(hodToken).get(`/hod/report?from=${day(-1)}&to=${day(-3)}`)).status, 400);
  assert.equal((await as(hodToken).get(`/hod/report?from=${day(-400)}&to=${day(-1)}`)).status, 400);
  assert.deepEqual(parsePeriod({}, new Date('2026-11-18T10:00:00Z')), { from: '2026-11-01', to: '2026-11-18' }, 'this month so far');
  assert.equal(weekOf('2026-11-18'), '2026-11-16', 'weeks start on Monday');
  assert.equal(weekOf('2026-11-15'), '2026-11-09', 'a Sunday belongs to the week before');
});

test('only a head of department gets the department tools', async () => {
  for (const url of ['/hod/report', '/hod/today', '/hod/sessions', '/hod/leave']) {
    assert.equal((await as(m1Token).get(url)).status, 403, url);
  }
});

test('the church-wide report: every active worker, by department and by service', async () => {
  const res = await as(adminToken).get(`/admin/report?from=${day(-12)}&to=${day(-1)}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const choirRow = res.body.departments.find((d) => d.name === 'Choir');
  assert.equal(choirRow.workers, 5);
  assert.equal(choirRow.attended, 5);
  assert.equal(choirRow.rate, 45.5);
  assert.equal(res.body.departments.find((d) => d.name === 'Media').attended, 1);
  const onlyMedia = await as(adminToken).get(`/admin/report?from=${day(-12)}&to=${day(-1)}&departmentId=${media.id}`);
  assert.deepEqual(onlyMedia.body.rows.map((r) => r.worker.id).sort(), [other.id, otherHod.id].sort());
  assert.equal((await as(hodToken).get('/admin/report')).status, 403, 'a HOD can’t see other departments');
});

test('CSV exports: a spreadsheet each, with formulas made harmless', async () => {
  const res = await fetch(`${api.base}/hod/report.csv?from=${day(-12)}&to=${day(-1)}`, { headers: { authorization: `Bearer ${hodToken}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /Choir-attendance-/);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'a BOM, so Excel reads it as UTF-8');
  const text = bytes.toString('utf8');
  assert.match(text, /^﻿"Name","Department","Expected"/);
  assert.match(text, /"Total \(/);
  for (const view of ['departments', 'services', 'workers']) {
    const r = await fetch(`${api.base}/admin/report.csv?view=${view}&from=${day(-12)}&to=${day(-1)}`, { headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(r.status, 200, view);
  }
  assert.equal(esc('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(esc('-5'), '"\'-5"');
  assert.equal(esc(12), '"12"');
  assert.equal(toCsv([['a', null]]), '﻿"a",""\r\n');
});

test('the admin dashboard: today, what’s waiting, and this month', async () => {
  const res = await as(adminToken).get('/admin/dashboard');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.workers, 8);
  assert.equal(res.body.waiting.approvals, 1);
  assert.ok(Array.isArray(res.body.today));
  assert.ok(Array.isArray(res.body.departments));
  assert.ok('rate' in res.body.month.totals);
});

// ─── Registers ────────────────────────────────────────────────────────────────

test('a date’s register for the department: present, excused, absent', async () => {
  const res = await as(hodToken).get(`/hod/sessions/${S.d3.id}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const state = Object.fromEntries(res.body.rows.map((r) => [r.worker.id, r.state]));
  assert.equal(state[m1.id], 'present');
  assert.equal(state[m3.id], 'excused');
  assert.equal(state[m2.id], 'absent');
  assert.equal(state[newcomer.id], 'present');
  assert.equal(state[other.id], undefined, 'another department’s people aren’t on it');
  assert.equal(res.body.counts.present, 2);

  const list = await as(hodToken).get(`/hod/sessions?from=${day(-12)}&to=${day(-1)}`);
  assert.equal(list.status, 200);
  const d3 = list.body.sessions.find((s) => s.id === S.d3.id);
  assert.equal(d3.present, 2, 'only the Choir’s clock-ins are counted');
  assert.equal(list.body.sessions.find((s) => s.id === S.d5cancelled.id).cancelled, true);
});

test('a HOD marks a member present by hand: with a reason, the time deciding late, and logged', async () => {
  const noReason = await as(hodToken).post(`/hod/sessions/${S.d3.id}/mark`, { workerId: m2.id, arrivedAt: '07:50' });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.field, 'reason');

  const res = await as(hodToken).post(`/hod/sessions/${S.d3.id}/mark`, { workerId: m2.id, arrivedAt: '07:50', reason: 'Phone battery died' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.attendance.method, 'MANUAL');
  assert.equal(res.body.attendance.status, 'LATE');
  assert.equal(res.body.attendance.lateMinutes, 20);
  assert.equal(res.body.attendance.markedByName, 'Hannah Worker');
  const logged = await prisma.auditLog.findFirst({ where: { action: 'attendance.mark' } });
  assert.match(logged.summary, /Phone battery died/);

  const again = await as(hodToken).post(`/hod/sessions/${S.d3.id}/mark`, { workerId: m2.id, arrivedAt: '07:40', reason: 'Twice' });
  assert.equal(again.status, 409);

  // The forgotten-clock-out sweep leaves a hand mark alone.
  await as(hodToken).get(`/hod/sessions/${S.d3.id}`);
  const record = await prisma.attendance.findUnique({ where: { id: res.body.attendance.id } });
  assert.equal(record.autoClockedOut, false);
});

test('marking by hand has limits: own department, the last 14 days, a time inside the service', async () => {
  const mark = (session, body) => as(hodToken).post(`/hod/sessions/${session.id}/mark`, { reason: 'Forgot phone', arrivedAt: '07:35', ...body });
  assert.equal((await mark(S.d10, { workerId: other.id })).status, 404, 'not in the Choir');
  assert.equal((await mark(S.old, { workerId: m2.id })).status, 400, 'twenty days ago');
  assert.equal((await mark(S.d5cancelled, { workerId: m2.id })).status, 400, 'cancelled');
  const late = await mark(S.d7, { workerId: m2.id, arrivedAt: '10:00' });
  assert.equal(late.status, 400);
  assert.equal(late.body.field, 'arrivedAt');
  const backwards = await mark(S.d7, { workerId: m2.id, leftAt: '07:30' });
  assert.equal(backwards.body.field, 'leftAt');
  const withLeaving = await mark(S.d7, { workerId: m2.id, leftAt: '09:00' });
  assert.equal(withLeaving.status, 201);
  assert.equal(withLeaving.body.attendance.minutesPresent, 85);
  assert.equal(withLeaving.body.attendance.leftEarlyMinutes, 30);
  // Another department's HOD can't mark the Choir.
  assert.equal((await as(otherHodToken).post(`/hod/sessions/${S.d10.id}/mark`, { workerId: m3.id, arrivedAt: '07:35', reason: 'x x x' })).status, 404);
});

test('a HOD removes their own mistaken marks, but not a real clock-in', async () => {
  const marked = await prisma.attendance.findFirst({ where: { workerId: m2.id, sessionId: S.d7.id } });
  const gps = await prisma.attendance.findFirst({ where: { workerId: m1.id, sessionId: S.d7.id } });
  assert.equal((await as(hodToken).post(`/hod/attendance/${gps.id}/remove`, { reason: 'Not real' })).status, 403);
  assert.equal((await as(otherHodToken).post(`/hod/attendance/${marked.id}/remove`, { reason: 'Mistake' })).status, 404);
  const res = await as(hodToken).post(`/hod/attendance/${marked.id}/remove`, { reason: 'Wrong person' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await prisma.attendance.count({ where: { id: marked.id } }), 0);
  const logged = await prisma.auditLog.findFirst({ where: { action: 'attendance.remove' } });
  assert.match(logged.summary, /Wrong person/);
  assert.equal(logged.details.method, 'MANUAL');
});

test('an administrator marks anyone and removes any record, with a reason', async () => {
  const reg = await as(adminToken).get(`/admin/sessions/${S.old.id}/register`);
  assert.equal(reg.status, 200);
  assert.equal(reg.body.rows.length, 7, 'every active worker approved by then — not the newcomer');
  const res = await as(adminToken).post(`/admin/sessions/${S.old.id}/attendance`, { workerId: other.id, arrivedAt: '07:30', reason: 'Signed the paper register' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.attendance.status, 'ON_TIME');
  const gps = await prisma.attendance.findFirst({ where: { workerId: m1.id, sessionId: S.d10.id } });
  assert.equal((await as(adminToken).post(`/admin/attendance/${gps.id}/remove`, {})).status, 400, 'a reason is needed');
  assert.equal((await as(adminToken).post(`/admin/attendance/${gps.id}/remove`, { reason: 'Clocked in for a friend' })).status, 200);
});

test('nobody marks themselves present, and nobody before they joined', async () => {
  const self = await as(hodToken).post(`/hod/sessions/${S.d10.id}/mark`, { workerId: hod.id, arrivedAt: '07:30', reason: 'I was there' });
  assert.equal(self.status, 403);
  const early = await as(hodToken).post(`/hod/sessions/${S.d10.id}/mark`, { workerId: newcomer.id, arrivedAt: '07:30', reason: 'Visiting' });
  assert.equal(early.status, 400);
  assert.match(early.body.message, /only joined/);
});

test('a service still going on: those in count, nobody is absent yet', async () => {
  const svc = await service('Running Now');
  const startsAt = new Date(Date.now() - 20 * 60000);
  const running = await prisma.serviceSession.create({
    data: { serviceId: svc.id, date: dateOnly(today), startsAt, endsAt: new Date(startsAt.getTime() + 3 * 3600000), custom: true },
  });
  await attend(m1, running, { clockInAt: startsAt, clockOutAt: null, minutesPresent: null });
  const res = await as(hodToken).get(`/hod/report?from=${today}&to=${today}`);
  const row = (w) => res.body.rows.find((x) => x.worker.id === w.id);
  assert.equal(row(m1).expected, 1);
  assert.equal(row(m1).attended, 1);
  assert.equal(row(m2).expected, 0, 'not absent while the service is still on');
  assert.equal(row(m2).absent, 0);
  const now = await as(hodToken).get('/hod/today');
  const reg = now.body.registers.find((r) => r.session.id === running.id);
  assert.equal(reg.rows.find((r) => r.worker.id === m2.id).state, 'notIn');
});

// ─── Leave ────────────────────────────────────────────────────────────────────

test('asking for leave: dates checked, no overlaps', async () => {
  const ask = (body) => as(m1Token).post('/leave', { type: 'SICK', reason: 'Malaria', ...body });
  assert.equal((await ask({ startDate: day(-8), endDate: day(-8) })).status, 400, 'more than a week ago');
  assert.equal((await ask({ startDate: day(5), endDate: day(3) })).body.field, 'endDate');
  assert.equal((await ask({ startDate: day(1), endDate: day(61) })).status, 400, 'over 60 days');
  assert.equal((await ask({ type: 'HOLIDAY', startDate: day(1), endDate: day(2) })).status, 400);

  const ok = await ask({ startDate: day(10), endDate: day(12) });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.leave.status, 'PENDING');
  assert.equal(ok.body.leave.days, 3);
  assert.equal(ok.body.leave.cancellable, true);
  const clash = await ask({ startDate: day(12), endDate: day(14) });
  assert.equal(clash.status, 409);

  // Two at the same moment: one is saved.
  const both = await Promise.all([1, 2].map(() => ask({ startDate: day(20), endDate: day(21) })));
  assert.deepEqual(both.map((r) => r.status).sort(), [201, 409]);

  const mine = await as(m1Token).get('/leave');
  assert.equal(mine.body.leave.length, 2);
});

test('reviewing leave: the member’s HOD or the office, never one’s own, once', async () => {
  const hodAsks = await as(hodToken).post('/leave', { type: 'FAMILY', startDate: day(30), endDate: day(31), reason: 'Wedding' });
  const m3Asks = await as(m3Token).post('/leave', { type: 'SICK', startDate: day(-1), endDate: day(1), reason: 'Fever' });
  assert.equal(m3Asks.status, 201);

  assert.equal((await as(hodToken).post(`/hod/leave/${hodAsks.body.leave.id}/approve`)).status, 403, 'not their own');
  assert.equal((await as(otherHodToken).post(`/hod/leave/${m3Asks.body.leave.id}/approve`)).status, 404, 'not another department’s');

  const list = await as(hodToken).get('/hod/leave?status=PENDING');
  assert.ok(list.body.leave.some((l) => l.id === m3Asks.body.leave.id));
  assert.ok(!list.body.leave.some((l) => l.worker.department.name === 'Media'));

  const ok = await as(hodToken).post(`/hod/leave/${m3Asks.body.leave.id}/approve`, { note: 'Get well soon' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.leave.status, 'APPROVED');
  assert.equal(ok.body.leave.reviewedByName, 'Hannah Worker');
  assert.equal((await as(hodToken).post(`/hod/leave/${m3Asks.body.leave.id}/reject`)).status, 409, 'already decided');
  assert.match((await prisma.auditLog.findFirst({ where: { action: 'leave.approve' } })).summary, /sick leave for Cee Worker/);

  const office = await as(adminToken).post(`/admin/leave/${hodAsks.body.leave.id}/reject`, { note: 'Choir festival that weekend' });
  assert.equal(office.status, 200);
  assert.equal(office.body.leave.status, 'REJECTED');
  const all = await as(adminToken).get('/admin/leave');
  assert.ok(all.body.leave.length >= 4);
});

test('withdrawing leave: while waiting, or before it begins — not once it has', async () => {
  const mine = (await as(m3Token).get('/leave')).body.leave;
  const begun = mine.find((l) => l.status === 'APPROVED' && l.startDate === day(-1));
  assert.equal(begun.cancellable, false);
  assert.equal((await as(m3Token).post(`/leave/${begun.id}/cancel`)).status, 409);

  const future = await as(m3Token).post('/leave', { type: 'TRAVEL', startDate: day(40), endDate: day(41), reason: 'Trip' });
  await as(hodToken).post(`/hod/leave/${future.body.leave.id}/approve`);
  const res = await as(m3Token).post(`/leave/${future.body.leave.id}/cancel`);
  assert.equal(res.status, 200);
  assert.equal(res.body.leave.status, 'CANCELLED');
  assert.equal((await as(m1Token).post(`/leave/${future.body.leave.id}/cancel`)).status, 404, 'not someone else’s');
});
