const prisma = require('./prisma');
const { transaction } = require('./tx');
const { audit } = require('./audit');
const { fullName } = require('./present');
const { getSettings } = require('./settings');
const { dateKey, todayKey, addDays, at, timeOf } = require('./time');
const { windowOf, arrival, departure } = require('./clock');
const { presentAttendance } = require('./sessions');

/**
 * Attendance put right by hand: a HOD marking present someone whose phone
 * died, or an administrator adding or removing a record. Always with a
 * reason, always in the audit log, and the record says who marked it.
 */

const HOD_DAYS_BACK   = 14;
const ADMIN_DAYS_BACK = 92;

const describe = (session) => `${session.service.name} on ${dateKey(session.date)}`;

/**
 * Mark `workerId` present at `session`, arriving at `arrivedAt` (and, if
 * known, leaving at `leftAt`), both "HH:MM" on the session's day. A head of
 * department passes their `departmentId`. Returns { attendance } or
 * { status, field?, message }.
 */
async function markPresent(actor, session, { workerId, arrivedAt, leftAt, reason }, { departmentId, daysBack }) {
  const now = new Date();
  const key = dateKey(session.date);
  if (session.cancelled) return { status: 400, message: `${describe(session)} was cancelled.` };
  if (session.startsAt > now) return { status: 400, message: `${describe(session)} hasn’t started yet. Mark people once it has.` };
  if (key < addDays(todayKey(now), -daysBack)) {
    return { status: 400, message: `Attendance can be marked by hand for the last ${daysBack} days only.` };
  }

  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!worker || (departmentId && worker.departmentId !== departmentId)) {
    return { status: 404, field: 'workerId', message: departmentId ? 'That person isn’t in your department.' : 'That worker wasn’t found.' };
  }
  if (worker.status !== 'ACTIVE') return { status: 400, field: 'workerId', message: `${fullName(worker)}’s account isn’t active.` };
  if (worker.id === actor.id) {
    return { status: 403, field: 'workerId', message: 'Someone else must mark you present — your head of department or the church office.' };
  }
  // Reports count people from the day they were approved; a mark before that would count for nothing.
  const joined = dateKey(worker.approvedAt ?? worker.createdAt);
  if (key < joined) {
    return { status: 400, field: 'workerId', message: `${fullName(worker)} only joined on ${joined}, after this service.` };
  }

  const settings = await getSettings(prisma);
  const { opensAt, clockOutUntil } = windowOf(session, settings);
  const came = at(key, arrivedAt);
  if (came < opensAt || came > session.endsAt) {
    return { status: 400, field: 'arrivedAt', message: `Arrival must be between ${timeOf(opensAt)} and ${timeOf(session.endsAt)}.` };
  }
  if (came > now) return { status: 400, field: 'arrivedAt', message: 'That arrival time hasn’t come yet.' };
  let went = null;
  if (leftAt) {
    went = at(key, leftAt);
    if (went <= came) return { status: 400, field: 'leftAt', message: 'Leaving must be after arriving.' };
    if (went > clockOutUntil || went > now) {
      return { status: 400, field: 'leftAt', message: `Leaving must be by ${timeOf(clockOutUntil)} and not later than now.` };
    }
  }

  const { status, lateMinutes } = arrival(session, settings, came);
  const out = went ? departure({ clockInAt: came }, session, settings, went) : null;
  try {
    const record = await transaction(async (tx) => {
      const created = await tx.attendance.create({
        data: {
          workerId, sessionId: session.id, method: 'MANUAL', clockInAt: came, status, lateMinutes,
          ...(out ? { clockOutAt: went, clockOutMethod: 'MANUAL', minutesPresent: out.minutesPresent, leftEarlyMinutes: out.leftEarlyMinutes } : {}),
          markedById: actor.id, markedByName: fullName(actor), markReason: reason,
        },
      });
      await audit(tx, actor, {
        action: 'attendance.mark', targetType: 'attendance', targetId: created.id,
        summary: `Marked ${fullName(worker)} present at ${describe(session)}, arrived ${arrivedAt}${leftAt ? `, left ${leftAt}` : ''}: ${reason}`,
      });
      return created;
    });
    return { attendance: presentAttendance(record, settings) };
  } catch (err) {
    if (err.code === 'P2002') return { status: 409, field: 'workerId', message: `${fullName(worker)} is already recorded for ${describe(session)}.` };
    throw err;
  }
}

/**
 * Remove a record (a mistaken mark, or a clock-in that wasn't genuine).
 * A head of department may remove only marks made by hand, in their own
 * department, within the marking period; an administrator any record.
 */
async function removeAttendance(actor, id, reason, { departmentId, daysBack }) {
  return transaction(async (tx) => {
    const record = await tx.attendance.findUnique({
      where: { id }, include: { worker: true, session: { include: { service: true } } },
    });
    if (!record || (departmentId && record.worker.departmentId !== departmentId)) {
      return { status: 404, message: 'That record wasn’t found.' };
    }
    if (departmentId && record.method !== 'MANUAL') {
      return { status: 403, message: 'Only marks made by hand can be removed here. Ask the church office about a clock-in.' };
    }
    if (dateKey(record.session.date) < addDays(todayKey(), -daysBack)) {
      return { status: 400, message: `Records older than ${daysBack} days can’t be changed.` };
    }
    const gone = await tx.attendance.deleteMany({ where: { id, updatedAt: record.updatedAt } });
    if (!gone.count) return { status: 409, message: 'That record has just changed. Reload and try again.' };
    await audit(tx, actor, {
      action: 'attendance.remove', targetType: 'attendance', targetId: id,
      summary: `Removed ${fullName(record.worker)}’s attendance at ${describe(record.session)} (${record.method.toLowerCase()}, in at ${timeOf(record.clockInAt)}): ${reason}`,
      details: {
        workerId: record.workerId, sessionId: record.sessionId, method: record.method, status: record.status,
        clockInAt: record.clockInAt, clockOutAt: record.clockOutAt, markedByName: record.markedByName, markReason: record.markReason,
      },
    });
    return { removed: id };
  });
}

module.exports = { HOD_DAYS_BACK, ADMIN_DAYS_BACK, markPresent, removeAttendance };
