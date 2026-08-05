#!/usr/bin/env node
/**
 * build-offline.mjs — בונה את LexBudget לקובץ HTML יחיד שעובד מ-file:// (דאבל-קליק, בלי שרת).
 *
 * למה נדרש build: מודולי ES לא נטענים מ-file:// (חסימת CORS), ולכן המודולים
 * מומרים ל-IIFE-ים בסקריפט קלאסי אחד. הפונטים מוטמעים כ-data URI כדי שהקובץ יהיה עצמאי לגמרי.
 *
 * הרצה:  node budget/build-offline.mjs
 * פלט:   budget/LexBudget-offline.html
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(DIR, p), 'utf8');

/* ============================================================
   1) המודולים — בסדר תלויות
   ============================================================ */
const MODULES = ['model', 'db', 'xlsx', 'charts', 'importer', 'store', 'ui', 'app'];

/** ממיר מודול ES ל-IIFE שמחזיר את ה-exports שלו */
function transform(name, src) {
  const exported = new Set();
  let out = src;

  // import { a, b } from './x.js';   (כולל רשימות מרובות-שורות)
  out = out.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*'\.\/([\w-]+)\.js';/gm, (_, names, mod) => {
    const list = names.split(',').map((s) => s.trim()).filter(Boolean).join(', ');
    return `const { ${list} } = __m_${mod};`;
  });

  // import * as ns from './x.js';
  out = out.replace(/^import\s*\*\s*as\s+(\w+)\s+from\s*'\.\/([\w-]+)\.js';/gm, (_, ns, mod) => `const ${ns} = __m_${mod};`);

  // export { a, b };
  out = out.replace(/^export\s*\{([^}]*)\};?/gm, (_, names) => {
    for (const n of names.split(',').map((s) => s.trim()).filter(Boolean)) exported.add(n);
    return '';
  });

  // export const/let/function/async function
  out = out.replace(/^export\s+(async\s+function|function|const|let|class)\s+(\w+)/gm, (_, kind, id) => {
    exported.add(id);
    return `${kind} ${id}`;
  });

  if (/^\s*export\s/m.test(out)) throw new Error(`נשארה הצהרת export שלא טופלה ב-${name}.js`);
  if (/^\s*import\s/m.test(out)) throw new Error(`נשארה הצהרת import שלא טופלה ב-${name}.js`);

  const ret = exported.size ? `\n  return { ${[...exported].join(', ')} };\n` : '\n';
  return `/* ===== ${name}.js ===== */\nconst __m_${name} = (function () {\n${out}\n${ret}})();`;
}

const bundle = MODULES.map((m) => transform(m, read(`js/${m}.js`))).join('\n\n');

/* ============================================================
   2) CSS + פונטים מוטמעים
   ============================================================ */
const FONT_FILES = ['assistant-hebrew', 'assistant-latin', 'inter-latin', 'ibmplexmono'];
let fontsCss = read('css/fonts.css');
for (const f of FONT_FILES) {
  const b64 = fs.readFileSync(path.join(DIR, 'fonts', `${f}.woff2`)).toString('base64');
  fontsCss = fontsCss.replaceAll(`url('../fonts/${f}.woff2')`, `url(data:font/woff2;base64,${b64})`);
}
if (fontsCss.includes('../fonts/')) throw new Error('נשאר פונט שלא הוטמע');

const css = `${fontsCss}\n${read('css/styles.css')}`;

/* ============================================================
   3) ה-HTML
   ============================================================ */
let html = read('index.html');

// הסרת נכסים חיצוניים שאין להם משמעות ב-file://
html = html
  .replace(/^\s*<link rel="manifest"[^>]*>\n/m, '')
  .replace(/^\s*<link rel="apple-touch-icon"[^>]*>\n/m, '')
  .replace(/^\s*<link rel="preload"[^>]*>\n/m, '')
  .replace(/^\s*<link rel="stylesheet"[^>]*>\n/gm, '')
  .replace(/^\s*<script type="module" src="\.\/js\/app\.js"><\/script>\n/m, '');

html = html
  .replace('</head>', `  <style>\n${css}\n  </style>\n</head>`)
  .replace('</body>', `  <script>\n${bundle}\n  </script>\n</body>`)
  .replace('<title>LexBudget · ניהול תקציב עסקה</title>', '<title>LexBudget · ניהול תקציב עסקה (אופליין)</title>');

const OUT = path.join(DIR, 'LexBudget-offline.html');
fs.writeFileSync(OUT, html, 'utf8');
console.log(`נבנה: ${OUT}  (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
