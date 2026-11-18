const router = require('express').Router();
const { z }  = require('zod');
const { ipKeyGenerator } = require('express-rate-limit');

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { validate } = require('../middleware/validate');
const { authenticate, requireActive } = require('../middleware/auth');
const { handle } = require('../lib/http');
const { getSettings } = require('../lib/settings');
const { todayKey, dateOnly, monthRange, spoken } = require('../lib/time');
const { windowOf, clockInState, arrival, departure } = require('../lib/clock');
const { atVenue, hasLocation } = require('../lib/geo');
const { sessionForCode } = require('../lib/qr');
const { ensureSessions, closeFinished, presentSession, presentAttendance } = require('../lib/sessions');

// A worker's own clocking: what's on today, clock in and out (by the phone's
// position, or the QR code at church), and their history.
router.use(authenticate, requireActive);

const WITH_SERVICE = { service: true };

/** The usual housekeeping before showing anything: dates made, old ones closed. */
async function prepare(now = new Date()) {
  const settings = await withDbRetry(() => getSettings(prisma), { label: 'settings' });
  await withDbRetry(() => ensureSessions(prisma), { label: 'ensure sessions' });
  await withDbRetry(() => closeFinished(prisma, settings, now), { label: 'close finished' });
  return settings;
}

// ─── Today ────────────────────────────────────────────────────────────────────

router.get('/today', handle('clock today', async (req, res) => {
  const now = new Date();
  const settings = await prepare(now);
  const today = todayKey(now);

  const sessions = await prisma.serviceSession.findMany({
    where:   { date: dateOnly(today), cancelled: false, service: { active: true } },
    include: { ...WITH_SERVICE, attendance: { where: { workerId: req.worker.id } } },
    orderBy: { startsAt: 'asc' },
  });
  // What's next, when nothing today is still to come: the first session
  // after today.
  const stillToCome = sessions.some((s) => windowOf(s, settings).clockOutUntil > now);
  const next = stillToCome ? null : await prisma.serviceSession.findFirst({
    where:   { date: { gt: dateOnly(today) }, cancelled: false, service: { active: true } },
    include: WITH_SERVICE,
    orderBy: { startsAt: 'asc' },
  });

  res.json({
    serverTime: now,
    // What the app needs to warn before a short clock-out, rather than after.
    rules: { minValidMinutes: settings.minValidMinutes, graceMinutes: settings.graceMinutes },
    sessions: sessions.map((s) => ({
      ...presentSession(s, settings, now),
      attendance: s.attendance[0] ? presentAttendance(s.attendance[0], settings) : null,
    })),
    next: next ? presentSession(next, settings, now) : null,
  });
}));

// ─── Clock in and out by the phone's position ────────────────────────────────

const positionSchema = z.object({
  sessionId: z.string({ error: 'Choose the service' }).uuid('Choose the service'),
  latitude:  z.number({ error: 'Your phone didn’t send its location' }).min(-90).max(90),
  longitude: z.number({ error: 'Your phone didn’t send its location' }).min(-180).max(180),
  accuracy:  z.number().min(0).max(100000).nullable().optional(),
});

async function loadSession(id) {
  return withDbRetry(() => prisma.serviceSession.findUnique({ where: { id }, include: WITH_SERVICE }), { label: 'session' });
}

/** The refusal when the phone isn't at the venue, or null when it is. */
function venueRefusal(service, position) {
  const where = service.venueName || 'the venue';
  if (!hasLocation(service)) {
    return {
      status: 400,
      body: {
        code:    'NO_LOCATION',
        message: `The church office hasn’t set where ${service.name} is held yet, so clocking in by location isn’t possible. Scan the QR code at church instead.`,
      },
    };
  }
  const check = atVenue(service, position);
  if (check.ok) return null;
  const far = check.distanceM >= 1000 ? `${(check.distanceM / 1000).toFixed(1)} km` : `${check.distanceM} m`;
  return {
    status: 400,
    body: {
      code:      'TOO_FAR',
      distanceM: check.distanceM,
      message:   `You’re ${far} from ${where} — come closer and try again, or scan the QR code at church.`,
    },
  };
}

const lateness = (a) => (a.status === 'ON_TIME'
  ? 'on time'
  : `${a.lateMinutes} minute${a.lateMinutes === 1 ? '' : 's'} late`);

/** Record a clock-in; the caller has checked the window and how they got here. */
async function recordClockIn(workerId, session, settings, now, fields) {
  const { status, lateMinutes } = arrival(session, settings, now);
  try {
    return await prisma.attendance.create({
      data: { workerId, sessionId: session.id, clockInAt: now, status, lateMinutes, ...fields },
    });
  } catch (err) {
    if (err.code === 'P2002') return null;   // already clocked in: the unique key saw to it
    throw err;
  }
}

function windowRefusal(session, settings, now) {
  if (session.cancelled) return { status: 400, body: { code: 'CANCELLED', message: `${session.service.name} on this date has been cancelled.` } };
  const state = clockInState(session, settings, now);
  if (state === 'early') {
    return { status: 400, body: { code: 'NOT_OPEN', message: `Clock-in for ${session.service.name} opens at ${spoken(windowOf(session, settings).opensAt)}.` } };
  }
  if (state === 'closed') {
    return { status: 400, body: { code: 'CLOSED', message: `Clock-in for ${session.service.name} closed at ${spoken(session.endsAt)}, when it ended.` } };
  }
  return null;
}

router.post('/in', validate(positionSchema), handle('clock in', async (req, res) => {
  const now = new Date();
  const settings = await withDbRetry(() => getSettings(prisma));
  const session = await loadSession(req.body.sessionId);
  if (!session || !session.service.active) return res.status(404).json({ message: 'That service date wasn’t found.' });

  const closed = windowRefusal(session, settings, now);
  if (closed) return res.status(closed.status).json(closed.body);
  const away = venueRefusal(session.service, req.body);
  if (away) return res.status(away.status).json(away.body);

  const { latitude, longitude, accuracy } = req.body;
  const record = await recordClockIn(req.worker.id, session, settings, now, {
    method: 'GPS', clockInLat: latitude, clockInLng: longitude, clockInAccuracy: accuracy ?? null,
    clockInDistance: atVenue(session.service, req.body).distanceM,
  });
  if (!record) return res.status(409).json({ code: 'ALREADY_IN', message: `You’re already clocked in to ${session.service.name}.` });
  res.status(201).json({
    attendance: presentAttendance(record, settings),
    message:    `Clocked in to ${session.service.name} at ${spoken(now)} — ${lateness(record)}.`,
  });
}));

/** Record a clock-out, only if they are still clocked in (two taps can't both). */
async function recordClockOut(attendance, session, settings, now, fields) {
  const { minutesPresent, leftEarlyMinutes } = departure(attendance, session, settings, now);
  const done = await prisma.attendance.updateMany({
    where: { id: attendance.id, clockOutAt: null, autoClockedOut: false },
    data:  { clockOutAt: now, minutesPresent, leftEarlyMinutes, ...fields },
  });
  if (done.count === 0) return null;
  return prisma.attendance.findUnique({ where: { id: attendance.id } });
}

const presentFor = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
};

/** The refusal for a clock-out that can't happen, or null when it can. */
function clockOutRefusal(attendance, session, settings, now) {
  if (!attendance) return { status: 400, body: { code: 'NOT_IN', message: `You haven’t clocked in to ${session.service.name}.` } };
  if (attendance.clockOutAt || attendance.autoClockedOut) {
    return { status: 409, body: { code: 'ALREADY_OUT', message: `You’ve already clocked out of ${session.service.name}.` } };
  }
  if (now > windowOf(session, settings).clockOutUntil) {
    return { status: 400, body: { code: 'CLOSED', message: 'The clock-out time has passed. Your attendance is recorded; the clock-out was closed for you.' } };
  }
  return null;
}

router.post('/out', validate(positionSchema), handle('clock out', async (req, res) => {
  const now = new Date();
  const settings = await withDbRetry(() => getSettings(prisma));
  const session = await loadSession(req.body.sessionId);
  if (!session) return res.status(404).json({ message: 'That service date wasn’t found.' });
  const attendance = await prisma.attendance.findUnique({ where: { workerId_sessionId: { workerId: req.worker.id, sessionId: session.id } } });

  const refusal = clockOutRefusal(attendance, session, settings, now);
  if (refusal) return res.status(refusal.status).json(refusal.body);
  const away = venueRefusal(session.service, req.body);
  if (away) return res.status(away.status).json(away.body);

  const { latitude, longitude, accuracy } = req.body;
  const record = await recordClockOut(attendance, session, settings, now, {
    clockOutMethod: 'GPS', clockOutLat: latitude, clockOutLng: longitude, clockOutAccuracy: accuracy ?? null,
  });
  if (!record) return res.status(409).json({ code: 'ALREADY_OUT', message: `You’ve already clocked out of ${session.service.name}.` });
  res.json({
    attendance: presentAttendance(record, settings),
    message:    `Clocked out of ${session.service.name} at ${spoken(now)} — ${presentFor(record.minutesPresent)} in all.`,
  });
}));

// ─── The QR code at church ────────────────────────────────────────────────────

const qrSchema = z.object({
  code:   z.string({ error: 'Enter the 6-digit code' }).trim().regex(/^\d{6}$/, 'Enter the 6-digit code under the QR'),
  action: z.enum(['in', 'out']).optional(),
});

// Wrong codes a worker may send in an hour. A code is 6 digits and each is
// good for about a minute, so guessing from home would need hundreds of
// thousands of tries; this keeps it to a handful.
const BAD_CODES_PER_HOUR = 10;

router.post('/qr', validate(qrSchema), handle('clock qr', async (req, res) => {
  const now = new Date();
  const worker = req.worker;
  const settings = await withDbRetry(() => getSettings(prisma));
  const log = (result, sessionId = null) => prisma.qrScan.create({
    data: { workerId: worker.id, sessionId, result, address: ipKeyGenerator(req.ip) },
  }).catch((err) => console.error('[qr] log failed:', err.message));

  const recentBad = await prisma.qrScan.count({
    where: { workerId: worker.id, result: 'BAD_CODE', createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
  });
  if (recentBad >= BAD_CODES_PER_HOUR) {
    return res.status(429).json({ code: 'TOO_MANY_CODES', message: 'Too many wrong codes. Please wait a while, or ask your head of department to mark you present.' });
  }

  // The sessions a code could belong to now: open for clock-in or clock-out.
  const candidates = await prisma.serviceSession.findMany({
    where: {
      cancelled: false,
      service:   { active: true },
      startsAt:  { lte: new Date(now.getTime() + settings.opensBeforeMinutes * 60 * 1000) },
      endsAt:    { gte: new Date(now.getTime() - settings.clockOutAfterMinutes * 60 * 1000) },
    },
    include: WITH_SERVICE,
  });
  const sessionId = sessionForCode(req.body.code, candidates.map((s) => s.id), now);
  if (!sessionId) {
    await log('BAD_CODE');
    return res.status(400).json({ code: 'BAD_QR', message: 'That code has expired or isn’t right — scan the QR again.' });
  }
  const session = candidates.find((s) => s.id === sessionId);
  const presented = presentSession(session, settings, now);
  const attendance = await prisma.attendance.findUnique({ where: { workerId_sessionId: { workerId: worker.id, sessionId } } });

  if (!attendance) {
    if (req.body.action === 'out') {
      await log('NOT_OPEN', sessionId);
      return res.status(400).json({ code: 'NOT_IN', message: `You haven’t clocked in to ${session.service.name}.`, session: presented });
    }
    const closed = windowRefusal(session, settings, now);
    if (closed) {
      await log('NOT_OPEN', sessionId);
      return res.status(closed.status).json({ ...closed.body, session: presented });
    }
    const record = await recordClockIn(worker.id, session, settings, now, { method: 'QR' });
    if (!record) {
      await log('ALREADY', sessionId);
      return res.status(409).json({ code: 'ALREADY_IN', message: `You’re already clocked in to ${session.service.name}.`, session: presented });
    }
    await log('OK', sessionId);
    return res.status(201).json({
      attendance: presentAttendance(record, settings),
      session:    presented,
      message:    `Clocked in to ${session.service.name} at ${spoken(now)} — ${lateness(record)}.`,
    });
  }

  // Already clocked in: clock out only when asked to, so scanning twice on
  // arrival doesn't end their attendance.
  if (req.body.action !== 'out') {
    await log('ALREADY', sessionId);
    const done = attendance.clockOutAt || attendance.autoClockedOut;
    return res.status(409).json({
      code:       done ? 'ALREADY_OUT' : 'ALREADY_IN',
      message:    done
        ? `You’ve already clocked out of ${session.service.name}.`
        : `You’re clocked in to ${session.service.name} since ${spoken(attendance.clockInAt)}.`,
      session:    presented,
      attendance: presentAttendance(attendance, settings),
    });
  }
  const refusal = clockOutRefusal(attendance, session, settings, now);
  if (refusal) {
    await log('NOT_OPEN', sessionId);
    return res.status(refusal.status).json({ ...refusal.body, session: presented });
  }
  const record = await recordClockOut(attendance, session, settings, now, { clockOutMethod: 'QR' });
  if (!record) {
    await log('ALREADY', sessionId);
    return res.status(409).json({ code: 'ALREADY_OUT', message: `You’ve already clocked out of ${session.service.name}.`, session: presented });
  }
  await log('OK', sessionId);
  res.json({
    attendance: presentAttendance(record, settings),
    session:    presented,
    message:    `Clocked out of ${session.service.name} at ${spoken(now)} — ${presentFor(record.minutesPresent)} in all.`,
  });
}));

// ─── History ──────────────────────────────────────────────────────────────────

router.get('/history', handle('clock history', async (req, res) => {
  const now = new Date();
  const month = typeof req.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)
    ? req.query.month : todayKey(now).slice(0, 7);
  const settings = await prepare(now);
  const { first, last } = monthRange(month);

  const records = await prisma.attendance.findMany({
    where:   { workerId: req.worker.id, session: { date: { gte: dateOnly(first), lte: dateOnly(last) } } },
    include: { session: { include: WITH_SERVICE } },
    orderBy: { clockInAt: 'desc' },
  });

  const summary = { attended: records.length, onTime: 0, late: 0, veryLate: 0, minutes: 0, short: 0 };
  const shown = records.map((r) => {
    const a = presentAttendance(r, settings);
    if (r.status === 'ON_TIME') summary.onTime += 1;
    if (r.status === 'LATE') summary.late += 1;
    if (r.status === 'VERY_LATE') summary.veryLate += 1;
    summary.minutes += r.minutesPresent ?? 0;
    if (a.short) summary.short += 1;
    const s = presentSession(r.session, settings, now);
    return { ...a, session: { id: s.id, date: s.date, startsAt: s.startsAt, endsAt: s.endsAt, service: { id: s.service.id, name: s.service.name } } };
  });
  res.json({ month, records: shown, summary });
}));

module.exports = router;
