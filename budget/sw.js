// sw.js — Service Worker של LexBudget (scope נפרד: /budget/).
// app-shell = network-first (פרסומים נכנסים לתוקף מיד), פונטים/אייקונים = cache-first.
// offline עובד מלא: כל הנתונים ב-IndexedDB, ה-shell במטמון.

const CACHE = 'lexbudget-v6';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/fonts.css',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/model.js',
  './js/ui.js',
  './js/charts.js',
  './js/importer.js',
  './js/xlsx.js',
  './fonts/assistant-hebrew.woff2',
  './fonts/assistant-latin.woff2',
  './fonts/inter-latin.woff2',
  './fonts/ibmplexmono.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('lexbudget-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // app-shell: network-first
  const isShell = request.mode === 'navigate' || /\.(?:js|css|json)$/i.test(url.pathname);
  if (isShell) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            const key = request.mode === 'navigate' ? './index.html' : request;
            caches.open(CACHE).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // נכסים יציבים: cache-first עם רענון ברקע
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
