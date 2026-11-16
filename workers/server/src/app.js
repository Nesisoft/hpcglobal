const path      = require('path');
const express   = require('express');
const helmet    = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// workers/.env and nothing else — never the website's .env at the repo root,
// whatever folder the server was started from. (On Vercel there is no file;
// the project's settings are the environment.)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { readToken, secret } = require('./lib/tokens');

// Fail at start-up, not on the first sign-in, when the secret is missing.
secret();

const app = express();

// Vercel's edge sets X-Forwarded-For to the visitor's address; trusting that
// one hop is what lets the limits below count per visitor. (The old PHP app
// read the header itself, so anyone could pick their own address.)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// No CORS: the app and its API share one origin (workers.hpcglobal.org, and
// Vite's proxy in development), so browsers refuse other sites' reads.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));

// ─── Rate limits ──────────────────────────────────────────────────────────────
// Sized for a Sunday morning: most workers use the church Wi-Fi or one mobile
// network, so many people share one address. Limits that successful requests
// don't count towards (wrong passwords, wrong codes) can be tight; the rest
// are generous. An address is an IPv4 address or an IPv6 /56, so cycling
// through a home connection's IPv6 addresses doesn't buy fresh attempts.
//
// The counters live in each server instance's memory, like the website's: a
// determined attacker spread over many instances gets more, which is why the
// password-reset limits that matter most are also kept in the database.
const tooMany = { message: 'Too many attempts. Please wait a few minutes and try again.' };
const address = (req) => ipKeyGenerator(req.ip);
const bearer  = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? readToken(header.slice(7)) : null;
};
const minutes = (n) => n * 60 * 1000;
const limit = (options) => rateLimit({ standardHeaders: true, legacyHeaders: false, message: tooMany, ...options });

// An approved worker's own requests are counted against them — keyed by the
// token's version too, so one signed out with "sign out everywhere else" or a
// password change can't keep its owner's count full. Everyone else (signed
// out, waiting for approval, or presenting any token on the sign-in routes,
// where a sign-up hands one out) is counted by address. `ok` in the token
// only steers this counting; what a person may do is read from the database.
const approved = (req) => {
  if (req.path.startsWith('/auth/')) return null;
  const claims = bearer(req);
  return claims?.ok ? claims : null;
};
const accountOrAddress = (req) => {
  const claims = approved(req);
  return claims ? `worker:${claims.sub}:${claims.tv}` : `address:${address(req)}`;
};
app.use('/api', limit({ windowMs: minutes(15), max: 600, keyGenerator: accountOrAddress }));
// And a ceiling per address for everyone who isn't an approved worker, so
// self-registered accounts can't multiply one address's allowance — nor, by
// filling it, shut out the approved workers who share the church's Wi-Fi.
app.use('/api', limit({ windowMs: minutes(15), max: 6000, keyGenerator: address, skip: (req) => Boolean(approved(req)) }));

// Wrong passwords — and only wrong passwords (401s), not a form sent half
// empty or a busy moment on the server: 10 per account per address, and 50 per
// address across all accounts, in 15 minutes. A church full of people signing
// in at once is never held up.
const wrongPassword = (_req, res) => res.statusCode !== 401;
app.post('/api/auth/login', limit({
  windowMs: minutes(15), max: 10, skipSuccessfulRequests: true, requestWasSuccessful: wrongPassword,
  keyGenerator: (req) => `${address(req)}|${String(req.body?.email || '').trim().toLowerCase()}`,
}));
app.post('/api/auth/login', limit({
  windowMs: minutes(15), max: 50, skipSuccessfulRequests: true, requestWasSuccessful: wrongPassword, keyGenerator: address,
}));
// Every sign-in costs a deliberately slow password check, right or wrong; this
// caps how many one address can ask for — still far more than a Sunday's.
app.post('/api/auth/login', limit({ windowMs: minutes(15), max: 400, keyGenerator: address }));

// Launch Sunday: everybody signs up at church. Approval by their HOD is the
// real gate; this only stops a script.
app.post('/api/auth/register', limit({ windowMs: minutes(60), max: 500, keyGenerator: address }));
// How many reset emails go out is limited in the database (services/email.js);
// this only stops a script hammering the route.
app.post('/api/auth/forgot-password', limit({ windowMs: minutes(15), max: 60, keyGenerator: address }));
// Wrong reset codes only (routes/auth.js marks them).
app.post('/api/auth/reset-password', limit({
  windowMs: minutes(15), max: 30, skipSuccessfulRequests: true, keyGenerator: address,
  requestWasSuccessful: (_req, res) => !res.locals.wrongGuess,
}));

// Guessing the current password from a signed-in session: wrong current
// passwords only (routes/me.js marks them), per account and token version.
app.post('/api/me/password', limit({
  windowMs: minutes(15), max: 10, skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => !res.locals.wrongPassword,
  keyGenerator: (req) => { const claims = bearer(req); return claims ? `worker:${claims.sub}:${claims.tv}` : `address:${address(req)}`; },
}));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/me',          require('./routes/me'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/hod',         require('./routes/hod'));
app.use('/api/admin',       require('./routes/admin'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

// A malformed JSON body, or anything else that escaped a route.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'The request could not be read.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'That is too much to send at once.' });
  console.error('[unhandled]', err);
  res.status(500).json({ message: 'Something went wrong on our side. Please try again.' });
});

module.exports = app;
