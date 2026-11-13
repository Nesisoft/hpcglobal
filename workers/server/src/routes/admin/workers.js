const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z }  = require('zod');

const prisma = require('../../lib/prisma');
const { withDbRetry } = require('../../lib/dbRetry');
const { validate } = require('../../middleware/validate');
const { WITH_DEPARTMENT } = require('../../middleware/auth');
const { handle } = require('../../lib/http');
const { presentWorker, fullName, isAdmin } = require('../../lib/present');
const { workerFields, emailField } = require('../../lib/fields');
const { decide } = require('../../lib/approval');
const { audit } = require('../../lib/audit');
const { transaction, lockSuperAdmins } = require('../../lib/tx');
const { firstProblem } = require('../../lib/passwordPolicy');
const { BCRYPT_ROUNDS } = require('../auth');

// Mounted under /api/admin, behind authenticate + requireActive + requireAdmin.

const STATUSES = ['PENDING', 'ACTIVE', 'DECLINED', 'SUSPENDED'];
const ROLES    = ['WORKER', 'ADMIN', 'SUPER_ADMIN'];
const ROLE_LABEL = { WORKER: 'worker', ADMIN: 'administrator', SUPER_ADMIN: 'super administrator' };

const NO_ADMINS  = 'Only a super administrator can change an administrator’s account.';
const USE_PROFILE = 'Use My profile to change your own account.';

/**
 * Whether `actor` may change `target`'s account. Administrators' accounts are
 * a super administrator's to manage, and nobody manages their own here — that
 * is what My profile is for, and it keeps anyone from locking themselves out.
 */
function mayManage(actor, target) {
  if (actor.id === target.id) return USE_PROFILE;
  if (isAdmin(target) && actor.role !== 'SUPER_ADMIN') return NO_ADMINS;
  return null;
}

/**
 * The same rule as a database condition, for every update below: an
 * administrator's change only lands on an account that is still a worker's
 * when it is written, so a role changed at the same moment can't slip past
 * the check above.
 */
const manageable = (actor, id) => ({ id, ...(actor.role === 'SUPER_ADMIN' ? {} : { role: 'WORKER' }) });

/** Thrown inside a transaction to stop it and answer with `status` and `message`. */
class Refusal extends Error {
  constructor(status, message, field) { super(message); this.status = status; this.field = field; }
}
const refuse = (res, err) => res.status(err.status).json({ message: err.message, ...(err.field ? { field: err.field } : {}) });

async function loadTarget(id) {
  return withDbRetry(() => prisma.worker.findUnique({ where: { id }, include: WITH_DEPARTMENT }), { label: 'admin worker' });
}

const activeSuperAdmins = (db) => db.worker.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });

const STALE = 'Someone else changed this account while you had it open. It now shows their change — make yours again and save.';

/**
 * Make the change in `data` to `target`, or refuse if it is no longer theirs
 * to make. With `editedAt` (from the admin's form), also refuse if the
 * account has changed since the form was loaded.
 */
async function updateManageable(tx, actor, target, data, { editedAt } = {}) {
  const changed = await tx.worker.updateMany({
    where: { ...manageable(actor, target.id), ...(editedAt ? { editedAt } : {}) },
    data,
  });
  if (changed.count === 0) {
    const current = await tx.worker.findUnique({ where: { id: target.id } });
    if (!current) throw new Refusal(404, 'No such worker.');
    if (editedAt && current.editedAt.getTime() !== editedAt.getTime()) throw new Refusal(409, STALE);
    throw new Refusal(403, NO_ADMINS);
  }
  return tx.worker.findUnique({ where: { id: target.id }, include: WITH_DEPARTMENT });
}

/** ?page= as a whole number between 1 and a bound no list here will reach. */
const pageOf = (raw) => Math.min(100000, Math.max(1, Number.parseInt(raw, 10) || 1));

// ─── List and detail ──────────────────────────────────────────────────────────

router.get('/workers', handle('admin workers', async (req, res) => {
  const { q, status, departmentId, role } = req.query;
  const page  = pageOf(req.query.page);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));

  const search = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  const digits = search.replace(/\D/g, '').replace(/^0/, '');
  const where = {
    ...(STATUSES.includes(status) ? { status } : {}),
    ...(ROLES.includes(role) ? { role } : {}),
    ...(departmentId === 'none' ? { departmentId: null }
      : typeof departmentId === 'string' && departmentId ? { departmentId } : {}),
    ...(search ? {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { email:     { contains: search, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    } : {}),
  };

  const [workers, total, grouped] = await withDbRetry(() => Promise.all([
    prisma.worker.findMany({
      where,
      include: WITH_DEPARTMENT,
      // id last, so two people with the same name keep their places from
      // one page to the next.
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.worker.count({ where }),
    prisma.worker.groupBy({ by: ['status'], _count: { _all: true } }),
  ]), { label: 'admin workers' });

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const g of grouped) counts[g.status] = g._count._all;
  res.json({ workers: workers.map(presentWorker), total, page, limit, counts });
}));

router.get('/workers/:id', handle('admin worker', async (req, res) => {
  const worker = await loadTarget(req.params.id);
  if (!worker) return res.status(404).json({ message: 'No such worker.' });
  const history = await withDbRetry(() => prisma.auditLog.findMany({
    where:   { targetType: 'worker', targetId: worker.id },
    orderBy: { createdAt: 'desc' },
    take:    20,
  }));
  res.json({ worker: presentWorker(worker), history });
}));

// ─── Edit ─────────────────────────────────────────────────────────────────────

// Only the fields the admin changed are sent, with the account's editedAt as
// the form loaded it. So an admin's save never writes back a value someone
// else changed meanwhile, and the edit is refused (409) if another admin has
// changed the account since (see updateManageable). A worker's own profile
// edits don't move editedAt, so they can't hold up an admin's.
const editSchema = z.object({
  ...workerFields,
  email:        emailField,
  departmentId: z.string().uuid('Choose a department').nullable(),
  isHod:        z.boolean(),
  role:         z.enum(ROLES),
}).partial().extend({
  editedAt:     z.coerce.date({ error: 'Close this account and open it again.' }),
});

router.patch('/workers/:id', validate(editSchema), handle('admin edit worker', async (req, res) => {
  const actor  = req.worker;
  const target = await loadTarget(req.params.id);
  if (!target) return res.status(404).json({ message: 'No such worker.' });
  const refusal = mayManage(actor, target);
  if (refusal) return res.status(403).json({ message: refusal });

  const { role, editedAt, ...sent } = req.body;
  // What actually differs from the account as it is now.
  const data = Object.fromEntries(Object.entries(sent).filter(([k, v]) => target[k] !== v));
  if (role && role !== target.role) {
    if (actor.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only a super administrator can change who is an administrator.', field: 'role' });
    }
    data.role = role;
  }
  if (!Object.keys(data).length) return res.json({ worker: presentWorker(target) });

  // The account as it would be after this edit.
  const next = { ...target, ...data };
  if (next.isHod && !next.departmentId) {
    return res.status(400).json({ message: 'A head of department needs a department.', field: data.isHod ? 'departmentId' : 'isHod' });
  }
  // A sign-up the HOD hasn't approved yet can't lead anyone: approve first.
  if (data.isHod === true && target.status !== 'ACTIVE') {
    return res.status(400).json({ message: 'Approve this account before making them head of department.', field: 'isHod' });
  }
  // A reset code already sent to the old address must not work for the new one.
  if ('email' in data) Object.assign(data, { resetCodeHash: null, resetCodeExpires: null, resetCodeAttempts: 0 });

  if (data.departmentId) {
    const department = await withDbRetry(() => prisma.department.findUnique({ where: { id: data.departmentId } }));
    if (!department) return res.status(400).json({ message: 'Choose a department from the list.', field: 'departmentId' });
    if (!department.active) {
      return res.status(400).json({ message: `${department.name} is archived. Choose another department.`, field: 'departmentId' });
    }
  }
  data.editedAt = new Date();

  let updated;
  try {
    updated = await transaction(async (tx) => {
      // Demoting a super administrator must never leave none. Under one lock,
      // so two super admins demoting each other at once can't both pass.
      if (target.role === 'SUPER_ADMIN' && data.role && data.role !== 'SUPER_ADMIN') {
        await lockSuperAdmins(tx);
        const current = await tx.worker.findUnique({ where: { id: target.id } });
        if (current.status === 'ACTIVE' && (await activeSuperAdmins(tx)) <= 1) {
          throw new Refusal(409, 'There must always be at least one super administrator.', 'role');
        }
      }
      const after = await updateManageable(tx, actor, target, data, { editedAt });

      const changes = [];
      if (target.departmentId !== after.departmentId) {
        changes.push(`department ${target.department?.name ?? 'none'} → ${after.department?.name ?? 'none'}`);
      }
      if (target.isHod !== after.isHod) changes.push(after.isHod ? 'made head of department' : 'no longer head of department');
      if (target.role !== after.role) changes.push(`role ${ROLE_LABEL[target.role]} → ${ROLE_LABEL[after.role]}`);
      for (const f of ['firstName', 'lastName', 'email', 'phone', 'gender']) {
        if (target[f] !== after[f]) changes.push(`${f} changed`);
      }
      if (changes.length) {
        await audit(tx, actor, {
          action:     'worker.update',
          targetType: 'worker',
          targetId:   after.id,
          summary:    `Updated ${fullName(after)}: ${changes.join('; ')}`,
        });
      }
      return after;
    });
  } catch (err) {
    if (err instanceof Refusal) return refuse(res, err);
    if (err.code === 'P2002') return res.status(409).json({ message: 'Another account already uses this email.', field: 'email' });
    throw err;
  }
  res.json({ worker: presentWorker(updated) });
}));

// ─── Approve, decline, suspend, reactivate ────────────────────────────────────

const reasonSchema = z.object({ reason: z.string().trim().max(300, 'Keep the reason under 300 characters').optional() });

router.post('/workers/:id/approve', handle('admin approve', async (req, res) => {
  const result = await decide(req.worker, req.params.id, { approve: true });
  if (result.status) return res.status(result.status).json({ message: result.message });
  res.json(result);
}));

router.post('/workers/:id/decline', validate(reasonSchema), handle('admin decline', async (req, res) => {
  const result = await decide(req.worker, req.params.id, { approve: false, reason: req.body.reason });
  if (result.status) return res.status(result.status).json({ message: result.message });
  res.json(result);
}));

router.post('/workers/:id/suspend', validate(reasonSchema), handle('admin suspend', async (req, res) => {
  const actor  = req.worker;
  const target = await loadTarget(req.params.id);
  if (!target) return res.status(404).json({ message: 'No such worker.' });
  const refusal = mayManage(actor, target);
  if (refusal) return res.status(403).json({ message: refusal });
  if (target.status !== 'ACTIVE') return res.status(409).json({ message: `${fullName(target)} isn’t active.` });

  try {
    const updated = await transaction(async (tx) => {
      if (target.role === 'SUPER_ADMIN') {
        await lockSuperAdmins(tx);
        if ((await activeSuperAdmins(tx)) <= 1) {
          throw new Refusal(409, 'There must always be at least one active super administrator.');
        }
      }
      const after = await updateManageable(tx, actor, target, {
        status: 'SUSPENDED', statusNote: req.body.reason || null, tokenVersion: { increment: 1 }, editedAt: new Date(),
      });
      await audit(tx, actor, {
        action: 'worker.suspend', targetType: 'worker', targetId: after.id,
        summary: `Suspended ${fullName(after)}${req.body.reason ? `: ${req.body.reason}` : ''}`,
      });
      return after;
    });
    res.json({ worker: presentWorker(updated) });
  } catch (err) {
    if (err instanceof Refusal) return refuse(res, err);
    throw err;
  }
}));

router.post('/workers/:id/reactivate', handle('admin reactivate', async (req, res) => {
  const actor  = req.worker;
  const target = await loadTarget(req.params.id);
  if (!target) return res.status(404).json({ message: 'No such worker.' });
  const refusal = mayManage(actor, target);
  if (refusal) return res.status(403).json({ message: refusal });
  if (target.status !== 'SUSPENDED' && target.status !== 'DECLINED') {
    return res.status(409).json({ message: `${fullName(target)} isn’t suspended or declined.` });
  }

  try {
    const updated = await transaction(async (tx) => {
      const after = await updateManageable(tx, actor, target, {
        status:     'ACTIVE',
        statusNote: null,
        editedAt:   new Date(),
        ...(target.approvedAt ? {} : { approvedAt: new Date(), approvedById: actor.id, approvedByName: fullName(actor) }),
      });
      await audit(tx, actor, {
        action: 'worker.reactivate', targetType: 'worker', targetId: after.id,
        summary: `${target.status === 'DECLINED' ? 'Approved previously declined' : 'Reactivated'} ${fullName(after)}`,
      });
      return after;
    });
    res.json({ worker: presentWorker(updated) });
  } catch (err) {
    if (err instanceof Refusal) return refuse(res, err);
    throw err;
  }
}));

// ─── Temporary password ───────────────────────────────────────────────────────
// For a worker who can't receive the reset email. The office reads the
// password to them; it stops working after 72 hours, and until they choose
// their own the app answers nothing else (requireActive), so a password
// someone else has seen is never kept. Three words and four digits from the
// list below: about 31 bits, on top of the sign-in limits.

const WORDS = [
  'Grace', 'Hope', 'Light', 'Faith', 'Peace', 'Joy', 'Mercy', 'Glory', 'Psalm', 'Altar', 'Crown', 'River',
  'Dove', 'Shield', 'Lamp', 'Rock', 'Vine', 'Seed', 'Harvest', 'Zion', 'Cedar', 'Olive', 'Manna', 'Jordan',
  'Bethel', 'Eden', 'Ark', 'Trumpet', 'Lily', 'Rose', 'Sharon', 'Gilead', 'Hermon', 'Carmel', 'Salem', 'Sabbath',
  'Anchor', 'Banner', 'Beacon', 'Candle', 'Chorus', 'Covenant', 'Dawn', 'Fountain', 'Garden', 'Haven', 'Hymn', 'Jubilee',
  'Kingdom', 'Lantern', 'Meadow', 'Morning', 'Oasis', 'Pillar', 'Praise', 'Promise', 'Refuge', 'Sapphire', 'Shepherd', 'Spring',
  'Star', 'Temple', 'Tower', 'Wisdom',
];
const TEMP_HOURS = 72;

function temporaryPassword() {
  for (;;) {
    const pick = () => WORDS[crypto.randomInt(WORDS.length)];
    const candidate = `${pick()}-${pick().toLowerCase()}-${pick().toLowerCase()}-${crypto.randomInt(1000, 10000)}`;
    if (!firstProblem(candidate)) return candidate;
  }
}

router.post('/workers/:id/temporary-password', handle('admin temporary password', async (req, res) => {
  const actor  = req.worker;
  const target = await loadTarget(req.params.id);
  if (!target) return res.status(404).json({ message: 'No such worker.' });
  const refusal = mayManage(actor, target);
  if (refusal) return res.status(403).json({ message: refusal });

  const password     = temporaryPassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);   // outside the transaction: it takes a moment
  const expires      = new Date(Date.now() + TEMP_HOURS * 60 * 60 * 1000);
  try {
    await transaction(async (tx) => {
      await updateManageable(tx, actor, target, {
        passwordHash,
        mustChangePassword:  true,
        tempPasswordExpires: expires,
        tokenVersion:        { increment: 1 },
        resetCodeHash:       null,
        resetCodeExpires:    null,
        resetCodeAttempts:   0,
      });
      await audit(tx, actor, {
        action: 'worker.temporary-password', targetType: 'worker', targetId: target.id,
        summary: `Gave ${fullName(target)} a temporary password`,
      });
    });
  } catch (err) {
    if (err instanceof Refusal) return refuse(res, err);
    throw err;
  }
  // Shown once, to the admin who asked. It is never stored or logged.
  res.json({ password, expires });
}));

// ─── Remove a sign-up ─────────────────────────────────────────────────────────
// Only someone who never became a worker: a pending or declined sign-up has
// no attendance or history to lose. Everyone else is suspended instead.

router.delete('/workers/:id', handle('admin delete worker', async (req, res) => {
  const actor  = req.worker;
  const target = await loadTarget(req.params.id);
  if (!target) return res.status(404).json({ message: 'No such worker.' });
  const refusal = mayManage(actor, target);
  if (refusal) return res.status(403).json({ message: refusal });

  try {
    await transaction(async (tx) => {
      const removed = await tx.worker.deleteMany({
        where: { ...manageable(actor, target.id), status: { in: ['PENDING', 'DECLINED'] } },
      });
      if (removed.count === 0) {
        throw new Refusal(409, 'Only a sign-up that was never approved can be removed. Suspend this account instead.');
      }
      await audit(tx, actor, {
        action: 'worker.delete', targetType: 'worker', targetId: target.id,
        summary: `Removed the sign-up of ${fullName(target)} (${target.email})`,
      });
    });
  } catch (err) {
    if (err instanceof Refusal) return refuse(res, err);
    throw err;
  }
  res.json({ ok: true });
}));

module.exports = router;

// For the tests: the conditional write every change goes through.
module.exports.updateManageable = updateManageable;
module.exports.Refusal = Refusal;
