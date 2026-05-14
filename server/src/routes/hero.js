const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { verifyToken }  = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/hero — public
router.get('/', async (_req, res) => {
  try {
    const slides = await prisma.heroSlide.findMany({
      where:   { isActive: true },
      orderBy: { order: 'asc' },
    });
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
    res.json({ slides, tickerMessages: settings?.tickerMessages || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/hero — admin only
router.put('/', verifyToken, async (req, res) => {
  try {
    const { slides } = req.body;
    // Upsert each slide
    for (const slide of slides) {
      await prisma.heroSlide.upsert({
        where:  { id: slide.id || '' },
        update: slide,
        create: slide,
      });
    }
    res.json({ message: 'Hero updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
