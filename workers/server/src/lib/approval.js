const { transaction } = require('./tx');
const { audit } = require('./audit');
const { fullName, presentWorker } = require('./present');
const { WITH_DEPARTMENT } = require('../middleware/auth');

/**
 * Approving and declining sign-ups — the same for a head of department and an
 * administrator, except that a HOD passes `departmentId` and can only act on
 * people who signed up to their own department.
 *
 * Each change is a conditional update (only from PENDING, only in that
 * department), so two people pressing Approve at once, or a HOD acting on
 * someone an admin has just moved, can't both succeed or reach the wrong
 * person. Returns { worker } or { status, message } for the route to send.
 */
async function decide(actor, workerId, { approve, reason, departmentId }) {
  const where = {
    id: workerId,
    status: 'PENDING',
    ...(departmentId ? { departmentId } : {}),
    // A sign-up a super administrator has already made an administrator is
    // theirs alone to approve or decline. Part of the update's own condition,
    // so it holds even if the role changes at the same moment.
    ...(actor.role === 'SUPER_ADMIN' ? {} : { role: 'WORKER' }),
  };
  const now = new Date();

  return transaction(async (tx) => {
    const changed = await tx.worker.updateMany({
      where,
      data: approve
        ? { status: 'ACTIVE', approvedAt: now, approvedById: actor.id, approvedByName: fullName(actor), statusNote: null, editedAt: now }
        : { status: 'DECLINED', statusNote: reason || null, editedAt: now },
    });
    if (changed.count === 0) {
      const current = await tx.worker.findUnique({ where: { id: workerId } });
      if (!current) return { status: 404, message: departmentId ? 'That person isn’t waiting in your department.' : 'No such worker.' };
      if (departmentId && current.departmentId !== departmentId) {
        return { status: 404, message: 'That person isn’t waiting in your department.' };
      }
      if (current.status === 'PENDING') {
        return { status: 403, message: 'Only a super administrator can approve or decline an administrator’s account.' };
      }
      return { status: 409, message: `${fullName(current)} has already been ${current.status === 'ACTIVE' ? 'approved' : current.status.toLowerCase()}.` };
    }

    const worker = await tx.worker.findUnique({ where: { id: workerId }, include: WITH_DEPARTMENT });
    const where_ = worker.department ? ` (${worker.department.name})` : '';
    await audit(tx, actor, approve
      ? { action: 'worker.approve', targetType: 'worker', targetId: worker.id, summary: `Approved ${fullName(worker)}${where_}` }
      : { action: 'worker.decline', targetType: 'worker', targetId: worker.id, summary: `Declined ${fullName(worker)}${where_}${reason ? `: ${reason}` : ''}` });
    return { worker: presentWorker(worker) };
  });
}

module.exports = { decide };
