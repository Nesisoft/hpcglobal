const router = require('express').Router();

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { authenticate, requireActive } = require('../middleware/auth');
const { handle } = require('../lib/http');
const { todayKey, addDays, dateOnly } = require('../lib/time');
const { WITH_DETAILS, presentTicket } = require('../lib/tickets');
const { progressOf, presentReward, presentClaim } = require('../lib/rewards');

// A worker's own record: the tickets they've been given, and the rewards
// they're working towards, have earned, or have been handed.
router.use(authenticate, requireActive);

// Rewards stay on show for a while after they end, so an earned one can be collected.
const SHOW_ENDED_DAYS = 60;

router.get('/', handle('my record', async (req, res) => {
  const today = todayKey();
  const [tickets, rewards] = await withDbRetry(() => Promise.all([
    prisma.ticket.findMany({ where: { workerId: req.worker.id }, include: WITH_DETAILS, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.reward.findMany({
      where:   {
        OR: [
          { active: true, endsOn: { gte: dateOnly(addDays(today, -SHOW_ENDED_DAYS)) }, startsOn: { lte: dateOnly(today) } },
          { claims: { some: { workerId: req.worker.id } } },
        ],
      },
      include: { service: { select: { id: true, name: true } }, claims: { where: { workerId: req.worker.id } } },
      orderBy: [{ endsOn: 'asc' }, { name: 'asc' }],
    }),
  ]));
  const shown = [];
  for (const r of rewards) {
    const progress = (await withDbRetry(() => progressOf(prisma, r, [req.worker.id]))).get(req.worker.id) ?? 0;
    shown.push({
      ...presentReward(r, today),
      progress,
      earned:     progress >= r.target,
      handedOver: presentClaim(r.claims[0]) ?? null,
    });
  }
  res.json({ tickets: tickets.map(presentTicket), rewards: shown });
}));

module.exports = router;
