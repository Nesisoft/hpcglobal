const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../../lib/prisma');
const { withDbRetry } = require('../../lib/dbRetry');
const { validate } = require('../../middleware/validate');
const { handle } = require('../../lib/http');
const { fullName } = require('../../lib/present');
const { audit } = require('../../lib/audit');
const { transaction } = require('../../lib/tx');

// Mounted under /api/admin, behind authenticate + requireActive + requireAdmin.
// Departments are archived, never deleted: attendance and reports name them.

router.get('/departments', handle('admin departments', async (_req, res) => {
  const [departments, members] = await withDbRetry(() => Promise.all([
    prisma.department.findMany({ orderBy: { name: 'asc' } }),
    prisma.worker.findMany({
      where:  { departmentId: { not: null }, status: { in: ['ACTIVE', 'PENDING'] } },
      select: { departmentId: true, status: true, isHod: true, firstName: true, lastName: true },
    }),
  ]), { label: 'admin departments' });

  const byDepartment = new Map(departments.map((d) => [d.id, { activeMembers: 0, pendingMembers: 0, hods: [] }]));
  for (const m of members) {
    const entry = byDepartment.get(m.departmentId);
    if (!entry) continue;
    if (m.status === 'ACTIVE') entry.activeMembers += 1; else entry.pendingMembers += 1;
    if (m.isHod && m.status === 'ACTIVE') entry.hods.push(fullName(m));
  }
  res.json({ departments: departments.map((d) => ({ ...d, ...byDepartment.get(d.id) })) });
}));

const departmentSchema = z.object({
  name:        z.string({ error: 'Enter a name' }).trim().min(1, 'Enter a name').max(80, 'Keep the name under 80 characters'),
  description: z.string().trim().max(300, 'Keep the description under 300 characters').optional().nullable(),
});

const DUPLICATE = { message: 'There is already a department with that name.', field: 'name' };

router.post('/departments', validate(departmentSchema), handle('admin add department', async (req, res) => {
  try {
    const department = await transaction(async (tx) => {
      const created = await tx.department.create({ data: { name: req.body.name, description: req.body.description || null } });
      await audit(tx, req.worker, {
        action: 'department.create', targetType: 'department', targetId: created.id, summary: `Added the ${created.name} department`,
      });
      return created;
    });
    res.status(201).json({ department });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json(DUPLICATE);
    throw err;
  }
}));

const updateSchema = departmentSchema.partial().extend({ active: z.boolean().optional() });

router.patch('/departments/:id', validate(updateSchema), handle('admin edit department', async (req, res) => {
  const before = await withDbRetry(() => prisma.department.findUnique({ where: { id: req.params.id } }));
  if (!before) return res.status(404).json({ message: 'No such department.' });

  const data = {};
  if (req.body.name !== undefined) data.name = req.body.name;
  if (req.body.description !== undefined) data.description = req.body.description || null;
  if (req.body.active !== undefined) data.active = req.body.active;

  try {
    const department = await transaction(async (tx) => {
      const after = await tx.department.update({ where: { id: before.id }, data });
      const changes = [];
      if (before.name !== after.name) changes.push(`renamed from ${before.name}`);
      if ((before.description || '') !== (after.description || '')) changes.push('description changed');
      if (before.active !== after.active) changes.push(after.active ? 'restored' : 'archived');
      if (changes.length) {
        await audit(tx, req.worker, {
          action: 'department.update', targetType: 'department', targetId: after.id,
          summary: `${after.name}: ${changes.join('; ')}`,
        });
      }
      return after;
    });
    res.json({ department });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json(DUPLICATE);
    throw err;
  }
}));

module.exports = router;
