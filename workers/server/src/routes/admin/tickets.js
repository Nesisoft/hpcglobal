const router = require('express').Router();

const prisma = require('../../lib/prisma');
const { withDbRetry } = require('../../lib/dbRetry');
const { validate } = require('../../middleware/validate');
const { handle } = require('../../lib/http');
const tickets = require('../../lib/tickets');

// Every ticket in the church: issue, resolve, and filter by department or status.

router.get('/tickets', handle('admin tickets', async (req, res) => {
  const departmentId = typeof req.query.departmentId === 'string' && req.query.departmentId ? req.query.departmentId : undefined;
  const inDepartment = departmentId ? { worker: { departmentId } } : {};
  const [list, open] = await withDbRetry(() => Promise.all([
    prisma.ticket.findMany({
      where:   { ...inDepartment, ...tickets.statusFilter(req.query.status) },
      include: tickets.WITH_DETAILS,
      orderBy: { createdAt: 'desc' },
      take:    300,
    }),
    prisma.ticket.count({ where: { ...inDepartment, resolved: false } }),
  ]));
  res.json({ tickets: list.map(tickets.presentTicket), open });
}));

router.post('/tickets', validate(tickets.issueSchema), handle('admin issue ticket', async (req, res) => {
  const result = await tickets.issueTicket(req.worker, req.body);
  if (result.status) return res.status(result.status).json({ message: result.message, field: result.field });
  res.status(201).json(result);
}));

router.post('/tickets/:id/resolve', validate(tickets.resolveSchema), handle('admin resolve ticket', async (req, res) => {
  const result = await tickets.resolveTicket(req.worker, req.params.id, req.body.note);
  if (result.status) return res.status(result.status).json({ message: result.message });
  res.json(result);
}));

module.exports = router;
