const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../../lib/prisma');
const { withDbRetry } = require('../../lib/dbRetry');
const { validate } = require('../../middleware/validate');
const { handle } = require('../../lib/http');
const { transaction } = require('../../lib/tx');
const { audit } = require('../../lib/audit');
const { fullName } = require('../../lib/present');
const { presentNotice, noticeFields, noticeDates, WITH_DEPARTMENT } = require('../../lib/notices');

// Notices from the office: to everyone, one department, or the heads of
// department. Listed with the ones scheduled and expired, and how many have
// read each.

const WITH_COUNTS = { ...WITH_DEPARTMENT, _count: { select: { reads: true } } };

const audienceFields = z.object({
  audience:     z.enum(['ALL', 'DEPARTMENT', 'HODS'], { error: 'Choose who it is for' }),
  departmentId: z.string().min(1).optional().nullable(),
});
const createSchema = noticeFields.extend(audienceFields.shape);
const updateSchema = createSchema.partial();

const audienceLabel = (n, department) => (n.audience === 'ALL' ? 'everyone' : n.audience === 'HODS' ? 'heads of department' : department?.name ?? 'a department');

/** The department a notice for one department goes to, or a refusal. */
async function checkAudience({ audience, departmentId }) {
  if (audience !== 'DEPARTMENT') return { departmentId: null };
  if (!departmentId) return { error: { field: 'departmentId', message: 'Choose the department' } };
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department?.active) return { error: { field: 'departmentId', message: 'Choose an active department' } };
  return { departmentId, department };
}

router.get('/notices', handle('admin notices', async (_req, res) => {
  const now = new Date();
  const notices = await withDbRetry(() => prisma.announcement.findMany({ include: WITH_COUNTS, orderBy: { publishAt: 'desc' }, take: 200 }));
  res.json({ notices: notices.map((n) => presentNotice(n, { now })) });
}));

router.post('/notices', validate(createSchema), handle('admin post notice', async (req, res) => {
  const target = await checkAudience(req.body);
  if (target.error) return res.status(400).json(target.error);
  const dates = noticeDates(req.body);
  if (dates.error) return res.status(400).json(dates.error);
  const notice = await transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: {
        title: req.body.title, body: req.body.body, pinned: req.body.pinned ?? false,
        audience: req.body.audience, departmentId: target.departmentId,
        publishAt: dates.publishAt, expiresAt: dates.expiresAt, authorId: req.worker.id, authorName: fullName(req.worker),
      },
      include: WITH_COUNTS,
    });
    await audit(tx, req.worker, {
      action: 'notice.create', targetType: 'notice', targetId: created.id,
      summary: `Posted “${created.title}” to ${audienceLabel(created, created.department)}`,
    });
    return created;
  });
  res.status(201).json({ notice: presentNotice(notice) });
}));

router.patch('/notices/:id', validate(updateSchema), handle('admin edit notice', async (req, res) => {
  const before = await withDbRetry(() => prisma.announcement.findUnique({ where: { id: req.params.id } }));
  if (!before) return res.status(404).json({ message: 'That notice wasn’t found.' });
  const merged = {
    audience:     req.body.audience ?? before.audience,
    departmentId: req.body.departmentId !== undefined ? req.body.departmentId : before.departmentId,
  };
  const target = await checkAudience(merged);
  if (target.error) return res.status(400).json(target.error);
  const data = { audience: merged.audience, departmentId: target.departmentId };
  for (const key of ['title', 'body', 'pinned']) if (req.body[key] !== undefined) data[key] = req.body[key];
  const dates = noticeDates(req.body, { keep: before });
  if (dates.error) return res.status(400).json(dates.error);
  Object.assign(data, dates);
  const notice = await transaction(async (tx) => {
    const after = await tx.announcement.update({ where: { id: before.id }, data, include: WITH_COUNTS });
    await audit(tx, req.worker, { action: 'notice.update', targetType: 'notice', targetId: after.id, summary: `Edited “${after.title}”` });
    return after;
  });
  res.json({ notice: presentNotice(notice) });
}));

router.delete('/notices/:id', handle('admin delete notice', async (req, res) => {
  const removed = await transaction(async (tx) => {
    const notice = await tx.announcement.findUnique({ where: { id: req.params.id } });
    if (!notice) return null;
    await tx.announcement.delete({ where: { id: notice.id } });
    await audit(tx, req.worker, { action: 'notice.delete', targetType: 'notice', targetId: notice.id, summary: `Took down “${notice.title}”` });
    return notice;
  });
  if (!removed) return res.status(404).json({ message: 'That notice wasn’t found.' });
  res.json({ removed: removed.id });
}));

module.exports = router;
