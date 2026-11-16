const router = require('express').Router();
const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { handle } = require('../lib/http');

// The sign-up form's department list: names only, active ones only.
router.get('/', handle('departments', async (_req, res) => {
  const departments = await withDbRetry(() => prisma.department.findMany({
    where:   { active: true },
    select:  { id: true, name: true },
    orderBy: { name: 'asc' },
  }), { label: 'departments' });
  res.json({ departments });
}));

module.exports = router;
