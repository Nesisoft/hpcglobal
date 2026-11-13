const jwt = require('jsonwebtoken');

/**
 * Sign-in tokens.
 *
 * Workers clock in from their phones every week, so a sign-in lasts 60 days
 * and is renewed whenever the app opens (GET /api/me) once it is a week old —
 * someone who comes to church every Sunday never has to type their password
 * again. A token says who it is for and nothing else that could go stale:
 * role, status and department are read from the database on every request,
 * and `tv` (the worker's tokenVersion) lets one action sign them out
 * everywhere.
 *
 * The secret is required. The old PHP app fell back to a secret written in its
 * source when the setting was missing; this one refuses to start instead.
 */

const LIFETIME    = '60d';
const RENEW_AFTER = 7 * 24 * 60 * 60; // seconds

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET is missing or too short (at least 32 characters). Set it in the Vercel project settings.');
  }
  return value;
}

function signToken(worker) {
  // `ok`: the account was approved when this was issued. Used only to decide
  // how app.js counts requests for its rate limits (an approved worker's
  // requests count against them, not the address they share); what a person
  // may do is always read from the database.
  return jwt.sign({ sub: worker.id, tv: worker.tokenVersion, ok: worker.status === 'ACTIVE' }, secret(), {
    expiresIn: LIFETIME,
    audience:  'hpc-workers',
  });
}

/** The token's claims, or null when it is missing, forged or expired. */
function readToken(token) {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, secret(), { audience: 'hpc-workers', algorithms: ['HS256'] });
    return typeof claims.sub === 'string' && Number.isInteger(claims.tv) ? claims : null;
  } catch {
    return null;
  }
}

/** Worth reissuing: more than a week old. */
const dueForRenewal = (claims) => Math.floor(Date.now() / 1000) - claims.iat > RENEW_AFTER;

module.exports = { signToken, readToken, dueForRenewal, secret };
