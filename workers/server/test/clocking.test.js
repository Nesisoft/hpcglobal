/**
 * Clocking in and out, end to end: by the phone's position, by the QR code at
 * church, the automatic clock-out, a worker's history — and the admin's side:
 * services, their dates, and the settings that decide on time and late.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, startServer, makeWorker, makeDepartment, signIn } = require('./helpers');

let api, prisma, dept, worker, workerToken, admin, adminToken, superAdmin, superToken;

const VENUE = { latitude: 5.610256, longitude: -0.076429 };
const AT_VENUE = { ...VENUE, accuracy: 10 };
const FAR = { latitude: 5.610256 + 0.003, longitude: -0.076429, accuracy: 10 };   // ~330 m
const MIN = 60 * 1000;

test.before(async () => {
  const loaded = loadApp('clocking', { CRON_SECRET: 'test-cron-secret-0123456789' });
  prisma = loaded.prisma;
  api = await startServer(loaded.app);
  dept = await makeDepartment(prisma, 'Ushers');
  worker = await makeWorker(prisma, { departmentId: dept.id });
  admin = await makeWorker(prisma, { role: 'ADMIN' });
  superAdmin = await makeWorker(prisma, { role: 'SUPER_ADMIN' });
  workerToken = await signIn(api.call, worker.email);
  adminToken = await signIn(api.call, admin.email);
  superToken = await signIn(api.call, superAdmin.email);
});
test.after(async () => { await api.close(); await prisma.$disconnect(); });

const as = (token) => ({
  get:   (url) => api.call('GET', url, undefined, { token }),
  post:  (url, body) => api.call('POST', url, body, { token }),
  put:   (url, body) => api.call('PUT', url, body, { token }),
  patch: (url, body) => api.call('PATCH', url, body, { token }),
});

let serviceSeq = 0;
/** A service (not repeating, so the automatic dates leave the test alone) and one session relative to now. */
async function session({ startedMinutesAgo = 10, lengthMinutes = 120, location = true, cancelled = false } = {}) {
  serviceSeq += 1;
  const service = await prisma.service.create({
    data: {
      name: `Test Service ${serviceSeq}`, venueName: 'Royal Ravico Hotel', recurrence: 'NONE', active: true,
      startTime: '07:30', endTime: '13:30', ...(location ? VENUE : {}),
    },
  });
  const startsAt = new Date(Date.now() - startedMinutesAgo * MIN);
  return prisma.serviceSession.create({
    data: {
      serviceId: service.id, date: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`),
      startsAt, endsAt: new Date(startsAt.getTime() + lengthMinutes * MIN), cancelled, custom: true,
    },
    include: { service: true },
  });
}

async function freshWorker() {
  const w = await makeWorker(prisma, { departmentId: dept.id });
  return { w, token: await signIn(api.call, w.email) };
}

// ─── Clocking in by position ──────────────────────────────────────────────────

test('clocking in at the venue, ten minutes after the start: on time', async () => {
  const s = await session({ startedMinutesAgo: 10 });
  const res = await as(workerToken).post('/clock/in', { sessionId: s.id, ...AT_VENUE });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.attendance.status, 'ON_TIME');
  assert.equal(res.body.attendance.method, 'GPS');
  assert.ok(res.body.attendance.distanceM < 5);
  assert.match(res.body.message, /on time/);
});

test('late after the grace period, very late after half an hour', async () => {
  const late = await session({ startedMinutesAgo: 20 });
  const r1 = await as(workerToken).post('/clock/in', { sessionId: late.id, ...AT_VENUE });
  assert.equal(r1.body.attendance.status, 'LATE');
  assert.equal(r1.body.attendance.lateMinutes, 20);
  assert.match(r1.body.message, /20 minutes late/);

  const veryLate = await session({ startedMinutesAgo: 45 });
  const r2 = await as(workerToken).post('/clock/in', { sessionId: veryLate.id, ...AT_VENUE });
  assert.equal(r2.body.attendance.status, 'VERY_LATE');
});

test('too far from the venue: refused, with the distance', async () => {
  const s = await session();
  const res = await as(workerToken).post('/clock/in', { sessionId: s.id, ...FAR });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'TOO_FAR');
  assert.ok(res.body.distanceM > 300 && res.body.distanceM < 360);
  assert.match(res.body.message, /m from Royal Ravico Hotel/);
  assert.equal(await prisma.attendance.count({ where: { sessionId: s.id } }), 0);
});

test('no venue set yet: refused, pointing to the QR code', async () => {
  const s = await session({ location: false });
  const res = await as(workerToken).post('/clock/in', { sessionId: s.id, ...AT_VENUE });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'NO_LOCATION');
  assert.match(res.body.message, /QR code/);
});

test('too early, after the end, or cancelled: refused', async () => {
  const early = await session({ startedMinutesAgo: -120 });
  const r1 = await as(workerToken).post('/clock/in', { sessionId: early.id, ...AT_VENUE });
  assert.equal(r1.body.code, 'NOT_OPEN');
  assert.match(r1.body.message, /opens at/);

  const ended = await session({ startedMinutesAgo: 130, lengthMinutes: 120 });
  assert.equal((await as(workerToken).post('/clock/in', { sessionId: ended.id, ...AT_VENUE })).body.code, 'CLOSED');

  const off = await session({ cancelled: true });
  assert.equal((await as(workerToken).post('/clock/in', { sessionId: off.id, ...AT_VENUE })).body.code, 'CANCELLED');
});

test('a double tap — or two phones at once — clocks in once', async () => {
  const s = await session();
  const { token } = await freshWorker();
  const results = await Promise.all([1, 2, 3].map(() => as(token).post('/clock/in', { sessionId: s.id, ...AT_VENUE })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
  assert.equal(await prisma.attendance.count({ where: { sessionId: s.id } }), 1);
});

test('a position that isn’t one is refused before anything else', async () => {
  const s = await session();
  const res = await as(workerToken).post('/clock/in', { sessionId: s.id, latitude: 200, longitude: 0 });
  assert.equal(res.status, 400);
  assert.equal(res.body.field, 'latitude');
});

test('a worker waiting for approval can’t clock in', async () => {
  const s = await session();
  const pending = await makeWorker(prisma, { status: 'PENDING', departmentId: dept.id });
  const token = await signIn(api.call, pending.email);
  assert.equal((await as(token).post('/clock/in', { sessionId: s.id, ...AT_VENUE })).status, 403);
});

// ─── Clocking out ─────────────────────────────────────────────────────────────

test('clocking out: minutes present, leaving early, and short attendance', async () => {
  const s = await session({ startedMinutesAgo: 10, lengthMinutes: 120 });
  const { w, token } = await freshWorker();
  assert.equal((await as(token).post('/clock/in', { sessionId: s.id, ...AT_VENUE })).status, 201);
  // Pretend they clocked in 40 minutes ago.
  await prisma.attendance.update({ where: { workerId_sessionId: { workerId: w.id, sessionId: s.id } }, data: { clockInAt: new Date(Date.now() - 40 * MIN) } });
  const out = await as(token).post('/clock/out', { sessionId: s.id, ...AT_VENUE });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.attendance.minutesPresent, 40);
  assert.ok(out.body.attendance.leftEarlyMinutes >= 109, 'left about 110 minutes before the end');
  assert.equal(out.body.attendance.short, false);
  assert.match(out.body.message, /40 min in all/);

  const again = await as(token).post('/clock/out', { sessionId: s.id, ...AT_VENUE });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'ALREADY_OUT');
});

test('clocking out needs a clock-in, the venue, and the clock-out time not yet passed', async () => {
  const s = await session();
  const { token } = await freshWorker();
  assert.equal((await as(token).post('/clock/out', { sessionId: s.id, ...AT_VENUE })).body.code, 'NOT_IN');
  await as(token).post('/clock/in', { sessionId: s.id, ...AT_VENUE });
  assert.equal((await as(token).post('/clock/out', { sessionId: s.id, ...FAR })).body.code, 'TOO_FAR');

  const long = await session({ startedMinutesAgo: 300, lengthMinutes: 120 });
  const { w: w2, token: t2 } = await freshWorker();
  await prisma.attendance.create({ data: { workerId: w2.id, sessionId: long.id, method: 'GPS', clockInAt: long.startsAt, status: 'ON_TIME' } });
  const late = await as(t2).post('/clock/out', { sessionId: long.id, ...AT_VENUE });
  assert.equal(late.status, 400);
  assert.equal(late.body.code, 'CLOSED');
});

test('two clock-outs at once: one lands', async () => {
  const s = await session();
  const { token } = await freshWorker();
  await as(token).post('/clock/in', { sessionId: s.id, ...AT_VENUE });
  const both = await Promise.all([1, 2].map(() => as(token).post('/clock/out', { sessionId: s.id, ...AT_VENUE })));
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
});

// ─── The automatic clock-out ─────────────────────────────────────────────────

test('a clock-in left open after the clock-out time is closed — attended, minutes unknown', async () => {
  const s = await session({ startedMinutesAgo: 300, lengthMinutes: 120 });   // ended 3 h ago
  const { w, token } = await freshWorker();
  await prisma.attendance.create({ data: { workerId: w.id, sessionId: s.id, method: 'GPS', clockInAt: s.startsAt, status: 'ON_TIME' } });
  const recent = await session({ startedMinutesAgo: 130, lengthMinutes: 120 });  // ended 10 min ago: still open for clock-out
  await prisma.attendance.create({ data: { workerId: w.id, sessionId: recent.id, method: 'GPS', clockInAt: recent.startsAt, status: 'ON_TIME' } });

  assert.equal((await as(token).get('/clock/today')).status, 200);
  const closed = await prisma.attendance.findUnique({ where: { workerId_sessionId: { workerId: w.id, sessionId: s.id } } });
  assert.equal(closed.autoClockedOut, true);
  assert.equal(closed.clockOutAt, null);
  assert.equal(closed.minutesPresent, null, 'not nought minutes, as the old app recorded');
  const open = await prisma.attendance.findUnique({ where: { workerId_sessionId: { workerId: w.id, sessionId: recent.id } } });
  assert.equal(open.autoClockedOut, false, 'still inside the clock-out time');
});

// ─── Today and history ────────────────────────────────────────────────────────

test('today shows the day’s sessions with this worker’s own record', async () => {
  const s = await session({ startedMinutesAgo: 5 });
  const { token } = await freshWorker();
  await as(token).post('/clock/in', { sessionId: s.id, ...AT_VENUE });
  const res = await as(token).get('/clock/today');
  assert.equal(res.status, 200);
  const mine = res.body.sessions.find((x) => x.id === s.id);
  assert.ok(mine);
  assert.equal(mine.phase, 'running');
  assert.equal(mine.attendance.status, 'ON_TIME');
  assert.equal(mine.service.hasLocation, true);
  assert.ok(res.body.sessions.filter((x) => x.attendance).every((x) => x.id === s.id), 'nobody else’s records');
  assert.ok(res.body.serverTime);
});

test('history: this month’s records, newest first, with a summary', async () => {
  const { w, token } = await freshWorker();
  const a = await session({ startedMinutesAgo: 20 });
  const b = await session({ startedMinutesAgo: 5 });
  await as(token).post('/clock/in', { sessionId: a.id, ...AT_VENUE });
  await as(token).post('/clock/in', { sessionId: b.id, ...AT_VENUE });
  const res = await as(token).get('/clock/history');
  assert.equal(res.status, 200);
  assert.equal(res.body.records.length, 2);
  assert.equal(res.body.summary.attended, 2);
  assert.equal(res.body.summary.late, 1);
  assert.equal(res.body.summary.onTime, 1);
  assert.equal(res.body.records[0].session.service.name, b.service.name);
  void w;
  const lastYear = await as(token).get(`/clock/history?month=${new Date().getUTCFullYear() - 1}-01`);
  assert.deepEqual(lastYear.body.records, []);
});

// ─── The QR code ──────────────────────────────────────────────────────────────

test('QR: the code on the screen clocks a worker in, again asks before clocking out, and then clocks out', async () => {
  const s = await session({ startedMinutesAgo: 5 });
  const shown = await as(adminToken).get(`/qr/${s.id}`);
  assert.equal(shown.status, 200);
  assert.match(shown.body.code, /^\d{6}$/);
  assert.equal(shown.body.url, `https://workers.hpcglobal.org/q/${shown.body.code}`);

  const { w, token } = await freshWorker();
  const inRes = await as(token).post('/clock/qr', { code: shown.body.code });
  assert.equal(inRes.status, 201, JSON.stringify(inRes.body));
  assert.equal(inRes.body.attendance.method, 'QR');
  assert.equal(inRes.body.session.id, s.id);

  const again = await as(token).post('/clock/qr', { code: shown.body.code });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'ALREADY_IN', 'a second scan on arrival doesn’t clock out');

  const out = await as(token).post('/clock/qr', { code: shown.body.code, action: 'out' });
  assert.equal(out.status, 200);
  assert.equal(out.body.attendance.clockOutAt !== null, true);
  const record = await prisma.attendance.findUnique({ where: { workerId_sessionId: { workerId: w.id, sessionId: s.id } } });
  assert.equal(record.clockOutMethod, 'QR');
  const scans = await prisma.qrScan.findMany({ where: { workerId: w.id } });
  assert.deepEqual(scans.map((x) => x.result).sort(), ['ALREADY', 'OK', 'OK']);
});

test('QR: a wrong code is refused and logged; ten an hour and the worker must wait', async () => {
  await session({ startedMinutesAgo: 5 });
  const { w, token } = await freshWorker();
  let res;
  for (let i = 0; i < 10; i += 1) {
    res = await as(token).post('/clock/qr', { code: String(100000 + i) });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'BAD_QR');
  }
  res = await as(token).post('/clock/qr', { code: '199999' });
  assert.equal(res.status, 429);
  assert.equal(await prisma.qrScan.count({ where: { workerId: w.id, result: 'BAD_CODE' } }), 10);
});

test('QR: only an admin or a HOD can show it, and only while the session is open', async () => {
  const s = await session({ startedMinutesAgo: 5 });
  assert.equal((await as(workerToken).get(`/qr/${s.id}`)).status, 403);
  const hod = await makeWorker(prisma, { departmentId: dept.id, isHod: true });
  const hodToken = await signIn(api.call, hod.email);
  assert.equal((await as(hodToken).get(`/qr/${s.id}`)).status, 200);
  const today = await as(hodToken).get('/qr/today');
  assert.ok(today.body.sessions.some((x) => x.id === s.id));

  const later = await session({ startedMinutesAgo: -180 });
  const notYet = await as(adminToken).get(`/qr/${later.id}`);
  assert.equal(notYet.status, 409);
  assert.equal(notYet.body.code, 'NOT_OPEN');
});

// ─── Services and their dates (admin) ────────────────────────────────────────

const todayKey = () => new Date().toISOString().slice(0, 10);
const weekdayToday = () => new Date().getUTCDay();

test('a weekly service on today’s weekday gets today’s session, once, however often it is asked for', async () => {
  const res = await as(adminToken).post('/admin/services', {
    name: 'Weekly Test', recurrence: 'WEEKLY', weekday: weekdayToday(), startTime: '00:00', endTime: '23:59', ...VENUE,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.service.id;
  await Promise.all([as(workerToken).get('/clock/today'), as(workerToken).get('/clock/today'), as(adminToken).get('/admin/sessions')]);
  const sessions = await prisma.serviceSession.findMany({ where: { serviceId: id } });
  assert.equal(sessions.filter((x) => x.date.toISOString().slice(0, 10) === todayKey()).length, 1);
  assert.ok(sessions.length >= 2 && sessions.length <= 3, 'today and the next week or two');
});

test('service rules: end after start, a weekday for weekly, both coordinates or neither', async () => {
  const base = { name: 'Bad', recurrence: 'WEEKLY', weekday: 0, startTime: '09:00', endTime: '10:00' };
  assert.equal((await as(adminToken).post('/admin/services', { ...base, endTime: '08:00' })).body.field, 'endTime');
  assert.equal((await as(adminToken).post('/admin/services', { ...base, weekday: null })).body.field, 'weekday');
  assert.equal((await as(adminToken).post('/admin/services', { ...base, latitude: 5.6 })).body.field, 'latitude');
  assert.equal((await as(adminToken).post('/admin/services', { ...base, recurrence: 'NONE', weekday: null })).body.field, 'startsOn');
  assert.equal((await as(workerToken).post('/admin/services', base)).status, 403);
});

test('changing a service’s time moves its future dates — but not one moved by hand, cancelled, or already attended', async () => {
  const created = await as(adminToken).post('/admin/services', {
    name: 'Mover', recurrence: 'DAILY', startsOn: todayKey(), startTime: '23:00', endTime: '23:30', ...VENUE,
  });
  const id = created.body.service.id;
  await as(adminToken).get('/admin/sessions');
  const dates = await prisma.serviceSession.findMany({ where: { serviceId: id }, orderBy: { date: 'asc' } });
  assert.ok(dates.length >= 4);
  const [, movedByHand, cancelled, attended] = dates;
  await as(adminToken).patch(`/admin/sessions/${movedByHand.id}`, { startTime: '22:00', endTime: '22:30' });
  await as(adminToken).patch(`/admin/sessions/${cancelled.id}`, { cancelled: true });
  await prisma.attendance.create({ data: { workerId: worker.id, sessionId: attended.id, method: 'MANUAL', clockInAt: attended.startsAt, status: 'ON_TIME' } });

  const changed = await as(adminToken).patch(`/admin/services/${id}`, { startTime: '18:00', endTime: '19:00' });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const after = await prisma.serviceSession.findMany({ where: { serviceId: id } });
  const byId = new Map(after.map((x) => [x.id, x]));
  assert.equal(byId.get(movedByHand.id).startsAt.toISOString().slice(11, 16), '22:00');
  assert.equal(byId.get(cancelled.id).cancelled, true, 'a cancelled date is never brought back');
  assert.equal(byId.get(attended.id).startsAt.toISOString().slice(11, 16), '23:00');
  const regenerated = after.filter((x) => ![movedByHand.id, cancelled.id, attended.id].includes(x.id) && x.startsAt > new Date());
  assert.ok(regenerated.length > 0);
  assert.ok(regenerated.every((x) => x.startsAt.toISOString().slice(11, 16) === '18:00'));
  assert.ok(await prisma.auditLog.findFirst({ where: { targetId: id, action: 'service.update' } }));
});

test('archiving a service removes its future dates that nobody attended', async () => {
  const created = await as(adminToken).post('/admin/services', {
    name: 'Short-lived', recurrence: 'DAILY', startsOn: todayKey(), startTime: '23:40', endTime: '23:50', ...VENUE,
  });
  const id = created.body.service.id;
  await as(adminToken).get('/admin/sessions');
  assert.ok(await prisma.serviceSession.count({ where: { serviceId: id } }) > 0);
  const res = await as(adminToken).patch(`/admin/services/${id}`, { active: false });
  assert.equal(res.body.service.active, false);
  assert.equal(await prisma.serviceSession.count({ where: { serviceId: id, startsAt: { gt: new Date() } } }), 0);
});

test('a one-off date, a duplicate, a past date; cancelling hides it from workers', async () => {
  const s = await session();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const extra = await as(adminToken).post('/admin/sessions', { serviceId: s.serviceId, date: tomorrow, startTime: '10:00', endTime: '12:00', note: 'Extra rehearsal' });
  assert.equal(extra.status, 201, JSON.stringify(extra.body));
  assert.equal(extra.body.session.custom, true);
  assert.equal((await as(adminToken).post('/admin/sessions', { serviceId: s.serviceId, date: tomorrow, startTime: '10:00', endTime: '12:00' })).status, 409);
  assert.equal((await as(adminToken).post('/admin/sessions', { serviceId: s.serviceId, date: '2020-01-01', startTime: '10:00', endTime: '12:00' })).body.field, 'date');

  const live = await session({ startedMinutesAgo: 5 });
  await as(adminToken).patch(`/admin/sessions/${live.id}`, { cancelled: true });
  const today = await as(workerToken).get('/clock/today');
  assert.ok(!today.body.sessions.some((x) => x.id === live.id));
});

test('who’s in: an admin sees a session’s clock-ins with names and departments', async () => {
  const s = await session({ startedMinutesAgo: 5 });
  const { w, token } = await freshWorker();
  await as(token).post('/clock/in', { sessionId: s.id, ...AT_VENUE });
  const res = await as(adminToken).get(`/admin/sessions/${s.id}/attendance`);
  assert.equal(res.status, 200);
  assert.equal(res.body.attendance.length, 1);
  assert.equal(res.body.attendance[0].worker.id, w.id);
  assert.equal(res.body.attendance[0].worker.department.name, 'Ushers');
  const list = await as(adminToken).get('/admin/sessions');
  assert.equal(list.body.sessions.find((x) => x.id === s.id).counts.clockedIn, 1);
});

// ─── Settings ─────────────────────────────────────────────────────────────────

test('settings: admins read them, only a super admin changes them, and they decide what counts as late', async () => {
  const read = await as(adminToken).get('/admin/settings');
  assert.equal(read.status, 200);
  assert.equal(read.body.settings.graceMinutes, 15);
  const body = { ...read.body.settings, graceMinutes: 5 };
  assert.equal((await as(adminToken).put('/admin/settings', body)).status, 403);
  assert.equal((await as(superToken).put('/admin/settings', { ...body, veryLateMinutes: 5 })).body.field, 'veryLateMinutes');

  const saved = await as(superToken).put('/admin/settings', body);
  assert.equal(saved.status, 200);
  try {
    const s = await session({ startedMinutesAgo: 8 });
    const { token } = await freshWorker();
    const res = await as(token).post('/clock/in', { sessionId: s.id, ...AT_VENUE });
    assert.equal(res.body.attendance.status, 'LATE', '8 minutes is late with a 5-minute grace');
  } finally {
    await as(superToken).put('/admin/settings', read.body.settings);
  }
});

// ─── The daily job ────────────────────────────────────────────────────────────

test('the daily job runs only for Vercel’s cron, and closes what was left open', async () => {
  assert.equal((await api.call('GET', '/cron/daily')).status, 401);
  assert.equal((await api.call('GET', '/cron/daily', undefined, { token: 'wrong-secret' })).status, 401);
  const s = await session({ startedMinutesAgo: 400, lengthMinutes: 120 });
  const { w } = await freshWorker();
  await prisma.attendance.create({ data: { workerId: w.id, sessionId: s.id, method: 'GPS', clockInAt: s.startsAt, status: 'ON_TIME' } });
  const ok = await api.call('GET', '/cron/daily', undefined, { token: 'test-cron-secret-0123456789' });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.closed >= 1);
});

test('with no CRON_SECRET set, the daily job refuses everyone', async () => {
  const saved = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    assert.equal((await api.call('GET', '/cron/daily')).status, 401);
    assert.equal((await api.call('GET', '/cron/daily', undefined, { token: 'anything' })).status, 401);
  } finally {
    process.env.CRON_SECRET = saved;
  }
});

test('QR: with two services on at once, each screen’s code clocks into its own service', async () => {
  const first = await session({ startedMinutesAgo: 5 });
  const second = await session({ startedMinutesAgo: 3 });
  const code = (await as(adminToken).get(`/qr/${second.id}`)).body.code;
  const { w, token } = await freshWorker();
  const res = await as(token).post('/clock/qr', { code });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.session.id, second.id);
  assert.ok(await prisma.attendance.findUnique({ where: { workerId_sessionId: { workerId: w.id, sessionId: second.id } } }));
  assert.equal(await prisma.attendance.findUnique({ where: { workerId_sessionId: { workerId: w.id, sessionId: first.id } } }), null);
});
