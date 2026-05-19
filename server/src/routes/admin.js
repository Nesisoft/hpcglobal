const router = require('express').Router();
const bcrypt = require('bcryptjs');

const { verifyToken }  = require('../middleware/auth');
const { requireRole }  = require('../middleware/adminOnly');

const prisma = require('../lib/prisma');

// All admin routes require auth
router.use(verifyToken);

// ─── CSV helpers ──────────────────────────────────────────────────────────────
function toCsv(rows, columns) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = columns.map((c) => esc(c.label)).join(',');
  const lines  = rows.map((r) => columns.map((c) => esc(c.value(r))).join(','));
  return [header, ...lines].join('\n');
}
function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
const fmtCsvDate = (d) =>
  d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '';

// GET /api/admin/dashboard
router.get('/dashboard', async (_req, res) => {
  try {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      newPrayer, newVisitors, upcomingEvents, latestSermon,
      givingMonth, givingMonthCount, unreadMessages,
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
        where: { status: 'COMPLETED', createdAt: { gte: start } },
        _sum:  { amount: true },
      }),
      prisma.givingRecord.count({
        where: { status: 'COMPLETED', createdAt: { gte: start } },
      }),
      prisma.contactMessage.count({ where: { isRead: false } }),
    ]);

    res.json({
      newPrayerRequests:   newPrayer,
      newVisitorsThisWeek: newVisitors,
      upcomingEvents,
      latestSermon,
      givingThisMonth: {
        total: givingMonth._sum?.amount ?? 0,
        count: givingMonthCount,
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
    const { page = 1, limit = 20, search, series } = req.query;
    const where = {
      ...(search && {
        OR: [
          { title:    { contains: search, mode: 'insensitive' } },
          { preacher: { contains: search, mode: 'insensitive' } },
          { series:   { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(series && { series: { contains: series, mode: 'insensitive' } }),
    };
    const [sermons, total] = await Promise.all([
      prisma.sermon.findMany({
        where,
        orderBy: { datePracticed: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.sermon.count({ where }),
    ]);
    res.json({ sermons, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Fetch YouTube video metadata by URL or ID
router.get('/sermons/youtube-meta', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ message: 'url required' });

    // Extract video ID from various YouTube URL formats
    const match = url.match(
      /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    );
    const videoId = match?.[1] ?? (url.length === 11 ? url : null);
    if (!videoId) return res.status(400).json({ message: 'Could not extract YouTube video ID' });

    if (!process.env.YOUTUBE_API_KEY) {
      // Return minimal info without API key
      return res.json({
        youtubeId:    videoId,
        youtubeUrl:   `https://www.youtube.com/watch?v=${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        title:        '',
        preacher:     '',
        duration:     '',
      });
    }

    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
    );
    const ytData = await ytRes.json();
    const item = ytData.items?.[0];
    if (!item) return res.status(404).json({ message: 'Video not found on YouTube' });

    // Convert ISO 8601 duration to readable string
    const iso = item.contentDetails?.duration ?? '';
    const durMatch = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = durMatch?.[1], m = durMatch?.[2], s = durMatch?.[3];
    const duration = [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ');

    res.json({
      youtubeId:    videoId,
      youtubeUrl:   `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: item.snippet.thumbnails?.high?.url ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      title:        item.snippet.title ?? '',
      preacher:     '',
      duration,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/sermons', async (req, res) => {
  try {
    const sermon = await prisma.sermon.create({
      data: {
        ...req.body,
        datePracticed: new Date(req.body.datePracticed),
      },
    });
    res.status(201).json(sermon);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/sermons/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.datePracticed) data.datePracticed = new Date(data.datePracticed);
    const sermon = await prisma.sermon.update({ where: { id: req.params.id }, data });
    res.json(sermon);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/sermons/:id', async (req, res) => {
  try {
    await prisma.sermon.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
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

function sanitizeEvent(body) {
  const {
    title, description, startDate, endDate, timeGmt, timeEst, timeBst,
    venue, isOnline, joinLink, imageUrl, category, isFeatured, isPublished,
  } = body;
  return {
    title,
    description,
    startDate:   new Date(startDate),
    endDate:     endDate ? new Date(endDate) : null,
    timeGmt,
    timeEst:     timeEst     || null,
    timeBst:     timeBst     || null,
    venue:       venue       || null,
    isOnline:    Boolean(isOnline),
    joinLink:    joinLink    || null,
    imageUrl:    imageUrl    || null,
    category,
    isFeatured:  Boolean(isFeatured),
    isPublished: Boolean(isPublished),
  };
}

router.post('/events', async (req, res) => {
  try {
    const slug = req.body.title
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const event = await prisma.event.create({
      data: { ...sanitizeEvent(req.body), slug },
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
      data:  sanitizeEvent(req.body),
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

router.get('/events/:id/rsvps/export', async (req, res) => {
  try {
    const rsvps = await prisma.eventRsvp.findMany({
      where:   { eventId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    const csv = toCsv(rsvps, [
      { label: 'Name',       value: (r) => r.name },
      { label: 'Phone',      value: (r) => r.phone },
      { label: 'Email',      value: (r) => r.email },
      { label: 'Attendance', value: (r) => r.attendance },
      { label: 'Registered', value: (r) => fmtCsvDate(r.createdAt) },
    ]);
    sendCsv(res, `rsvps-${req.params.id}.csv`, csv);
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

router.get('/giving/export', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { status, category, method } = req.query;
    const where = {
      ...(status   && { status }),
      ...(category && { category }),
      ...(method   && { method }),
    };
    const records = await prisma.givingRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    const csv = toCsv(records, [
      { label: 'Date',      value: (r) => fmtCsvDate(r.createdAt) },
      { label: 'Name',      value: (r) => r.name },
      { label: 'Phone',     value: (r) => r.phone },
      { label: 'Email',     value: (r) => r.email },
      { label: 'Amount',    value: (r) => r.amount },
      { label: 'Currency',  value: (r) => r.currency },
      { label: 'Category',  value: (r) => r.category },
      { label: 'Method',    value: (r) => r.method },
      { label: 'Status',    value: (r) => r.status },
      { label: 'Reference', value: (r) => r.reference },
    ]);
    sendCsv(res, `giving-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/giving/summary', requireRole('SUPER_ADMIN'), async (_req, res) => {
  try {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear  = new Date(now.getFullYear(), 0, 1);

    const whereMonth = { status: 'COMPLETED', createdAt: { gte: startOfMonth } };
    const whereYear  = { status: 'COMPLETED', createdAt: { gte: startOfYear  } };

    // Run sequentially so a failure tells us exactly which query broke
    const monthSum   = await prisma.givingRecord.aggregate({ where: whereMonth, _sum: { amount: true } });
    const monthCount = await prisma.givingRecord.count({ where: whereMonth });
    const yearSum    = await prisma.givingRecord.aggregate({ where: whereYear,  _sum: { amount: true } });
    const yearCount  = await prisma.givingRecord.count({ where: whereYear });

    // groupBy — fetch all completed records and group in JS to avoid potential
    // Prisma/pgbouncer groupBy issues in serverless
    const completed = await prisma.givingRecord.findMany({
      where:  { status: 'COMPLETED' },
      select: { category: true, method: true, amount: true },
    });

    const byCategory = Object.entries(
      completed.reduce((acc, r) => {
        acc[r.category] = (acc[r.category] || 0) + r.amount;
        return acc;
      }, {})
    ).map(([category, total]) => ({ category, _sum: { amount: total } }));

    const byMethod = Object.entries(
      completed.reduce((acc, r) => {
        acc[r.method] = (acc[r.method] || 0) + r.amount;
        return acc;
      }, {})
    ).map(([method, total]) => ({ method, _sum: { amount: total } }));

    res.json({
      month: { total: monthSum._sum?.amount ?? 0, count: monthCount },
      year:  { total: yearSum._sum?.amount  ?? 0, count: yearCount  },
      byCategory,
      byMethod,
    });
  } catch (err) {
    console.error('Giving summary error:', err);
    res.status(500).json({ message: err.message || 'Server error' });
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
router.get('/visitors/export', async (req, res) => {
  try {
    const { status } = req.query;
    const where = { ...(status && { status }) };
    const visitors = await prisma.visitor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    const csv = toCsv(visitors, [
      { label: 'Date',              value: (r) => fmtCsvDate(r.createdAt) },
      { label: 'Name',              value: (r) => r.name },
      { label: 'Phone',             value: (r) => r.phone },
      { label: 'Email',             value: (r) => r.email },
      { label: 'Country',           value: (r) => r.country },
      { label: 'City',              value: (r) => r.city },
      { label: 'Source',            value: (r) => r.source },
      { label: 'Preferred Service', value: (r) => r.preferredSvc },
      { label: 'Status',            value: (r) => r.status },
      { label: 'Message',           value: (r) => r.message },
      { label: 'Followed Up',       value: (r) => fmtCsvDate(r.followedUpAt) },
    ]);
    sendCsv(res, `visitors-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

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
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function estimateReadTime(content) {
  const words = String(content).trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200)); // 200 wpm
}

router.get('/blog', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category } = req.query;
    const where = {
      ...(search && {
        OR: [
          { title:   { contains: search, mode: 'insensitive' } },
          { excerpt: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(category && { category }),
    };
    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { author: { select: { name: true } } },
      }),
      prisma.blogPost.count({ where }),
    ]);
    res.json({ posts, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/blog', async (req, res) => {
  try {
    const { title, content, isPublished } = req.body;
    let slug = slugify(title);

    // Ensure slug uniqueness by appending suffix if needed
    const existing = await prisma.blogPost.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const post = await prisma.blogPost.create({
      data: {
        ...req.body,
        slug,
        authorId:    req.user.id,
        readTime:    estimateReadTime(content),
        publishedAt: isPublished ? new Date() : null,
      },
    });
    res.status(201).json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/blog/:id', async (req, res) => {
  try {
    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Post not found' });

    const data = { ...req.body };
    if (data.content) data.readTime = estimateReadTime(data.content);
    // Set publishedAt when transitioning to published
    if (data.isPublished && !existing.isPublished) data.publishedAt = new Date();
    if (data.isPublished === false) data.publishedAt = null;

    const post = await prisma.blogPost.update({ where: { id: req.params.id }, data });
    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/blog/:id', async (req, res) => {
  try {
    await prisma.blogPost.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Gallery ───────────────────────────────────────────────────────────
const { upload, uploadToCloudinary } = require('../middleware/upload');

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

router.get('/gallery/albums/:id', async (req, res) => {
  try {
    const album = await prisma.galleryAlbum.findUnique({
      where:   { id: req.params.id },
      include: { photos: { orderBy: { order: 'asc' } } },
    });
    if (!album) return res.status(404).json({ message: 'Album not found' });
    res.json(album);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/gallery/albums', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.eventDate) data.eventDate = new Date(data.eventDate);
    const album = await prisma.galleryAlbum.create({ data });
    res.status(201).json(album);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/gallery/albums/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.eventDate) data.eventDate = new Date(data.eventDate);
    const album = await prisma.galleryAlbum.update({
      where: { id: req.params.id },
      data,
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

// Upload photos to an album (multipart)
router.post('/gallery/albums/:id/photos', upload.array('photos', 30), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ message: 'No files uploaded' });
    const album = await prisma.galleryAlbum.findUnique({ where: { id: req.params.id } });
    if (!album) return res.status(404).json({ message: 'Album not found' });

    const existingCount = await prisma.galleryPhoto.count({ where: { albumId: req.params.id } });
    const results = await Promise.all(
      req.files.map((f, i) =>
        uploadToCloudinary(f.buffer, 'hpcglobal/gallery').then((r) =>
          prisma.galleryPhoto.create({
            data: {
              albumId: req.params.id,
              url:     r.secure_url,
              order:   existingCount + i,
            },
          })
        )
      )
    );

    // If album has no cover yet, set the first uploaded photo as cover
    if (!album.coverImage && results[0]) {
      await prisma.galleryAlbum.update({
        where: { id: req.params.id },
        data:  { coverImage: results[0].url },
      });
    }

    res.status(201).json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message ?? 'Server error' });
  }
});

router.get('/gallery/albums/:id/photos', async (req, res) => {
  try {
    const photos = await prisma.galleryPhoto.findMany({
      where:   { albumId: req.params.id },
      orderBy: { order: 'asc' },
    });
    res.json(photos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/gallery/photos/:id', async (req, res) => {
  try {
    const photo = await prisma.galleryPhoto.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(photo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/gallery/photos/:id', async (req, res) => {
  try {
    await prisma.galleryPhoto.delete({ where: { id: req.params.id } });
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

router.post('/ministries', async (req, res) => {
  try {
    let slug = slugify(req.body.name);
    const existing = await prisma.ministry.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;
    const count = await prisma.ministry.count();
    const ministry = await prisma.ministry.create({
      data: { ...req.body, slug, order: req.body.order ?? count + 1 },
    });
    res.status(201).json(ministry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/ministries/reorder', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ message: 'ids array required' });
    await prisma.$transaction(
      ids.map((id, i) =>
        prisma.ministry.update({ where: { id }, data: { order: i + 1 } })
      )
    );
    res.json({ message: 'Reordered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/ministries/:id', async (req, res) => {
  try {
    const ministry = await prisma.ministry.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(ministry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/ministries/:id', async (req, res) => {
  try {
    await prisma.ministry.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
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

router.post('/leadership', async (req, res) => {
  try {
    const count = await prisma.leadershipProfile.count();
    const profile = await prisma.leadershipProfile.create({
      data: { ...req.body, order: req.body.order ?? count + 1 },
    });
    res.status(201).json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/leadership/reorder', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ message: 'ids array required' });
    await prisma.$transaction(
      ids.map((id, i) =>
        prisma.leadershipProfile.update({ where: { id }, data: { order: i + 1 } })
      )
    );
    res.json({ message: 'Reordered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/leadership/:id', async (req, res) => {
  try {
    const profile = await prisma.leadershipProfile.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/leadership/:id', async (req, res) => {
  try {
    await prisma.leadershipProfile.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: Hero Slides ───────────────────────────────────────────────────────
router.get('/hero', async (_req, res) => {
  try {
    const slides = await prisma.heroSlide.findMany({ orderBy: { order: 'asc' } });
    res.json(slides);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/hero', async (req, res) => {
  try {
    const slide = await prisma.heroSlide.create({ data: req.body });
    res.status(201).json(slide);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/hero/:id', async (req, res) => {
  try {
    const { id: _ignore, updatedAt: _u, ...data } = req.body;
    const slide = await prisma.heroSlide.update({
      where: { id: req.params.id },
      data,
    });
    res.json(slide);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/hero/:id', async (req, res) => {
  try {
    await prisma.heroSlide.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
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

router.post('/service-times', async (req, res) => {
  try {
    // Place new service at the end
    const count = await prisma.serviceTime.count();
    const time  = await prisma.serviceTime.create({
      data: { ...req.body, order: req.body.order ?? count + 1 },
    });
    res.status(201).json(time);
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

router.delete('/service-times/:id', async (req, res) => {
  try {
    await prisma.serviceTime.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/service-times/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    const result = await uploadToCloudinary(req.file.buffer, 'hpcglobal/services');
    const time = await prisma.serviceTime.update({
      where: { id: req.params.id },
      data:  { imageUrl: result.secure_url },
    });
    res.json(time);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/upload — generic image upload, returns Cloudinary URL
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    const folder = typeof req.query.folder === 'string' && /^[\w-]+$/.test(req.query.folder)
      ? `hpcglobal/${req.query.folder}`
      : 'hpcglobal/uploads';
    const result = await uploadToCloudinary(req.file.buffer, folder);
    res.json({ url: result.secure_url });
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
