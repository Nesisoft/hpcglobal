/**
 * Clock-out reminders: who gets one (still clocked in as the service ends,
 * with reminders on), only once, and turning them on and off for a phone.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const webpush = require('web-push');
const { loadApp, startServer, makeWorker, signIn } = require('./helpers');

let api, prisma, sendDueReminders;
const MIN = 60000;
const FCM = 'https://fcm.googleapis.com/fcm/send/';
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

test.before(async () => {
  const loaded = loadApp('reminders', { CRON_SECRET: 'test-cron-secret-0123456789' });
  prisma = loaded.prisma;
  api = await startServer(loaded.app);
  ({ sendDueReminders } = require('../src/lib/reminders'));
});
test.after(async () => { await api.close(); await prisma.$disconnect(); });

let seq = 0;
async function session({ endedMinutesAgo }) {
  seq += 1;
  const service = await prisma.service.create({ data: { name: `Evening ${seq}`, recurrence: 'NONE', startTime: '19:00', endTime: '21:30' } });
  const endsAt = new Date(Date.now() - endedMinutesAgo * MIN);
  return prisma.serviceSession.create({
    data: { serviceId: service.id, date: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`), startsAt: new Date(endsAt - 150 * MIN), endsAt, custom: true },
  });
}
const clockedIn = (w, s, fields = {}) => prisma.attendance.create({
  data: { workerId: w.id, sessionId: s.id, method: 'GPS', clockInAt: s.startsAt, status: 'ON_TIME', ...fields },
});
const subscribe = (w, n = 1) => prisma.pushSubscription.create({ data: { workerId: w.id, endpoint: `${FCM}${w.id}-${n}`, ...KEYS } });

function recorder(result = 'sent') {
  const calls = [];
  const send = async (sub, payload) => { calls.push({ sub, payload }); return typeof result === 'function' ? result(sub) : result; };
  return { calls, send };
}

test('a reminder goes to those still clocked in when the service ends — once', async () => {
  const ended = await session({ endedMinutesAgo: 5 });
  const running = await session({ endedMinutesAgo: -30 });
  const longAgo = await session({ endedMinutesAgo: 40 });
  const stillIn = await makeWorker(prisma); await subscribe(stillIn); await clockedIn(stillIn, ended);
  const out = await makeWorker(prisma); await subscribe(out); await clockedIn(out, ended, { clockOutAt: new Date() });
  const marked = await makeWorker(prisma); await subscribe(marked); await clockedIn(marked, ended, { method: 'MANUAL' });
  const noPhone = await makeWorker(prisma); await clockedIn(noPhone, ended);
  const notYet = await makeWorker(prisma); await subscribe(notYet); await clockedIn(notYet, running);
  const tooLate = await makeWorker(prisma); await subscribe(tooLate); await clockedIn(tooLate, longAgo);

  const r = recorder();
  // Two servers checking at the same moment.
  const results = await Promise.all([sendDueReminders(prisma, { send: r.send }), sendDueReminders(prisma, { send: r.send })]);
  assert.equal(results[0].sent + results[1].sent, 1);
  assert.equal(r.calls.length, 1, 'once, though checked twice at once');
  assert.equal(r.calls[0].sub.workerId, stillIn.id);
  assert.match(r.calls[0].payload.title, /Clock out of Evening/);
  assert.match(r.calls[0].payload.body, /clock-out closes at/);

  const again = recorder();
  await sendDueReminders(prisma, { send: again.send });
  assert.equal(again.calls.length, 0, 'not again later');
});

test('every phone gets it, and a phone that has dropped reminders is forgotten', async () => {
  const s = await session({ endedMinutesAgo: 1 });
  const w = await makeWorker(prisma);
  const kept = await subscribe(w, 1);
  const dropped = await subscribe(w, 2);
  await clockedIn(w, s);
  const r = recorder((sub) => (sub.id === dropped.id ? 'gone' : 'sent'));
  await sendDueReminders(prisma, { send: r.send });
  assert.equal(r.calls.length, 2);
  assert.equal(await prisma.pushSubscription.count({ where: { id: dropped.id } }), 0);
  assert.ok((await prisma.pushSubscription.findUnique({ where: { id: kept.id } })).lastSentAt);
});

test('without the server’s keys nothing is sent, and phones aren’t offered reminders', async () => {
  assert.deepEqual(await sendDueReminders(prisma), { configured: false, due: 0, sent: 0 });
  const w = await makeWorker(prisma);
  const token = await signIn(api.call, w.email);
  assert.deepEqual((await api.call('GET', '/push/key', undefined, { token })).body, { publicKey: null });
  assert.equal((await api.call('POST', '/push/subscribe', { endpoint: `${FCM}x`, keys: KEYS }, { token })).status, 503);
});

test('turning reminders on and off for a phone', async () => {
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  try {
    const a = await makeWorker(prisma);
    const b = await makeWorker(prisma);
    const [ta, tb] = await Promise.all([signIn(api.call, a.email), signIn(api.call, b.email)]);
    const call = (token, url, body) => api.call('POST', url, body, { token });

    assert.equal((await api.call('GET', '/push/key', undefined, { token: ta })).body.publicKey, keys.publicKey);
    const endpoint = `${FCM}phone-1`;
    assert.equal((await call(ta, '/push/subscribe', { endpoint: 'https://evil.example.com/x', keys: KEYS })).status, 400, 'only real push services');
    assert.equal((await call(ta, '/push/subscribe', { endpoint: 'http://fcm.googleapis.com/x', keys: KEYS })).status, 400);
    assert.equal((await call(ta, '/push/subscribe', { endpoint, keys: { p256dh: 'not base64!', auth: 'x' } })).status, 400);
    assert.equal((await call(ta, '/push/subscribe', { endpoint, keys: KEYS })).status, 200);
    assert.equal((await call(ta, '/push/subscribe', { endpoint: 'https://web.push.apple.com/abc123', keys: KEYS })).status, 200, 'an iPhone');
    assert.equal((await call(ta, '/push/status', { endpoint })).body.on, true);

    // The same phone, now signed in as someone else, is theirs.
    await call(tb, '/push/subscribe', { endpoint, keys: KEYS });
    assert.equal((await call(ta, '/push/status', { endpoint })).body.on, false);
    assert.equal((await call(tb, '/push/status', { endpoint })).body.on, true);
    await call(ta, '/push/unsubscribe', { endpoint });
    assert.equal((await call(tb, '/push/status', { endpoint })).body.on, true, 'one person can’t switch off another’s');
    await call(tb, '/push/unsubscribe', { endpoint });
    assert.equal((await call(tb, '/push/status', { endpoint })).body.on, false);

    for (let i = 0; i < 7; i += 1) await call(ta, '/push/subscribe', { endpoint: `${FCM}many-${i}`, keys: KEYS });
    assert.equal(await prisma.pushSubscription.count({ where: { workerId: a.id } }), 5, 'the newest five');
  } finally {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  }
});

test('the scheduler’s call needs the secret', async () => {
  assert.equal((await api.call('GET', '/cron/reminders')).status, 401);
  const res = await fetch(`${api.base}/cron/reminders`, { headers: { authorization: 'Bearer test-cron-secret-0123456789' } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test('a bad setting turns reminders off — it never takes the app down', async () => {
  const { subjectOf } = require('../src/lib/push');
  assert.equal(subjectOf({ APP_URL: 'http://localhost:5174' }), 'https://workers.hpcglobal.org', 'push services refuse http');
  assert.equal(subjectOf({ APP_URL: 'https://workers.hpcglobal.org/' }), 'https://workers.hpcglobal.org');
  assert.equal(subjectOf({ VAPID_SUBJECT: 'mailto:office@hpcglobal.org', APP_URL: 'https://x.test' }), 'mailto:office@hpcglobal.org');
  assert.equal(subjectOf({ VAPID_SUBJECT: 'office@hpcglobal.org' }), 'https://workers.hpcglobal.org', 'an email needs mailto:');

  const w = await makeWorker(prisma);
  const token = await signIn(api.call, w.email);
  const appUrl = process.env.APP_URL;
  process.env.APP_URL = 'http://localhost:5174';
  process.env.VAPID_PUBLIC_KEY = 'not-a-key';
  process.env.VAPID_PRIVATE_KEY = 'not-a-key-either';
  try {
    assert.deepEqual((await api.call('GET', '/push/key', undefined, { token })).body, { publicKey: null }, 'a broken key: no reminders offered');
    const today = await api.call('GET', '/clock/today', undefined, { token });
    assert.equal(today.status, 200, 'and the app carries on');
  } finally {
    process.env.APP_URL = appUrl;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  }
});
