const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../../lib/prisma');
const { withDbRetry } = require('../../lib/dbRetry');
const { validate } = require('../../middleware/validate');
const { requireSuperAdmin } = require('../../middleware/auth');
const { handle } = require('../../lib/http');
const { audit } = require('../../lib/audit');
const { transaction } = require('../../lib/tx');
const { fullName, presentWorker } = require('../../lib/present');
const { getSettings, presentSettings } = require('../../lib/settings');
const { hasLocation } = require('../../lib/geo');
const {
  todayKey, isDateKey, isTime, dateOnly, dateKey, at, addDays,
} = require('../../lib/time');
const {
  ensureSessions, forgetMade, closeFinished, presentSession, presentAttendance, AHEAD_DAYS,
} = require('../../lib/sessions');

// Mounted under /api/admin, behind authenticate + requireActive + requireAdmin.

const KINDS = ['REGULAR', 'MIDWEEK', 'CONFERENCE', 'TRAINING', 'SPECIAL'];
const RECURRENCES = ['WEEKLY', 'DAILY', 'NONE'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Services ─────────────────────────────────────────────────────────────────

function presentService(s) {
  return {
    id:          s.id,
    name:        s.name,
    kind:        s.kind,
    venueName:   s.venueName ?? null,
    latitude:    s.latitude ?? null,
    longitude:   s.longitude ?? null,
    radiusM:     s.radiusM,
    recurrence:  s.recurrence,
    weekday:     s.weekday ?? null,
    startTime:   s.startTime,
    endTime:     s.endTime,
    startsOn:    s.startsOn ? dateKey(s.startsOn) : null,
    endsOn:      s.endsOn ? dateKey(s.endsOn) : null,
    expected:    s.expected,
    active:      s.active,
    hasLocation: hasLocation(s),
  };
}

const time = (label) => z.string({ error: `Enter the ${label}` }).refine(isTime, `Enter the ${label} as HH:MM`);
const dateField = z.string().refine(isDateKey, 'Choose a date').nullable();

const serviceFields = z.object({
  name:       z.string({ error: 'Enter a name' }).trim().min(1, 'Enter a name').max(100, 'Keep the name under 100 characters'),
  kind:       z.enum(KINDS),
  venueName:  z.string().trim().max(120, 'Keep the venue under 120 characters').nullable(),
  latitude:   z.number().min(-90, 'Latitude is between -90 and 90').max(90, 'Latitude is between -90 and 90').nullable(),
  longitude:  z.number().min(-180, 'Longitude is between -180 and 180').max(180, 'Longitude is between -180 and 180').nullable(),
  radiusM:    z.number().int().min(20, 'Allow at least 20 m').max(2000, 'Keep the area under 2 km'),
  recurrence: z.enum(RECURRENCES),
  weekday:    z.number().int().min(0).max(6).nullable(),
  startTime:  time('start time'),
  endTime:    time('end time'),
  startsOn:   dateField,
  endsOn:     dateField,
  expected:   z.boolean(),
  active:     z.boolean(),
});

/** The rules that need more than one field, checked on the service as it would be. */
function serviceProblem(s) {
  if ((s.latitude == null) !== (s.longitude == null)) return { field: 'latitude', message: 'Give both latitude and longitude, or neither.' };
  if (s.endTime <= s.startTime) return { field: 'endTime', message: 'The end time must be after the start time.' };
  if (s.recurrence === 'WEEKLY' && s.weekday == null) return { field: 'weekday', message: 'Choose the day of the week.' };
  if (s.recurrence !== 'WEEKLY' && s.active && !s.startsOn) {
    return { field: 'startsOn', message: s.recurrence === 'NONE' ? 'Choose the date.' : 'Choose the first day.' };
  }
  if (s.startsOn && s.endsOn && s.endsOn < s.startsOn) return { field: 'endsOn', message: 'The last day can’t be before the first.' };
  return null;
}

/** The fields as stored: dates as @db.Date, weekday only for WEEKLY. */
const toRow = (s) => ({
  ...s,
  weekday:  s.recurrence === 'WEEKLY' ? s.weekday : null,
  startsOn: s.startsOn ? dateOnly(s.startsOn) : null,
  endsOn:   s.recurrence === 'NONE' ? null : (s.endsOn ? dateOnly(s.endsOn) : null),
});

const describe = (s) => {
  const when = s.recurrence === 'WEEKLY' ? `${WEEKDAYS[s.weekday]}s` : s.recurrence === 'DAILY' ? 'daily' : 'once';
  return `${s.name} (${when}, ${s.startTime}–${s.endTime})`;
};

router.get('/services', handle('admin services', async (_req, res) => {
  const services = await withDbRetry(() => prisma.service.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }));
  res.json({ services: services.map(presentService) });
}));

router.post('/services', validate(serviceFields.partial({ venueName: true, latitude: true, longitude: true, weekday: true, startsOn: true, endsOn: true, expected: true, active: true, kind: true, radiusM: true })), handle('admin add service', async (req, res) => {
  const settings = await withDbRetry(() => getSettings(prisma));
  const s = {
    kind: 'REGULAR', venueName: null, latitude: null, longitude: null, radiusM: settings.defaultRadiusM,
    weekday: null, startsOn: null, endsOn: null, expected: true, active: true, ...req.body,
  };
  const problem = serviceProblem(s);
  if (problem) return res.status(400).json(problem);

  const service = await transaction(async (tx) => {
    const created = await tx.service.create({ data: toRow(s) });
    await audit(tx, req.worker, { action: 'service.create', targetType: 'service', targetId: created.id, summary: `Added ${describe(s)}` });
    return created;
  });
  forgetMade();
  await ensureSessions(prisma);
  res.status(201).json({ service: presentService(service) });
}));

// What changing a service means for its future dates: the ones made from its
// old pattern are remade from the new one — unless someone has clocked in to
// them, or they were set by hand (moved, a one-off) or cancelled.
const PATTERN = ['recurrence', 'weekday', 'startTime', 'endTime', 'startsOn', 'endsOn', 'active'];

router.patch('/services/:id', validate(serviceFields.partial()), handle('admin edit service', async (req, res) => {
  const before = await withDbRetry(() => prisma.service.findUnique({ where: { id: req.params.id } }));
  if (!before) return res.status(404).json({ message: 'No such service.' });
  const current = presentService(before);
  const next = { ...current, ...req.body };
  const problem = serviceProblem(next);
  if (problem) return res.status(400).json(problem);

  const changed = Object.keys(req.body).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(next[k]));
  if (!changed.length) return res.json({ service: current });
  const { id: _id, hasLocation: _h, ...fields } = next;
  const now = new Date();

  const service = await transaction(async (tx) => {
    const after = await tx.service.update({ where: { id: before.id }, data: toRow(fields) });
    if (changed.some((k) => PATTERN.includes(k))) {
      await tx.serviceSession.deleteMany({
        where: { serviceId: before.id, startsAt: { gt: now }, custom: false, cancelled: false, attendance: { none: {} } },
      });
    }
    const what = changed.includes('active') ? (after.active ? 'restored' : 'archived') : `changed ${changed.join(', ')}`;
    await audit(tx, req.worker, { action: 'service.update', targetType: 'service', targetId: after.id, summary: `${after.name}: ${what}` });
    return after;
  });
  forgetMade();
  await ensureSessions(prisma);
  res.json({ service: presentService(service) });
}));

// ─── Sessions (the dates) ─────────────────────────────────────────────────────

const MAX_RANGE_DAYS = 92;

router.get('/sessions', handle('admin sessions', async (req, res) => {
  const now = new Date();
  const today = todayKey(now);
  const from = isDateKey(req.query.from) ? req.query.from : addDays(today, -7);
  let to = isDateKey(req.query.to) ? req.query.to : addDays(today, AHEAD_DAYS);
  if (to < from) return res.status(400).json({ message: 'The end of the range is before its start.' });
  if (to > addDays(from, MAX_RANGE_DAYS)) to = addDays(from, MAX_RANGE_DAYS);

  const settings = await withDbRetry(() => getSettings(prisma));
  await withDbRetry(() => ensureSessions(prisma));
  await withDbRetry(() => closeFinished(prisma, settings, now));
  const sessions = await prisma.serviceSession.findMany({
    where:   { date: { gte: dateOnly(from), lte: dateOnly(to) } },
    include: { service: true, _count: { select: { attendance: true } } },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });
  res.json({ from, to, sessions: sessions.map((s) => presentSession(s, settings, now)) });
}));

const oneOffSchema = z.object({
  serviceId: z.string({ error: 'Choose the service' }).uuid('Choose the service'),
  date:      z.string({ error: 'Choose the date' }).refine(isDateKey, 'Choose the date'),
  startTime: time('start time'),
  endTime:   time('end time'),
  note:      z.string().trim().max(300).optional().nullable(),
});

router.post('/sessions', validate(oneOffSchema), handle('admin add session', async (req, res) => {
  const { serviceId, date, startTime, endTime, note } = req.body;
  if (endTime <= startTime) return res.status(400).json({ field: 'endTime', message: 'The end time must be after the start time.' });
  if (date < todayKey()) return res.status(400).json({ field: 'date', message: 'Choose today or a later date.' });
  const service = await withDbRetry(() => prisma.service.findUnique({ where: { id: serviceId } }));
  if (!service?.active) return res.status(400).json({ field: 'serviceId', message: 'Choose an active service.' });

  try {
    const session = await transaction(async (tx) => {
      const created = await tx.serviceSession.create({
        data:    { serviceId, date: dateOnly(date), startsAt: at(date, startTime), endsAt: at(date, endTime), note: note || null, custom: true },
        include: { service: true },
      });
      await audit(tx, req.worker, {
        action: 'session.create', targetType: 'session', targetId: created.id,
        summary: `Added ${service.name} on ${date}, ${startTime}–${endTime}`,
      });
      return created;
    });
    res.status(201).json({ session: presentSession(session, await getSettings(prisma)) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ field: 'date', message: `${service.name} already has a date on ${date}. Change that one instead.` });
    throw err;
  }
}));

const sessionEditSchema = z.object({
  startTime: time('start time').optional(),
  endTime:   time('end time').optional(),
  cancelled: z.boolean().optional(),
  note:      z.string().trim().max(300).optional().nullable(),
});

router.patch('/sessions/:id', validate(sessionEditSchema), handle('admin edit session', async (req, res) => {
  const before = await withDbRetry(() => prisma.serviceSession.findUnique({ where: { id: req.params.id }, include: { service: true } }));
  if (!before) return res.status(404).json({ message: 'That service date wasn’t found.' });
  const key = dateKey(before.date);
  const startTime = req.body.startTime ?? before.startsAt.toISOString().slice(11, 16);
  const endTime   = req.body.endTime ?? before.endsAt.toISOString().slice(11, 16);
  if (endTime <= startTime) return res.status(400).json({ field: 'endTime', message: 'The end time must be after the start time.' });

  const data = {};
  const changes = [];
  if (req.body.startTime !== undefined || req.body.endTime !== undefined) {
    const startsAt = at(key, startTime);
    const endsAt   = at(key, endTime);
    if (startsAt.getTime() !== before.startsAt.getTime() || endsAt.getTime() !== before.endsAt.getTime()) {
      Object.assign(data, { startsAt, endsAt, custom: true });
      changes.push(`moved to ${startTime}–${endTime}`);
    }
  }
  if (req.body.cancelled !== undefined && req.body.cancelled !== before.cancelled) {
    data.cancelled = req.body.cancelled;
    changes.push(req.body.cancelled ? 'cancelled' : 'restored');
  }
  if (req.body.note !== undefined && (req.body.note || null) !== before.note) {
    data.note = req.body.note || null;
    changes.push('note changed');
  }
  const settings = await withDbRetry(() => getSettings(prisma));
  if (!changes.length) return res.json({ session: presentSession(before, settings) });

  const session = await transaction(async (tx) => {
    const after = await tx.serviceSession.update({ where: { id: before.id }, data, include: { service: true } });
    await audit(tx, req.worker, {
      action: 'session.update', targetType: 'session', targetId: after.id,
      summary: `${after.service.name} on ${key}: ${changes.join('; ')}`,
    });
    return after;
  });
  res.json({ session: presentSession(session, settings) });
}));

router.get('/sessions/:id/attendance', handle('admin session attendance', async (req, res) => {
  const settings = await withDbRetry(() => getSettings(prisma));
  await closeFinished(prisma, settings);
  const session = await withDbRetry(() => prisma.serviceSession.findUnique({
    where:   { id: req.params.id },
    include: {
      service:    true,
      attendance: {
        include: { worker: { include: { department: { select: { id: true, name: true, active: true } } } } },
        orderBy: { clockInAt: 'asc' },
      },
    },
  }));
  if (!session) return res.status(404).json({ message: 'That service date wasn’t found.' });
  res.json({
    session:    presentSession(session, settings),
    attendance: session.attendance.map((a) => {
      const w = presentWorker(a.worker);
      return { ...presentAttendance(a, settings), worker: { id: w.id, name: w.name, department: w.department } };
    }),
  });
}));

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get('/settings', handle('admin settings', async (_req, res) => {
  const settings = await withDbRetry(() => getSettings(prisma));
  res.json({ settings: presentSettings(settings), updatedByName: settings.updatedByName ?? null, updatedAt: settings.updatedAt });
}));

const minutes = (max) => z.number({ error: 'Enter a number of minutes' }).int('Whole minutes only').min(0, 'Can’t be negative').max(max, `At most ${max} minutes`);
const settingsSchema = z.object({
  graceMinutes:         minutes(120),
  veryLateMinutes:      minutes(240),
  opensBeforeMinutes:   minutes(240),
  clockOutAfterMinutes: minutes(480),
  minValidMinutes:      minutes(600),
  leftEarlyMinutes:     minutes(240),
  defaultRadiusM:       z.number().int().min(20, 'Allow at least 20 m').max(2000, 'Keep the area under 2 km'),
});

router.put('/settings', requireSuperAdmin, validate(settingsSchema), handle('admin save settings', async (req, res) => {
  if (req.body.veryLateMinutes <= req.body.graceMinutes) {
    return res.status(400).json({ field: 'veryLateMinutes', message: '“Very late” must start after the grace period ends.' });
  }
  const before = await getSettings(prisma);
  const changed = Object.keys(req.body).filter((k) => before[k] !== req.body[k]);
  const settings = await transaction(async (tx) => {
    const after = await tx.settings.update({ where: { id: 'singleton' }, data: { ...req.body, updatedByName: fullName(req.worker) } });
    if (changed.length) {
      await audit(tx, req.worker, {
        action: 'settings.update', targetType: 'settings', targetId: 'singleton',
        summary: `Changed the clocking settings: ${changed.map((k) => `${k} ${before[k]} → ${req.body[k]}`).join('; ')}`,
      });
    }
    return after;
  });
  res.json({ settings: presentSettings(settings), updatedByName: settings.updatedByName, updatedAt: settings.updatedAt });
}));

module.exports = router;
module.exports.presentService = presentService;
