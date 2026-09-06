const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api/auth/login', strictLimiter);
app.use('/api/give',        strictLimiter);

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
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/partner',       require('./routes/partner'));
app.use('/api/appointments',  require('./routes/appointments'));

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = app;
