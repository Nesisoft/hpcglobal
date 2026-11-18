const prisma = require('./prisma');
const { transaction } = require('./tx');
const { audit } = require('./audit');
const { fullName } = require('./present');
const { dateKey, dateOnly, todayKey, addDays, isDateKey } = require('./time');

/**
 * Leave: a worker asks to be excused for some days; their head of department
 * (or an administrator) approves or rejects it. Approved leave turns the
 * services on those days from "absent" into "excused" in every report.
 */

const TYPES = ['SICK', 'PERSONAL', 'FAMILY', 'TRAVEL', 'OTHER'];
const TYPE_LABELS = { SICK: 'Sick', PERSONAL: 'Personal', FAMILY: 'Family emergency', TRAVEL: 'Travel', OTHER: 'Other' };

const BACKDATE_DAYS = 7;     // how far back a request may start (an illness reported afterwards)
const MAX_SPAN_DAYS = 60;    // the longest single request
const AHEAD_DAYS    = 365;   // how far ahead it may be asked for

const WITH_WORKER = {
  worker: { select: { id: true, firstName: true, lastName: true, departmentId: true, department: { select: { id: true, name: true } } } },
};

function presentLeave(l, today = todayKey()) {
  const start = dateKey(l.startDate);
  const end = dateKey(l.endDate);
  return {
    id:             l.id,
    type:           l.type,
    typeLabel:      TYPE_LABELS[l.type],
    startDate:      start,
    endDate:        end,
    days:           Math.round((dateOnly(end) - dateOnly(start)) / 86400000) + 1,
    reason:         l.reason,
    status:         l.status,
    reviewedByName: l.reviewedByName ?? null,
    reviewNote:     l.reviewNote ?? null,
    reviewedAt:     l.reviewedAt ?? null,
    createdAt:      l.createdAt,
    // A worker may withdraw a request still waiting, or approved leave that hasn't begun.
    cancellable:    l.status === 'PENDING' || (l.status === 'APPROVED' && start > today),
    ...(l.worker ? {
      worker: {
        id: l.worker.id, name: fullName(l.worker),
        department: l.worker.department ? { id: l.worker.department.id, name: l.worker.department.name } : null,
      },
    } : {}),
  };
}

/** The problem with a requested range, or null. */
function rangeProblem(startDate, endDate, today = todayKey()) {
  if (!isDateKey(startDate)) return { field: 'startDate', message: 'Choose the first day.' };
  if (!isDateKey(endDate)) return { field: 'endDate', message: 'Choose the last day.' };
  if (endDate < startDate) return { field: 'endDate', message: 'The last day is before the first.' };
  if (startDate < addDays(today, -BACKDATE_DAYS)) {
    return { field: 'startDate', message: `Leave can start at most ${BACKDATE_DAYS} days ago. For anything older, speak to your head of department.` };
  }
  if (endDate > addDays(startDate, MAX_SPAN_DAYS - 1)) return { field: 'endDate', message: `One request can cover at most ${MAX_SPAN_DAYS} days.` };
  if (startDate > addDays(today, AHEAD_DAYS)) return { field: 'startDate', message: 'That’s too far ahead to ask for now.' };
  return null;
}

// Requests for one worker are made one at a time, so two taps (or two tabs)
// can't each find no overlap and both be saved.
const lockWorker = (tx, workerId) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${workerId}`})::bigint)`;

/** Ask for leave. Returns { leave } or { status, field?, message }. */
async function requestLeave(worker, { type, startDate, endDate, reason }) {
  const problem = rangeProblem(startDate, endDate);
  if (problem) return { status: 400, ...problem };
  return transaction(async (tx) => {
    await lockWorker(tx, worker.id);
    const clash = await tx.leaveRequest.findFirst({
      where: {
        workerId: worker.id, status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: dateOnly(endDate) }, endDate: { gte: dateOnly(startDate) },
      },
    });
    if (clash) {
      const c = presentLeave(clash);
      return {
        status: 409, field: 'startDate',
        message: `You already have ${c.status === 'APPROVED' ? 'approved leave' : 'a request waiting'} for ${c.startDate === c.endDate ? c.startDate : `${c.startDate} to ${c.endDate}`}. Cancel it first to change the dates.`,
      };
    }
    const leave = await tx.leaveRequest.create({
      data: { workerId: worker.id, type, startDate: dateOnly(startDate), endDate: dateOnly(endDate), reason },
    });
    return { leave: presentLeave(leave) };
  });
}

/** Withdraw one's own request. */
async function cancelLeave(worker, id) {
  const today = todayKey();
  const where = { id, workerId: worker.id };
  const changed = await prisma.leaveRequest.updateMany({
    where: { ...where, OR: [{ status: 'PENDING' }, { status: 'APPROVED', startDate: { gt: dateOnly(today) } }] },
    data:  { status: 'CANCELLED' },
  });
  const leave = await prisma.leaveRequest.findFirst({ where });
  if (!leave) return { status: 404, message: 'That request wasn’t found.' };
  if (!changed.count) {
    return {
      status: 409,
      message: leave.status === 'APPROVED'
        ? 'This leave has already begun, so it can’t be withdrawn. Speak to your head of department.'
        : `This request has already been ${leave.status.toLowerCase()}.`,
    };
  }
  return { leave: presentLeave(leave) };
}

/**
 * Approve or reject a waiting request. A head of department passes their
 * `departmentId` and can act only on their own members' requests; nobody
 * reviews their own.
 */
async function reviewLeave(actor, id, { approve, note, departmentId }) {
  return transaction(async (tx) => {
    const leave = await tx.leaveRequest.findUnique({ where: { id }, include: WITH_WORKER });
    const notFound = { status: 404, message: departmentId ? 'That request isn’t from your department.' : 'That request wasn’t found.' };
    if (!leave) return notFound;
    if (departmentId && leave.worker.departmentId !== departmentId) return notFound;
    if (leave.workerId === actor.id) {
      return { status: 403, message: departmentId ? 'Your own leave is approved by the church office.' : 'Someone else must review your own leave.' };
    }
    const changed = await tx.leaveRequest.updateMany({
      where: { id, status: 'PENDING' },
      data:  {
        status: approve ? 'APPROVED' : 'REJECTED', reviewedById: actor.id, reviewedByName: fullName(actor),
        reviewNote: note || null, reviewedAt: new Date(),
      },
    });
    if (!changed.count) return { status: 409, message: `This request has already been ${leave.status.toLowerCase()}.` };
    const after = await tx.leaveRequest.findUnique({ where: { id }, include: WITH_WORKER });
    const p = presentLeave(after);
    const dates = p.startDate === p.endDate ? p.startDate : `${p.startDate} to ${p.endDate}`;
    await audit(tx, actor, {
      action: approve ? 'leave.approve' : 'leave.reject', targetType: 'leave', targetId: id,
      summary: `${approve ? 'Approved' : 'Rejected'} ${p.typeLabel.toLowerCase()} leave for ${p.worker.name}, ${dates}${note ? `: ${note}` : ''}`,
    });
    return { leave: p };
  });
}

module.exports = {
  TYPES, TYPE_LABELS, BACKDATE_DAYS, MAX_SPAN_DAYS, WITH_WORKER, presentLeave, rangeProblem, requestLeave, cancelLeave, reviewLeave,
};
