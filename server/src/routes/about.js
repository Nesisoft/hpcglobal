const router = require('express').Router();

const { verifyToken }  = require('../middleware/auth');

const prisma = require('../lib/prisma');

router.get('/', async (_req, res) => {
  try {
    const about = await prisma.aboutContent.findUnique({ where: { id: 'singleton' } });
    res.json(about || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/', verifyToken, async (req, res) => {
  try {
    const about = await prisma.aboutContent.upsert({
      where:  { id: 'singleton' },
      update: req.body,
      create: { id: 'singleton', ...req.body },
    });
    res.json(about);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
