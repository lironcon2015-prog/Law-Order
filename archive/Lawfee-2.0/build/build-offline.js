#!/usr/bin/env node
/**
 * build-offline.js — מייצר קובץ HTML יחיד, עצמאי לחלוטין, לעבודה אופליין.
 *
 * הקובץ שנוצר (LexLedger-Offline.html בשורש הפרויקט) כולל בתוכו את כל ה-CSS,
 * ה-JS, הגופנים (base64) ו-worker של PDF.js — ניתן להוריד אותו לדסקטופ,
 * לפתוח ב-Chrome (file://) והמערכת עובדת ללא אינטרנט.
 *
 * הרצה:  node build/build-offline.js   (או: npm run build:offline)
 *
 * הקובץ נבנה מ-index.html הקיים, כך שכל שינוי במערכת מתבטא אוטומטית
 * בהרצה הבאה. יש להריץ כחלק מכל bump גרסה (ראה CLAUDE.md).
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const r    = (...p) => path.join(ROOT, ...p);
const read = (p) => fs.readFileSync(r(p), 'utf8');
const readB64 = (p) => fs.readFileSync(r(p)).toString('base64');

// JS שמוטמע inline בתוך <script> — נטרול רצף </script שעלול לסגור את התג בטעות
const safeJs = (s) => s.replace(/<\/script/gi, '<\\/script');

// ── 1. fonts.css עם גופנים מוטמעים כ-base64 ─────────────────
function inlineFonts() {
  let css = read('vendor/lib/fonts.css');
  css = css.replace(/url\(\.\.\/fonts\/([^)]+)\)/g, (_, file) => {
    const b64 = readB64(path.join('vendor', 'fonts', file.trim()));
    return `url(data:font/woff2;base64,${b64})`;
  });
  return css;
}

// ── 2. בניית הקובץ ──────────────────────────────────────────
function build() {
  let html = read('index.html');

  const fontsCss   = inlineFonts();
  const tailwind   = read('vendor/lib/tailwind.css');
  const styleCss   = read('style.css');

  // החלפת תגי <link> ב-<style> מוטמעים.
  // חשוב: מעבירים פונקציה (לא מחרוזת) ל-replace כדי שרצפי $ בתוכן
  // (למשל $&, $', $`) לא יפורשו כתבניות החלפה ויהרסו את הקוד.
  const sub = (s) => () => s;   // replacement function — מחזיר את התוכן כמות שהוא

  html = html.replace(
    /<link rel="stylesheet" href="vendor\/lib\/fonts\.css"\/>/,
    sub(`<style>\n${fontsCss}\n</style>`)
  );
  html = html.replace(
    /<link rel="stylesheet" href="vendor\/lib\/tailwind\.css"\/>/,
    sub(`<style>\n${tailwind}\n</style>`)
  );
  html = html.replace(
    /<link rel="stylesheet" href="style\.css" \/>/,
    sub(`<style>\n${styleCss}\n</style>`)
  );

  // הסרת Google Identity Services (remote) — לא נדרש באופליין; drive מוסתר ב-file://
  html = html.replace(
    /<script src="https:\/\/accounts\.google\.com\/gsi\/client"[^>]*><\/script>\n?/,
    sub('')
  );

  // ספריות vendor — הטמעה inline
  const xlsx   = safeJs(read('vendor/lib/xlsx.full.min.js'));
  const pdfLib = safeJs(read('vendor/lib/pdf.min.js'));
  html = html.replace(
    /<script src="vendor\/lib\/xlsx\.full\.min\.js"><\/script>/,
    sub(`<script>\n${xlsx}\n</script>`)
  );
  html = html.replace(
    /<script src="vendor\/lib\/pdf\.min\.js"><\/script>/,
    sub(`<script>\n${pdfLib}\n</script>`)
  );

  // PDF.js worker — הטמעה כ-base64 וטעינה דרך Blob URL (אין קובץ נפרד באופליין)
  const workerB64 = readB64('vendor/lib/pdf.worker.min.js');
  html = html.replace(
    /pdfjsLib\.GlobalWorkerOptions\.workerSrc = 'vendor\/lib\/pdf\.worker\.min\.js';/,
    sub(`try {
        const __b = atob("${workerB64}");
        const __u = new Uint8Array(__b.length);
        for (let i = 0; i < __b.length; i++) __u[i] = __b.charCodeAt(i);
        const __blob = new Blob([__u], { type: 'application/javascript' });
        pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(__blob);
      } catch (e) { console.warn('PDF worker init failed', e); }`)
  );

  // מודולי האפליקציה — הטמעה inline לפי סדר הטעינה
  const appModules = [
    'db.js', 'ui.js', 'import.js', 'dashboard.js', 'clients.js',
    'invoices.js', 'payments.js', 'settings.js', 'drive.js', 'app.js',
  ];
  for (const m of appModules) {
    const re = new RegExp(`<script src="${m.replace('.', '\\.')}"><\\/script>`);
    html = html.replace(re, sub(`<script>\n${safeJs(read(m))}\n</script>`));
  }

  // נטרול רישום Service Worker — אינו נתמך ב-file:// ואין בו צורך באופליין
  html = html.replace(
    /if \('serviceWorker' in navigator\) \{/,
    sub(`if (location.protocol !== 'file:' && 'serviceWorker' in navigator) {`)
  );

  const out = r('LexLedger-Offline.html');
  fs.writeFileSync(out, html, 'utf8');

  const mb = (fs.statSync(out).size / 1048576).toFixed(2);
  const ver = JSON.parse(read('version.json')).version;
  console.log(`✓ LexLedger-Offline.html נוצר (v${ver}, ${mb}MB)`);
}

build();
