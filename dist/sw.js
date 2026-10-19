// Offline support. tools/build.js fills in VERSION (a hash of the built files) and ASSETS,
// so every rebuild that changes the game installs a fresh cache and drops the old one.
const VERSION = "07f6e883bd2c";
const ASSETS = ["./","index.html","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/apple-touch-icon.png"];
const CACHE = 'tw1848-' + VERSION;
const FONT_CACHE = 'tw1848-fonts';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=VT323&display=swap';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// The page asks for the font before this worker exists, so fetch the stylesheet and the
// font files it points to here, so the first offline launch still looks right.
async function cacheFont() {
  const cache = await caches.open(FONT_CACHE);
  if (await cache.match(FONT_CSS)) return;
  const res = await fetch(FONT_CSS);
  if (!res.ok) return;
  const css = await res.clone().text();
  const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
  await Promise.all(files.map(async (url) => {
    const file = await fetch(url, { mode: 'cors' });
    if (file.ok) await cache.put(url, file);
  }));
  await cache.put(FONT_CSS, res);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await (await caches.open(CACHE)).addAll(ASSETS);
    try { await cacheFont(); } catch (e) { /* offline or blocked: the game falls back to a system monospace font */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('tw1848-') && k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) await cache.put(req.url, res.clone());
      return res;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Cache first: the game is a single file, so a cached copy is always complete.
  // A new build reaches players on the launch after the browser picks up the new worker.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      if (req.mode === 'navigate') return (await cache.match('./')) || Response.error();
      throw e;
    }
  })());
});
