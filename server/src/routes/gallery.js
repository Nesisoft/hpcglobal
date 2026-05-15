const router = require('express').Router();
const { PrismaClient }    = require('@prisma/client');
const { verifyToken }     = require('../middleware/auth');
const { upload, uploadToCloudinary } = require('../middleware/upload');

const prisma = new PrismaClient();

// GET /api/gallery — public albums
router.get('/', async (_req, res) => {
  try {
    const albums = await prisma.galleryAlbum.findMany({
      where:   { isPublished: true },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { photos: true } } },
    });
    res.json(albums);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/gallery/:id — public album + photos
router.get('/:id', async (req, res) => {
  try {
    const album = await prisma.galleryAlbum.findFirst({
      where:   { id: req.params.id, isPublished: true },
      include: { photos: { orderBy: { order: 'asc' } } },
    });
    if (!album) return res.status(404).json({ message: 'Not found' });
    res.json(album);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/gallery/albums/:id/photos — upload photos (admin)
router.post('/albums/:id/photos', verifyToken, upload.array('photos', 30), async (req, res) => {
  try {
    const results = await Promise.all(
      req.files.map((f, i) => uploadToCloudinary(f.buffer, 'hpcglobal/gallery')
        .then((r) => prisma.galleryPhoto.create({
          data: { albumId: req.params.id, url: r.secure_url, order: i },
        }))
      )
    );
    res.status(201).json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/gallery/photos/:id — admin
router.delete('/photos/:id', verifyToken, async (req, res) => {
  try {
    await prisma.galleryPhoto.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
