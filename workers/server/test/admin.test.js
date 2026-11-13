/**
 * Approving sign-ups, and managing workers and departments.
 *
 * In the old PHP app, HODs could reach church-wide data through the admin
 * APIs, an admin could make anyone a super admin, and nothing anyone did was
 * written down. Here a HOD acts only inside their own department, only a super
 * administrator manages administrators, the last super administrator can't be
 * removed, and every change lands in the audit log.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, startServer, makeWorker, makeDepartment, signIn, PASSWORD } = require('./helpers');

let api, prisma, ushers, media, superAdmin, admin, superToken, adminToken;

test.before(async () => {
  const loaded = loadApp('admin');
  prisma = loaded.prisma;
  api = await startServer(loaded.app);
  ushers = await makeDepartment(prisma, 'Ushers');
  media  = await makeDepartment(prisma, 'Media');
  superAdmin = await makeWorker(prisma, { role: 'SUPER_ADMIN', firstName: 'Sena' });
  admin      = await makeWorker(prisma, { role: 'ADMIN', firstName: 'Adwoa' });
  superToken = await signIn(api.call, superAdmin.email);
  adminToken = await signIn(api.call, admin.email);
});
test.after(async () => { await api.close(); await prisma.$disconnect(); });

const as = (token) => ({
  get:   (url) => api.call('GET', url, undefined, { token }),
  post:  (url, body) => api.call('POST', url, body, { token }),
  patch: (url, body) => api.call('PATCH', url, body, { token }),
  del:   (url) => api.call('DELETE', url, undefined, { token }),
});

async function hodOf(department) {
  const hod = await makeWorker(prisma, { departmentId: department.id, isHod: true });
  return { hod, token: await signIn(api.call, hod.email) };
}

// What the admin's form sends: the account as loaded, including when it was
// last edited, so the server can refuse a stale form.
const editBody = (w, changes = {}) => ({
  firstName: w.firstName, lastName: w.lastName, email: w.email, phone: w.phone, gender: w.gender,
  departmentId: w.departmentId, isHod: w.isHod, editedAt: w.editedAt, ...changes,
});

// ─── Heads of department ─────────────────────────────────────────────────────

test('a HOD sees and approves sign-ups in their own department only', async () => {
  const { hod, token } = await hodOf(ushers);
  const mine   = await makeWorker(prisma, { status: 'PENDING', departmentId: ushers.id, firstName: 'Mine' });
  const theirs = await makeWorker(prisma, { status: 'PENDING', departmentId: media.id, firstName: 'Theirs' });

  const list = await as(token).get('/hod/members?status=PENDING');
  assert.equal(list.status, 200);
  const ids = list.body.members.map((m) => m.id);
  assert.ok(ids.includes(mine.id));
  assert.ok(!ids.includes(theirs.id));
  assert.equal(list.body.department.name, 'Ushers');
  assert.ok(list.body.counts.PENDING >= 1);

  const other = await as(token).post(`/hod/members/${theirs.id}/approve`);
  assert.equal(other.status, 404, 'another department’s sign-up is out of reach, even by id');
  assert.equal((await prisma.worker.findUnique({ where: { id: theirs.id } })).status, 'PENDING');

  const ok = await as(token).post(`/hod/members/${mine.id}/approve`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.worker.status, 'ACTIVE');
  const stored = await prisma.worker.findUnique({ where: { id: mine.id } });
  assert.equal(stored.approvedById, hod.id);
  assert.ok(stored.approvedAt);

  const twice = await as(token).post(`/hod/members/${mine.id}/approve`);
  assert.equal(twice.status, 409);

  const log = await prisma.auditLog.findFirst({ where: { targetId: mine.id, action: 'worker.approve' } });
  assert.match(log.summary, /Approved Mine Worker \(Ushers\)/);
  assert.equal(log.actorId, hod.id);
});

test('two people approving at once: exactly one succeeds', async () => {
  const { token } = await hodOf(ushers);
  const pending = await makeWorker(prisma, { status: 'PENDING', departmentId: ushers.id });
  const [a, b] = await Promise.all([
    as(token).post(`/hod/members/${pending.id}/approve`),
    as(adminToken).post(`/admin/workers/${pending.id}/approve`),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(await prisma.auditLog.count({ where: { targetId: pending.id, action: 'worker.approve' } }), 1);
});

test('a HOD can decline with a reason, which the person sees when they sign in', async () => {
  const { token } = await hodOf(media);
  const pending = await makeWorker(prisma, { status: 'PENDING', departmentId: media.id });
  const res = await as(token).post(`/hod/members/${pending.id}/decline`, { reason: 'Not in our department' });
  assert.equal(res.status, 200);
  const login = await api.call('POST', '/auth/login', { email: pending.email, password: PASSWORD });
  assert.equal(login.body.code, 'DECLINED');
  assert.equal(login.body.note, 'Not in our department');
});

test('a worker without the HOD flag, or a HOD of an archived department, has no HOD tools', async () => {
  const plain = await makeWorker(prisma, { departmentId: ushers.id });
  assert.equal((await as(await signIn(api.call, plain.email)).get('/hod/members')).status, 403);

  const gone = await makeDepartment(prisma, 'Disbanded', { active: false });
  const { token } = await hodOf(gone);
  assert.equal((await as(token).get('/hod/members')).status, 403);
});

test('a HOD cannot use the admin pages', async () => {
  const { token } = await hodOf(ushers);
  assert.equal((await as(token).get('/admin/workers')).status, 403);
  assert.equal((await as(token).get('/admin/departments')).status, 403);
});

// ─── Administrators ──────────────────────────────────────────────────────────

test('an admin approves anyone, and lists workers by status, department and search', async () => {
  const pending = await makeWorker(prisma, { status: 'PENDING', departmentId: media.id, firstName: 'Yaw', lastName: 'Searchable' });
  const ok = await as(adminToken).post(`/admin/workers/${pending.id}/approve`);
  assert.equal(ok.status, 200);

  const found = await as(adminToken).get('/admin/workers?q=searchable');
  assert.equal(found.status, 200);
  assert.deepEqual(found.body.workers.map((w) => w.id), [pending.id]);

  const byDept = await as(adminToken).get(`/admin/workers?departmentId=${media.id}&status=ACTIVE`);
  assert.ok(byDept.body.workers.every((w) => w.department?.id === media.id && w.status === 'ACTIVE'));
  assert.ok(Number.isInteger(byDept.body.counts.PENDING));
});

test('an admin edits a worker, makes them HOD, moves department — and it is audited', async () => {
  const w = await makeWorker(prisma, { departmentId: ushers.id, firstName: 'Kwame' });
  const res = await as(adminToken).patch(`/admin/workers/${w.id}`, editBody(w, { departmentId: media.id, isHod: true }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.worker.department.name, 'Media');
  assert.equal(res.body.worker.isHod, true);
  const log = await prisma.auditLog.findFirst({ where: { targetId: w.id, action: 'worker.update' } });
  assert.match(log.summary, /department Ushers → Media/);
  assert.match(log.summary, /made head of department/);
});

test('a HOD needs a department; emails stay unique', async () => {
  const w = await makeWorker(prisma);
  const noDept = await as(adminToken).patch(`/admin/workers/${w.id}`, editBody(w, { isHod: true, departmentId: null }));
  assert.equal(noDept.status, 400);
  const taken = await as(adminToken).patch(`/admin/workers/${w.id}`, editBody(w, { email: admin.email }));
  assert.equal(taken.status, 409);
  assert.equal(taken.body.field, 'email');
});

test('only a super admin makes administrators; an admin can’t touch admin accounts or their own', async () => {
  const w = await makeWorker(prisma);
  const byAdmin = await as(adminToken).patch(`/admin/workers/${w.id}`, editBody(w, { role: 'ADMIN' }));
  assert.equal(byAdmin.status, 403);
  assert.equal((await prisma.worker.findUnique({ where: { id: w.id } })).role, 'WORKER');

  const otherAdmin = await makeWorker(prisma, { role: 'ADMIN' });
  assert.equal((await as(adminToken).post(`/admin/workers/${otherAdmin.id}/suspend`, {})).status, 403);
  assert.equal((await as(adminToken).patch(`/admin/workers/${admin.id}`, editBody(admin))).status, 403);

  const bySuper = await as(superToken).patch(`/admin/workers/${w.id}`, editBody(w, { role: 'ADMIN' }));
  assert.equal(bySuper.status, 200);
  assert.equal(bySuper.body.worker.role, 'ADMIN');
});

test('nobody changes or suspends their own account here, so a super admin can’t remove the last one', async () => {
  // The only way to lose the last super admin would be to demote or suspend
  // yourself; both are refused (the route also counts, as a second guard).
  assert.equal((await as(superToken).patch(`/admin/workers/${superAdmin.id}`, editBody(superAdmin, { role: 'ADMIN' }))).status, 403);
  assert.equal((await as(superToken).post(`/admin/workers/${superAdmin.id}/suspend`, {})).status, 403);
  assert.equal((await prisma.worker.findUnique({ where: { id: superAdmin.id } })).role, 'SUPER_ADMIN');

  // With two, one can step the other down.
  const second = await makeWorker(prisma, { role: 'SUPER_ADMIN' });
  const demote = await as(superToken).patch(`/admin/workers/${second.id}`, editBody(second, { role: 'ADMIN' }));
  assert.equal(demote.status, 200);
  assert.equal(demote.body.worker.role, 'ADMIN');
});

test('suspending and reactivating, with a reason, audited', async () => {
  const w = await makeWorker(prisma, { departmentId: ushers.id });
  const token = await signIn(api.call, w.email);
  const res = await as(adminToken).post(`/admin/workers/${w.id}/suspend`, { reason: 'Asked to step down' });
  assert.equal(res.status, 200);
  assert.equal(res.body.worker.status, 'SUSPENDED');
  assert.equal((await api.call('GET', '/me', undefined, { token })).status, 401, 'signed out on suspension');

  assert.equal((await as(adminToken).post(`/admin/workers/${w.id}/suspend`, {})).status, 409);
  const back = await as(adminToken).post(`/admin/workers/${w.id}/reactivate`);
  assert.equal(back.status, 200);
  assert.equal(back.body.worker.status, 'ACTIVE');
  const actions = (await prisma.auditLog.findMany({ where: { targetId: w.id }, orderBy: { createdAt: 'asc' } })).map((l) => l.action);
  assert.deepEqual(actions, ['worker.suspend', 'worker.reactivate']);
});

test('a temporary password works once, then only the password change is open', async () => {
  const w = await makeWorker(prisma, { departmentId: ushers.id, isHod: true });
  const res = await as(adminToken).post(`/admin/workers/${w.id}/temporary-password`);
  assert.equal(res.status, 200);
  const temp = res.body.password;
  assert.match(temp, /^[A-Z][a-z]+-[a-z]+-[a-z]+-\d{4}$/);
  assert.ok(new Date(res.body.expires) > new Date(Date.now() + 71 * 3600 * 1000), 'works for 72 hours');
  const log = await prisma.auditLog.findFirst({ where: { targetId: w.id, action: 'worker.temporary-password' } });
  assert.ok(!JSON.stringify(log).includes(temp), 'the password is never logged');

  const token = await signIn(api.call, w.email, temp);
  const blocked = await as(token).get('/hod/members');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');

  const changed = await as(token).post('/me/password', { currentPassword: temp, newPassword: 'My-Own-Pass-42' });
  assert.equal(changed.status, 200);
  assert.equal((await as(changed.body.token).get('/hod/members')).status, 200);
});

test('only a never-approved sign-up can be removed', async () => {
  const pending = await makeWorker(prisma, { status: 'PENDING' });
  const active  = await makeWorker(prisma);
  assert.equal((await as(adminToken).del(`/admin/workers/${active.id}`)).status, 409);
  assert.ok(await prisma.worker.findUnique({ where: { id: active.id } }));
  assert.equal((await as(adminToken).del(`/admin/workers/${pending.id}`)).status, 200);
  assert.equal(await prisma.worker.findUnique({ where: { id: pending.id } }), null);
  assert.ok(await prisma.auditLog.findFirst({ where: { targetId: pending.id, action: 'worker.delete' } }));
});

// ─── Departments ─────────────────────────────────────────────────────────────

test('departments: add, rename, archive, restore; names stay unique; counts and HODs shown', async () => {
  const added = await as(adminToken).post('/admin/departments', { name: 'Choir', description: 'Sings' });
  assert.equal(added.status, 201);
  assert.equal((await as(adminToken).post('/admin/departments', { name: 'Choir' })).status, 409);

  const id = added.body.department.id;
  await makeWorker(prisma, { departmentId: id, isHod: true, firstName: 'Lead' });
  await makeWorker(prisma, { departmentId: id, status: 'PENDING' });

  const list = await as(adminToken).get('/admin/departments');
  const choir = list.body.departments.find((d) => d.id === id);
  assert.equal(choir.active, true);
  assert.equal(choir.pendingMembers, 1);
  assert.equal(choir.activeMembers, 1);
  assert.deepEqual(choir.hods, ['Lead Worker']);

  const archived = await as(adminToken).patch(`/admin/departments/${id}`, { active: false, name: 'Choir & Music' });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.department.active, false);
  const log = await prisma.auditLog.findFirst({ where: { targetId: id, action: 'department.update' } });
  assert.match(log.summary, /renamed from Choir; archived/);

  const signUpList = await api.call('GET', '/departments');
  assert.ok(!signUpList.body.departments.some((d) => d.id === id), 'archived departments leave the sign-up list');
});

test('the audit log lists newest first and can be searched', async () => {
  const res = await as(adminToken).get('/admin/audit?q=choir');
  assert.equal(res.status, 200);
  assert.ok(res.body.entries.length >= 1);
  assert.ok(res.body.entries.every((e) => /choir/i.test(e.summary) || /choir/i.test(e.actorName)));
  const all = await as(adminToken).get('/admin/audit');
  const times = all.body.entries.map((e) => new Date(e.createdAt).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});

// ─── Found in review ─────────────────────────────────────────────────────────

test('two super admins suspending each other at once take turns under the lock: one always remains', async () => {
  // Exactly two active super admins for this test: the module's superAdmin
  // and a new one. Anyone else is stood down and put back afterwards.
  const others = await prisma.worker.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: superAdmin.id } } });
  await prisma.worker.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { role: 'ADMIN' } });
  const second = await makeWorker(prisma, { role: 'SUPER_ADMIN' });
  const secondToken = await signIn(api.call, second.email);
  const pair = [superAdmin.id, second.id];

  let release;
  const holder = prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(724501::bigint)`;
    await new Promise((resolve) => { release = resolve; });
  }, { maxWait: 10000, timeout: 30000 });
  try {
    while (!release) await new Promise((r) => setTimeout(r, 20));
    const both = Promise.all([
      as(superToken).post(`/admin/workers/${second.id}/suspend`, {}),
      as(secondToken).post(`/admin/workers/${superAdmin.id}/suspend`, {}),
    ]);
    // Both requests reach the lock and wait there — Postgres shows two
    // advisory locks not yet granted — and neither has suspended anyone.
    // Without the lock each would count two active super admins, both would
    // go ahead, and none would be left.
    let waiting = 0;
    for (let i = 0; i < 100 && waiting < 2; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const [row] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
      waiting = row.n;
    }
    assert.equal(waiting, 2, 'both requests are waiting on the lock');
    assert.equal(await prisma.worker.count({ where: { id: { in: pair }, status: 'SUSPENDED' } }), 0);
    release();
    await holder;

    const results = await both;
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409], JSON.stringify(results.map((r) => r.body)));
    assert.equal(await prisma.worker.count({ where: { id: { in: pair }, status: 'ACTIVE' } }), 1);
  } finally {
    release?.();
    await holder.catch(() => {});
    await prisma.worker.updateMany({ where: { id: { in: pair } }, data: { status: 'ACTIVE' } });
    await prisma.worker.update({ where: { id: second.id }, data: { role: 'ADMIN' } });
    await prisma.worker.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { role: 'SUPER_ADMIN' } });
    superToken = await signIn(api.call, superAdmin.email);
  }
});

test('a pending sign-up already made an administrator is only a super admin’s to approve or decline', async () => {
  const pending = await makeWorker(prisma, { status: 'PENDING', departmentId: ushers.id, role: 'ADMIN' });
  const { token: hodToken } = await hodOf(ushers);
  assert.equal((await as(hodToken).post(`/hod/members/${pending.id}/approve`)).status, 403);
  assert.equal((await as(adminToken).post(`/admin/workers/${pending.id}/decline`, {})).status, 403);
  assert.equal((await prisma.worker.findUnique({ where: { id: pending.id } })).status, 'PENDING');
  assert.equal((await as(superToken).post(`/admin/workers/${pending.id}/approve`)).status, 200);
});

test('only an approved worker can be made head of department', async () => {
  const pending = await makeWorker(prisma, { status: 'PENDING', departmentId: ushers.id });
  const res = await as(adminToken).patch(`/admin/workers/${pending.id}`, editBody(pending, { isHod: true }));
  assert.equal(res.status, 400);
  assert.equal(res.body.field, 'isHod');
});

test('changing someone’s email cancels a reset code sent to the old one', async () => {
  const w = await makeWorker(prisma);
  await prisma.worker.update({
    where: { id: w.id },
    data:  { resetCodeHash: 'a'.repeat(64), resetCodeExpires: new Date(Date.now() + 600_000) },
  });
  const res = await as(adminToken).patch(`/admin/workers/${w.id}`, editBody(w, { email: `new-${w.email}` }));
  assert.equal(res.status, 200);
  const stored = await prisma.worker.findUnique({ where: { id: w.id } });
  assert.equal(stored.resetCodeHash, null);
});

test('an admin can’t act on an account once it is an administrator’s', async () => {
  const w = await makeWorker(prisma);
  await prisma.worker.update({ where: { id: w.id }, data: { role: 'ADMIN' } });
  for (const [method, url] of [['post', 'temporary-password'], ['post', 'suspend'], ['patch', '']]) {
    const res = method === 'patch'
      ? await as(adminToken).patch(`/admin/workers/${w.id}`, editBody(w))
      : await as(adminToken).post(`/admin/workers/${w.id}/${url}`, {});
    assert.equal(res.status, 403, `${method} ${url}`);
  }
  const stored = await prisma.worker.findUnique({ where: { id: w.id } });
  assert.equal(stored.status, 'ACTIVE');
  assert.equal(stored.mustChangePassword, false);
});

test('a stale form can’t undo someone else’s change', async () => {
  const w = await makeWorker(prisma, { departmentId: ushers.id });
  const opened = w;   // admin A opens the form
  const first = await as(superToken).patch(`/admin/workers/${w.id}`, editBody(w, { isHod: true }));
  assert.equal(first.status, 200);   // admin B makes them HOD
  const stale = await as(adminToken).patch(`/admin/workers/${w.id}`, editBody(opened, { phone: '0209999999' }));
  assert.equal(stale.status, 409);
  assert.match(stale.body.message, /changed this account/);
  const stored = await prisma.worker.findUnique({ where: { id: w.id } });
  assert.equal(stored.isHod, true, 'B’s change stands');
  assert.equal(stored.phone, w.phone);

  // Signing in doesn't make the form stale.
  const fresh = await prisma.worker.findUnique({ where: { id: w.id } });
  await signIn(api.call, w.email);
  assert.equal((await as(adminToken).patch(`/admin/workers/${w.id}`, editBody(fresh, { phone: '0209999999' }))).status, 200);
});

test('a temporary password signs out the old sessions and cancels a reset code', async () => {
  const w = await makeWorker(prisma);
  const oldToken = await signIn(api.call, w.email);
  await prisma.worker.update({ where: { id: w.id }, data: { resetCodeHash: 'b'.repeat(64), resetCodeExpires: new Date(Date.now() + 600_000) } });
  assert.equal((await as(adminToken).post(`/admin/workers/${w.id}/temporary-password`)).status, 200);
  assert.equal((await api.call('GET', '/me', undefined, { token: oldToken })).status, 401);
  assert.equal((await prisma.worker.findUnique({ where: { id: w.id } })).resetCodeHash, null);
});

test('demoting a signed-in admin closes the admin pages to them at once', async () => {
  const a = await makeWorker(prisma, { role: 'ADMIN' });
  const token = await signIn(api.call, a.email);
  assert.equal((await as(token).get('/admin/workers')).status, 200);
  assert.equal((await as(superToken).patch(`/admin/workers/${a.id}`, editBody(a, { role: 'WORKER' }))).status, 200);
  assert.equal((await as(token).get('/admin/workers')).status, 403);
});

test('nobody gives themselves a temporary password, reactivates or removes themselves here', async () => {
  for (const [method, path] of [['post', 'temporary-password'], ['post', 'reactivate'], ['del', '']]) {
    const res = method === 'del' ? await as(adminToken).del(`/admin/workers/${admin.id}`) : await as(adminToken).post(`/admin/workers/${admin.id}/${path}`);
    assert.equal(res.status, 403, `${method} ${path}`);
  }
});

test('a filter by department and status really returns that department’s people', async () => {
  const pending = await makeWorker(prisma, { status: 'PENDING', departmentId: media.id });
  const res = await as(adminToken).get(`/admin/workers?departmentId=${media.id}&status=PENDING`);
  assert.ok(res.body.workers.some((w) => w.id === pending.id));
  assert.ok(res.body.workers.every((w) => w.department?.id === media.id && w.status === 'PENDING'));
});

test('people with the same name keep their places from page to page', async () => {
  const dept = await makeDepartment(prisma, 'Twins');
  const made = await Promise.all([1, 2, 3, 4].map(() => makeWorker(prisma, { firstName: 'Kwame', lastName: 'Mensah', departmentId: dept.id })));
  const seen = [];
  for (let page = 1; page <= 4; page += 1) {
    const res = await as(adminToken).get(`/admin/workers?departmentId=${dept.id}&limit=1&page=${page}`);
    seen.push(res.body.workers[0].id);
  }
  assert.deepEqual([...seen].sort(), made.map((m) => m.id).sort());
});

test('an absurd page number gives an empty page, not an error', async () => {
  const res = await as(adminToken).get('/admin/workers?page=1000000000000000000000');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.workers, []);
  assert.equal((await as(adminToken).get('/admin/audit?page=99999999999999999999')).status, 200);
});

test('approving someone already removed says so plainly', async () => {
  const pending = await makeWorker(prisma, { status: 'PENDING' });
  await prisma.worker.delete({ where: { id: pending.id } });
  const res = await as(adminToken).post(`/admin/workers/${pending.id}/approve`);
  assert.equal(res.status, 404);
  assert.equal(res.body.message, 'No such worker.');
});

test('departments: restore after archiving, and a rename can’t take another department’s name', async () => {
  const d = await makeDepartment(prisma, 'Drama');
  assert.equal((await as(adminToken).patch(`/admin/departments/${d.id}`, { active: false })).status, 200);
  const restored = await as(adminToken).patch(`/admin/departments/${d.id}`, { active: true });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.department.active, true);
  const clash = await as(adminToken).patch(`/admin/departments/${d.id}`, { name: 'Media' });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.field, 'name');
});

test('the archived department’s HOD is told they no longer lead it', async () => {
  const d = await makeDepartment(prisma, 'Closing');
  const { token } = await hodOf(d);
  assert.equal((await as(token).get('/me')).body.worker.leadsDepartment, true);
  await prisma.department.update({ where: { id: d.id }, data: { active: false } });
  const me = await as(token).get('/me');
  assert.equal(me.body.worker.leadsDepartment, false);
  assert.equal(me.body.worker.department.active, false);
});

// ─── Found in the third review ───────────────────────────────────────────────

test('a worker editing their own profile never holds up an admin’s edit — nor does the admin undo it', async () => {
  const w = await makeWorker(prisma, { departmentId: ushers.id });
  const openedAt = w.editedAt;   // the admin opens the form
  const token = await signIn(api.call, w.email);
  for (let i = 0; i < 3; i += 1) {
    await api.call('PUT', '/me', { firstName: w.firstName, lastName: w.lastName, phone: `02011122${20 + i}`, gender: w.gender }, { token });
  }
  // The admin changes only the department; the form sends only that.
  const res = await as(adminToken).patch(`/admin/workers/${w.id}`, { departmentId: media.id, editedAt: openedAt });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = await prisma.worker.findUnique({ where: { id: w.id } });
  assert.equal(stored.departmentId, media.id);
  assert.equal(stored.phone, '233201112222', 'the worker’s own latest phone stands');
});

test('the conditions inside the write hold even when the checks before it were passed', async () => {
  const { updateManageable, Refusal } = require('../src/routes/admin/workers');
  const { transaction } = require('../src/lib/tx');
  const adminActor = await prisma.worker.findUnique({ where: { id: admin.id } });

  // The route checked a worker's account; by the time it writes, it is an
  // administrator's.
  const w = await makeWorker(prisma);
  const asChecked = await prisma.worker.findUnique({ where: { id: w.id } });
  await prisma.worker.update({ where: { id: w.id }, data: { role: 'ADMIN' } });
  await assert.rejects(
    transaction((tx) => updateManageable(tx, adminActor, asChecked, { phone: '233209990000' })),
    (err) => err instanceof Refusal && err.status === 403,
  );
  assert.equal((await prisma.worker.findUnique({ where: { id: w.id } })).phone, asChecked.phone);

  // …or it has gone altogether.
  const gone = await makeWorker(prisma, { status: 'PENDING' });
  const goneAsChecked = await prisma.worker.findUnique({ where: { id: gone.id } });
  await prisma.worker.delete({ where: { id: gone.id } });
  await assert.rejects(
    transaction((tx) => updateManageable(tx, adminActor, goneAsChecked, { phone: '233209990000' })),
    (err) => err instanceof Refusal && err.status === 404,
  );

  // …or another admin changed it since the form was loaded.
  const x = await makeWorker(prisma);
  const loaded = await prisma.worker.findUnique({ where: { id: x.id } });
  await prisma.worker.update({ where: { id: x.id }, data: { isHod: false, editedAt: new Date(Date.now() + 1000) } });
  await assert.rejects(
    transaction((tx) => updateManageable(tx, adminActor, loaded, { phone: '233209990000' }, { editedAt: loaded.editedAt })),
    (err) => err instanceof Refusal && err.status === 409,
  );
});

test('an admin saving nothing changes nothing', async () => {
  const w = await makeWorker(prisma);
  const res = await as(adminToken).patch(`/admin/workers/${w.id}`, editBody(w));
  assert.equal(res.status, 200);
  assert.equal(await prisma.auditLog.count({ where: { targetId: w.id } }), 0);
  assert.equal((await prisma.worker.findUnique({ where: { id: w.id } })).editedAt.getTime(), w.editedAt.getTime());
});
