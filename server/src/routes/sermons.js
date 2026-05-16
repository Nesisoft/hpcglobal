const router = require('express').Router();
const { z }   = require('zod');

const { verifyToken }  = require('../middleware/auth');
const { validate }     = require('../middleware/validate');

const prisma = require('../lib/prisma');

const sermonSchema = z.object({
  title:         z.string().min(1),
  preacher:      z.string().min(1),
  youtubeId:     z.string().min(1),
  youtubeUrl:    z.string().url(),
  thumbnailUrl:  z.string().url(),
  duration:      z.string().optional(),
  series:        z.string().optional(),
  scripture:     z.string().optional(),
  serviceType:   z.string().optional(),
  datePracticed: z.string(),
  isPublished:   z.boolean().default(true),
  isFeatured:    z.boolean().default(false),
});

// GET /api/sermons — public, published only
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 12, series, preacher } = req.query;
    const where = {
      isPublished: true,
      ...(series   && { series }),
      ...(preacher && { preacher }),
    };
    const [sermons, total] = await Promise.all([
      prisma.sermon.findMany({
        where,
        orderBy: { datePracticed: 'desc' },
        skip:  (Number(page) - 1) * Number(limit),
        take:  Number(limit),
      }),
      prisma.sermon.count({ where }),
    ]);
    res.json({ sermons, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/sermons/:id — public
router.get('/:id', async (req, res) => {
  try {
    const sermon = await prisma.sermon.findFirst({
      where: { id: req.params.id, isPublished: true },
    });
    if (!sermon) return res.status(404).json({ message: 'Not found' });
    res.json(sermon);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin routes
// GET /api/sermons/admin/all
router.get('/admin/all', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [sermons, total] = await Promise.all([
      prisma.sermon.findMany({
        orderBy: { datePracticed: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.sermon.count(),
    ]);
    res.json({ sermons, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/sermons — admin
router.post('/', verifyToken, validate(sermonSchema), async (req, res) => {
  try {
    const sermon = await prisma.sermon.create({
      data: { ...req.body, datePracticed: new Date(req.body.datePracticed) },
    });
    res.status(201).json(sermon);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/sermons/:id — admin
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const sermon = await prisma.sermon.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(sermon);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/sermons/:id — admin
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await prisma.sermon.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
