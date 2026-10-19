/**
 * sw.js — LexLedger Service Worker
 * כל פעם שמספר הגרסה ב-version.json משתנה,
 * ה-SW מוחק את הcache הישן ומוריד מחדש את כל הקבצים.
 *
 * חשוב: כל deploy חייב לשנות את CACHE_VERSION כאן ואת version.json.
 */

const CACHE_PREFIX  = 'lexledger-v';
const CACHE_VERSION = '3.3.3';           // ← עדכן בכל deploy
const CACHE_NAME    = CACHE_PREFIX + CACHE_VERSION;

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './db.js',
  './ui.js',
  './app.js',
  './dashboard.js',
  './clients.js',
  './invoices.js',
  './payments.js',
  './import.js',
  './settings.js',
  './drive.js',
  './version.json',
  // vendored dependencies
  './vendor/lib/tailwind.css',
  './vendor/lib/fonts.css',
  './vendor/lib/xlsx.full.min.js',
  './vendor/lib/pdf.min.js',
  './vendor/lib/pdf.worker.min.js',
];

// ── Install ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  // CACHE_NAME הוא קבוע בזמן compile — אין fetch async שיכול להיכשל
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())  // ← דחוף את עצמך לפעולה מיד
  );
});

// ── Activate ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())  // ← קח שליטה על כל הטאבים הפתוחים מיד
  );
});

// ── Fetch ──────────────────────────────────────────────
// version.json תמיד מהרשת כדי לזהות עדכונים
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('version.json')) {
    event.respondWith(
      fetch(event.request.url + '?_=' + Date.now())
        .catch(() => caches.match('./version.json'))
    );
    return;
  }

  // קבצי גופנים (vendor/fonts/) — cache-first עם הוספה ל-cache ברענון ראשון
  if (event.request.url.includes('/vendor/fonts/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          if (resp.ok) {
            const respClone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone));
          }
          return resp;
        });
      })
    );
    return;
  }

  // שאר הקבצים — cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});

// ── Message from app ───────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
