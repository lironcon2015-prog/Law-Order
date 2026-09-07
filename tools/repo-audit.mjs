// repo-audit.mjs — בדיקת שפיות לפני שמתחילים לעבוד (ולפני שמוסרים קובץ למשתמש).
// נולד משתי טעויות אמיתיות:
//   1. נמסר קובץ אופליין "מעודכן" שנבנה מ-main, בזמן שענף אחר החזיק 16 קומיטים
//      שמעולם לא מוזגו — כלומר הקובץ היה ישן ממה שקיים בפועל.
//   2. DB_VERSION ירד מ-4 ל-3 (ענף אחר העלה אותו), ו-IndexedDB חסם את האפליקציה
//      אצל המשתמש: "the requested version (3) is less than the existing version (4)".
//
// הרצה: node tools/repo-audit.mjs            (רץ אוטומטית ב-SessionStart hook)
//       node tools/repo-audit.mjs --no-fetch (בלי גישה לרשת)

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NO_FETCH = process.argv.includes('--no-fetch');

const git = (cmd, fallback = '') => {
  try { return execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return fallback; }
};

/** אפליקציות שיש להן מסד נתונים משלהן — כל אחת עם קובץ ה-db והאופליין שלה */
const APPS = [
  { name: 'LexBudget', dir: 'budget', db: 'budget/js/db.js', offline: 'LexBudget-Offline.html' },
  { name: 'LexLedger (v2)', dir: 'v2', db: 'v2/js/db.js', offline: 'LexLedger-Offline.html' },
];

const dbVersionOf = (text) => {
  const m = String(text || '').match(/const\s+DB_VERSION\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
};

const lines = [];
const warn = (s) => lines.push(`⚠️  ${s}`);
const info = (s) => lines.push(`   ${s}`);

if (!NO_FETCH) git('fetch --quiet --prune origin');

const base = git('rev-parse --verify --quiet origin/main') ? 'origin/main' : 'main';
if (!git(`rev-parse --verify --quiet ${base}`)) {
  console.log('repo-audit: אין main מקומי או מרוחק — דילוג.');
  process.exit(0);
}

/* ---------- 1) ענפים עם עבודה שלא מוזגה ל-main ---------- */
const branches = git(`for-each-ref --format='%(refname:short)' refs/remotes/origin`)
  .split('\n').map((s) => s.trim())
  .filter((b) => b && b !== 'origin/main' && b !== 'origin/HEAD');

const unmerged = [];
for (const b of branches) {
  const ahead = Number(git(`rev-list --count ${base}..${b}`, '0'));
  if (!ahead) continue;
  const files = git(`diff --name-only ${base}...${b}`).split('\n').filter(Boolean);
  const apps = APPS.filter((a) => files.some((f) => f.startsWith(`${a.dir}/`))).map((a) => a.name);
  // כמה main מקדים אותו — ענף שנשאר הרחק מאחור הוא בדרך כלל קו פיתוח נטוש, לא עבודה חסרה
  const behind = Number(git(`rev-list --count ${b}..${base}`, '0'));
  unmerged.push({ branch: b, ahead, behind, apps, last: git(`log -1 --format=%ad --date=short ${b}`) });
}
unmerged.sort((a, b) => b.ahead - a.ahead);

if (unmerged.length) {
  warn(`יש ${unmerged.length} ענפים עם עבודה שלא מוזגה ל-main:`);
  for (const u of unmerged.slice(0, 8)) {
    info(`${u.branch} — ${u.ahead} קומיטים לפני main (main לפניו ב-${u.behind}) · ${u.last}${u.apps.length ? ` · נוגע ב-${u.apps.join(', ')}` : ''}`);
  }
  info('לפני מסירת קובץ למשתמש: לבדוק אם העבודה הזו צריכה להיכנס, אחרת הקובץ יהיה ישן ממה שקיים.');
} else {
  info('כל הענפים מוזגו ל-main.');
}

/* ---------- 2) DB_VERSION — אסור שיירד מתחת למה שקיים בענף אחר ---------- */
for (const app of APPS) {
  const path = join(ROOT, app.db);
  if (!existsSync(path)) continue;
  const mine = dbVersionOf(readFileSync(path, 'utf8'));
  if (mine === null) continue;
  let maxVer = mine;
  let owner = 'כאן';
  for (const b of [base, ...branches]) {
    const v = dbVersionOf(git(`show ${b}:${app.db}`));
    if (v !== null && v > maxVer) { maxVer = v; owner = b; }
  }
  if (maxVer > mine) {
    warn(`${app.name}: DB_VERSION כאן ${mine}, אבל ${owner} כבר ב-${maxVer}.`);
    info('IndexedDB אוסר הורדת גרסה — משתמש שפתח את הגרסה הגבוהה ייחסם. להעלות ל-' + maxVer + ' לפחות (ולשמור על ה-stores שנוצרו שם).');
  }
}

/* ---------- 3) קבצי האופליין — האם נבנו אחרי השינוי האחרון בקוד ---------- */
for (const app of APPS) {
  const offline = join(ROOT, app.offline);
  if (!existsSync(offline) || !existsSync(join(ROOT, app.dir))) continue;
  const codeAt = git(`log -1 --format=%ct -- ${app.dir}`, '0');
  const builtAt = git(`log -1 --format=%ct -- ${app.offline}`, '0');
  if (Number(codeAt) > Number(builtAt)) {
    warn(`${app.name}: ${app.offline} ישן מהקוד ב-${app.dir}/ — להריץ את סקריפט הבנייה ולמסור מחדש.`);
  }
}

console.log(['— repo-audit —', ...lines].join('\n'));
