const router = require('express').Router();
const { z }   = require('zod');
const { PrismaClient } = require('@prisma/client');
const { validate }    = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');

const prisma = new PrismaClient();

const postSchema = z.object({
  title:         z.string().min(1),
  excerpt:       z.string().min(1),
  content:       z.string().min(1),
  category:      z.enum(['DEVOTIONAL','PROPHETIC_WORD','SERMON_NOTES','TEACHING','TESTIMONY','EVENT_RECAP','ANNOUNCEMENT']),
  authorId:      z.string(),
  featuredImage: z.string().optional(),
  isPublished:   z.boolean().default(false),
  publishedAt:   z.string().optional(),
});

// GET /api/blog — public
router.get('/', async (req, res) => {
  try {
    const { category, page = 1, limit = 12 } = req.query;
    const where = {
      isPublished: true,
      ...(category && { category }),
    };
    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
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

// GET /api/blog/:slug — public
router.get('/:slug', async (req, res) => {
  try {
    const post = await prisma.blogPost.findFirst({
      where: { slug: req.params.slug, isPublished: true },
      include: { author: { select: { name: true, email: true } } },
    });
    if (!post) return res.status(404).json({ message: 'Not found' });
    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/blog — admin
router.post('/', verifyToken, validate(postSchema), async (req, res) => {
  try {
    const slug = req.body.title
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const post = await prisma.blogPost.create({
      data: {
        ...req.body,
        slug,
        publishedAt: req.body.isPublished ? new Date() : null,
      },
    });
    res.status(201).json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/blog/:id — admin
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const post = await prisma.blogPost.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/blog/:id — admin
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await prisma.blogPost.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
