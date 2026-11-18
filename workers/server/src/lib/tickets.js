const { z } = require('zod');
const prisma = require('./prisma');
const { transaction } = require('./tx');
const { audit } = require('./audit');
const { fullName } = require('./present');
const { dateKey } = require('./time');

/**
 * Penalty tickets: a head of department (for their own members) or the
 * office issues one with a reason; the worker sees it; it is resolved with
 * a note once dealt with. Never issued to oneself.
 */

const TYPES = ['WARNING', 'LATENESS', 'ABSENCE', 'MISCONDUCT'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'];
const TYPE_LABELS = { WARNING: 'Warning', LATENESS: 'Lateness', ABSENCE: 'Absence', MISCONDUCT: 'Misconduct' };

const WITH_DETAILS = {
  worker:  { select: { id: true, firstName: true, lastName: true, department: { select: { id: true, name: true } } } },
  session: { include: { service: { select: { name: true } } } },
};

function presentTicket(t) {
  return {
    id:             t.id,
    type:           t.type,
    typeLabel:      TYPE_LABELS[t.type],
    severity:       t.severity,
    reason:         t.reason,
    session:        t.session ? { id: t.session.id, date: dateKey(t.session.date), name: t.session.service?.name } : null,
    issuedById:     t.issuedById ?? null,
    issuedByName:   t.issuedByName,
    resolved:       t.resolved,
    resolvedAt:     t.resolvedAt ?? null,
    resolvedByName: t.resolvedByName ?? null,
    resolutionNote: t.resolutionNote ?? null,
    createdAt:      t.createdAt,
    ...(t.worker ? {
      worker: {
        id: t.worker.id, name: fullName(t.worker),
        department: t.worker.department ? { id: t.worker.department.id, name: t.worker.department.name } : null,
      },
    } : {}),
  };
}

const issueSchema = z.object({
  workerId:  z.string({ error: 'Choose who it is for' }).min(1, 'Choose who it is for'),
  type:      z.enum(TYPES, { error: 'Choose the kind of ticket' }),
  severity:  z.enum(SEVERITIES, { error: 'Choose how serious it is' }),
  reason:    z.string({ error: 'Give the reason' }).trim().min(3, 'Give the reason').max(500, 'Keep it under 500 characters'),
  sessionId: z.string().min(1).optional().nullable(),
});

const resolveSchema = z.object({
  note: z.string({ error: 'Say how it was dealt with' }).trim().min(3, 'Say how it was dealt with').max(300, 'Keep the note under 300 characters'),
});

/** Issue a ticket. A head of department passes their `departmentId`. Returns { ticket } or { status, field?, message }. */
async function issueTicket(actor, { workerId, type, severity, reason, sessionId }, { departmentId } = {}) {
  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!worker || (departmentId && worker.departmentId !== departmentId)) {
    return { status: 404, field: 'workerId', message: departmentId ? 'That person isn’t in your department.' : 'That worker wasn’t found.' };
  }
  if (worker.id === actor.id) return { status: 403, field: 'workerId', message: 'You can’t issue a ticket to yourself.' };
  if (worker.status !== 'ACTIVE') return { status: 400, field: 'workerId', message: `${fullName(worker)}’s account isn’t active.` };
  if (sessionId) {
    const session = await prisma.serviceSession.findUnique({ where: { id: sessionId } });
    if (!session || session.startsAt > new Date()) return { status: 400, field: 'sessionId', message: 'Choose a service that has already happened.' };
  }
  return transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data:    { workerId, type, severity, reason, sessionId: sessionId || null, issuedById: actor.id, issuedByName: fullName(actor) },
      include: WITH_DETAILS,
    });
    await audit(tx, actor, {
      action: 'ticket.issue', targetType: 'ticket', targetId: ticket.id,
      summary: `Issued a ${severity.toLowerCase()} ${TYPE_LABELS[type].toLowerCase()} ticket to ${fullName(worker)}: ${reason}`,
    });
    return { ticket: presentTicket(ticket) };
  });
}

/** Resolve an open ticket, once. A head of department may resolve their own department's, but not their own. */
async function resolveTicket(actor, id, note, { departmentId } = {}) {
  return transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id }, include: WITH_DETAILS });
    if (!ticket || (departmentId && ticket.worker.department?.id !== departmentId)) {
      return { status: 404, message: departmentId ? 'That ticket isn’t in your department.' : 'That ticket wasn’t found.' };
    }
    if (ticket.workerId === actor.id) return { status: 403, message: 'Someone else must resolve a ticket of your own.' };
    const done = await tx.ticket.updateMany({
      where: { id, resolved: false },
      data:  { resolved: true, resolvedAt: new Date(), resolvedById: actor.id, resolvedByName: fullName(actor), resolutionNote: note },
    });
    if (!done.count) return { status: 409, message: 'That ticket has already been resolved.' };
    await audit(tx, actor, {
      action: 'ticket.resolve', targetType: 'ticket', targetId: id,
      summary: `Resolved ${fullName(ticket.worker)}’s ${TYPE_LABELS[ticket.type].toLowerCase()} ticket: ${note}`,
    });
    return { ticket: presentTicket(await tx.ticket.findUnique({ where: { id }, include: WITH_DETAILS })) };
  });
}

/** `?status=open|resolved` (anything else: all) as a filter. */
const statusFilter = (status) => (status === 'open' ? { resolved: false } : status === 'resolved' ? { resolved: true } : {});

module.exports = {
  TYPES, SEVERITIES, TYPE_LABELS, WITH_DETAILS, presentTicket, issueSchema, resolveSchema, issueTicket, resolveTicket, statusFilter,
};
