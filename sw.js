// sw.js — Service Worker: precache של app-shell + נכסים, אסטרטגיית cache-first.
// offline-first מלא: לאחר הביקור הראשון האפליקציה והפונטים נטענים גם ללא רשת.

const CACHE = 'lexledger-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/fonts.css',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/search.js',
  './js/ui.js',
  './js/seed.js',
  './fonts/assistant-hebrew.woff2',
  './fonts/assistant-latin.woff2',
  './fonts/inter-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // נכסים חיצוניים — לדפדפן

  // ניווט (HTML): network-first עם נפילה ל-cache (כדי לקבל עדכונים כשיש רשת)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // נכסים סטטיים: cache-first עם רענון רקע
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
