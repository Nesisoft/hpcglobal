/**
 * Part 4: notices (who sees which, what's new), penalty tickets (who may
 * issue and resolve them), and rewards (progress counted from attendance,
 * handed over once).
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, startServer, makeWorker, makeDepartment, signIn } = require('./helpers');
const { todayKey, addDays, at, dateOnly } = require('../src/lib/time');

let api, prisma;
let choir, media, hod, member, mediaWorker, mediaHod, admin;
let hodToken, memberToken, mediaToken, mediaHodToken, adminToken;

const today = todayKey();
const day = (n) => addDays(today, n);
const as = (token) => ({
  get:   (url) => api.call('GET', url, undefined, { token }),
  post:  (url, body) => api.call('POST', url, body ?? {}, { token }),
  patch: (url, body) => api.call('PATCH', url, body, { token }),
  del:   (url) => api.call('DELETE', url, undefined, { token }),
});

test.before(async () => {
  const loaded = loadApp('notices');
  prisma = loaded.prisma;
  api = await startServer(loaded.app);
  choir = await makeDepartment(prisma, 'Choir');
  media = await makeDepartment(prisma, 'Media');
  hod = await makeWorker(prisma, { departmentId: choir.id, isHod: true, firstName: 'Hannah' });
  member = await makeWorker(prisma, { departmentId: choir.id, firstName: 'Ama' });
  mediaWorker = await makeWorker(prisma, { departmentId: media.id, firstName: 'Dan' });
  mediaHod = await makeWorker(prisma, { departmentId: media.id, isHod: true, firstName: 'Eve' });
  admin = await makeWorker(prisma, { role: 'ADMIN', firstName: 'Fred' });
  [hodToken, memberToken, mediaToken, mediaHodToken, adminToken] = await Promise.all(
    [hod, member, mediaWorker, mediaHod, admin].map((w) => signIn(api.call, w.email)),
  );
});
test.after(async () => { await api.close(); await prisma.$disconnect(); });

// ─── Notices ──────────────────────────────────────────────────────────────────

const N = {};

test('the office posts notices: to everyone, one department, or the heads of department', async () => {
  const post = (body) => as(adminToken).post('/admin/notices', { body: 'Details inside.', ...body });
  const all = await post({ title: 'Church picnic', audience: 'ALL', pinned: true });
  assert.equal(all.status, 201, JSON.stringify(all.body));
  N.all = all.body.notice;
  N.choir = (await post({ title: 'Choir robes', audience: 'DEPARTMENT', departmentId: choir.id })).body.notice;
  N.hods = (await post({ title: 'HOD meeting', audience: 'HODS' })).body.notice;
  N.later = (await post({ title: 'Next month', audience: 'ALL', publishOn: day(3) })).body.notice;
  assert.equal(N.later.state, 'scheduled');
  const old = await prisma.announcement.create({
    data: { title: 'Old news', body: 'x', audience: 'ALL', authorName: 'Fred', publishAt: new Date(Date.now() - 864e5 * 5), expiresAt: new Date(Date.now() - 864e5) },
  });
  N.expired = old;

  assert.equal((await post({ title: 'No department', audience: 'DEPARTMENT' })).body.field, 'departmentId');
  assert.equal((await post({ title: 'Backwards', audience: 'ALL', publishOn: day(5), expiresOn: day(2) })).body.field, 'expiresOn');
  assert.equal((await post({ title: 'Too late', audience: 'ALL', expiresOn: day(-1) })).body.field, 'expiresOn');
  assert.equal((await as(hodToken).post('/admin/notices', { title: 'Mine', body: 'x', audience: 'ALL' })).status, 403);
});

test('each worker sees only what is meant for them, pinned first', async () => {
  const titles = async (token) => (await as(token).get('/notices')).body.notices.map((n) => n.title);
  assert.deepEqual(await titles(mediaToken), ['Church picnic']);
  assert.deepEqual((await titles(memberToken)).sort(), ['Choir robes', 'Church picnic']);
  assert.deepEqual((await titles(hodToken)).sort(), ['Choir robes', 'Church picnic', 'HOD meeting']);
  assert.deepEqual((await titles(mediaHodToken)).sort(), ['Church picnic', 'HOD meeting']);
  assert.equal((await titles(hodToken))[0], 'Church picnic', 'pinned first');
});

test('what’s new: an unread count, cleared by reading — and only for notices one can see', async () => {
  assert.equal((await as(memberToken).get('/notices/unread')).body.unread, 2);
  const res = await as(memberToken).post('/notices/read', { ids: [N.choir.id, N.hods.id, N.later.id] });
  assert.equal(res.status, 200);
  assert.equal(res.body.marked, 1, 'the HOD and scheduled notices aren’t theirs to mark');
  assert.equal(res.body.unread, 1);
  const list = (await as(memberToken).get('/notices')).body;
  assert.equal(list.notices.find((n) => n.id === N.choir.id).read, true);
  assert.equal(list.unread, 1);
  assert.equal((await as(memberToken).post('/notices/read', { ids: [N.choir.id] })).body.marked, 0, 'twice is harmless');
});

test('a HOD posts to their own department only, and takes down only their own', async () => {
  const res = await as(hodToken).post('/hod/notices', { title: 'Rehearsal moved', body: 'Saturday 4pm.', audience: 'ALL', departmentId: media.id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.notice.audience, 'DEPARTMENT', 'a HOD can’t post to everyone');
  assert.equal(res.body.notice.department.id, choir.id, 'or to another department');
  assert.ok(!(await as(mediaToken).get('/notices')).body.notices.some((n) => n.id === res.body.notice.id));
  assert.ok((await as(memberToken).get('/notices')).body.notices.some((n) => n.id === res.body.notice.id));

  const mine = await as(hodToken).get('/hod/notices');
  assert.deepEqual(mine.body.notices.map((n) => n.title).sort(), ['Choir robes', 'Rehearsal moved']);
  assert.equal(mine.body.members, 2);
  assert.equal((await as(mediaHodToken).del(`/hod/notices/${res.body.notice.id}`)).status, 404);
  assert.equal((await as(hodToken).del(`/hod/notices/${N.choir.id}`)).status, 403, 'the office’s notice');
  assert.equal((await as(hodToken).del(`/hod/notices/${res.body.notice.id}`)).status, 200);
  assert.equal((await as(adminToken).del(`/admin/notices/${N.choir.id}`)).status, 200, 'the office can take down any');
});

test('the office edits a notice: its words, who it’s for, its dates', async () => {
  const res = await as(adminToken).patch(`/admin/notices/${N.hods.id}`, { title: 'HOD meeting — moved', audience: 'DEPARTMENT', departmentId: media.id, expiresOn: day(10) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.notice.title, 'HOD meeting — moved');
  assert.equal(res.body.notice.department.id, media.id);
  assert.ok(res.body.notice.expiresAt);
  assert.ok((await as(mediaToken).get('/notices')).body.notices.some((n) => n.id === N.hods.id));
  assert.ok(!(await as(hodToken).get('/notices')).body.notices.some((n) => n.id === N.hods.id));
  const list = await as(adminToken).get('/admin/notices');
  assert.equal(list.body.notices.find((n) => n.id === N.expired.id).state, 'expired');
});

// ─── Tickets ──────────────────────────────────────────────────────────────────

test('tickets: a HOD issues to their own members — not another department, not themselves', async () => {
  const issue = (token, body) => as(token).post(token === adminToken ? '/admin/tickets' : '/hod/tickets', { type: 'LATENESS', severity: 'LOW', reason: 'Late three Sundays running', ...body });
  const ok = await issue(hodToken, { workerId: member.id });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.ticket.issuedByName, 'Hannah Worker');
  assert.equal((await issue(hodToken, { workerId: mediaWorker.id })).status, 404);
  assert.equal((await issue(hodToken, { workerId: hod.id })).status, 403);
  assert.equal((await issue(hodToken, { workerId: member.id, type: 'PARKING' })).status, 400);
  assert.equal((await as(memberToken).post('/hod/tickets', { workerId: hod.id, type: 'WARNING', severity: 'LOW', reason: 'xxxx' })).status, 403);
  const toHod = await issue(adminToken, { workerId: hod.id, type: 'ABSENCE', severity: 'MEDIUM', reason: 'Missed the HOD meeting' });
  assert.equal(toHod.status, 201);
  assert.match((await prisma.auditLog.findFirst({ where: { action: 'ticket.issue' } })).summary, /low lateness ticket to Ama Worker/);
});

test('tickets: each worker sees their own; resolving happens once, by someone else', async () => {
  const mine = (await as(memberToken).get('/record')).body.tickets;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].resolved, false);
  assert.equal((await as(mediaToken).get('/record')).body.tickets.length, 0);

  const hodList = await as(hodToken).get('/hod/tickets?status=open');
  assert.equal(hodList.body.open, 2, 'their member’s and their own');
  const own = hodList.body.tickets.find((t) => t.worker.id === hod.id);
  assert.equal((await as(hodToken).post(`/hod/tickets/${own.id}/resolve`, { note: 'Spoke to myself' })).status, 403);
  assert.equal((await as(mediaHodToken).post(`/hod/tickets/${mine[0].id}/resolve`, { note: 'Not mine' })).status, 404);
  assert.equal((await as(hodToken).post(`/hod/tickets/${mine[0].id}/resolve`, {})).status, 400, 'a note is needed');
  const done = await as(hodToken).post(`/hod/tickets/${mine[0].id}/resolve`, { note: 'We talked; she’ll come earlier' });
  assert.equal(done.status, 200);
  assert.equal(done.body.ticket.resolved, true);
  assert.equal((await as(adminToken).post(`/admin/tickets/${mine[0].id}/resolve`, { note: 'Again' })).status, 409);
  const all = await as(adminToken).get(`/admin/tickets?departmentId=${choir.id}&status=resolved`);
  assert.deepEqual(all.body.tickets.map((t) => t.id), [mine[0].id]);
});

// ─── Rewards ──────────────────────────────────────────────────────────────────

test('rewards: progress counts only the matching attendance in the period, and is handed over once', async () => {
  const sunday = await prisma.service.create({ data: { name: 'Reward Sunday', recurrence: 'NONE', startTime: '07:30', endTime: '09:30' } });
  const friday = await prisma.service.create({ data: { name: 'Reward Friday', recurrence: 'NONE', startTime: '18:30', endTime: '21:00' } });
  const prayer = await prisma.service.create({ data: { name: 'Optional Prayer', recurrence: 'NONE', startTime: '06:00', endTime: '07:00', expected: false } });
  const session = (svc, key, fields = {}) => prisma.serviceSession.create({
    data: { serviceId: svc.id, date: dateOnly(key), startsAt: at(key, '07:30'), endsAt: at(key, '09:30'), custom: true, ...fields },
  });
  const attend = (w, s, status = 'ON_TIME') => prisma.attendance.create({ data: { workerId: w.id, sessionId: s.id, method: 'GPS', clockInAt: s.startsAt, status } });

  const s1 = await session(sunday, day(-14));
  const s2 = await session(sunday, day(-7));
  const sOld = await session(sunday, day(-40));
  const sCancelled = await session(sunday, day(-21), { cancelled: true });
  const f1 = await session(friday, day(-9));
  const p1 = await session(prayer, day(-8));
  await attend(member, s1); await attend(member, s2, 'LATE'); await attend(member, sOld);
  await attend(member, sCancelled); await attend(member, f1); await attend(member, p1);
  await attend(mediaWorker, s1);

  const make = (body) => as(adminToken).post('/admin/rewards', { startsOn: day(-30), endsOn: day(30), ...body });
  assert.equal((await make({ name: 'Backwards', target: 2, startsOn: day(5), endsOn: day(1) })).body.field, 'endsOn');
  assert.equal((await as(hodToken).post('/admin/rewards', { name: 'x', target: 1, startsOn: day(0), endsOn: day(1) })).status, 403);
  const sundays = (await make({ name: 'Faithful Sundays', target: 2, serviceId: sunday.id })).body.reward;
  const onTime = (await make({ name: 'Early Sundays', target: 2, serviceId: sunday.id, onTimeOnly: true })).body.reward;
  const anyService = (await make({ name: 'Every service', target: 3 })).body.reward;
  assert.equal(sundays.state, 'running');

  const row = async (reward, w) => (await as(adminToken).get(`/admin/rewards/${reward.id}`)).body.rows.find((r) => r.worker.id === w.id);
  assert.equal((await row(sundays, member)).progress, 2, 'not the one before the period, nor the cancelled date');
  assert.equal((await row(sundays, member)).earned, true);
  assert.equal((await row(sundays, mediaWorker)).progress, 1);
  assert.equal((await row(onTime, member)).progress, 1, 'the late Sunday doesn’t count');
  assert.equal((await row(anyService, member)).progress, 3, 'two Sundays and a Friday — not the optional prayer');

  const notYet = await as(adminToken).post(`/admin/rewards/${sundays.id}/hand-over`, { workerId: mediaWorker.id });
  assert.equal(notYet.status, 400);
  assert.match(notYet.body.message, /1 of the 2/);
  const both = await Promise.all([1, 2].map(() => as(adminToken).post(`/admin/rewards/${sundays.id}/hand-over`, { workerId: member.id })));
  assert.deepEqual(both.map((r) => r.status).sort(), [201, 409], 'once, even when pressed twice at once');

  const record = (await as(memberToken).get('/record')).body.rewards;
  const r = record.find((x) => x.id === sundays.id);
  assert.equal(r.progress, 2);
  assert.equal(r.earned, true);
  assert.equal(r.handedOver.handedOverByName, 'Fred Worker');
  assert.equal(record.find((x) => x.id === onTime.id).earned, false);

  const edited = await as(adminToken).patch(`/admin/rewards/${onTime.id}`, { target: 1, active: false });
  assert.equal(edited.status, 200);
  assert.ok(!(await as(memberToken).get('/record')).body.rewards.some((x) => x.id === onTime.id), 'an inactive reward isn’t shown');
  const list = await as(adminToken).get('/admin/rewards');
  assert.equal(list.body.rewards.find((x) => x.id === sundays.id).handedOver, 1);
});
