/**
 * Delivery Problems: the emails and texts the site could not send.
 *
 * Form confirmations and office alerts are sent before the response (Vercel
 * may freeze the function once it has responded), so a failure has to be
 * recorded in that same window or it is lost. These tests make every provider
 * fail for real — the harness points SMTP and Hubtel at a closed port — and
 * check that each failure lands in Admin → Delivery Problems with enough to
 * follow up on, and that only super admins can see or clear the list, since
 * the rows carry prayer requesters' names and contact details.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const { loadApp, startServer, tokenFor } = require('./helpers');

const { app, prisma } = loadApp('delivery');
const email = require('../src/services/email');
const { sendNotifications, recordFailure, withTimeout } = require('../src/lib/notify');

const DAY = 24 * 60 * 60 * 1000;

let server;
let superAdmin, editor, mediaManager, hod;

test.before(async () => {
  server = await startServer(app);
  const admin = (role) => prisma.adminUser.create({
    data: { name: `${role} tester`, email: `${role.toLowerCase()}@delivery.test`, passwordHash: 'not-a-real-hash', role },
  });
  superAdmin   = tokenFor(await admin('SUPER_ADMIN'));
  editor       = tokenFor(await admin('CONTENT_EDITOR'));
  mediaManager = tokenFor(await admin('MEDIA_MANAGER'));
  hod          = tokenFor(await admin('HOD'));
});

test.after(async () => {
  await server?.close();
  await prisma.$disconnect();
});

// Every test starts from an empty list, so counts and listings are its own.
test.beforeEach(async () => {
  await prisma.deliveryFailure.deleteMany();
});

const failuresFor = (context) =>
  prisma.deliveryFailure.findMany({ where: { context }, orderBy: { label: 'asc' } });

/** label → the parts of a row the office acts on. */
const byLabel = (rows) => Object.fromEntries(rows.map((r) => [r.label, { channel: r.channel, recipient: r.recipient }]));

const seed = (data) => prisma.deliveryFailure.create({
  data: { channel: 'EMAIL', label: 'confirmation email', recipient: 'someone@example.com', error: 'connect ECONNREFUSED', ...data },
});

// ─── Recording from the public forms ──────────────────────────────────────────

test('a contact form whose every send fails still succeeds, with all four failures recorded before it responds', async () => {
  const res = await server.call('POST', '/contact/message', {
    name: 'Kofi Mensah', email: 'kofi@example.com', phone: '0241234567',
    type: 'General', message: 'Please call me about the youth programme.',
  }, { ip: '10.20.0.1' });

  // The message itself is saved; a provider outage must not turn that into an error.
  assert.equal(res.status, 201);

  // Read straight after the response, with no waiting: on Vercel nothing runs
  // once the function has responded, so a failure recorded later is never recorded.
  const rows = await failuresFor('Contact message from Kofi Mensah');
  assert.deepEqual(byLabel(rows), {
    'auto-reply email': { channel: 'EMAIL', recipient: 'kofi@example.com' },
    // Wherever office mail is actually sent, so the office can tell which inbox missed it.
    'office email':     { channel: 'EMAIL', recipient: email.officeEmail() },
    'office SMS':       { channel: 'SMS',   recipient: process.env.OFFICE_PHONE },
    'confirmation SMS': { channel: 'SMS',   recipient: '0241234567' },
  });
  assert.equal(email.officeEmail(), 'office@hpcglobal.org');
  for (const row of rows) {
    assert.equal(row.resolvedAt, null);
    assert.ok(row.error.length > 0, `${row.label} should say why it failed`);
  }
});

test('a prayer request records its failures under the requester\'s name', async () => {
  const res = await server.call('POST', '/prayer', {
    name: 'Ama Owusu', email: 'ama@example.com', phone: '0207654321',
    category: 'HEALTH', request: 'Please pray for my mother\'s recovery.', wantsCall: true,
  }, { ip: '10.20.0.2' });
  assert.equal(res.status, 201);

  assert.deepEqual(byLabel(await failuresFor('Prayer request from Ama Owusu')), {
    'confirmation SMS':   { channel: 'SMS',   recipient: '0207654321' },
    'confirmation email': { channel: 'EMAIL', recipient: 'ama@example.com' },
    'office call SMS':    { channel: 'SMS',   recipient: process.env.OFFICE_PHONE },
    'office email':       { channel: 'EMAIL', recipient: email.officeEmail() },
  });
});

test('an anonymous prayer request is recorded as from Anonymous', async () => {
  const res = await server.call('POST', '/prayer', {
    category: 'FAMILY', request: 'Pray for peace in our home, please.',
  }, { ip: '10.20.0.3' });
  assert.equal(res.status, 201);

  // No name, no contact details: only the office alert was attempted.
  const rows = await failuresFor('Prayer request from Anonymous');
  assert.deepEqual(byLabel(rows), {
    'office email': { channel: 'EMAIL', recipient: email.officeEmail() },
  });
  // And never "from undefined" or "from null".
  assert.equal(await prisma.deliveryFailure.count({ where: { context: { contains: 'undefined' } } }), 0);
  assert.equal(await prisma.deliveryFailure.count({ where: { context: { contains: 'null' } } }), 0);
});

test('a partner application records its confirmation email', async () => {
  const res = await server.call('POST', '/partner/apply', {
    firstName: 'Yaw', lastName: 'Boateng', email: 'yaw.boateng@example.com',
  }, { ip: '10.20.0.4' });
  assert.equal(res.status, 201);

  assert.deepEqual(byLabel(await failuresFor('Partner application from Yaw Boateng')), {
    'confirmation email': { channel: 'EMAIL', recipient: 'yaw.boateng@example.com' },
  });
});

test('an appointment request records its confirmations and office alert', async () => {
  // Open every weekday so whichever date we pick is a slot the site offers.
  await prisma.appointmentAvailability.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00', slotMinutes: 30 })),
  });
  // Worked out the way the route works out its booking horizon.
  const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + 3);
  const date = day.toISOString().slice(0, 10);

  const res = await server.call('POST', '/appointments', {
    name: 'Efua Asante', email: 'efua@example.com', phone: '0551112222',
    date, time: '10:00', reason: 'Counselling',
  }, { ip: '10.20.0.5' });
  assert.equal(res.status, 201);

  assert.deepEqual(byLabel(await failuresFor('Appointment request from Efua Asante')), {
    'confirmation SMS':   { channel: 'SMS',   recipient: '0551112222' },
    'confirmation email': { channel: 'EMAIL', recipient: 'efua@example.com' },
    'office SMS':         { channel: 'SMS',   recipient: process.env.OFFICE_PHONE },
  });
});

// ─── lib/notify ───────────────────────────────────────────────────────────────

test('a send that timed out is recorded as possibly delivered', async () => {
  // A real timeout from withTimeout, not a hand-made one.
  const timeout = await withTimeout(new Promise(() => {}), 'office SMS', 20).catch((err) => err);
  assert.equal(timeout.timedOut, true);
  assert.match(timeout.message, /office SMS timed out after 20ms/);

  await recordFailure({ channel: 'SMS', context: 'Timeout check', label: 'office SMS', to: '0300000000', error: timeout });
  await recordFailure({ channel: 'SMS', context: 'Refused check', label: 'office SMS', to: '0300000000', error: new Error('connect ECONNREFUSED 127.0.0.1:1') });

  // We stopped waiting, but the provider may have sent it anyway; the office
  // should know that before chasing the person.
  const [timedOut] = await failuresFor('Timeout check');
  assert.match(timedOut.error, /may still have been delivered/);
  assert.match(timedOut.error, /office SMS timed out after 20ms/);

  // An outright refusal is reported as it is, without the hedge.
  const [refused] = await failuresFor('Refused check');
  assert.equal(refused.error, 'connect ECONNREFUSED 127.0.0.1:1');
});

test('recordFailure never throws, even when the row cannot be saved', async () => {
  // An unknown channel is refused by the database; the form that was being
  // reported on must still get its response.
  await assert.doesNotReject(recordFailure({ channel: 'FAX', context: 'Bad row', label: 'fax', to: 'x', error: new Error('nope') }));
  assert.equal(await prisma.deliveryFailure.count(), 0);
});

test('recordFailure keeps each field to a bounded length', async () => {
  await recordFailure({
    channel: 'EMAIL', context: 'C'.repeat(1000), label: 'L'.repeat(1000), to: 'T'.repeat(1000), error: new Error('E'.repeat(5000)),
  });
  const [row] = await prisma.deliveryFailure.findMany();
  assert.equal(row.context.length, 200);
  assert.equal(row.label.length, 100);
  assert.equal(row.recipient.length, 200);
  assert.equal(row.error.length, 500);
});

test('sendNotifications never throws and reports what happened to each message', async () => {
  const send = sendNotifications('Notify check', [
    ['sent email',       () => Promise.resolve({ messageId: 'abc' }), 'sent@example.com'],
    ['unconfigured SMS', () => Promise.resolve({ skipped: true }),   '0241111111'],
    ['failed email',     () => Promise.reject(new Error('provider down')), 'failed@example.com'],
    // Throws before it has returned a promise at all.
    ['throwing SMS',     () => { throw new Error('threw synchronously'); }, '0242222222'],
    // Messages only some submissions get are written inline as `cond && [...]`.
    false, null, undefined, '',
  ]);
  await assert.doesNotReject(send);

  assert.deepEqual(await send, {
    'sent email':       'sent',
    // Reporting a skipped send as "sent" would tell the office it went out.
    'unconfigured SMS': 'not configured',
    'failed email':     'failed',
    'throwing SMS':     'failed',
  });

  // Only real failures are recorded, under the right channel. A transport that
  // isn't set up is reported once on the Delivery Problems page instead of once
  // per message.
  assert.deepEqual(byLabel(await failuresFor('Notify check')), {
    'failed email': { channel: 'EMAIL', recipient: 'failed@example.com' },
    'throwing SMS': { channel: 'SMS',   recipient: '0242222222' },
  });
});

// ─── Delivery Problems endpoints ──────────────────────────────────────────────

test('the Delivery Problems endpoints refuse anyone who is not signed in', async () => {
  const failure = await seed({ context: 'Anonymous check' });
  for (const [method, url, body] of [
    ['GET', '/admin/delivery-failures'],
    ['GET', '/admin/delivery-failures/count'],
    ['PUT', '/admin/delivery-failures/resolve', { ids: [failure.id] }],
    ['PUT', `/admin/delivery-failures/${failure.id}/resolve`],
  ]) {
    const res = await server.call(method, url, body);
    assert.equal(res.status, 401, `${method} ${url}`);
  }
  assert.equal((await prisma.deliveryFailure.findUnique({ where: { id: failure.id } })).resolvedAt, null);
});

test('only super admins can list, count or resolve delivery failures', async () => {
  // The rows name prayer requesters and carry their phone numbers and emails.
  const failure = await seed({ context: 'Prayer request from Ama', recipient: '0207654321', channel: 'SMS', label: 'confirmation SMS' });
  const roles = { CONTENT_EDITOR: editor, MEDIA_MANAGER: mediaManager, HOD: hod };

  for (const [role, token] of Object.entries(roles)) {
    for (const [method, url, body] of [
      ['GET', '/admin/delivery-failures'],
      ['GET', '/admin/delivery-failures?show=all'],
      ['GET', '/admin/delivery-failures/count'],
      ['PUT', '/admin/delivery-failures/resolve', { ids: [failure.id] }],
      ['PUT', `/admin/delivery-failures/${failure.id}/resolve`],
    ]) {
      const res = await server.call(method, url, body, { token });
      assert.equal(res.status, 403, `${role} ${method} ${url}`);
      assert.equal(res.body.failures, undefined, `${role} must not see the rows`);
    }
  }
  assert.equal((await prisma.deliveryFailure.findUnique({ where: { id: failure.id } })).resolvedAt, null);
});

test('a super admin gets the failures, totals and which transports are set up', async () => {
  const failure = await seed({ context: 'Contact message from Kofi', label: 'auto-reply email', recipient: 'kofi@example.com' });

  const res = await server.call('GET', '/admin/delivery-failures', undefined, { token: superAdmin });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['failures', 'open', 'total', 'transports']);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.open, 1);
  // The harness configures SMTP (no Resend key) and Hubtel.
  assert.deepEqual(res.body.transports, { email: 'smtp', sms: 'hubtel' });

  assert.equal(res.body.failures.length, 1);
  assert.equal(res.body.failures[0].id, failure.id);
  assert.equal(res.body.failures[0].context, 'Contact message from Kofi');
  assert.equal(res.body.failures[0].recipient, 'kofi@example.com');

  const count = await server.call('GET', '/admin/delivery-failures/count', undefined, { token: superAdmin });
  assert.equal(count.status, 200);
  assert.deepEqual(count.body, { open: 1 });
});

test('resolving one failure leaves the others open', async () => {
  const first  = await seed({ context: 'First' });
  const second = await seed({ context: 'Second' });

  const res = await server.call('PUT', `/admin/delivery-failures/${first.id}/resolve`, undefined, { token: superAdmin });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, first.id);
  assert.ok(res.body.resolvedAt);

  assert.notEqual((await prisma.deliveryFailure.findUnique({ where: { id: first.id } })).resolvedAt, null);
  assert.equal((await prisma.deliveryFailure.findUnique({ where: { id: second.id } })).resolvedAt, null);

  const count = await server.call('GET', '/admin/delivery-failures/count', undefined, { token: superAdmin });
  assert.deepEqual(count.body, { open: 1 });
});

test('resolving an unknown failure is a 404', async () => {
  const res = await server.call('PUT', `/admin/delivery-failures/${randomUUID()}/resolve`, undefined, { token: superAdmin });
  assert.equal(res.status, 404);
});

test('"mark all resolved" resolves only the rows that were on screen', async () => {
  await recordFailure({ channel: 'EMAIL', context: 'On screen A', label: 'confirmation email', to: 'a@example.com', error: new Error('down') });
  await recordFailure({ channel: 'SMS',   context: 'On screen B', label: 'confirmation SMS',   to: '0241000000',    error: new Error('down') });

  const list = await server.call('GET', '/admin/delivery-failures', undefined, { token: superAdmin });
  const ids = list.body.failures.map((f) => f.id);
  assert.equal(ids.length, 2);

  // Recorded while the admin was looking at the page: nobody has seen it yet,
  // so it must stay open after they press the button.
  await recordFailure({ channel: 'EMAIL', context: 'Arrived later', label: 'office email', to: email.officeEmail(), error: new Error('down') });

  const res = await server.call('PUT', '/admin/delivery-failures/resolve', { ids }, { token: superAdmin });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { resolved: 2 });

  const rows = await prisma.deliveryFailure.findMany();
  const open = rows.filter((r) => r.resolvedAt === null);
  assert.deepEqual(open.map((r) => r.context), ['Arrived later']);

  const count = await server.call('GET', '/admin/delivery-failures/count', undefined, { token: superAdmin });
  assert.deepEqual(count.body, { open: 1 });

  // Pressing it again changes nothing, and keeps the time they were resolved.
  const before = rows.filter((r) => r.resolvedAt).map((r) => r.resolvedAt.getTime()).sort();
  const again = await server.call('PUT', '/admin/delivery-failures/resolve', { ids }, { token: superAdmin });
  assert.deepEqual(again.body, { resolved: 0 });
  const after = (await prisma.deliveryFailure.findMany({ where: { id: { in: ids } } })).map((r) => r.resolvedAt.getTime()).sort();
  assert.deepEqual(after, before);
});

test('"mark all resolved" needs at least one id', async () => {
  const failure = await seed({ context: 'Still open' });

  // Without a list of ids there is nothing to say which rows were seen, and
  // resolving "everything" would clear ones nobody has looked at.
  for (const body of [{ ids: [] }, {}]) {
    const res = await server.call('PUT', '/admin/delivery-failures/resolve', body, { token: superAdmin });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal((await prisma.deliveryFailure.findUnique({ where: { id: failure.id } })).resolvedAt, null);
});

test('resolved failures are hidden unless asked for with ?show=all', async () => {
  const open     = await seed({ context: 'Open one' });
  const resolved = await seed({ context: 'Resolved one', resolvedAt: new Date() });

  const list = await server.call('GET', '/admin/delivery-failures', undefined, { token: superAdmin });
  assert.deepEqual(list.body.failures.map((f) => f.id), [open.id]);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.open, 1);

  const all = await server.call('GET', '/admin/delivery-failures?show=all', undefined, { token: superAdmin });
  assert.deepEqual(all.body.failures.map((f) => f.id).sort(), [open.id, resolved.id].sort());
  assert.equal(all.body.total, 2);
  assert.equal(all.body.open, 1);
});

test('failures older than 90 days are not counted, and are deleted when the list is read', async () => {
  const now = Date.now();
  const stale         = await seed({ context: 'Stale open',     createdAt: new Date(now - 91 * DAY) });
  const staleResolved = await seed({ context: 'Stale resolved', createdAt: new Date(now - 120 * DAY), resolvedAt: new Date(now - 100 * DAY) });
  const oldButKept    = await seed({ context: 'Eighty-nine days', createdAt: new Date(now - 89 * DAY) });
  const fresh         = await seed({ context: 'Fresh' });

  // The sidebar badge counts over the window the list keeps, even before the
  // list has been opened to clear the old rows out.
  const count = await server.call('GET', '/admin/delivery-failures/count', undefined, { token: superAdmin });
  assert.deepEqual(count.body, { open: 2 });
  assert.equal(await prisma.deliveryFailure.count(), 4, 'counting alone deletes nothing');

  const list = await server.call('GET', '/admin/delivery-failures?show=all', undefined, { token: superAdmin });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.failures.map((f) => f.id).sort(), [oldButKept.id, fresh.id].sort());
  assert.equal(list.body.total, 2);
  assert.equal(list.body.open, 2);

  assert.equal(await prisma.deliveryFailure.findUnique({ where: { id: stale.id } }), null);
  assert.equal(await prisma.deliveryFailure.findUnique({ where: { id: staleResolved.id } }), null);
  assert.ok(await prisma.deliveryFailure.findUnique({ where: { id: oldButKept.id } }));
});
