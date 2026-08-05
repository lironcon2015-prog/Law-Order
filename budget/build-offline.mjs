// build-offline.mjs — בונה קובץ HTML יחיד עצמאי (offline, file://) מכל LexBudget.
// מטמיע: מודולי ES כ-base64 → blob URLs עם rewrite של import specifiers,
// CSS מוטבע, פונטים כ-data URIs. מסיר manifest/אייקונים (אין נתיבים יחסיים ב-file://).
// שימוש: node budget/build-offline.mjs  →  יוצר LexBudget-Offline.html בשורש.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BUDGET = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BUDGET, '..');
const rd = (p) => readFileSync(join(BUDGET, p), 'utf8');
const b64 = (p) => readFileSync(join(BUDGET, p)).toString('base64');

/* ---------- 1) מודולי JS בסדר תלויות ---------- */
const ORDER = ['model.js', 'db.js', 'xlsx.js', 'charts.js', 'importer.js', 'store.js', 'ui.js', 'app.js'];
const SRC = {};
for (const name of ORDER) SRC[name] = Buffer.from(rd('js/' + name), 'utf8').toString('base64');

/* ---------- 2) CSS + פונטים מוטבעים ---------- */
const FONTS = {
  'assistant-hebrew.woff2': b64('fonts/assistant-hebrew.woff2'),
  'assistant-latin.woff2': b64('fonts/assistant-latin.woff2'),
  'inter-latin.woff2': b64('fonts/inter-latin.woff2'),
  'ibmplexmono.woff2': b64('fonts/ibmplexmono.woff2'),
};
let fontsCss = rd('css/fonts.css');
for (const [file, data] of Object.entries(FONTS)) {
  fontsCss = fontsCss.replaceAll(`url('../fonts/${file}')`, `url('data:font/woff2;base64,${data}')`);
}
const css = fontsCss + '\n\n' + rd('css/styles.css');

/* ---------- 3) bootstrap שמרכיב את המודולים ל-blob URLs ---------- */
const bootstrap = `<script type="module">
/* Offline bundle — כל המודולים מוטבעים כ-base64, נטענים כ-blob URLs (עובד מ-file://). */
const SRC = ${JSON.stringify(SRC)};
const ORDER = ${JSON.stringify(ORDER)};
const dec = new TextDecoder();
const urls = {};
for (const name of ORDER) {
  let src = dec.decode(Uint8Array.from(atob(SRC[name]), c => c.charCodeAt(0)));
  src = src.replace(/from(\\s*)(['"])\\.\\/([\\w.-]+)\\2/g, (m, s, q, f) => 'from ' + q + urls[f] + q);
  src = src.replace(/import\\((\\s*)(['"])\\.\\/([\\w.-]+)\\2(\\s*)\\)/g, (m, a, q, f) => 'import(' + q + urls[f] + q + ')');
  urls[name] = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
}
import(urls['app.js']).catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('afterbegin', '<pre style="color:#f88;padding:20px;font-size:14px;white-space:pre-wrap">שגיאה בטעינה:\\n' + (e && e.stack || e) + '</pre>');
});
</script>`;

/* ---------- 4) הרכבת ה-HTML ---------- */
let html = rd('index.html');
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/\s*<link rel="preload"[^>]*>/, '')
  .replace(/\s*<link rel="stylesheet" href="\.\/css\/fonts\.css"[^>]*>/, '')
  .replace(/\s*<link rel="stylesheet" href="\.\/css\/styles\.css"[^>]*>/, `\n  <style>\n${css}\n  </style>`)
  .replace(/\s*<script type="module" src="\.\/js\/app\.js"><\/script>/, '');
html = html.replace('</body>', `  ${bootstrap}\n</body>`);

const out = join(ROOT, 'LexBudget-Offline.html');
writeFileSync(out, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`✓ ${out}  (${kb} KB)`);
