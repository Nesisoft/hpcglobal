const router = require('express').Router();
const { z }   = require('zod');

const { verifyToken }  = require('../middleware/auth');
const { validate }     = require('../middleware/validate');

const prisma = require('../lib/prisma');

const eventSchema = z.object({
  title:       z.string().min(1),
  description: z.string().min(1),
  startDate:   z.string(),
  endDate:     z.string().optional(),
  timeGmt:     z.string(),
  timeEst:     z.string().optional(),
  timeBst:     z.string().optional(),
  venue:       z.string().optional(),
  isOnline:    z.boolean().default(false),
  joinLink:    z.string().optional(),
  imageUrl:    z.string().optional(),
  category:    z.enum(['SERVICE','CONFERENCE','YOUTH','WOMENS','MENS','ONLINE','OTHER']),
  isFeatured:  z.boolean().default(false),
  isPublished: z.boolean().default(false),
  speakers:    z.string().optional(),
});

const rsvpSchema = z.object({
  name:       z.string().min(1),
  email:      z.string().email().optional(),
  phone:      z.string().min(1),
  attendance: z.enum(['in-person', 'online']),
});

// GET /api/events — public upcoming
router.get('/', async (req, res) => {
  try {
    const { featured, category } = req.query;
    const where = {
      isPublished: true,
      startDate:   { gte: new Date() },
      ...(featured === 'true' && { isFeatured: true }),
      ...(category && { category }),
    };
    const events = await prisma.event.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/events/:slug — public single
router.get('/:slug', async (req, res) => {
  try {
    const event = await prisma.event.findFirst({
      where: { slug: req.params.slug, isPublished: true },
    });
    if (!event) return res.status(404).json({ message: 'Not found' });
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/events/:id/rsvp — public
router.post('/:id/rsvp', validate(rsvpSchema), async (req, res) => {
  try {
    const rsvp = await prisma.eventRsvp.create({
      data: { ...req.body, eventId: req.params.id },
    });
    res.status(201).json(rsvp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
