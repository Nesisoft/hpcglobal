/**
 * The general rate limit counts visitors, not staff. Recording a Sunday's
 * tithes is a few hundred requests in one sitting, which a per-visitor cap
 * would cut off halfway with a message that reads like an outage — so a
 * request carrying a valid admin token is not counted. A made-up token buys
 * nothing.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const jwt    = require('jsonwebtoken');
const { loadApp, startServer, tokenFor } = require('./helpers');

const { app, prisma } = loadApp('limiter');

const CAP = 200;

let server;
let token;

test.before(async () => {
  server = await startServer(app);
  const user = await prisma.adminUser.create({
    data: { email: 'office@hpcglobal.org', name: 'The Office', role: 'SUPER_ADMIN', passwordHash: 'not-checked-here' },
  });
  token = tokenFor(user);
});

test.after(async () => {
  await server.close();
  await prisma.$disconnect();
});

const ping = (opts) => server.call('GET', '/health', undefined, opts);

test('a visitor is cut off after the cap; signed-in staff never are', async () => {
  const visitor = '203.0.113.7';
  const statuses = [];
  for (let i = 0; i < CAP + 1; i++) statuses.push((await ping({ ip: visitor })).status);
  assert.equal(statuses.filter((s) => s === 200).length, CAP, 'every request up to the cap is answered');
  assert.equal(statuses[CAP], 429, 'the one after it is refused');

  // Same address, but signed in: not counted, and not blocked by the count
  // the anonymous requests ran up.
  for (let i = 0; i < CAP + 20; i++) {
    const { status } = await ping({ ip: visitor, token });
    assert.equal(status, 200, `signed-in request ${i + 1}`);
  }

  // A token signed with the wrong secret is just an anonymous request.
  const forged = jwt.sign({ id: 'x', role: 'SUPER_ADMIN' }, 'not-the-secret', { expiresIn: '15m' });
  assert.equal((await ping({ ip: visitor, token: forged })).status, 429);

  // Another visitor is unaffected by the first one's count.
  assert.equal((await ping({ ip: '203.0.113.8' })).status, 200);
});

test('requests with an expired admin token are counted like anonymous ones', async () => {
  const user = await prisma.adminUser.findFirst();
  const expired = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET,
  );
  const visitor = '203.0.113.9';
  for (let i = 0; i < CAP; i++) {
    const { status } = await ping({ ip: visitor, token: expired });
    assert.equal(status, 200, `request ${i + 1} with the expired token`);
  }
  // They used up this address's allowance: the next request is refused,
  // with or without the expired token, while a valid one still goes through.
  assert.equal((await ping({ ip: visitor })).status, 429);
  assert.equal((await ping({ ip: visitor, token: expired })).status, 429);
  assert.equal((await ping({ ip: visitor, token })).status, 200);
});
