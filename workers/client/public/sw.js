/**
 * HPC Workers service worker: just enough to install the app and open it
 * without a network.
 *
 * It caches the app itself — the page, its scripts and styles, the icons —
 * and nothing from /api. The old app cached API answers holding people's
 * details and kept them after sign-out, and faked a successful clock-in while
 * offline that never reached the server; neither happens here. Clocking in
 * needs the server's clock and the venue check, so offline the app says so.
 */
const CACHE = 'hpc-workers-v2';
const SHELL = ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon-32.png'];

/** Our own successful answer — never an error page, a redirect or someone else's. */
const usable = (response) => Boolean(response && response.ok && response.type === 'basic' && !response.redirected);

/** The app's page itself, rather than an image or file someone opened directly. */
const isPage = (response) => usable(response) && (response.headers.get('Content-Type') || '').includes('text/html');

/**
 * A real built file, not the page standing in for one: vercel.json sends any
 * unknown address to index.html, so a file from a release that has just been
 * replaced comes back as the page, with a 200. Cached under the file's name,
 * that would break the app until the next release.
 */
const isFile = (response) => usable(response) && !(response.headers.get('Content-Type') || '').includes('text/html');

/** Let caching finish after the answer has gone back, without ever failing that answer. */
function inBackground(event, promise) {
  const quiet = promise.catch(() => { /* keep the last good copy */ });
  try { event.waitUntil(quiet); } catch { /* it still runs */ }
}

/** The built files (/assets/…) a page names in its src and href attributes. */
function assetsIn(html) {
  const paths = new Set();
  for (const [, value] of html.matchAll(/\s(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const url = new URL(value, self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) paths.add(url.pathname);
  }
  return [...paths];
}

/** Drop the built files the cached page no longer names: each release brings new ones. */
async function prune(cache, keep) {
  const wanted = new Set(keep);
  const stored = await cache.keys();
  await Promise.all(stored
    .filter((request) => {
      const { pathname } = new URL(request.url);
      return pathname.startsWith('/assets/') && !wanted.has(pathname);
    })
    .map((request) => cache.delete(request)));
}

/**
 * Keep this copy of the page, with every built file it needs. The files go
 * in first and the page last, so the cached page never names a file that
 * isn't cached — if one can't be fetched, the previous page and its files
 * stay as they were.
 */
async function savePage(cache, response) {
  const assets = assetsIn(await response.clone().text());
  await Promise.all(assets.map(async (path) => {
    if (await cache.match(path, { ignoreVary: true })) return;   // named in the hash, so never stale
    const file = await fetch(path);
    if (!isFile(file)) throw new Error(`Couldn’t fetch ${path}`);
    await cache.put(path, file);
  }));
  await cache.put('/', response);
  await prune(cache, assets);
}

// Everything needed to open the app offline is cached before this worker
// takes over — including the built scripts and styles, which the first visit
// fetched before this worker existed to see them.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const page = await fetch('/', { cache: 'reload' });
    if (!isPage(page)) throw new Error('Couldn’t fetch the app’s page');
    await savePage(cache, page);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    const cache = await caches.open(CACHE);
    const page = await cache.match('/', { ignoreVary: true });
    if (page) await prune(cache, assetsIn(await page.text()));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: the network first, so a new version shows at once; the cached
  // page when offline. Every address in the app is the same page.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (isPage(response)) {
          const copy = response.clone();
          inBackground(event, caches.open(CACHE).then((cache) => savePage(cache, copy)));
        }
        return response;
      } catch {
        return (await caches.match('/', { ignoreVary: true })) || Response.error();
      }
    })());
    return;
  }

  // Built files have their content's hash in the name, so a cached one is
  // never out of date.
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then((hit) => hit || fetch(request).then((response) => {
        if (isFile(response)) {
          const copy = response.clone();
          inBackground(event, caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })),
    );
  }
});
