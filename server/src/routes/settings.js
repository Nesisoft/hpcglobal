const router = require('express').Router();

const { verifyToken }  = require('../middleware/auth');

const prisma = require('../lib/prisma');

// Safe fields returned to the public
const PUBLIC_FIELDS = {
  churchName: true, tagline: true, phone: true, email: true, whatsapp: true,
  address: true, mapsLat: true, mapsLng: true, zoomLink: true,
  youtubeHandle: true, facebookUrl: true, instagramUrl: true,
  mtnMomoNumber: true, telecelNumber: true, airteltigo: true,
  bankName: true, bankAccount: true, bankBranch: true, bankSwift: true, bankCode: true,
  partnerMinAmount: true, zelleAccount: true,
};

// GET /api/settings — public (safe fields only)
router.get('/', async (_req, res) => {
  try {
    const settings = await prisma.siteSettings.findUnique({
      where:  { id: 'singleton' },
      select: PUBLIC_FIELDS,
    });
    res.json(settings || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/settings — admin (full record including secrets)
router.put('/', verifyToken, async (req, res) => {
  try {
    const settings = await prisma.siteSettings.upsert({
      where:  { id: 'singleton' },
      update: req.body,
      create: { id: 'singleton', ...req.body },
    });
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
