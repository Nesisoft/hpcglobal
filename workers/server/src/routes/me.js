const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z }  = require('zod');

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { validate } = require('../middleware/validate');
const { authenticate, WITH_DEPARTMENT } = require('../middleware/auth');
const { handle } = require('../lib/http');
const { signToken, dueForRenewal } = require('../lib/tokens');
const { presentWorker, fullName, temporaryPasswordExpired, TEMP_EXPIRED } = require('../lib/present');
const { audit } = require('../lib/audit');
const { transaction } = require('../lib/tx');
const { workerFields, passwordField } = require('../lib/fields');
const { BCRYPT_ROUNDS } = require('./auth');

const OFFICE_MOVES = { message: 'Ask your head of department or the church office to change your department.', field: 'departmentId' };

// A worker's own account. Open to every signed-in worker whatever their
// status, so someone waiting for approval can still see that they are
// waiting, fix a typo in their name, or move to the right department.
router.use(authenticate);

router.get('/', (req, res) => {
  const w = req.worker;
  // Renew a week-old sign-in, so the 60 days start again whenever the app is
  // opened — and at once when the account has just been approved, so the
  // token says so (see `ok` in lib/tokens.js). Not for someone who has been
  // shut out, nor a sign-in made with a temporary password not yet replaced.
  const approvedSince = Boolean(req.claims.ok) !== (w.status === 'ACTIVE');
  const renew = (dueForRenewal(req.claims) || approvedSince)
    && (w.status === 'ACTIVE' || w.status === 'PENDING') && !w.mustChangePassword;
  res.json({ worker: presentWorker(w), ...(renew ? { token: signToken(w) } : {}) });
});

const profileSchema = z.object({
  ...workerFields,
  // Only while waiting for approval: once approved, a worker's department is
  // the office's to change, since it decides whose reports they appear in.
  departmentId: z.string().uuid('Choose your department').optional(),
});

const DETAIL_LABELS = { firstName: 'first name', lastName: 'last name', phone: 'phone', gender: 'gender' };

router.put('/', validate(profileSchema), handle('update profile', async (req, res) => {
  const w = req.worker;
  if (w.status === 'SUSPENDED' || w.status === 'DECLINED') {
    return res.status(403).json({ message: 'Your account can’t be changed right now. Please speak to your head of department.' });
  }
  if (w.mustChangePassword) {
    return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Please choose your own password first.' });
  }
  const { departmentId, ...details } = req.body;
  // Only what actually changed. (Not editedAt: a worker's own edits never
  // make an admin's open form out of date — that form sends only what the
  // admin changed, so it can't undo these.)
  const data = Object.fromEntries(Object.entries(details).filter(([k, v]) => w[k] !== v));

  const moving = Boolean(departmentId && departmentId !== w.departmentId);
  let department = null;
  if (moving) {
    if (w.status !== 'PENDING') return res.status(403).json(OFFICE_MOVES);
    department = await withDbRetry(() => prisma.department.findUnique({ where: { id: departmentId } }));
    if (!department?.active) return res.status(400).json({ message: 'Choose your department from the list.', field: 'departmentId' });
    data.departmentId = departmentId;
    // Leading one department never carries over to another the person chose
    // for themselves.
    data.isHod = false;
  }
  if (!Object.keys(data).length) return res.json({ worker: presentWorker(w) });

  const updated = await transaction(async (tx) => {
    // A move only while they are still waiting: if their HOD approved them a
    // moment ago, the department they were approved into stands.
    const changed = await tx.worker.updateMany({ where: { id: w.id, ...(moving ? { status: 'PENDING' } : {}) }, data });
    if (changed.count === 0) return null;
    if (moving) {
      await audit(tx, w, {
        action: 'worker.self-move', targetType: 'worker', targetId: w.id,
        summary: `${fullName(w)} moved their sign-up from ${w.department?.name ?? 'no department'} to ${department.name}`,
      });
    }
    const edited = Object.keys(DETAIL_LABELS).filter((k) => k in data);
    if (edited.length) {
      await audit(tx, w, {
        action: 'worker.self-update', targetType: 'worker', targetId: w.id,
        summary: `${fullName(w)} changed their own ${edited.map((k) => DETAIL_LABELS[k]).join(', ')}`,
      });
    }
    return tx.worker.findUnique({ where: { id: w.id }, include: WITH_DEPARTMENT });
  });
  if (!updated) return res.status(403).json(OFFICE_MOVES);
  res.json({ worker: presentWorker(updated) });
}));

const passwordSchema = z.object({
  currentPassword: z.string({ error: 'Enter your current password' }).min(1, 'Enter your current password').max(200),
  newPassword:     passwordField,
});

router.post('/password', validate(passwordSchema), handle('change password', async (req, res) => {
  const w = req.worker;
  if (w.status === 'SUSPENDED' || w.status === 'DECLINED') {
    return res.status(403).json({ message: 'Your account can’t be changed right now. Please speak to your head of department.' });
  }
  if (temporaryPasswordExpired(w)) return res.status(403).json({ code: 'TEMP_PASSWORD_EXPIRED', message: TEMP_EXPIRED });
  const { currentPassword, newPassword } = req.body;
  if (!(await bcrypt.compare(currentPassword, w.passwordHash))) {
    res.locals.wrongPassword = true;   // counted by the limit in app.js
    return res.status(400).json({ message: 'Your current password isn’t right.', field: 'currentPassword' });
  }
  if (await bcrypt.compare(newPassword, w.passwordHash)) {
    return res.status(400).json({ message: 'Choose a password different from the one you have now.', field: 'newPassword' });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);   // before the transaction: it takes a moment
  const updated = await transaction(async (tx) => {
    const after = await tx.worker.update({
      where:   { id: w.id },
      data:    {
        passwordHash,
        mustChangePassword:  false,
        tempPasswordExpires: null,
        // Other devices signed in with the old password are signed out; this
        // one gets a fresh token below.
        tokenVersion:        { increment: 1 },
      },
      include: WITH_DEPARTMENT,
    });
    await audit(tx, w, {
      action: 'worker.password-change', targetType: 'worker', targetId: w.id,
      summary: `${fullName(w)} ${w.mustChangePassword ? 'replaced their temporary password' : 'changed their password'}`,
    });
    return after;
  });
  res.json({ token: signToken(updated), worker: presentWorker(updated) });
}));

/** Sign out every other phone and computer; this one stays signed in. */
router.post('/sign-out-elsewhere', handle('sign out elsewhere', async (req, res) => {
  const updated = await prisma.worker.update({
    where:   { id: req.worker.id },
    data:    { tokenVersion: { increment: 1 } },
    include: WITH_DEPARTMENT,
  });
  res.json({ token: signToken(updated), worker: presentWorker(updated) });
}));

module.exports = router;
