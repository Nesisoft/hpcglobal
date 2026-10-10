const router = require('express').Router();
const rateLimit = require('express-rate-limit');

const prisma = require('../lib/prisma');
const { escapeHtml } = require('../lib/html');
const { eventWhen, eventWhere } = require('../services/eventNotify');

/**
 * Shareable event links with rich previews.
 *
 * WhatsApp, Facebook, Telegram, iMessage and X build their preview card by
 * fetching the URL and reading Open Graph tags out of the raw HTML. None of
 * them run JavaScript, so react-helmet-async — which sets those tags after
 * React mounts — is invisible to every one of them. The site is a static SPA
 * behind a catch-all rewrite, so today every event link previews as the same
 * generic shell. This route is the fix: real HTML, rendered per event, served
 * before any JavaScript exists.
 *
 * Humans are moved on to the real page by a script tag. That redirect is
 * deliberately NOT a meta refresh: Meta's crawler follows meta refresh and
 * would end up reading the SPA shell instead of these tags, which is exactly
 * the bug this route exists to avoid. It does not run the script.
 */

// This sits outside /api, so the limiter mounted there does not cover it. A
// public endpoint that reads the database needs its own.
const shareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const SITE_NAME = 'HPC Global — Hopepress Chapel';

function siteOrigin(req) {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

/**
 * Previews want a large landscape image. Cloudinary can produce one from the
 * original by URL, so a portrait flyer still fills the card instead of being
 * cropped to a thumbnail. Any non-Cloudinary URL is passed through untouched.
 */
function previewImage(imageUrl) {
  if (!imageUrl) return null;
  const marker = '/image/upload/';
  const at = imageUrl.indexOf(marker);
  if (at === -1 || !imageUrl.includes('res.cloudinary.com')) return imageUrl;
  const head = imageUrl.slice(0, at + marker.length);
  const tail = imageUrl.slice(at + marker.length);
  // 1200x630 is the size that renders as a large card rather than a thumbnail.
  return `${head}c_fill,g_auto,w_1200,h_630,f_jpg,q_auto:good/${tail}`;
}

/** Strip the description's markup and entities down to one line of preview text. */
function previewText(html, fallback) {
  const text = String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&rsquo;/gi, '’')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return fallback;
  return text.length > 200 ? `${text.slice(0, 197).trimEnd()}…` : text;
}

function sharePage({ origin, slug, event }) {
  const url      = `${origin}/e/${encodeURIComponent(slug)}`;
  const target   = `/events/${encodeURIComponent(slug)}`;
  const image    = previewImage(event.imageUrl);
  const when     = eventWhen(event);
  const where    = eventWhere(event);
  // The title and the time are what the church wants people to see at a glance.
  const summary  = [when, where].filter(Boolean).join(' · ')
    || previewText(event.description, event.title);

  // Every value is escaped: an unescaped quote in an admin-typed title would
  // terminate the content attribute and silently kill the tag.
  const t = escapeHtml;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t(event.title)} — HPC Global</title>
<meta name="description" content="${t(summary)}">
<link rel="canonical" href="${t(`${origin}${target}`)}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="${t(SITE_NAME)}">
<meta property="og:url" content="${t(url)}">
<meta property="og:title" content="${t(event.title)}">
<meta property="og:description" content="${t(summary)}">${image ? `
<meta property="og:image" content="${t(image)}">
<meta property="og:image:secure_url" content="${t(image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${t(event.title)}">` : ''}

<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${t(event.title)}">
<meta name="twitter:description" content="${t(summary)}">${image ? `
<meta name="twitter:image" content="${t(image)}">` : ''}
</head>
<body style="font-family:system-ui,sans-serif;margin:0;padding:48px;text-align:center;background:#210A4A;color:#fff">
<h1 style="font-weight:300">${t(event.title)}</h1>
<p>${t(summary)}</p>
<p><a href="${t(target)}" style="color:#C9A84C">Open this event</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;
}

// GET /e/:slug — the URL that gets shared
router.get('/:slug', shareLimiter, async (req, res) => {
  try {
    const event = await prisma.event.findFirst({
      where: { slug: req.params.slug, isPublished: true },
      select: {
        title: true, slug: true, description: true, imageUrl: true,
        startDate: true, timeGmt: true, venue: true, isOnline: true, joinLink: true,
      },
    });

    // An unpublished or unknown event must not leak through a public URL.
    if (!event) {
      return res.status(404).type('html').send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Event not found</title></head>
         <body><p>That event is not available.</p><script>location.replace("/events");</script></body></html>`
      );
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    // Crawlers re-fetch; a short cache keeps a changed flyer from being stale
    // for long while still absorbing a burst when a link is shared widely.
    res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.send(sharePage({ origin: siteOrigin(req), slug: event.slug, event }));
  } catch (err) {
    console.error('Share page error:', err);
    res.status(500).type('html').send(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>HPC Global</title></head><body><script>location.replace("/events");</script></body></html>'
    );
  }
});

module.exports = router;
module.exports.previewImage = previewImage;
module.exports.previewText = previewText;
