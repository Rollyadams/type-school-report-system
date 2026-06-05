const CACHE_VERSION  = 'v4';
const SHELL_CACHE    = `src-shell-${CACHE_VERSION}`;
const API_CACHE      = `src-api-${CACHE_VERSION}`;
const CDN_CACHE      = `src-cdn-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => ![SHELL_CACHE, API_CACHE, CDN_CACHE].includes(k))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;
  if (url.pathname.startsWith('/sockjs-node')) return;

  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirst(request, API_CACHE, 6000));
    return;
  }

  if (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    if (request.headers.get('accept')?.includes('text/html')) {
      event.respondWith(networkFirst(request, SHELL_CACHE, 4000));
    } else {
      event.respondWith(cacheFirst(request, SHELL_CACHE));
    }
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.status < 400) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    clearTimeout(timer);
    const cached = await cache.match(request);
    if (cached) return cached;
    const isApi = request.url.includes('supabase.co');
    return new Response(
      isApi ? JSON.stringify({ error: 'offline' }) : 'Offline',
      {
        status: 503,
        headers: isApi ? { 'Content-Type': 'application/json' } : {},
      }
    );
  }
}

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', event => {
  let data = { title: '📅 Attendance Reminder', body: 'Time to mark attendance!', icon: '/icons/icon-192.png' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  data.icon,
      badge: data.badge || '/icons/icon-72.png',
      tag:   data.tag   || 'attendance-reminder',
      renotify: true,
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
