const { getSettings } = require('./settings');
const { windowOf } = require('./clock');
const { spoken } = require('./time');
const push = require('./push');

/**
 * "Clock out before you leave": when a service reaches its end time, a
 * notification to everyone still clocked in. Clocking out needs the phone at
 * church, so it has to come while they are still there — at the end, not
 * later. Each clock-in gets one reminder at most (reminderSentAt, claimed
 * with a conditional update, so two servers checking at once send it once).
 *
 * Checked whenever the app is in use (see `tick`), which it is as a service
 * ends, and by /api/cron/reminders for a scheduler that calls every few
 * minutes.
 */

// A reminder that comes much after the end is no use — they've gone home.
const LATE_LIMIT_MINUTES = 20;

async function sendDueReminders(db, { now = new Date(), send = push.sendPush } = {}) {
  if (send === push.sendPush && !push.configure()) return { configured: false, due: 0, sent: 0 };
  const settings = await getSettings(db);
  const due = await db.attendance.findMany({
    where: {
      reminderSentAt: null,
      clockOutAt:     null,
      autoClockedOut: false,
      method:         { not: 'MANUAL' },
      session:        {
        cancelled: false,
        endsAt:    { lte: now, gt: new Date(now.getTime() - LATE_LIMIT_MINUTES * 60000) },
      },
      worker: { status: 'ACTIVE', pushSubscriptions: { some: {} } },
    },
    include: { session: { include: { service: true } }, worker: { include: { pushSubscriptions: true } } },
    take: 500,
  });

  let sent = 0;
  await Promise.all(due.map(async (a) => {
    const { clockOutUntil } = windowOf(a.session, settings);
    if (clockOutUntil <= now) return;
    // Ours to send, unless another server got there first.
    const claimed = await db.attendance.updateMany({ where: { id: a.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!claimed.count) return;
    const payload = {
      title: `Clock out of ${a.session.service.name}`,
      body:  `It has ended. Clock out before you leave church — clock-out closes at ${spoken(clockOutUntil)}.`,
      tag:   `clock-out-${a.sessionId}`,
      url:   '/',
    };
    const results = await Promise.all(a.worker.pushSubscriptions.map(async (sub) => {
      const result = await send(sub, payload);
      if (result === 'gone') await db.pushSubscription.deleteMany({ where: { id: sub.id } });
      if (result === 'sent') await db.pushSubscription.updateMany({ where: { id: sub.id }, data: { lastSentAt: now } });
      return result;
    }));
    if (results.includes('sent')) sent += 1;
  }));
  return { configured: true, due: due.length, sent };
}

// Checking as the app is used: at most once a minute per server, never
// holding a request up for long, never failing it.
const EVERY_MS = 60 * 1000;
let lastTick = 0;
function tick(db) {
  return async (_req, _res, next) => {
    try {
      const now = Date.now();
      if (now - lastTick >= EVERY_MS && push.configure()) {
        lastTick = now;
        await Promise.race([
          sendDueReminders(db).catch((err) => console.error('[reminders]', err?.message || err)),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      }
    } catch (err) {
      // Reminders are an extra: whatever goes wrong, the request goes on.
      console.error('[reminders]', err?.message || err);
    }
    next();
  };
}

module.exports = { sendDueReminders, tick, LATE_LIMIT_MINUTES };
