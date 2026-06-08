/**
 * EventFlow Africa — Service Worker
 * Cache intelligent : shell statique, pages runtime, CDN stale-while-revalidate
 * Push FCM arrière-plan + Background Sync
 */

const CACHE_VERSION = 'eventflow-v7';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;
const MAX_RUNTIME_ENTRIES = 40;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/events.html',
  '/event-details.html',
  '/tickets-wallet.html',
  '/contact.html',
  '/help.html',
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/create-event.html',
  '/admin.html',
  '/scan.html',
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
  '/js/admin-platform.js',
  '/js/organizer.js',
  '/js/favorites.js',
  '/js/notifications.js',
  '/js/support.js',
  '/js/scan.js',
  '/js/pwa.js',
  '/js/pwa-store.js',
  '/js/vendor/qrcodejs.min.js',
  '/js/vendor/jspdf.umd.min.js',
  '/img/logo.png',
  '/icons/icon-72.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

const STATIC_PREFIXES = ['/css/', '/js/', '/img/', '/icons/'];
const CDN_HOSTS = ['gstatic.com', 'googleapis.com', 'jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com'];

/* ——— FCM push arrière-plan (même SW que le cache) ——— */
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: 'AIzaSyBmn7YsizRGD7rXQ2ZJHgBmxiXQi6rC3K4',
    authDomain: 'eventflow-africa.firebaseapp.com',
    projectId: 'eventflow-africa',
    storageBucket: 'eventflow-africa.firebasestorage.app',
    messagingSenderId: '249089579362',
    appId: '1:249089579362:web:81b2ed59d0b8926ddab43b'
  });
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'EventFlow Africa';
    const options = {
      body: payload.notification?.body || payload.data?.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      data: { url: payload.data?.url || payload.fcmOptions?.link || '/tickets-wallet.html' },
      tag: payload.data?.tag || 'eventflow',
      renotify: true
    };
    return self.registration.showNotification(title, options);
  });
} catch (e) {
  console.warn('FCM SW init:', e);
}

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
          .filter((key) => key.startsWith('eventflow-') && ![STATIC_CACHE, RUNTIME_CACHE, CDN_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));
}

function isCDN(url) {
  return CDN_HOSTS.some((h) => url.hostname.includes(h));
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.origin !== self.location.origin) {
    if (isCDN(url)) {
      event.respondWith(staleWhileRevalidate(request, CDN_CACHE));
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

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

/* Background Sync — déclenche sync scans/billets côté client */
self.addEventListener('sync', (event) => {
  if (event.tag === 'eventflow-offline-sync') {
    event.waitUntil(notifyClientsSync());
  }
});

async function notifyClientsSync() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'BACKGROUND_SYNC' });
  }
  if (!clients.length) {
    await self.registration.showNotification('EventFlow Africa', {
      body: 'Synchronisation terminée — ouvrez l\'app pour mettre à jour.',
      icon: '/icons/icon-192.png',
      data: { url: '/dashboard.html' }
    });
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CACHE_TICKETS_PAGE') {
    caches.open(STATIC_CACHE).then((c) => c.add('/tickets-wallet.html'));
  }
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'EventFlow Africa';
  const options = {
    body: data.body || 'Nouvelle notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    data: { url: data.url || '/events.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
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
      trimCache(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.url.includes('tickets-wallet')) {
      const wallet = await caches.match('/tickets-wallet.html');
      if (wallet) return wallet;
    }
    return caches.match('/offline.html');
  }
}

async function staleWhileRevalidate(request, cacheName = RUNTIME_CACHE) {
  const cache = await caches.open(cacheName);
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
