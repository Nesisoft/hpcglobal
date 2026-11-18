const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { validate } = require('../middleware/validate');
const { authenticate, requireActive } = require('../middleware/auth');
const { handle } = require('../lib/http');
const { visibleTo, presentNotice, WITH_DEPARTMENT } = require('../lib/notices');

// A worker's notices: the ones meant for them, pinned first, and which are new.
router.use(authenticate, requireActive);

const unseen = (worker, now) => ({ ...visibleTo(worker, now), reads: { none: { workerId: worker.id } } });

router.get('/', handle('notices', async (req, res) => {
  const now = new Date();
  const notices = await withDbRetry(() => prisma.announcement.findMany({
    where:   visibleTo(req.worker, now),
    include: { ...WITH_DEPARTMENT, reads: { where: { workerId: req.worker.id }, select: { workerId: true } } },
    orderBy: [{ pinned: 'desc' }, { publishAt: 'desc' }],
    take:    100,
  }));
  const readIds = new Set(notices.filter((n) => n.reads.length).map((n) => n.id));
  res.json({
    notices: notices.map((n) => presentNotice(n, { now, readIds })),
    unread:  notices.length - readIds.size,
  });
}));

/** How many are new, and the newest one's title — for the count by "Notices" and the Home card. */
router.get('/unread', handle('notices unread', async (req, res) => {
  const where = unseen(req.worker, new Date());
  const [unread, latest] = await withDbRetry(() => Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findFirst({ where, orderBy: [{ pinned: 'desc' }, { publishAt: 'desc' }], select: { id: true, title: true } }),
  ]));
  res.json({ unread, latest });
}));

const readSchema = z.object({ ids: z.array(z.string().min(1)).max(100) });

/** Mark notices seen. Only ones this worker can see are marked; others are ignored. */
router.post('/read', validate(readSchema), handle('notices read', async (req, res) => {
  const now = new Date();
  const visible = await withDbRetry(() => prisma.announcement.findMany({
    where:  { id: { in: req.body.ids }, ...unseen(req.worker, now) },
    select: { id: true },
  }));
  if (visible.length) {
    await withDbRetry(() => prisma.announcementRead.createMany({
      data:           visible.map((n) => ({ announcementId: n.id, workerId: req.worker.id })),
      skipDuplicates: true,
    }));
  }
  const unread = await withDbRetry(() => prisma.announcement.count({ where: unseen(req.worker, now) }));
  res.json({ marked: visible.length, unread });
}));

module.exports = router;
