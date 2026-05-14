const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { verifyToken }  = require('../middleware/auth');
const { requireRole }  = require('../middleware/adminOnly');

const prisma = new PrismaClient();

// All admin routes require auth
router.use(verifyToken);

// GET /api/admin/dashboard
router.get('/dashboard', async (_req, res) => {
  try {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      newPrayer, newVisitors, upcomingEvents, latestSermon,
      givingMonth, unreadMessages,
    ] = await Promise.all([
      prisma.prayerRequest.count({ where: { status: 'NEW' } }),
      prisma.visitor.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
      prisma.event.findMany({
        where:   { isPublished: true, startDate: { gte: now } },
        orderBy: { startDate: 'asc' },
        take:    3,
        select:  { title: true, startDate: true, category: true },
      }),
      prisma.sermon.findFirst({
        orderBy: { datePracticed: 'desc' },
        select:  { title: true, preacher: true, datePracticed: true },
      }),
      prisma.givingRecord.aggregate({
        where:  { status: 'COMPLETED', createdAt: { gte: start } },
        _sum:   { amount: true },
        _count: true,
      }),
      prisma.contactMessage.count({ where: { isRead: false } }),
    ]);

    res.json({
      newPrayerRequests:  newPrayer,
      newVisitorsThisWeek: newVisitors,
      upcomingEvents,
      latestSermon,
      givingThisMonth: {
        total: givingMonth._sum.amount || 0,
        count: givingMonth._count,
      },
      unreadMessages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Sermons ───────────────────────────────────────────────────────────
router.get('/sermons', async (req, res) => {
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

// ─── Admin: Events ────────────────────────────────────────────────────────────
router.get('/events', async (req, res) => {
  try {
    const events = await prisma.event.findMany({ orderBy: { startDate: 'desc' } });
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/events', async (req, res) => {
  try {
    const slug = req.body.title
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const event = await prisma.event.create({
      data: { ...req.body, slug, startDate: new Date(req.body.startDate) },
    });
    res.status(201).json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/events/:id', async (req, res) => {
  try {
    const event = await prisma.event.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/events/:id', async (req, res) => {
  try {
    await prisma.event.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/events/:id/rsvps', async (req, res) => {
  try {
    const rsvps = await prisma.eventRsvp.findMany({
      where:   { eventId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rsvps);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Giving ────────────────────────────────────────────────────────────
router.get('/giving', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { status, category, method, page = 1, limit = 20 } = req.query;
    const where = {
      ...(status   && { status }),
      ...(category && { category }),
      ...(method   && { method }),
    };
    const [records, total] = await Promise.all([
      prisma.givingRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.givingRecord.count({ where }),
    ]);
    res.json({ records, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/giving/summary', requireRole('SUPER_ADMIN'), async (_req, res) => {
  try {
    const now   = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear  = new Date(now.getFullYear(), 0, 1);

    const [month, year, byCategory, byMethod] = await Promise.all([
      prisma.givingRecord.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: startOfMonth } },
        _sum:  { amount: true }, _count: true,
      }),
      prisma.givingRecord.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: startOfYear } },
        _sum:  { amount: true }, _count: true,
      }),
      prisma.givingRecord.groupBy({
        by:    ['category'],
        where: { status: 'COMPLETED' },
        _sum:  { amount: true },
      }),
      prisma.givingRecord.groupBy({
        by:    ['method'],
        where: { status: 'COMPLETED' },
        _sum:  { amount: true },
      }),
    ]);

    res.json({ month, year, byCategory, byMethod });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Prayer ────────────────────────────────────────────────────────────
router.get('/prayer', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { status, category, page = 1, limit = 20 } = req.query;
    const where = {
      ...(status   && { status }),
      ...(category && { category }),
    };
    const [requests, total] = await Promise.all([
      prisma.prayerRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.prayerRequest.count({ where }),
    ]);
    res.json({ requests, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/prayer/:id', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const updated = await prisma.prayerRequest.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Visitors ──────────────────────────────────────────────────────────
router.get('/visitors', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = { ...(status && { status }) };
    const [visitors, total] = await Promise.all([
      prisma.visitor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.visitor.count({ where }),
    ]);
    res.json({ visitors, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/visitors/:id', async (req, res) => {
  try {
    const visitor = await prisma.visitor.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(visitor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Blog ──────────────────────────────────────────────────────────────
router.get('/blog', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { author: { select: { name: true } } },
      }),
      prisma.blogPost.count(),
    ]);
    res.json({ posts, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Gallery ───────────────────────────────────────────────────────────
router.get('/gallery/albums', async (_req, res) => {
  try {
    const albums = await prisma.galleryAlbum.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { photos: true } } },
    });
    res.json(albums);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/gallery/albums', async (req, res) => {
  try {
    const album = await prisma.galleryAlbum.create({ data: req.body });
    res.status(201).json(album);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/gallery/albums/:id', async (req, res) => {
  try {
    const album = await prisma.galleryAlbum.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(album);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/gallery/albums/:id', async (req, res) => {
  try {
    await prisma.galleryAlbum.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Ministries ────────────────────────────────────────────────────────
router.get('/ministries', async (_req, res) => {
  try {
    const ministries = await prisma.ministry.findMany({ orderBy: { order: 'asc' } });
    res.json(ministries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Leadership ────────────────────────────────────────────────────────
router.get('/leadership', async (_req, res) => {
  try {
    const profiles = await prisma.leadershipProfile.findMany({
      orderBy: [{ isSenior: 'desc' }, { order: 'asc' }],
    });
    res.json(profiles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: About ─────────────────────────────────────────────────────────────
router.get('/about', async (_req, res) => {
  try {
    const about = await prisma.aboutContent.findUnique({ where: { id: 'singleton' } });
    res.json(about || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/about', async (req, res) => {
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

// ─── Admin: Service Times ─────────────────────────────────────────────────────
router.get('/service-times', async (_req, res) => {
  try {
    const times = await prisma.serviceTime.findMany({ orderBy: { order: 'asc' } });
    res.json(times);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/service-times/:id', async (req, res) => {
  try {
    const time = await prisma.serviceTime.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(time);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Settings ──────────────────────────────────────────────────────────
router.get('/settings', requireRole('SUPER_ADMIN'), async (_req, res) => {
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
    res.json(settings || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/settings', requireRole('SUPER_ADMIN'), async (req, res) => {
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

// ─── Admin: Contact Messages ──────────────────────────────────────────────────
router.get('/contact/messages', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [messages, total] = await Promise.all([
      prisma.contactMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.contactMessage.count(),
    ]);
    res.json({ messages, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/contact/messages/:id', async (req, res) => {
  try {
    const msg = await prisma.contactMessage.update({
      where: { id: req.params.id },
      data:  { isRead: true },
    });
    res.json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Users (SUPER_ADMIN only) ─────────────────────────────────────────
router.get('/users', requireRole('SUPER_ADMIN'), async (_req, res) => {
  try {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: 'asc' },
      select:  { id: true, name: true, email: true, role: true, lastLogin: true, createdAt: true },
    });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/users', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.adminUser.create({
      data: { name, email, passwordHash, role },
      select: { id: true, name: true, email: true, role: true },
    });
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/users/:id', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    const data = { name, email, role };
    if (password) data.passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.adminUser.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, email: true, role: true },
    });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/users/:id', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    await prisma.adminUser.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
