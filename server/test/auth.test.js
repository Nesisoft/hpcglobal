/**
 * Admin sign-in matches email addresses whatever their capitalisation, and the
 * user screens refuse an address that differs from another only in case.
 *
 * Both rest on lower(email) = lower(typed), compared exactly. The tempting
 * alternative, Prisma's case-insensitive `equals`, becomes ILIKE: '%' and '_'
 * in whatever was typed then match other people's accounts. Several cases
 * below exist only to catch that swap.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, startServer, tokenFor } = require('./helpers');

const { app, prisma } = loadApp('auth');

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

// forgot-password answers first and hands the token write to Vercel's
// waitUntil. Standing in for the platform's request context collects that work
// so a test can wait for it to finish, which is the only way to know a token
// was not written at all rather than not written yet.
const background = [];
globalThis[Symbol.for('@vercel/request-context')] = {
  get: () => ({ waitUntil: (promise) => { background.push(promise); } }),
};

async function backgroundSettled() {
  // If this hook ever stops receiving the work, the "no token" checks would
  // pass without having waited for anything, so say so instead.
  assert.ok(background.length > 0, 'forgot-password handed no work to waitUntil');
  await Promise.allSettled(background.splice(0));
}

const PASSWORD = 'Sunday-Service-7';
// Meets shared/passwordPolicy.json, which POST /admin/users enforces.
const STRONG_PASSWORD = 'Fresh-Start-2026!';

let passwordHash;
let superToken;
let server;

// Straight into the table, as older versions of the app did: whatever case
// the address arrives in is the case it is stored in.
function addAdmin(email, name, role = 'CONTENT_EDITOR') {
  return prisma.adminUser.create({ data: { email, name, role, passwordHash } });
}

const login = (email, password, ip) => server.call('POST', '/auth/login', { email, password }, { ip });
const forgot = (email, ip) => server.call('POST', '/auth/forgot-password', { email }, { ip });

// Who the portal will believe signed in.
const claims = (accessToken) => jwt.verify(accessToken, process.env.JWT_SECRET);

const clearResetTokens = () =>
  prisma.adminUser.updateMany({ data: { passwordResetToken: null, passwordResetExpiry: null } });

const accountsWithResetToken = async () =>
  (await prisma.adminUser.findMany({
    where:   { passwordResetToken: { not: null } },
    select:  { email: true },
    orderBy: { email: 'asc' },
  })).map((u) => u.email);

test.before(async () => {
  // Few rounds keeps the file fast; compare() reads the cost from the hash.
  passwordHash = await bcrypt.hash(PASSWORD, 4);
  superToken = tokenFor(await addAdmin('super@hpcglobal.org', 'Super Admin', 'SUPER_ADMIN'));
  await addAdmin('office@hpcglobal.org', 'Office');
  await addAdmin('ama@hpcglobal.org', 'Ama Mensah');
  // Saved before addresses were lowercased on the way in.
  await addAdmin('Kofi@HPCGlobal.org', 'Kofi Boateng');
  server = await startServer(app);
});

test.after(async () => {
  await server?.close();
  await prisma.$disconnect();
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

test('login matches the address whatever its capitalisation and surrounding spaces', async () => {
  const ip = '203.0.113.1';

  // Saved lowercase, typed however the person types it.
  const typed = await login('  AMA@HpcGlobal.ORG ', PASSWORD, ip);
  assert.equal(typed.status, 200);
  assert.equal(claims(typed.body.accessToken).email, 'ama@hpcglobal.org');

  // Saved in mixed case by an older version, typed lowercase.
  const legacy = await login('kofi@hpcglobal.org', PASSWORD, ip);
  assert.equal(legacy.status, 200);
  assert.equal(claims(legacy.body.accessToken).name, 'Kofi Boateng');
});

test('a wrong password is still refused when the address matches in another case', async () => {
  const res = await login('Ama@HPCGlobal.org', 'Not-the-password-1', '203.0.113.2');
  assert.equal(res.status, 401);
  assert.equal(res.body.message, 'Invalid credentials');
  assert.equal(res.body.accessToken, undefined);
});

test("'_' in a typed address is a character at sign-in, not a wildcard", async () => {
  const ip = '203.0.113.3';
  // Under ILIKE each '_' matches any one character, so a pattern would let
  // someone try a password against accounts whose addresses they never knew.
  // Both of these would land on office@hpcglobal.org.
  for (const email of ['o_fice@hpcglobal.org', '______@hpcglobal.org']) {
    const res = await login(email, PASSWORD, ip);
    assert.equal(res.status, 401, `${email} should not sign in`);
    assert.equal(res.body.accessToken, undefined);
  }

  // The real address with the same password does work, so the refusals above
  // are about the address and nothing else.
  assert.equal((await login('office@hpcglobal.org', PASSWORD, ip)).status, 200);
});

test('two accounts differing only in case: the exact spelling signs in, any other is refused', async () => {
  const ip = '203.0.113.4';
  // The unique index is case-sensitive, so legacy data can hold both.
  await addAdmin('Twin@hpcglobal.org', 'Twin Capital');
  await addAdmin('twin@hpcglobal.org', 'Twin Lower');

  // Same password on both, so this refusal can only be the ambiguity: picking
  // one would sign the person into an account that may not be theirs.
  const third = await login('TWIN@hpcglobal.org', PASSWORD, ip);
  assert.equal(third.status, 401);

  const capital = await login('Twin@hpcglobal.org', PASSWORD, ip);
  assert.equal(capital.status, 200);
  assert.equal(claims(capital.body.accessToken).name, 'Twin Capital');

  const lower = await login('twin@hpcglobal.org', PASSWORD, ip);
  assert.equal(lower.status, 200);
  assert.equal(claims(lower.body.accessToken).name, 'Twin Lower');
});

// ─── POST /auth/forgot-password ───────────────────────────────────────────────

test("forgot-password treats '%' and '_' as characters, so a pattern resets nobody", async () => {
  const ip = '203.0.113.5';
  await clearResetTokens();

  // Unlike login, nothing validates this address first, so '%' reaches the
  // lookup as typed. Under ILIKE it matches every admin, and one of them would
  // get a reset link nobody asked for.
  for (const email of ['%', '%@hpcglobal.org', 'o_fice@hpcglobal.org']) {
    const res = await forgot(email, ip);
    assert.equal(res.status, 200);
  }
  await backgroundSettled();

  assert.deepEqual(await accountsWithResetToken(), []);
});

test('forgot-password finds the account whatever its capitalisation and writes its token', async () => {
  await clearResetTokens();

  const res = await forgot('  Ama@HPCGLOBAL.org ', '203.0.113.6');
  assert.equal(res.status, 200);
  await backgroundSettled();

  const ama = await prisma.adminUser.findUnique({ where: { email: 'ama@hpcglobal.org' } });
  assert.match(ama.passwordResetToken ?? '', /^[0-9a-f]{64}$/);
  assert.ok(ama.passwordResetExpiry > new Date(), 'the reset link should not already have expired');
  assert.deepEqual(await accountsWithResetToken(), ['ama@hpcglobal.org']);
});

test('forgot-password answers a known and an unknown address identically', async () => {
  const ip = '203.0.113.7';
  // Anything that differed would tell a stranger which addresses are admins.
  const known   = await forgot('office@hpcglobal.org', ip);
  const unknown = await forgot('nobody@hpcglobal.org', ip);
  await backgroundSettled();

  assert.equal(known.status, 200);
  assert.equal(unknown.status, known.status);
  assert.deepEqual(unknown.body, known.body);
});

test('forgot-password for an address two accounts share in different cases resets neither', async () => {
  await addAdmin('Pair@hpcglobal.org', 'Pair Capital');
  await addAdmin('pair@hpcglobal.org', 'Pair Lower');
  await clearResetTokens();

  await forgot('PAIR@hpcglobal.org', '203.0.113.8');
  await backgroundSettled();

  assert.deepEqual(await accountsWithResetToken(), []);
});

// ─── POST / PUT /admin/users ──────────────────────────────────────────────────
// The user schema lowercases the address, so the unique index alone would
// catch a clash with an account saved in lowercase. Kofi was saved in mixed
// case, which only emailTakenByAnother can see.

const kofiSpellings = () =>
  prisma.$queryRaw`SELECT email FROM "AdminUser" WHERE lower(email) = 'kofi@hpcglobal.org'`;

test('creating an account with an address another has in a different case is refused', async () => {
  const res = await server.call('POST', '/admin/users', {
    name: 'Kofi Again', email: 'KOFI@hpcglobal.org', role: 'CONTENT_EDITOR', password: STRONG_PASSWORD,
  }, { token: superToken, ip: '203.0.113.9' });

  assert.equal(res.status, 409);
  assert.deepEqual((await kofiSpellings()).map((r) => r.email), ['Kofi@HPCGlobal.org']);
});

test("renaming an account onto another's address in a different case is refused", async () => {
  const yaw = await addAdmin('yaw@hpcglobal.org', 'Yaw Asante');

  const res = await server.call('PUT', `/admin/users/${yaw.id}`, {
    name: 'Yaw Asante', email: 'kOFI@HPCGlobal.org', role: 'CONTENT_EDITOR',
  }, { token: superToken, ip: '203.0.113.10' });

  assert.equal(res.status, 409);
  const after = await prisma.adminUser.findUnique({ where: { id: yaw.id } });
  assert.equal(after.email, 'yaw@hpcglobal.org');
  assert.deepEqual((await kofiSpellings()).map((r) => r.email), ['Kofi@HPCGlobal.org']);
});

test('renaming an account to its own address in a different case is allowed', async () => {
  // An older account whose spelling the office tidies up. The only row that
  // matches is its own, so it must not count as taken.
  const esi = await addAdmin('Esi@HPCGlobal.org', 'Esi Owusu');

  const res = await server.call('PUT', `/admin/users/${esi.id}`, {
    name: 'Esi Owusu', email: 'ESI@HPCGLOBAL.ORG', role: 'CONTENT_EDITOR',
  }, { token: superToken, ip: '203.0.113.11' });

  assert.equal(res.status, 200);
  assert.equal(res.body.email, 'esi@hpcglobal.org');
  const after = await prisma.adminUser.findUnique({ where: { id: esi.id } });
  assert.equal(after.email, 'esi@hpcglobal.org');
});
