/**
 * Signing up, signing in, and resetting a forgotten password.
 *
 * The old PHP app let anyone finish someone else's registration with any role
 * (admin included), returned one-time codes in its API responses, and never
 * checked its reset token. These tests pin down that none of that is possible
 * here: a sign-up is always a PENDING worker, the reset code exists only in
 * the email, and it expires and runs out of tries.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, startServer, makeWorker, makeDepartment, signIn, PASSWORD } = require('./helpers');
const { startFakeResend } = require('./fakes');

let api, prisma, resend, departments;

test.before(async () => {
  resend = await startFakeResend();
  const loaded = loadApp('auth', { RESEND_BASE_URL: resend.url, RESEND_API_KEY: 're_test_key', EMAILS_PER_DAY: '1000', EMAILS_PER_ADDRESS_PER_DAY: '1000' });
  prisma = loaded.prisma;
  api = await startServer(loaded.app);
  departments = {
    ushers:   await makeDepartment(prisma, 'Ushers'),
    media:    await makeDepartment(prisma, 'Media'),
    archived: await makeDepartment(prisma, 'Old Dept', { active: false }),
  };
});
test.after(async () => { await api.close(); await resend.close(); await prisma.$disconnect(); });
test.beforeEach(() => resend.reset());

const signUp = (overrides = {}) => api.call('POST', '/auth/register', {
  firstName:    'Ama',
  lastName:     'Mensah',
  email:        `ama.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@Example.com`,
  phone:        '024 412 3456',
  gender:       'FEMALE',
  departmentId: departments.ushers.id,
  password:     PASSWORD,
  ...overrides,
});

// ─── Sign up ──────────────────────────────────────────────────────────────────

test('a sign-up is a pending worker in the chosen department, signed in', async () => {
  const res = await signUp({ email: 'Kofi.Boateng@Example.COM ' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.token);
  const w = res.body.worker;
  assert.equal(w.status, 'PENDING');
  assert.equal(w.role, 'WORKER');
  assert.equal(w.isHod, false);
  assert.equal(w.email, 'kofi.boateng@example.com');
  assert.equal(w.phone, '233244123456');
  assert.equal(w.phoneDisplay, '024 412 3456');
  assert.equal(w.department.name, 'Ushers');
  assert.equal(w.passwordHash, undefined);

  const me = await api.call('GET', '/me', undefined, { token: res.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.worker.status, 'PENDING');
});

test('a sign-up cannot choose its own role, HOD flag or status', async () => {
  const res = await signUp({ role: 'SUPER_ADMIN', isHod: true, status: 'ACTIVE' });
  assert.equal(res.status, 201);
  const stored = await prisma.worker.findUnique({ where: { id: res.body.worker.id } });
  assert.equal(stored.role, 'WORKER');
  assert.equal(stored.isHod, false);
  assert.equal(stored.status, 'PENDING');
});

test('a pending worker can see themselves but nothing else', async () => {
  const { body } = await signUp();
  const hod   = await api.call('GET', '/hod/members', undefined, { token: body.token });
  const admin = await api.call('GET', '/admin/workers', undefined, { token: body.token });
  assert.equal(hod.status, 403);
  assert.equal(hod.body.code, 'PENDING_APPROVAL');
  assert.equal(admin.status, 403);
});

test('sign-up refuses a weak password, a bad phone, an archived or unknown department, and a taken email', async () => {
  const weak = await signUp({ password: 'password' });
  assert.equal(weak.status, 400);
  assert.match(weak.body.message, /^Password needs/);

  const phone = await signUp({ phone: '12345' });
  assert.equal(phone.status, 400);
  assert.match(phone.body.message, /024 412 3456/);

  const archived = await signUp({ departmentId: departments.archived.id });
  assert.equal(archived.status, 400);
  assert.equal(archived.body.field, 'departmentId');

  const unknown = await signUp({ departmentId: '00000000-0000-4000-8000-000000000000' });
  assert.equal(unknown.status, 400);

  const first = await signUp({ email: 'twice@example.com' });
  assert.equal(first.status, 201);
  const again = await signUp({ email: 'TWICE@example.com' });
  assert.equal(again.status, 409);
  assert.equal(again.body.field, 'email');
});

test('a pending worker may move to another department; an active one may not', async () => {
  const { body } = await signUp();
  const profile = { firstName: 'Ama', lastName: 'Mensah', phone: '0244123456', gender: 'FEMALE' };
  const moved = await api.call('PUT', '/me', { ...profile, departmentId: departments.media.id }, { token: body.token });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.worker.department.name, 'Media');

  const active = await makeWorker(prisma, { departmentId: departments.ushers.id });
  const token = await signIn(api.call, active.email);
  const refused = await api.call('PUT', '/me', { ...profile, departmentId: departments.media.id }, { token });
  assert.equal(refused.status, 403);
});

// ─── Sign in ──────────────────────────────────────────────────────────────────

test('sign-in: right password works, wrong password and unknown email get the same answer', async () => {
  const w = await makeWorker(prisma, { email: 'signin@example.com' });
  const ok = await api.call('POST', '/auth/login', { email: ' SignIn@Example.com', password: PASSWORD });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.worker.id, w.id);
  assert.ok((await prisma.worker.findUnique({ where: { id: w.id } })).lastLogin);

  const wrong   = await api.call('POST', '/auth/login', { email: 'signin@example.com', password: 'Nope-nope-1' }, { ip: '10.9.0.1' });
  const unknown = await api.call('POST', '/auth/login', { email: 'nobody@example.com', password: PASSWORD }, { ip: '10.9.0.2' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.message, unknown.body.message);
});

test('suspended and declined workers are told why and get no token', async () => {
  const suspended = await makeWorker(prisma, { status: 'SUSPENDED' });
  await prisma.worker.update({ where: { id: suspended.id }, data: { statusNote: 'Repeated absence' } });
  const res = await api.call('POST', '/auth/login', { email: suspended.email, password: PASSWORD });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'SUSPENDED');
  assert.equal(res.body.note, 'Repeated absence');
  assert.equal(res.body.token, undefined);

  const declined = await makeWorker(prisma, { status: 'DECLINED' });
  const res2 = await api.call('POST', '/auth/login', { email: declined.email, password: PASSWORD });
  assert.equal(res2.status, 403);
  assert.equal(res2.body.code, 'DECLINED');
});

test('suspending a signed-in worker shuts them out at once, not when the token expires', async () => {
  const w = await makeWorker(prisma, { departmentId: departments.ushers.id, isHod: true });
  const token = await signIn(api.call, w.email);
  assert.equal((await api.call('GET', '/hod/members', undefined, { token })).status, 200);

  await prisma.worker.update({ where: { id: w.id }, data: { status: 'SUSPENDED' } });
  const after = await api.call('GET', '/hod/members', undefined, { token });
  assert.equal(after.status, 403);
  assert.equal(after.body.code, 'SUSPENDED');
});

test('a forged, foreign or outdated token is refused', async () => {
  const w = await makeWorker(prisma);
  const token = await signIn(api.call, w.email);
  const jwt = require('jsonwebtoken');

  const forged = jwt.sign({ sub: w.id, tv: 0 }, 'someone-elses-secret-0123456789abcdef', { audience: 'hpc-workers' });
  assert.equal((await api.call('GET', '/me', undefined, { token: forged })).status, 401);

  // A website admin token is signed for a different audience.
  const website = jwt.sign({ id: w.id, role: 'SUPER_ADMIN' }, process.env.JWT_SECRET);
  assert.equal((await api.call('GET', '/me', undefined, { token: website })).status, 401);

  const elsewhere = await api.call('POST', '/me/sign-out-elsewhere', undefined, { token });
  assert.equal(elsewhere.status, 200);
  assert.equal((await api.call('GET', '/me', undefined, { token })).status, 401, 'the old token is signed out');
  assert.equal((await api.call('GET', '/me', undefined, { token: elsewhere.body.token })).status, 200);
});

test('changing your password needs the current one and signs out other devices', async () => {
  const w = await makeWorker(prisma);
  const token = await signIn(api.call, w.email);
  const wrong = await api.call('POST', '/me/password', { currentPassword: 'Wrong-pass-12', newPassword: 'Another-Pass-77' }, { token });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.field, 'currentPassword');

  const same = await api.call('POST', '/me/password', { currentPassword: PASSWORD, newPassword: PASSWORD }, { token });
  assert.equal(same.status, 400);

  const ok = await api.call('POST', '/me/password', { currentPassword: PASSWORD, newPassword: 'Another-Pass-77' }, { token });
  assert.equal(ok.status, 200);
  assert.equal((await api.call('GET', '/me', undefined, { token })).status, 401);
  assert.equal((await api.call('POST', '/auth/login', { email: w.email, password: 'Another-Pass-77' })).status, 200);
});

// ─── Forgotten password ───────────────────────────────────────────────────────

test('reset: the code goes only to the email, works once, and signs out old sessions', async () => {
  const w = await makeWorker(prisma, { email: 'forgot@example.com' });
  const oldToken = await signIn(api.call, w.email);

  const asked = await api.call('POST', '/auth/forgot-password', { email: 'Forgot@Example.com' });
  assert.equal(asked.status, 200);
  assert.doesNotMatch(JSON.stringify(asked.body), /\d{6}/, 'the code is never in the response');
  assert.equal(resend.sent.length, 1);
  assert.deepEqual(resend.sent[0].to, ['forgot@example.com']);
  assert.equal(resend.sent[0].authorization, 'Bearer re_test_key');
  const code = resend.codeFor('forgot@example.com');
  assert.match(code, /^\d{6}$/);

  const stored = await prisma.worker.findUnique({ where: { id: w.id } });
  assert.notEqual(stored.resetCodeHash, code, 'only a hash is kept');
  assert.ok(!stored.resetCodeHash.includes(code));

  const reset = await api.call('POST', '/auth/reset-password', { email: w.email, code, password: 'Brand-New-Pass-5' });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.ok(reset.body.token);
  assert.equal((await api.call('GET', '/me', undefined, { token: oldToken })).status, 401);

  const again = await api.call('POST', '/auth/reset-password', { email: w.email, code, password: 'Another-New-Pass-6' });
  assert.equal(again.status, 400, 'a code works once');
  assert.equal((await api.call('POST', '/auth/login', { email: w.email, password: 'Brand-New-Pass-5' })).status, 200);
});

test('reset: an unknown email gets the same answer and no email', async () => {
  const res = await api.call('POST', '/auth/forgot-password', { email: 'nobody-here@example.com' });
  assert.equal(res.status, 200);
  assert.equal(resend.sent.length, 0);
  const known = await makeWorker(prisma);
  const res2 = await api.call('POST', '/auth/forgot-password', { email: known.email });
  assert.equal(res2.body.message, res.body.message);
});

test('reset: five wrong tries use the code up, even sent all at once', async () => {
  const w = await makeWorker(prisma);
  await api.call('POST', '/auth/forgot-password', { email: w.email });
  const code = resend.codeFor(w.email);
  const wrong = code === '000000' ? '111111' : '000000';

  const guesses = await Promise.all(Array.from({ length: 8 }, () =>
    api.call('POST', '/auth/reset-password', { email: w.email, code: wrong, password: 'Brand-New-Pass-5' })));
  assert.ok(guesses.every((g) => g.status === 400));
  assert.ok(guesses.filter((g) => /Too many/.test(g.body.message)).length >= 3);

  const right = await api.call('POST', '/auth/reset-password', { email: w.email, code, password: 'Brand-New-Pass-5' });
  assert.equal(right.status, 400, 'the right code no longer works after five wrong tries');
  assert.match(right.body.message, /Too many/);
});

test('reset: an expired code is refused', async () => {
  const w = await makeWorker(prisma);
  await api.call('POST', '/auth/forgot-password', { email: w.email });
  const code = resend.codeFor(w.email);
  await prisma.worker.update({ where: { id: w.id }, data: { resetCodeExpires: new Date(Date.now() - 1000) } });
  const res = await api.call('POST', '/auth/reset-password', { email: w.email, code, password: 'Brand-New-Pass-5' });
  assert.equal(res.status, 400);
});

test('reset: one email a minute, however often the button is pressed', async () => {
  const w = await makeWorker(prisma);
  await Promise.all([1, 2, 3].map(() => api.call('POST', '/auth/forgot-password', { email: w.email })));
  assert.equal(resend.sent.length, 1);
});

test('reset: when email is down the person is told, and can ask again at once', async () => {
  const w = await makeWorker(prisma);
  resend.down = true;
  const res = await api.call('POST', '/auth/forgot-password', { email: w.email });
  assert.equal(res.status, 502);
  resend.down = false;
  const retry = await api.call('POST', '/auth/forgot-password', { email: w.email });
  assert.equal(retry.status, 200);
  assert.equal(resend.sent.length, 1);
});

test('the department list for sign-up has active departments only, by name', async () => {
  const res = await api.call('GET', '/departments');
  assert.equal(res.status, 200);
  const names = res.body.departments.map((d) => d.name);
  assert.ok(names.includes('Ushers'));
  assert.ok(!names.includes('Old Dept'));
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('wrong passwords for one account are limited; other accounts on the same network are not', async () => {
  const target = await makeWorker(prisma);
  const other  = await makeWorker(prisma);
  const ip = '10.20.30.40';
  let limited = false;
  for (let i = 0; i < 12; i += 1) {
    const res = await api.call('POST', '/auth/login', { email: target.email, password: 'Wrong-pass-12' }, { ip });
    if (res.status === 429) limited = true;
  }
  assert.ok(limited, 'the 11th wrong password is refused');
  const fine = await api.call('POST', '/auth/login', { email: other.email, password: PASSWORD }, { ip });
  assert.equal(fine.status, 200, 'someone else on the same church Wi-Fi can still sign in');
});

// ─── Limits that a sign-in token can't switch off ────────────────────────────

test('a sign-up token doesn’t lift the limit on wrong passwords from one address', async () => {
  // Wrong passwords spread over many accounts from one address: 50 at most.
  const { body } = await signUp();
  const accounts = await Promise.all(Array.from({ length: 6 }, () => makeWorker(prisma)));
  const ip = '10.77.0.1';
  let refused = 0;
  for (const a of accounts) {
    for (let i = 0; i < 9; i += 1) {
      const res = await api.call('POST', '/auth/login', { email: a.email, password: 'Wrong-pass-12' }, { ip, token: body.token });
      if (res.status === 429) refused += 1;
    }
  }
  assert.ok(refused >= 4, `54 wrong passwords from one address: the last few are refused (got ${refused})`);
  const someoneElse = await makeWorker(prisma);
  const fine = await api.call('POST', '/auth/login', { email: someoneElse.email, password: PASSWORD }, { ip: '10.77.0.2' });
  assert.equal(fine.status, 200, 'another address is unaffected');
});

test('guessing the current password from a signed-in session is limited', async () => {
  const w = await makeWorker(prisma);
  const token = await signIn(api.call, w.email);
  const statuses = [];
  for (let i = 0; i < 12; i += 1) {
    statuses.push((await api.call('POST', '/me/password', { currentPassword: `Wrong-pass-${i}0`, newPassword: 'Another-Pass-77' }, { token })).status);
  }
  assert.ok(statuses.slice(0, 10).every((s) => s === 400));
  assert.equal(statuses[11], 429);
});

// ─── A day's allowance of reset codes and guesses ────────────────────────────

const allowNextCode = (id) => prisma.worker.update({ where: { id }, data: { resetCodeSentAt: new Date(Date.now() - 61_000) } });

test('reset: three codes a day per account', async () => {
  const w = await makeWorker(prisma);
  for (let i = 0; i < 5; i += 1) {
    const res = await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.88.0.1' });
    assert.equal(res.status, 200);
    await allowNextCode(w.id);
  }
  assert.equal(resend.sent.filter((m) => m.to.includes(w.email)).length, 3);

  // The next day, codes come again.
  await prisma.worker.update({ where: { id: w.id }, data: { resetWindowStart: new Date(Date.now() - 25 * 3600 * 1000) } });
  await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.88.0.1' });
  assert.equal(resend.sent.filter((m) => m.to.includes(w.email)).length, 4);
});

test('reset: asking for new codes doesn’t buy more than ten wrong guesses a day', async () => {
  const w = await makeWorker(prisma);
  let wrongTries = 0;
  for (let round = 0; round < 4; round += 1) {
    await allowNextCode(w.id);
    await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.88.0.2' });
    const code = resend.codeFor(w.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      const res = await api.call('POST', '/auth/reset-password', { email: w.email, code: wrong, password: 'Brand-New-Pass-5' }, { ip: '10.88.0.2' });
      assert.equal(res.status, 400);
      if (!/Too many/.test(res.body.message)) wrongTries += 1;
    }
  }
  assert.equal(wrongTries, 10, 'ten wrong guesses were checked, no more');

  // Even the right code is refused for the rest of the day…
  await allowNextCode(w.id);
  await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.88.0.2' });
  const stored = await prisma.worker.findUnique({ where: { id: w.id } });
  assert.ok(stored.resetFailuresInWindow >= 10);
  const last = await api.call('POST', '/auth/reset-password', { email: w.email, code: resend.codeFor(w.email), password: 'Brand-New-Pass-5' }, { ip: '10.88.0.2' });
  assert.equal(last.status, 400);
  assert.match(last.body.message, /Too many wrong codes today/);
});

test('reset: the right code first time leaves the day’s allowance untouched', async () => {
  const w = await makeWorker(prisma);
  await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.88.0.3' });
  const ok = await api.call('POST', '/auth/reset-password', { email: w.email, code: resend.codeFor(w.email), password: 'Brand-New-Pass-5' }, { ip: '10.88.0.3' });
  assert.equal(ok.status, 200);
  assert.equal((await prisma.worker.findUnique({ where: { id: w.id } })).resetFailuresInWindow, 0);
});

test('an expired temporary password no longer signs in or sets a new password', async () => {
  const w = await makeWorker(prisma);
  await prisma.worker.update({ where: { id: w.id }, data: { mustChangePassword: true, tempPasswordExpires: new Date(Date.now() + 60_000) } });
  const token = await signIn(api.call, w.email);
  await prisma.worker.update({ where: { id: w.id }, data: { tempPasswordExpires: new Date(Date.now() - 1000) } });

  const login = await api.call('POST', '/auth/login', { email: w.email, password: PASSWORD });
  assert.equal(login.status, 403);
  assert.equal(login.body.code, 'TEMP_PASSWORD_EXPIRED');
  const change = await api.call('POST', '/me/password', { currentPassword: PASSWORD, newPassword: 'My-Own-Pass-42' }, { token });
  assert.equal(change.status, 401, 'the sign-in made with it ends too');
  assert.equal(change.body.code, 'TEMP_PASSWORD_EXPIRED');
  const me = await api.call('GET', '/me', undefined, { token });
  assert.equal(me.status, 401);
  assert.equal(me.body.code, 'TEMP_PASSWORD_EXPIRED');
});

test('moving yourself to another department while waiting drops any HOD flag', async () => {
  const { body } = await signUp();
  await prisma.worker.update({ where: { id: body.worker.id }, data: { isHod: true } });
  const moved = await api.call('PUT', '/me', {
    firstName: 'Ama', lastName: 'Mensah', phone: '0244123456', gender: 'FEMALE', departmentId: departments.media.id,
  }, { token: body.token });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.worker.isHod, false);
});

// ─── Found in the second review ──────────────────────────────────────────────

test('names are letters, with the punctuation names have', async () => {
  const digits = await signUp({ firstName: 'Call 0244000000' });
  assert.equal(digits.status, 400);
  assert.equal(digits.body.field, 'firstName');
  const link = await signUp({ lastName: 'see http://x.example' });
  assert.equal(link.status, 400);
  const real = await signUp({ firstName: 'Akosua-Mary', lastName: 'O’Neil-Dankwa Jr.' });
  assert.equal(real.status, 201, JSON.stringify(real.body));
});

test('a sign-up nobody has approved yet gets no reset email', async () => {
  const { body } = await signUp({ email: 'unapproved@example.com' });
  const res = await api.call('POST', '/auth/forgot-password', { email: 'unapproved@example.com' }, { ip: '10.89.0.1' });
  assert.equal(res.status, 200);
  assert.equal(resend.sent.length, 0);
  assert.equal((await prisma.worker.findUnique({ where: { id: body.worker.id } })).resetCodeHash, null);
});

const today = () => new Date().toISOString().slice(0, 10);
async function withEmailCount(key, sent, fn) {
  const before = await prisma.emailCount.findUnique({ where: { key } });
  await prisma.emailCount.upsert({ where: { key }, create: { key, day: today(), sent }, update: { sent } });
  try { await fn(); } finally {
    await prisma.emailCount.update({ where: { key }, data: { sent: before?.sent ?? 0 } });
  }
}

test('the app sends at most the day’s allowance of emails — and says so the same way for every email', async () => {
  const w = await makeWorker(prisma);
  await withEmailCount(`all:${today()}`, 1000, async () => {
    const known   = await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.89.0.2' });
    const unknown = await api.call('POST', '/auth/forgot-password', { email: 'nobody-at-all@example.com' }, { ip: '10.89.0.2' });
    assert.equal(known.status, 503);
    assert.equal(unknown.status, 503, 'an unknown email gets the same answer, so it reveals nothing');
    assert.deepEqual(known.body, unknown.body);
    assert.match(known.body.message, /temporary password/);
    assert.equal(resend.sent.length, 0);
    const stored = await prisma.worker.findUnique({ where: { id: w.id } });
    assert.equal(stored.resetCodesInWindow, 0, 'the account’s own allowance isn’t touched');
  });
  // Under the allowance, each email sent counts once, for the app and the address.
  const allBefore = (await prisma.emailCount.findUnique({ where: { key: `all:${today()}` } }))?.sent ?? 0;
  await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.89.0.2' });
  assert.equal((await prisma.emailCount.findUnique({ where: { key: `all:${today()}` } })).sent, allBefore + 1);
  assert.equal((await prisma.emailCount.findUnique({ where: { key: `address:${today()}:10.89.0.2` } })).sent, 1);
});

test('one address can only spend its own share of the day’s emails', async () => {
  const w = await makeWorker(prisma);
  await withEmailCount(`address:${today()}:10.89.0.9`, 1000, async () => {
    const res = await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.89.0.9' });
    assert.equal(res.status, 503);
    const elsewhere = await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.89.0.10' });
    assert.equal(elsewhere.status, 200, 'the same person from another connection is fine');
    assert.equal(resend.sent.length, 1);
  });
});

test('a resend that fails leaves the code they already have working', async () => {
  const w = await makeWorker(prisma);
  const ip = '10.89.0.11';
  await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip });
  const first = resend.codeFor(w.email);
  await allowNextCode(w.id);
  resend.down = true;
  assert.equal((await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip })).status, 502);
  resend.down = false;
  const res = await api.call('POST', '/auth/reset-password', { email: w.email, code: first, password: 'Brand-New-Pass-5' }, { ip });
  assert.equal(res.status, 200, 'the first code still works');
  const stored = await prisma.worker.findUnique({ where: { id: w.id } });
  assert.equal(stored.resetCodesInWindow, 1, 'the failed resend didn’t use up a code');
});

test('reset: a new day’s allowance starts even if no new code was asked for', async () => {
  const w = await makeWorker(prisma);
  const ip = '10.89.0.12';
  await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip });
  const code = resend.codeFor(w.email);
  // Yesterday's guesses all used, but this code is still fresh.
  await prisma.worker.update({
    where: { id: w.id },
    data:  { resetWindowStart: new Date(Date.now() - 25 * 3600 * 1000), resetFailuresInWindow: 10 },
  });
  const res = await api.call('POST', '/auth/reset-password', { email: w.email, code, password: 'Brand-New-Pass-5' }, { ip });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await prisma.worker.findUnique({ where: { id: w.id } })).resetFailuresInWindow, 0, 'never below nought');
});

test('a code sent before the email changed doesn’t work under the new email', async () => {
  const w = await makeWorker(prisma);
  await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.89.0.3' });
  const code = resend.codeFor(w.email);
  // The address changes without the admin route's clean-up, as in a race.
  await prisma.worker.update({ where: { id: w.id }, data: { email: `moved-${w.email}` } });
  const res = await api.call('POST', '/auth/reset-password', { email: `moved-${w.email}`, code, password: 'Brand-New-Pass-5' }, { ip: '10.89.0.3' });
  assert.equal(res.status, 400);
});

test('signing in renews a week-old token for 60 days; not a fresh one, nor a shut-out account', async () => {
  const jwt = require('jsonwebtoken');
  const w = await makeWorker(prisma);
  const now = Math.floor(Date.now() / 1000);
  const old = jwt.sign({ sub: w.id, tv: 0, iat: now - 8 * 86400 }, process.env.JWT_SECRET, { audience: 'hpc-workers', expiresIn: '60d' });
  const renewed = await api.call('GET', '/me', undefined, { token: old });
  assert.equal(renewed.status, 200);
  assert.ok(renewed.body.token, 'a week-old token is renewed');
  const claims = jwt.decode(renewed.body.token);
  assert.ok(claims.exp - now > 59 * 86400, 'for another 60 days');

  const fresh = jwt.sign({ sub: w.id, tv: 0, ok: true }, process.env.JWT_SECRET, { audience: 'hpc-workers', expiresIn: '60d' });
  assert.equal((await api.call('GET', '/me', undefined, { token: fresh })).body.token, undefined);

  const declined = await makeWorker(prisma, { status: 'DECLINED' });
  const oldDeclined = jwt.sign({ sub: declined.id, tv: 0, iat: now - 8 * 86400 }, process.env.JWT_SECRET, { audience: 'hpc-workers', expiresIn: '60d' });
  const res = await api.call('GET', '/me', undefined, { token: oldDeclined });
  assert.equal(res.status, 200);
  assert.equal(res.body.token, undefined, 'a declined account is not renewed');

  const expired = jwt.sign({ sub: w.id, tv: 0, iat: now - 61 * 86400, exp: now - 86400 }, process.env.JWT_SECRET, { audience: 'hpc-workers' });
  assert.equal((await api.call('GET', '/me', undefined, { token: expired })).status, 401);
});

test('reset: wrong guesses already used today count against a new code', async () => {
  const w = await makeWorker(prisma);
  const ip = '10.89.0.4';
  await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip });
  const code = resend.codeFor(w.email);
  const wrong = code === '000000' ? '111111' : '000000';
  await prisma.worker.update({ where: { id: w.id }, data: { resetFailuresInWindow: 8 } });
  const messages = [];
  for (let i = 0; i < 5; i += 1) {
    messages.push((await api.call('POST', '/auth/reset-password', { email: w.email, code: wrong, password: 'Brand-New-Pass-5' }, { ip })).body.message);
  }
  assert.equal(messages.filter((m) => /wrong or has expired/.test(m)).length, 2, 'only two more guesses were checked');
  assert.match(messages[4], /Too many wrong codes today/);
});

test('reset: no new code once the day’s wrong guesses are used up', async () => {
  const w = await makeWorker(prisma);
  await prisma.worker.update({
    where: { id: w.id },
    data:  { resetWindowStart: new Date(), resetFailuresInWindow: 10, resetCodeSentAt: new Date(Date.now() - 120_000) },
  });
  const res = await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.89.0.5' });
  assert.equal(res.status, 200);
  assert.equal(resend.sent.filter((m) => m.to.includes(w.email)).length, 0);
});

test('wrong passwords lock out one address for one account, not the account everywhere', async () => {
  const target = await makeWorker(prisma);
  const ip = '10.89.0.6';
  for (let i = 0; i < 10; i += 1) await api.call('POST', '/auth/login', { email: target.email, password: 'Wrong-pass-12' }, { ip });
  assert.equal((await api.call('POST', '/auth/login', { email: target.email, password: 'Wrong-pass-12' }, { ip })).status, 429);
  assert.equal((await api.call('POST', '/auth/login', { email: target.email, password: PASSWORD }, { ip: '10.89.0.7' })).status, 200,
    'the worker can still sign in from their own phone');
});

test('IPv6 addresses in one /56 share their limits', async () => {
  const target = await makeWorker(prisma);
  for (let i = 0; i < 10; i += 1) {
    await api.call('POST', '/auth/login', { email: target.email, password: 'Wrong-pass-12' }, { ip: `2001:db8:0:1::${i + 1}` });
  }
  const sameNetwork = await api.call('POST', '/auth/login', { email: target.email, password: 'Wrong-pass-12' }, { ip: '2001:db8:0:1:ffff::2' });
  assert.equal(sameNetwork.status, 429, 'a new address in the same /56 gets no fresh tries');
  const otherNetwork = await api.call('POST', '/auth/login', { email: target.email, password: 'Wrong-pass-12' }, { ip: '2001:db8:0:100::1' });
  assert.equal(otherNetwork.status, 401);
});

test('moving your own sign-up, changing your password and an emailed reset are all in the audit log', async () => {
  const { body } = await signUp();
  await api.call('PUT', '/me', {
    firstName: 'Ama', lastName: 'Mensah', phone: '0244123456', gender: 'FEMALE', departmentId: departments.media.id,
  }, { token: body.token });
  const move = await prisma.auditLog.findFirst({ where: { targetId: body.worker.id, action: 'worker.self-move' } });
  assert.match(move.summary, /from Ushers to Media/);

  const w = await makeWorker(prisma);
  const token = await signIn(api.call, w.email);
  await api.call('POST', '/me/password', { currentPassword: PASSWORD, newPassword: 'Another-Pass-77' }, { token });
  assert.ok(await prisma.auditLog.findFirst({ where: { targetId: w.id, action: 'worker.password-change' } }));

  await api.call('POST', '/auth/forgot-password', { email: w.email }, { ip: '10.89.0.8' });
  await api.call('POST', '/auth/reset-password', { email: w.email, code: resend.codeFor(w.email), password: 'Brand-New-Pass-5' }, { ip: '10.89.0.8' });
  assert.ok(await prisma.auditLog.findFirst({ where: { targetId: w.id, action: 'worker.password-reset' } }));
});

// ─── Found in the third review ───────────────────────────────────────────────

test('a token from before approval is replaced once the account is approved', async () => {
  const { body } = await signUp();
  await prisma.worker.update({ where: { id: body.worker.id }, data: { status: 'ACTIVE' } });
  const me = await api.call('GET', '/me', undefined, { token: body.token });
  assert.ok(me.body.token, 'a new token marking the account approved');
  assert.equal(require('jsonwebtoken').decode(me.body.token).ok, true);
});

test('a sign-in with a temporary password isn’t renewed, and can’t change the profile', async () => {
  const jwt = require('jsonwebtoken');
  const w = await makeWorker(prisma, { mustChangePassword: true });
  await prisma.worker.update({ where: { id: w.id }, data: { tempPasswordExpires: new Date(Date.now() + 3600_000) } });
  const old = jwt.sign({ sub: w.id, tv: 0, ok: true, iat: Math.floor(Date.now() / 1000) - 8 * 86400 }, process.env.JWT_SECRET, { audience: 'hpc-workers', expiresIn: '60d' });
  const me = await api.call('GET', '/me', undefined, { token: old });
  assert.equal(me.status, 200);
  assert.equal(me.body.token, undefined);
  const edit = await api.call('PUT', '/me', { firstName: 'Changed', lastName: 'Name', phone: '0244123456', gender: 'MALE' }, { token: old });
  assert.equal(edit.status, 403);
  assert.equal(edit.body.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('saving a profile changes only what changed, and says so in the audit log', async () => {
  const w = await makeWorker(prisma);
  const token = await signIn(api.call, w.email);
  const same = await api.call('PUT', '/me', { firstName: w.firstName, lastName: w.lastName, phone: w.phone, gender: w.gender }, { token });
  assert.equal(same.status, 200);
  const unchanged = await prisma.worker.findUnique({ where: { id: w.id } });
  assert.equal(unchanged.updatedAt.getTime(), (await prisma.worker.findUnique({ where: { id: w.id } })).updatedAt.getTime());
  assert.equal(await prisma.auditLog.count({ where: { targetId: w.id, action: 'worker.self-update' } }), 0);

  await api.call('PUT', '/me', { firstName: w.firstName, lastName: w.lastName, phone: '020 111 2222', gender: w.gender }, { token });
  const log = await prisma.auditLog.findFirst({ where: { targetId: w.id, action: 'worker.self-update' } });
  assert.match(log.summary, /changed their own phone$/);
  assert.equal((await prisma.worker.findUnique({ where: { id: w.id } })).editedAt.getTime(), unchanged.editedAt.getTime(),
    'a worker’s own edits never make an admin’s open form out of date');
});

test('only real wrong passwords count against an address: a form sent half empty doesn’t', async () => {
  const w = await makeWorker(prisma);
  const ip = '10.89.0.13';
  for (let i = 0; i < 60; i += 1) {
    await api.call('POST', '/auth/login', { email: `x${i}@example.com` }, { ip });   // no password: 400
  }
  assert.equal((await api.call('POST', '/auth/login', { email: w.email, password: PASSWORD }, { ip })).status, 200);
});

test('only wrong current passwords count against changing your password', async () => {
  const w = await makeWorker(prisma);
  const token = await signIn(api.call, w.email);
  for (let i = 0; i < 12; i += 1) {
    const res = await api.call('POST', '/me/password', { currentPassword: PASSWORD, newPassword: 'weak' }, { token });
    assert.equal(res.status, 400);   // a weak new password, not a wrong current one
  }
  assert.equal((await api.call('POST', '/me/password', { currentPassword: PASSWORD, newPassword: 'Another-Pass-77' }, { token })).status, 200);
});

test('a signed-out token can’t use up its owner’s request allowance', async () => {
  const w = await makeWorker(prisma);
  const oldToken = await signIn(api.call, w.email);
  const fresh = (await api.call('POST', '/me/sign-out-elsewhere', undefined, { token: oldToken })).body.token;
  for (let i = 0; i < 12; i += 1) {
    await api.call('POST', '/me/password', { currentPassword: 'Wrong-pass-12', newPassword: 'Another-Pass-77' }, { token: oldToken });
  }
  assert.equal((await api.call('POST', '/me/password', { currentPassword: PASSWORD, newPassword: 'Another-Pass-77' }, { token: fresh })).status, 200,
    'the old token’s refusals were counted apart from the owner’s');
});

test('a moved sign-up stays put if its HOD approves it at the same moment', async () => {
  const { body } = await signUp();
  let release;
  const holder = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "workers"."Worker" WHERE id = ${body.worker.id} FOR UPDATE`;
    await new Promise((resolve) => { release = resolve; });
    await tx.worker.update({ where: { id: body.worker.id }, data: { status: 'ACTIVE' } });   // approved meanwhile
  }, { maxWait: 10000, timeout: 30000 });
  while (!release) await new Promise((r) => setTimeout(r, 20));
  const move = api.call('PUT', '/me', {
    firstName: 'Ama', lastName: 'Mensah', phone: '0244123456', gender: 'FEMALE', departmentId: departments.media.id,
  }, { token: body.token });
  await new Promise((r) => setTimeout(r, 400));
  release();
  await holder;
  const res = await move;
  assert.equal(res.status, 403);
  const stored = await prisma.worker.findUnique({ where: { id: body.worker.id }, include: { department: true } });
  assert.equal(stored.department.name, 'Ushers', 'approved into Ushers, and there they stay');
});
