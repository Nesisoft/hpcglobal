const { z } = require('zod');
const { dateKey, isDateKey, todayKey } = require('./time');

/**
 * Rewards for attendance. Progress is counted from attendance each time it
 * is shown — never stored — so removing a record or editing a reward can't
 * leave it wrong. Only handing a reward over is recorded (RewardClaim, once
 * per worker per reward).
 */

/** The attendance a reward counts: in its period, at its service (or any that counts), on time if it asks. */
function countedWhere(reward) {
  return {
    ...(reward.onTimeOnly ? { status: 'ON_TIME' } : {}),
    session: {
      cancelled: false,
      date:      { gte: reward.startsOn, lte: reward.endsOn },
      ...(reward.serviceId ? { serviceId: reward.serviceId } : { service: { expected: true } }),
    },
  };
}

/** How many each of `workerIds` has towards `reward`: a Map of id → count. */
async function progressOf(db, reward, workerIds) {
  if (!workerIds.length) return new Map();
  const groups = await db.attendance.groupBy({
    by:     ['workerId'],
    where:  { workerId: { in: workerIds }, ...countedWhere(reward) },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.workerId, g._count._all]));
}

function presentReward(r, today = todayKey()) {
  const startsOn = dateKey(r.startsOn);
  const endsOn = dateKey(r.endsOn);
  return {
    id:          r.id,
    name:        r.name,
    description: r.description ?? null,
    service:     r.service ? { id: r.service.id, name: r.service.name } : null,
    target:      r.target,
    onTimeOnly:  r.onTimeOnly,
    startsOn,
    endsOn,
    active:      r.active,
    state:       today < startsOn ? 'upcoming' : today > endsOn ? 'ended' : 'running',
    ...(r._count ? { handedOver: r._count.claims } : {}),
  };
}

const presentClaim = (c) => c && ({ handedOverAt: c.handedOverAt, handedOverByName: c.handedOverByName });

const rewardFields = z.object({
  name:        z.string({ error: 'Name the reward' }).trim().min(3, 'Name the reward').max(120, 'Keep the name under 120 characters'),
  description: z.string().trim().max(500, 'Keep it under 500 characters').optional().nullable(),
  serviceId:   z.string().min(1).optional().nullable(),
  target:      z.number({ error: 'How many attendances does it take?' }).int('A whole number').min(1, 'At least 1').max(500, 'At most 500'),
  onTimeOnly:  z.boolean().optional(),
  startsOn:    z.string({ error: 'Choose the first day' }).refine(isDateKey, 'Choose the first day'),
  endsOn:      z.string({ error: 'Choose the last day' }).refine(isDateKey, 'Choose the last day'),
  active:      z.boolean().optional(),
});

module.exports = { countedWhere, progressOf, presentReward, presentClaim, rewardFields };
