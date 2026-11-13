const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { withDbRetry } = require('../../lib/dbRetry');
const { handle } = require('../../lib/http');

// Mounted under /api/admin, behind authenticate + requireActive + requireAdmin.
router.get('/audit', handle('admin audit', async (req, res) => {
  const page  = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const q     = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const where = q ? {
    OR: [
      { summary:   { contains: q, mode: 'insensitive' } },
      { actorName: { contains: q, mode: 'insensitive' } },
    ],
  } : {};

  const [entries, total] = await withDbRetry(() => Promise.all([
    prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.auditLog.count({ where }),
  ]), { label: 'admin audit' });
  res.json({ entries, total, page, limit });
}));

module.exports = router;
