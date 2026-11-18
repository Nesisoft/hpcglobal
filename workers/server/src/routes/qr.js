const router = require('express').Router();

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { authenticate, requireActive } = require('../middleware/auth');
const { handle } = require('../lib/http');
const { isAdmin, leadsDepartment } = require('../lib/present');
const { getSettings } = require('../lib/settings');
const { todayKey, dateOnly } = require('../lib/time');
const { windowOf } = require('../lib/clock');
const { currentCode } = require('../lib/qr');
const { ensureSessions, presentSession } = require('../lib/sessions');

// The QR code for a laptop or TV at church. Shown by an administrator or a
// head of department — the people who'd be standing at the door.
router.use(authenticate, requireActive, (req, res, next) => {
  if (isAdmin(req.worker) || leadsDepartment(req.worker)) return next();
  return res.status(403).json({ message: 'Only an administrator or a head of department can show the QR code.' });
});

const appUrl = () => (process.env.APP_URL || 'https://workers.hpcglobal.org').replace(/\/$/, '');

/** Today's sessions that are open now or later today — for the "Show QR" picker. */
router.get('/today', handle('qr today', async (_req, res) => {
  const now = new Date();
  const settings = await withDbRetry(() => getSettings(prisma));
  await withDbRetry(() => ensureSessions(prisma));
  const sessions = await prisma.serviceSession.findMany({
    where:   { date: dateOnly(todayKey(now)), cancelled: false, service: { active: true } },
    include: { service: true },
    orderBy: { startsAt: 'asc' },
  });
  res.json({
    sessions: sessions
      .filter((s) => windowOf(s, settings).clockOutUntil > now)
      .map((s) => presentSession(s, settings, now)),
  });
}));

router.get('/:sessionId', handle('qr code', async (req, res) => {
  const now = new Date();
  const settings = await withDbRetry(() => getSettings(prisma));
  const session = await prisma.serviceSession.findUnique({ where: { id: req.params.sessionId }, include: { service: true } })
    .catch(() => null);   // not a uuid: treat as not found
  if (!session) return res.status(404).json({ message: 'That service date wasn’t found.' });

  const presented = presentSession(session, settings, now);
  const { opensAt, clockOutUntil } = windowOf(session, settings);
  if (session.cancelled || !session.service.active || now < opensAt || now > clockOutUntil) {
    return res.status(409).json({
      code:    'NOT_OPEN',
      message: session.cancelled
        ? `${session.service.name} on this date has been cancelled.`
        : now < opensAt
          ? `The QR code for ${session.service.name} shows from when clock-in opens.`
          : `${session.service.name} has finished.`,
      session: presented,
    });
  }
  const { code, refreshInMs } = currentCode(session.id, now);
  res.json({ code, url: `${appUrl()}/q/${code}`, refreshInMs, session: presented });
}));

module.exports = router;
