/**
 * EventFlow Africa — Service Worker
 * Cache des ressources statiques + stratégie network-first pour les pages HTML
 */

const CACHE_VERSION = 'eventflow-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/events.html',
  '/event-details.html',
  '/contact.html',
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/create-event.html',
  '/admin.html',
  '/reset-password.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/css/main.css',
  '/css/auth.css',
  '/css/dashboard.css',
  '/css/admin.css',
  '/css/pwa.css',
  '/js/firebase-config.js',
  '/js/utils.js',
  '/js/auth.js',
  '/js/events.js',
  '/js/tickets.js',
  '/js/main.js',
  '/js/dashboard.js',
  '/js/admin.js',
  '/js/pwa.js',
  '/js/vendor/qrcodejs.min.js',
  '/js/vendor/jspdf.umd.min.js',
  '/img/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

const STATIC_DESTINATIONS = [
  '/css/',
  '/js/',
  '/img/',
  '/icons/'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('eventflow-') && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return STATIC_DESTINATIONS.some((prefix) => url.pathname.startsWith(prefix));
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Ne pas intercepter Firebase, Google APIs, CDN externes (sauf cache runtime optionnel)
  if (url.origin !== self.location.origin) {
    if (url.hostname.includes('gstatic.com') || url.hostname.includes('googleapis.com') ||
        url.hostname.includes('jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('unpkg.com')) {
      event.respondWith(staleWhileRevalidate(request));
    }
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isStaticAsset(url) || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('/offline.html');
  }
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('/offline.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    fetchPromise.catch(() => {});
    return cached;
  }

  const response = await fetchPromise;
  return response || new Response('Hors ligne', { status: 503, statusText: 'Service Unavailable' });
}
