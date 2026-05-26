/* ─────────────────────────────────────────────────────────────────
   School Report System — Service Worker
   Strategy:
   • App shell (JS/CSS/HTML) → Cache-First  (fast loads)
   • Supabase API calls      → Network-First (fresh data)
   • Images/fonts            → Cache-First with 30-day expiry
   ───────────────────────────────────────────────────────────────── */

const CACHE_NAME = 'school-app-v1';
const API_CACHE  = 'school-api-v1';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/static/js/vendors~main.chunk.js',
  '/manifest.json',
];

// ── Install: pre-cache app shell ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Silently fail on missing files — CRA filenames are hashed
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing logic ───────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET and browser-extension requests
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // 2. Supabase API → Network-First (always try fresh, fall back to cache)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirst(request, API_CACHE, 5000));
    return;
  }

  // 3. CDN scripts (jsPDF etc.) → Cache-First
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // 4. Same-origin app shell → Cache-First with network update
  if (url.origin === self.location.origin) {
    // HTML pages: Network-First so updates reach user
    if (request.headers.get('accept')?.includes('text/html')) {
      event.respondWith(networkFirst(request, CACHE_NAME, 3000));
    } else {
      // JS/CSS/images: Cache-First (hashed filenames = safe)
      event.respondWith(cacheFirst(request, CACHE_NAME));
    }
    return;
  }
});

// ── Strategy: Cache-First ─────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// ── Strategy: Network-First with timeout fallback ─────────────
async function networkFirst(request, cacheName, timeoutMs = 4000) {
  const cache = await caches.open(cacheName);

  const networkPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  );

  try {
    return await Promise.race([networkPromise, timeoutPromise]);
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ── Background sync placeholder (extend later) ────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
