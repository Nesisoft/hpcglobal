const router = require('express').Router();
const crypto = require('crypto');

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { handle } = require('../lib/http');
const { getSettings } = require('../lib/settings');
const { forgetMade, ensureSessions, closeFinished } = require('../lib/sessions');

/**
 * Once a day (vercel.json "crons"), whether or not anyone opens the app: make
 * the coming fortnight's service dates and close any clock-ins left open.
 * Everything here also happens whenever someone uses the app; this is the
 * backstop for quiet days.
 *
 * Vercel calls it with "Authorization: Bearer <CRON_SECRET>" when that
 * setting exists; without it, or with the wrong one, nothing runs.
 */
router.get('/daily', handle('cron daily', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  const given = (req.headers.authorization || '').replace(/^Bearer /, '');
  const ok = Boolean(expected) && given.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return res.status(401).json({ message: 'Not allowed.' });

  const settings = await withDbRetry(() => getSettings(prisma));
  forgetMade();
  await withDbRetry(() => ensureSessions(prisma), { label: 'cron ensure sessions' });
  const closed = await withDbRetry(() => closeFinished(prisma, settings), { label: 'cron close finished' });
  res.json({ ok: true, closed: closed.count });
}));

module.exports = router;
