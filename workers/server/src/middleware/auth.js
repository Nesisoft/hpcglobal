const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { readToken } = require('../lib/tokens');
const { dbFail } = require('../lib/http');
const { isAdmin, leadsDepartment, temporaryPasswordExpired, TEMP_EXPIRED } = require('../lib/present');

const WITH_DEPARTMENT = { department: { select: { id: true, name: true, active: true } } };

/**
 * Who is asking. The token only names the worker; everything that decides
 * what they may do — status, role, HOD flag, department — is read from the
 * database here, on every request, so a suspension or a role change takes
 * effect at once rather than when a token expires.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const claims = header.startsWith('Bearer ') ? readToken(header.slice(7)) : null;
  if (!claims) return res.status(401).json({ code: 'SIGNED_OUT', message: 'Please sign in again.' });

  try {
    const worker = await withDbRetry(
      () => prisma.worker.findUnique({ where: { id: claims.sub }, include: WITH_DEPARTMENT }),
      { label: 'authenticate' },
    );
    if (!worker || worker.tokenVersion !== claims.tv) {
      return res.status(401).json({ code: 'SIGNED_OUT', message: 'Please sign in again.' });
    }
    // Signed in with a temporary password that was never replaced and has
    // now expired: that sign-in ends with the password.
    if (temporaryPasswordExpired(worker)) {
      return res.status(401).json({ code: 'TEMP_PASSWORD_EXPIRED', message: TEMP_EXPIRED });
    }
    req.worker = worker;
    req.claims = claims;
    next();
  } catch (err) {
    dbFail(res, err, 'authenticate');
  }
}

const STATUS_REFUSAL = {
  PENDING:   { code: 'PENDING_APPROVAL', message: 'Your account is waiting for approval by your head of department.' },
  DECLINED:  { code: 'DECLINED',         message: 'Your registration was not approved. Please speak to your head of department.' },
  SUSPENDED: { code: 'SUSPENDED',        message: 'Your account is suspended. Please speak to your head of department.' },
};

/**
 * Everything beyond a worker's own profile needs an approved account whose
 * password is their own. The client recognises each code and shows the
 * matching screen.
 */
function requireActive(req, res, next) {
  const w = req.worker;
  if (w.status !== 'ACTIVE') return res.status(403).json(STATUS_REFUSAL[w.status] ?? STATUS_REFUSAL.SUSPENDED);
  if (w.mustChangePassword) {
    return res.status(403).json({
      code:    'PASSWORD_CHANGE_REQUIRED',
      message: 'Please choose your own password first.',
    });
  }
  next();
}

function requireHod(req, res, next) {
  if (!leadsDepartment(req.worker)) {
    return res.status(403).json({ message: 'Only a head of department can do this.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.worker)) return res.status(403).json({ message: 'Only an administrator can do this.' });
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.worker.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Only a super administrator can do this.' });
  }
  next();
}

module.exports = { authenticate, requireActive, requireHod, requireAdmin, requireSuperAdmin, WITH_DEPARTMENT };
