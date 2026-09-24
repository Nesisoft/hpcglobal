const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { z }   = require('zod');

const { validate }     = require('../middleware/validate');
const { verifyToken }  = require('../middleware/auth');
const emailService     = require('../services/email');

const prisma = require('../lib/prisma');
const { policy: passwordPolicy, evaluatePassword, firstProblem } = require('../lib/passwordPolicy');

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
});

function signAccess(user) {
  return jwt.sign(
    {
      id:    user.id,
      email: user.email,
      role:  user.role,
      name:  user.name,
      // Gates the portal both here and in the browser. A refresh re-reads it
      // from the database, so a flag an administrator sets takes effect within
      // the access token's lifetime at the latest.
      mustChangePassword: Boolean(user.mustChangePassword),
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    await prisma.adminUser.update({
      where: { id: user.id },
      data:  { lastLogin: new Date() },
    });

    res.json({
      accessToken:  signAccess(user),
      refreshToken: signRefresh(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user    = await prisma.adminUser.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(401).json({ message: 'User not found' });
    res.json({ accessToken: signAccess(user) });
  } catch {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', verifyToken, (_req, res) => {
  // With stateless JWT, logout is handled client-side.
  // Extend here with a token blocklist if needed.
  res.json({ message: 'Logged out' });
});

// POST /api/auth/change-password — any signed-in account
//
// Serves two cases at once: the first sign-in of an account whose password was
// typed by an administrator (mustChangePassword), and a routine change later.
// Fresh tokens come back so the caller is not left holding one that still says
// a change is required.
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword:     z.string().max(passwordPolicy.maxLength, `Password must be at most ${passwordPolicy.maxLength} characters`),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'Choose a password different from your current one',
    path: ['newPassword'],
  });

router.post('/change-password', verifyToken, validate(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.adminUser.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: 'Account not found' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Your current password is not correct' });

    // The browser shows this same checklist as they type.
    const { ok, failed } = evaluatePassword(newPassword);
    if (!ok) {
      return res.status(400).json({
        message: firstProblem(newPassword),
        errors:  { newPassword: failed.map((f) => f.label) },
      });
    }

    const updated = await prisma.adminUser.update({
      where: { id: user.id },
      data:  {
        passwordHash:        await bcrypt.hash(newPassword, 12),
        mustChangePassword:  false,
        // Any outstanding reset link is void now that the password has changed.
        passwordResetToken:  null,
        passwordResetExpiry: null,
      },
    });

    res.json({
      message:      'Password updated',
      accessToken:  signAccess(updated),
      refreshToken: signRefresh(updated),
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/forgot-password — public, rate-limit in production
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  // Always return 200 to avoid user enumeration
  res.json({ message: 'If that email exists, a reset link has been sent.' });
  try {
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) return;
    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.adminUser.update({
      where: { id: user.id },
      data:  { passwordResetToken: token, passwordResetExpiry: expiry },
    });
    const appUrl  = process.env.APP_URL || 'https://www.hpcglobal.org';
    const resetUrl = `${appUrl}/admin/reset-password?token=${token}`;
    await emailService.sendPasswordReset(user.email, resetUrl);
  } catch (err) {
    console.error('Password reset error (non-fatal):', err.message);
  }
});

// POST /api/auth/reset-password — public
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ message: 'Token and password are required.' });
  }
  try {
    const user = await prisma.adminUser.findFirst({
      where: {
        passwordResetToken:  token,
        passwordResetExpiry: { gt: new Date() },
      },
    });
    if (!user) return res.status(400).json({ message: 'Token is invalid or has expired.' });

    const { ok, failed } = evaluatePassword(password);
    if (!ok) {
      return res.status(400).json({
        message: firstProblem(password),
        errors:  { password: failed.map((f) => f.label) },
      });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.adminUser.update({
      where: { id: user.id },
      data:  {
        passwordHash,
        passwordResetToken:  null,
        passwordResetExpiry: null,
        // They have just chosen this one themselves.
        mustChangePassword:  false,
      },
    });
    res.json({ message: 'Password updated. You can now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
