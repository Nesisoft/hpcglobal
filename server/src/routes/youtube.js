const router  = require('express').Router();
const youtube = require('../services/youtube');

// GET /api/youtube/latest — cached
router.get('/latest', async (req, res) => {
  try {
    const count  = Math.min(Number(req.query.count) || 6, 12);
    const videos = await youtube.getLatestVideos(count);
    res.json(videos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch YouTube data' });
  }
});

module.exports = router;
