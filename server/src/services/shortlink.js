const axios = require('axios');
require('dotenv').config();

/**
 * Short links for sharing an event.
 *
 * Worth being clear about what shortening does and does not do: the rich
 * preview WhatsApp shows comes from the Open Graph tags on the destination
 * (routes/share.js), not from the shortener. A short link is for legibility in
 * a chat message and for print — it cannot create a preview on its own, and a
 * shortened link previews exactly as well as the page it points at.
 *
 * TinyURL is used when a token is configured. Without one the /e/<slug> URL is
 * returned as-is: it is already short, it is on the church's own domain, and
 * it does not spend a monthly quota or depend on a third party being up.
 */

const TINYURL_ENDPOINT = 'https://api.tinyurl.com/create';

function shortlinkProviderName() {
  return process.env.TINYURL_API_TOKEN ? 'tinyurl' : 'none';
}

/** The canonical shareable URL for an event — the one carrying the preview tags. */
function shareUrl(slug, origin) {
  const base = (origin || process.env.APP_URL || 'https://www.hpcglobal.org').replace(/\/+$/, '');
  return `${base}/e/${encodeURIComponent(slug)}`;
}

/**
 * Shorten a URL, returning the original if shortening is unavailable.
 *
 * Never throws: a shortener being down, out of quota or misconfigured must not
 * stop the church from sharing an event. The caller gets a usable link either
 * way and is told which it is.
 *
 * @returns {Promise<{url: string, shortened: boolean, provider: string, reason?: string}>}
 */
async function shorten(longUrl, { alias } = {}) {
  const provider = shortlinkProviderName();
  if (provider === 'none') {
    return { url: longUrl, shortened: false, provider, reason: 'no shortener configured' };
  }

  try {
    const body = { url: longUrl };
    // Aliases live in one namespace shared with every TinyURL user, so a
    // natural name is very likely taken. It is offered, never insisted on.
    if (alias) body.alias = alias;
    if (process.env.TINYURL_DOMAIN) body.domain = process.env.TINYURL_DOMAIN;

    const { data } = await axios.post(TINYURL_ENDPOINT, body, {
      headers: {
        Authorization: `Bearer ${process.env.TINYURL_API_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 10000,
    });

    const tiny = data?.data?.tiny_url;
    if (!tiny) return { url: longUrl, shortened: false, provider, reason: 'no link in response' };
    return { url: tiny, shortened: true, provider };
  } catch (err) {
    // A taken alias comes back as 400, 409 or 422 depending on the day; all of
    // them mean the same thing here, so retry once without the alias.
    const status = err?.response?.status;
    if (alias && [400, 409, 422].includes(status)) {
      return shorten(longUrl, {});
    }
    const detail = err?.response?.data?.errors?.[0] || err?.message || 'unknown error';
    console.error('Shortener failed:', detail);
    return { url: longUrl, shortened: false, provider, reason: String(detail) };
  }
}

module.exports = { shorten, shareUrl, shortlinkProviderName };
