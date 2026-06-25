# CLAUDE.md — זיכרון הפרויקט

## מה זה
CRM אישי לעו"ד M&A (פיתוח עסקי). אפליקציית **vanilla JS · PWA · offline-first · RTL/עברית**,
ללא build step. נתונים נשמרים מקומית ב-IndexedDB.

## ארכיטקטורה
- `index.html` — שלד ה-DOM (header, board/Pipeline, workspace/list, drawer, modal).
- `css/styles.css` — כל העיצוב ("Obsidian Gold" + שפת Pipeline בהשראת Stitch).
- `js/app.js` — bootstrap, state יחיד, event delegation, ניתוב תצוגות (Pipeline/List), drag&drop.
- `js/ui.js` — רינדור DOM (כרטיסים, Pipeline, תצוגת פרטים עם טאבים, טפסים). כל קלט משתמש כ-textContent (מניעת XSS).
- `js/store.js` — שכבת דומיין (שלבי משפך `LEAD_STATUSES`, נרמול, helpers: `dealValue`, `urgency`, `groupByStatus`, `isOverdue`).
- `js/db.js` — עטיפת IndexedDB. `js/search.js` — סינון/מיון. `js/seed.js` — `window.seedDemo()` לנתוני דמו.
- `sw.js` + `manifest.json` — Service Worker (offline) ו-PWA.

## פריסה (Deployment)
- GitHub Pages מגיש מענף **main** → `lironcon2015-prog.github.io/Law-Order/`.
- **Cloudflare Worker** (`cloudflare/crm-proxy.worker.js`) עושה proxy ל-**`lironcon.com/crm`** (ראו `cloudflare/README.md`).
- כך אפשר להוסיף `lironcon.com` ל-whitelist של רשת המשרד.

## ⚠️ Git workflow (הוראת קבע מהמשתמש)
- **תמיד לדחוף ישירות ל-`main` ולמזג — בלי לשאול אישור בכל פעם.** למשתמש יש אישור קבוע לכך.
- זרימה: לבצע commit, לדחוף לענף העבודה `claude/ma-lawyer-crm-pwa-jqqhhv`, ולעדכן (fast-forward) ולדחוף את `main` כדי לפרסם לאתר החי.
- אין צורך לפתוח Pull Request אלא אם מתבקש במפורש.

## אימות (Verification)
- שרת מקומי: `python3 -m http.server 8765` בתיקיית הפרויקט.
- Chromium מותקן מראש ב-`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (השתמש ב-`playwright-core`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).
- בקונסול הדפדפן: `window.seedDemo()` לטעינת נתוני דמו, ואז לצלם/לבדוק (אין שגיאות קונסול).
