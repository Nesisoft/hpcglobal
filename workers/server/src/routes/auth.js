const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z }  = require('zod');
const { ipKeyGenerator } = require('express-rate-limit');

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { validate } = require('../middleware/validate');
const { handle } = require('../lib/http');
const { signToken, secret } = require('../lib/tokens');
const { presentWorker, fullName, temporaryPasswordExpired, TEMP_EXPIRED } = require('../lib/present');
const { audit } = require('../lib/audit');
const { workerFields, emailField, passwordField } = require('../lib/fields');
const { sendResetCode, claimEmail, releaseEmail, emailsLeftToday } = require('../services/email');
const { WITH_DEPARTMENT } = require('../middleware/auth');

const BCRYPT_ROUNDS = 12;
// Compared against when the email has no account, so a wrong email takes as
// long to refuse as a wrong password and the timing gives nothing away.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-just-for-timing', BCRYPT_ROUNDS);

const RESET_MINUTES     = 15;
const RESET_TRIES       = 5;    // wrong guesses per code
const RESEND_AFTER_SECS = 60;
const DAY_MS            = 24 * 60 * 60 * 1000;
const CODES_PER_DAY     = 3;    // per account
const FAILURES_PER_DAY  = 10;   // wrong guesses per account, across all its codes

// ─── Sign up ──────────────────────────────────────────────────────────────────
// No role, no HOD flag, no status: a sign-up is always a PENDING worker. The
// old PHP app took the role from the request, so anyone could make themselves
// admin; here those are set only by an administrator, and audited.
const registerSchema = z.object({
  ...workerFields,
  email:        emailField,
  departmentId: z.string({ error: 'Choose your department' }).uuid('Choose your department'),
  password:     passwordField,
});

router.post('/register', validate(registerSchema), handle('register', async (req, res) => {
  const { password, departmentId, ...details } = req.body;

  const department = await withDbRetry(() => prisma.department.findUnique({ where: { id: departmentId } }));
  if (!department?.active) {
    return res.status(400).json({ message: 'Choose your department from the list.', field: 'departmentId' });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let worker;
  try {
    worker = await prisma.worker.create({
      data:    { ...details, departmentId, passwordHash, lastLogin: new Date() },
      include: WITH_DEPARTMENT,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        message: 'There is already an account with this email. Sign in, or reset your password if you have forgotten it.',
        field:   'email',
      });
    }
    throw err;
  }
  res.status(201).json({ token: signToken(worker), worker: presentWorker(worker) });
}));

// ─── Sign in ──────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email:    z.string({ error: 'Enter your email' }).trim().toLowerCase().min(1, 'Enter your email').max(200),
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password').max(200),
});

router.post('/login', validate(loginSchema), handle('login', async (req, res) => {
  const { email, password } = req.body;
  const worker = await withDbRetry(
    () => prisma.worker.findUnique({ where: { email }, include: WITH_DEPARTMENT }),
    { label: 'login' },
  );
  const ok = await bcrypt.compare(password, worker?.passwordHash ?? DUMMY_HASH);
  if (!worker || !ok) return res.status(401).json({ message: 'That email and password don’t match an account.' });
  if (temporaryPasswordExpired(worker)) {
    return res.status(403).json({ code: 'TEMP_PASSWORD_EXPIRED', message: TEMP_EXPIRED });
  }

  // Declined and suspended people are told why, but get no token: there is
  // nothing in the app for them until someone changes that.
  if (worker.status === 'DECLINED' || worker.status === 'SUSPENDED') {
    return res.status(403).json({
      code:    worker.status,
      message: worker.status === 'DECLINED'
        ? 'Your registration was not approved. Please speak to your head of department.'
        : 'Your account is suspended. Please speak to your head of department.',
      note: worker.statusNote ?? null,
    });
  }

  const signedIn = await withDbRetry(
    () => prisma.worker.update({ where: { id: worker.id }, data: { lastLogin: new Date() }, include: WITH_DEPARTMENT }),
    { label: 'login stamp' },
  );
  res.json({ token: signToken(signedIn), worker: presentWorker(signedIn) });
}));

// ─── Forgotten password ───────────────────────────────────────────────────────
// A 6-digit code by email, kept only as a keyed hash. The old app returned the
// code in the API response and never checked its reset token, so anyone could
// reset anyone's password; here the code exists only in the email, expires in
// 15 minutes and allows five tries — and an account gets at most three codes
// and ten wrong guesses a day, so asking for new codes doesn't buy more
// guesses (ten in a million a day), nor flood the person's inbox.
//
// Emails are also counted per day for the whole app and for each sender's
// address (services/email.js), so the Resend allowance the website shares
// can't be spent by one person. When it is spent, every request gets the same
// refusal before any account is looked at, so the answer never says whether
// an email has an account. (Known and unknown emails otherwise get the same
// words, though a known one takes a little longer to answer; sign-up already
// says whether an email has an account, so that is accepted.)

// Keyed to the account and the address the code was sent to, so a code
// can't outlive a change of email.
const codeHash = (workerId, email, code) =>
  crypto.createHmac('sha256', secret()).update(`${workerId}:${email}:${code}`).digest('hex');

const SENT_MESSAGE = `If that email belongs to an approved account, we have sent a 6-digit code to it. It works for ${RESET_MINUTES} minutes.`;
const NO_EMAILS_LEFT = {
  code:    'NO_EMAILS_LEFT',
  message: 'We can’t send any more reset emails today. Ask your head of department or the church office for a temporary password, or try again tomorrow.',
};

/** A new day's allowance of codes and guesses once the last one is over. */
const rollWindow = (id, now) => prisma.worker.updateMany({
  where: { id, OR: [{ resetWindowStart: null }, { resetWindowStart: { lt: new Date(now.getTime() - DAY_MS) } }] },
  data:  { resetWindowStart: now, resetCodesInWindow: 0, resetFailuresInWindow: 0 },
});

router.post('/forgot-password', validate(z.object({ email: emailField })), handle('forgot-password', async (req, res) => {
  const sender = ipKeyGenerator(req.ip);
  if (!(await emailsLeftToday(sender))) return res.status(503).json(NO_EMAILS_LEFT);

  const worker = await withDbRetry(() => prisma.worker.findUnique({ where: { email: req.body.email } }));
  // Only approved accounts are emailed: the address on a sign-up nobody has
  // approved yet was never checked, and could be anyone's. (Someone still
  // waiting who has forgotten their password asks their HOD or the office,
  // who can give them a temporary one.)
  if (!worker || worker.status !== 'ACTIVE') return res.json({ message: SENT_MESSAGE });

  const now = new Date();
  await rollWindow(worker.id, now);

  // An email first, so a refusal never touches a code they already have.
  const receipt = await claimEmail(sender);
  if (!receipt) return res.status(503).json(NO_EMAILS_LEFT);

  // One code a minute, three a day, none once the day's wrong guesses are
  // used up — and only while the address it goes to is still the account's:
  // if an admin changed the email a moment ago, the old address gets nothing.
  // The claim is conditional, so two presses at once can't both send.
  const code    = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const newHash = codeHash(worker.id, worker.email, code);
  const claim = await prisma.worker.updateMany({
    where: {
      id:                    worker.id,
      email:                 worker.email,
      status:                'ACTIVE',
      resetCodesInWindow:    { lt: CODES_PER_DAY },
      resetFailuresInWindow: { lt: FAILURES_PER_DAY },
      OR: [{ resetCodeSentAt: null }, { resetCodeSentAt: { lt: new Date(now.getTime() - RESEND_AFTER_SECS * 1000) } }],
    },
    data: {
      resetCodeHash:      newHash,
      resetCodeExpires:   new Date(now.getTime() + RESET_MINUTES * 60 * 1000),
      resetCodeAttempts:  0,
      resetCodeSentAt:    now,
      resetCodesInWindow: { increment: 1 },
    },
  });
  if (claim.count === 0) {
    await releaseEmail(receipt);
    return res.json({ message: SENT_MESSAGE });
  }

  try {
    await sendResetCode({ to: worker.email, code });
  } catch (err) {
    console.error('[forgot-password] email failed:', err.message);
    // Put back the code they may already have — it still works — and the
    // day's counts, so they can ask again straight away.
    await Promise.all([
      prisma.worker.updateMany({
        where: { id: worker.id, resetCodeHash: newHash },
        data:  {
          resetCodeHash:     worker.resetCodeHash,
          resetCodeExpires:  worker.resetCodeExpires,
          resetCodeAttempts: worker.resetCodeAttempts,
          resetCodeSentAt:   null,
        },
      }),
      prisma.worker.updateMany({ where: { id: worker.id, resetCodesInWindow: { gt: 0 } }, data: { resetCodesInWindow: { decrement: 1 } } }),
      releaseEmail(receipt),
    ]).catch(() => {});
    return res.status(502).json({ message: 'We couldn’t send the email just now. Please try again in a few minutes.' });
  }
  res.json({ message: SENT_MESSAGE });
}));

const resetSchema = z.object({
  email:    emailField,
  code:     z.string({ error: 'Enter the 6-digit code' }).trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email'),
  password: passwordField,
});

const BAD_CODE = 'That code is wrong or has expired. Check the email, or ask for a new code.';

router.post('/reset-password', validate(resetSchema), handle('reset-password', async (req, res) => {
  const { email, code, password } = req.body;
  // A wrong guess, for the per-address limit in app.js (other refusals
  // don't count against the church's shared address).
  const wrongGuess = () => { res.locals.wrongGuess = true; return res.status(400).json({ message: BAD_CODE, field: 'code' }); };

  const found = await withDbRetry(() => prisma.worker.findUnique({ where: { email } }));
  if (!found?.resetCodeHash || !found.resetCodeExpires || found.resetCodeExpires < new Date()) return wrongGuess();

  // Yesterday's wrong guesses don't count against today.
  await rollWindow(found.id, new Date());
  const worker = await prisma.worker.findUnique({ where: { id: found.id } });
  if (worker.resetCodeHash !== found.resetCodeHash) return wrongGuess();

  // Take one try before looking at the code, atomically, so a burst of
  // guesses sent at once can't get more than the code's five, or the day's
  // ten, between them.
  const attempt = await prisma.worker.updateMany({
    where: {
      id:                    worker.id,
      resetCodeHash:         worker.resetCodeHash,
      resetCodeAttempts:     { lt: RESET_TRIES },
      resetFailuresInWindow: { lt: FAILURES_PER_DAY },
    },
    data: { resetCodeAttempts: { increment: 1 }, resetFailuresInWindow: { increment: 1 } },
  });
  if (attempt.count === 0) {
    const today = worker.resetFailuresInWindow >= FAILURES_PER_DAY;
    return res.status(400).json({
      message: today
        ? 'Too many wrong codes today. Try again tomorrow, or ask the church office for a temporary password.'
        : 'Too many wrong tries. Ask for a new code.',
      field: 'code',
    });
  }

  const expected = Buffer.from(worker.resetCodeHash, 'hex');
  const given    = Buffer.from(codeHash(worker.id, worker.email, code), 'hex');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return wrongGuess();

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Only if the code is still the one just checked: a second request racing
  // this one with the same code finds it already used.
  const used = await prisma.worker.updateMany({
    where: { id: worker.id, resetCodeHash: worker.resetCodeHash },
    data:  {
      passwordHash,
      mustChangePassword:  false,
      tempPasswordExpires: null,
      resetCodeHash:       null,
      resetCodeExpires:    null,
      resetCodeAttempts:   0,
      // Signs out every device that had the old password.
      tokenVersion:        { increment: 1 },
    },
  });
  if (used.count === 0) return wrongGuess();
  // The right code wasn't a wrong guess: give that try back to the day —
  // never below nought, should the day have rolled over meanwhile.
  await prisma.worker.updateMany({
    where: { id: worker.id, resetFailuresInWindow: { gt: 0 } },
    data:  { resetFailuresInWindow: { decrement: 1 } },
  });

  const updated = await prisma.worker.findUnique({ where: { id: worker.id }, include: WITH_DEPARTMENT });
  // The event to look for if an account is ever taken over.
  await audit(prisma, updated, {
    action: 'worker.password-reset', targetType: 'worker', targetId: updated.id,
    summary: `${fullName(updated)} reset their password with a code emailed to ${updated.email}`,
  }).catch((err) => console.error('[reset-password] audit failed:', err.message));
  const canEnter = updated.status === 'PENDING' || updated.status === 'ACTIVE';
  res.json({
    message: 'Your password has been changed.',
    ...(canEnter ? { token: signToken(updated), worker: presentWorker(updated) } : {}),
  });
}));

module.exports = router;
module.exports.BCRYPT_ROUNDS = BCRYPT_ROUNDS;
