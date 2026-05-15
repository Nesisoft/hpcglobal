const axios = require('axios');

let cache = { data: null, expiresAt: 0 };
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function getLatestVideos(maxResults = 6) {
  if (cache.data && Date.now() < cache.expiresAt) return cache.data;

  const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', {
    params: {
      part:       'snippet',
      channelId:  process.env.YOUTUBE_CHANNEL_ID,
      maxResults,
      order:      'date',
      type:       'video',
      key:        process.env.YOUTUBE_API_KEY,
    },
  });

  const videos = data.items.map((item) => ({
    id:          item.id.videoId,
    title:       item.snippet.title,
    description: item.snippet.description,
    thumbnail:   item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
    publishedAt: item.snippet.publishedAt,
    channelTitle: item.snippet.channelTitle,
    url:         `https://www.youtube.com/watch?v=${item.id.videoId}`,
  }));

  cache = { data: videos, expiresAt: Date.now() + CACHE_TTL };
  return videos;
}

module.exports = { getLatestVideos };
