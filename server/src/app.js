const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt     = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Vercel's edge sits in front of the function and sets X-Forwarded-For to the
// visitor's address. Trusting that one hop is what lets the rate limits below
// count per visitor instead of per proxy.
app.set('trust proxy', 1);

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// ─── Paystack webhook ─────────────────────────────────────────────────────────
// Ahead of the body parsers: the signature is over the raw bytes, which
// express.json would consume. Ahead of the rate limits too: Paystack sends
// every webhook from a few addresses, and a busy Sunday must not lock it out.
app.use('/api/paystack', require('./routes/paystackWebhook'));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Signed-in staff are exempt from the general cap: recording a Sunday's tithes
// is a few hundred requests in a sitting, which the cap would cut off halfway
// with a message that reads like an outage. The token is checked here only to
// decide that — every admin route still verifies it for itself.
function signedInAdmin(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;
  try { jwt.verify(header.slice(7), process.env.JWT_SECRET); return true; } catch { return false; }
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: signedInAdmin,
});
app.use('/api', limiter);

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api/auth/login', strictLimiter);
// Starting a gift only. Checking one is a giver coming back from Paystack,
// perhaps pressing "Check again" while their phone prompt is pending, so it
// has a looser counter of its own.
app.post('/api/give',       strictLimiter);

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: 'Too many requests, please try again later.' },
});
app.get('/api/give/verify/:ref', verifyLimiter);

// Public forms that email and text whatever address and number they are given.
// They now always finish sending, so without a tighter cap a script could use
// the church's domain and SMS sender to message anyone it likes. POST only —
// the admin listings share these paths. Its own counter, so a visitor filling
// in forms doesn't use up their sign-in or giving attempts.
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many requests, please try again later.' },
});
app.post('/api/contact/message',      formLimiter);
app.post('/api/prayer',               formLimiter);
app.post('/api/appointments',         formLimiter);
app.post('/api/partner/apply',        formLimiter);
app.post('/api/events/:id/rsvp',      formLimiter);
app.post('/api/auth/forgot-password', formLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/hero',          require('./routes/hero'));
app.use('/api/service-times', require('./routes/services'));
app.use('/api/sermons',       require('./routes/sermons'));
app.use('/api/events',        require('./routes/events'));
app.use('/api/give',          require('./routes/giving'));
app.use('/api/prayer',        require('./routes/prayer'));
app.use('/api/visitors',      require('./routes/visitors'));
app.use('/api/blog',          require('./routes/blog'));
app.use('/api/gallery',       require('./routes/gallery'));
app.use('/api/ministries',    require('./routes/ministries'));
app.use('/api/leadership',    require('./routes/leadership'));
app.use('/api/about',         require('./routes/about'));
app.use('/api/contact',       require('./routes/contact'));
app.use('/api/youtube',       require('./routes/youtube'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/admin/tithes',  require('./routes/tithes'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/partner',       require('./routes/partner'));
app.use('/api/appointments',  require('./routes/appointments'));

// ─── Shareable event pages ────────────────────────────────────────────────────
// Outside /api on purpose: this is an HTML page crawlers fetch, and the URL
// people paste into WhatsApp. See routes/share.js for why it cannot be done
// in the SPA.
app.use('/e', require('./routes/share'));

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = app;
