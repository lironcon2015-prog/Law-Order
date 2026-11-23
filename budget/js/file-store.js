// file-store.js — ארכיון הקבצים של LexBudget (דוחות שעות, חשבונות, מסמכים).
//
// שני מצבי אחסון:
//   'folder' — תיקיית העבודה (אותה תיקייה של קובץ הנתונים — חיבור אחד, הרשאה אחת).
//              המערכת פותחת בתוכה **תת-תיקייה לכל עסקה** אוטומטית.
//              ה-handle נשמר ב-IndexedDB (`localPrefs`) ומחזיק בין הפעלות;
//              ההרשאה מתחדשת רק מתוך לחיצת משתמש (requestPermission).
//   'db'     — נפילה כשאין תמיכה/תיקייה: הקובץ נשמר כ-Blob ב-`files`.
//
// `localPrefs` הוא **מקומי למכשיר** ואינו נכלל בגיבוי ה-JSON.

import * as db from './db.js';
import { uid } from './model.js';

// חיבור תיקייה **אחד**: תיקיית העבודה (work-folder.js) היא גם תיקיית המסמכים.
// פעם היו שני חיבורים נפרדים (מסמכים / נתונים), כל אחד עם הרשאה משלו — והחיווי הראה רק אחד מהם,
// כך שהרשאה שפגה בשני שיתקה את ייבוא הדוחות בלי שום סימן. `docsDir` הישן נשמר רק לקריאת קבצים שנשמרו בו.
const LEGACY_DIR_KEY = 'docsDir';

export const supportsFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/* ---------- תיקיית השורש = תיקיית העבודה ---------- */

async function storedHandle() {
  return (await workFolderRec())?.handle || null;
}

async function legacyHandle() {
  return (await db.get('localPrefs', LEGACY_DIR_KEY).catch(() => null))?.handle || null;
}

/** התיקייה שבה נשמר קובץ מסוים: תיקיית העבודה, או — לקבצים ישנים — תיקיית המסמכים הנפרדת של פעם */
async function rootFor(rec) {
  const root = await storedHandle();
  if (root && (!rec?.dir || rec.dir === root.name)) return root;
  const legacy = await legacyHandle();
  if (legacy && rec?.dir === legacy.name) return legacy;
  return root;
}

async function hasPermission(handle) {
  try { return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch { return false; }
}

async function ensurePermission(handle) {
  if (!handle) return false;
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch { return false; }
}

/* ---------- תת-תיקייה לעסקה ---------- */

/** שם תיקייה חוקי מתוך שם העסקה: "M&A-2026-01 — רכישת אלפא" */
export function dealFolderName(deal) {
  const raw = [deal?.code, deal?.name].filter(Boolean).join(' — ') || 'עסקה ללא שם';
  return raw
    .replace(/[\\/:*?"<>|]/g, '-')   // תווים אסורים בשמות קבצים
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/** מחזיר (ויוצר במידת הצורך) את תת-התיקייה של העסקה */
async function dealDirectory(root, deal) {
  return root.getDirectoryHandle(dealFolderName(deal), { create: true });
}

/**
 * יוצר עכשיו את תת-התיקייה של העסקה (בלי לחכות לקובץ ראשון).
 * @returns {{ok:boolean, name?:string, error?:string}}
 */
export async function ensureDealFolder(deal) {
  const root = await storedHandle();
  if (!root) return { ok: false, error: 'לא מחוברת תיקיית עבודה' };
  if (!(await ensurePermission(root))) return { ok: false, error: 'אין הרשאת כתיבה לתיקיית העבודה' };
  try {
    await dealDirectory(root, deal);
    return { ok: true, name: dealFolderName(deal) };
  } catch (err) {
    return { ok: false, error: err?.message || 'יצירת תת-התיקייה נכשלה' };
  }
}

/** בדיקת כתיבה אמיתית: יוצר קובץ זמני בתת-התיקייה של העסקה ומוחק אותו */
export async function testWrite(deal) {
  const root = await storedHandle();
  if (!root) return { ok: false, error: 'לא מחוברת תיקיית עבודה' };
  if (!(await ensurePermission(root))) return { ok: false, error: 'לא ניתן אישור גישה לתיקיית העבודה' };
  try {
    const dir = await dealDirectory(root, deal);
    const name = `.lexbudget-test-${Date.now()}.txt`;
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write('LexBudget write test');
    await w.close();
    await dir.removeEntry(name).catch(() => {});
    return { ok: true, name: `${root.name}/${dealFolderName(deal)}` };
  } catch (err) {
    return { ok: false, error: err?.message || 'הכתיבה נכשלה' };
  }
}

/** שם פנוי בתיקייה: "דוח.xlsx" → "דוח (2).xlsx" אם תפוס */
async function freeName(dir, name) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? name : `${base} (${i})${ext}`;
    try { await dir.getFileHandle(candidate); }   // קיים → הבא
    catch { return candidate; }                    // NotFoundError → פנוי
  }
  return `${base} (${Date.now()})${ext}`;
}

/* ---------- שמירה ---------- */

/**
 * שומר עותק של הקובץ — בתת-התיקייה של העסקה אם יש תיקייה מחוברת, אחרת בתוך המערכת.
 * לא זורק: כישלון כתיבה נופל חזרה לאחסון ב-IndexedDB.
 * @returns {{id, name, storage:'folder'|'db', dir?:string, subdir?:string}}
 */
export async function saveDocument(file, deal, { kind = 'doc', id = '', ask = true } = {}) {
  const base = {
    id: id || uid('file'), name: file.name, type: file.type || '', size: file.size,
    dealId: deal?.id || '', kind, createdAt: new Date().toISOString(),
  };
  const root = await storedHandle();
  let fallbackReason = '';

  // ask=false: לא מבקשים הרשאה (בקשה שלא נענית משאירה את ה-promise תלוי לנצח) — רק הרשאה שכבר בתוקף
  const allowed = root && (ask ? await ensurePermission(root) : await hasPermission(root));
  if (allowed) {
    try {
      const dir = await dealDirectory(root, deal);
      const name = await freeName(dir, file.name);
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(file);
      await w.close();
      const rec = { ...base, name, storage: 'folder', dir: root.name, subdir: dealFolderName(deal) };
      await db.put('files', rec);
      return rec;
    } catch (err) {
      console.warn('כתיבה לתיקייה נכשלה — הקובץ נשמר בתוך המערכת', err);
      fallbackReason = err?.message || 'כתיבה לתיקייה נכשלה';
    }
  } else if (root) {
    fallbackReason = 'נשמר בתוך המערכת — תיקיית העבודה ממתינה לאישור גישה (הפס בראש המסך)';
  }

  const rec = { ...base, storage: 'db', blob: file };
  await db.put('files', rec);
  return { ...rec, fallbackReason };
}

/* ---------- קריאה / פתיחה ---------- */

export const getMeta = (id) => db.get('files', id);

/** מחזיר Blob של הקובץ. זורק Error עם הודעה בעברית אם אינו זמין. */
export async function readDocument(id) {
  const rec = await db.get('files', id);
  if (!rec) throw new Error('רשומת הקובץ לא נמצאה');
  if (rec.storage !== 'folder') {
    if (!rec.blob) throw new Error('הקובץ אינו זמין במכשיר זה');
    return rec.blob;
  }
  const root = await rootFor(rec);
  if (!root) throw new Error(`התיקייה "${rec.dir || ''}" אינה מחוברת — חבר את תיקיית העבודה`);
  if (!(await ensurePermission(root))) throw new Error('אין הרשאת גישה לתיקייה');
  try {
    const dir = rec.subdir ? await root.getDirectoryHandle(rec.subdir) : root;
    const fh = await dir.getFileHandle(rec.name);
    return await fh.getFile();
  } catch {
    throw new Error(`"${rec.name}" לא נמצא בתיקייה — ייתכן שהוזז או נמחק`);
  }
}

/**
 * מוחק את רשומת הקובץ, ואם הוא נשמר בתיקייה — גם את הקובץ עצמו מהדיסק.
 * לא זורק: מחיקה שנכשלת (תיקייה מנותקת, קובץ הוזז) מוחקת לפחות את הרשומה.
 * @returns {{removedFile:boolean, reason?:string}}
 */
export async function deleteDocument(id) {
  const rec = await db.get('files', id).catch(() => null);
  if (!rec) return { removedFile: false, reason: 'הרשומה לא נמצאה' };
  let removedFile = false, reason = '';
  if (rec.storage === 'folder') {
    try {
      const root = await rootFor(rec);
      if (!root || !(await ensurePermission(root))) throw new Error('התיקייה אינה מחוברת');
      const dir = rec.subdir ? await root.getDirectoryHandle(rec.subdir) : root;
      await dir.removeEntry(rec.name);
      removedFile = true;
    } catch (err) { reason = err?.message || 'מחיקת הקובץ מהתיקייה נכשלה'; }
  }
  await db.remove('files', id);
  return { removedFile, reason };
}

/** פותח את הקובץ בלשונית חדשה (חייב להיקרא מתוך לחיצת משתמש) */
export async function openDocument(id) {
  const blob = await readDocument(id);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}


/* ============================================================
   תיקיית העבודה — קובץ הנתונים
   ============================================================
   שכבת הקבצים בלבד (קריאה/כתיבה/גיבויים). מדיניות הסנכרון — מי גובר, מתי טוענים — ב-work-folder.js.
   ה-handle וחתימת הגרסה האחרונה שנראתה נשמרים ב-`localPrefs` (מקומי למכשיר). */

const WORK_KEY = 'dataDir';
export const DATA_FILE = 'lexbudget-data.json';
export const BACKUP_DIR = 'גיבויים';
const BACKUP_RE = /^lexbudget-\d{4}-\d{2}-\d{2}\.json$/;
const BACKUP_KEEP = 30;

// הרשומה נקראת מה-DB פעם אחת ונשמרת בזיכרון — הסנכרון ניגש אליה בכל כמה שניות
let workRec;
export async function workFolderRec() {
  if (workRec === undefined) workRec = (await db.get('localPrefs', WORK_KEY)) || null;
  return workRec;
}

async function saveRec(patch) {
  workRec = { ...((await workFolderRec()) || {}), ...patch, key: WORK_KEY };
  await db.put('localPrefs', workRec);
}
export const setWorkSig = (sig, savedAt) => saveRec({ sig, savedAt });

/** 'granted' | 'prompt' | '' (אין תיקייה) — בלי לבקש הרשאה */
export async function workFolderPermission() {
  const rec = await workFolderRec();
  if (!rec?.handle) return '';
  try { return (await rec.handle.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'granted' : 'prompt'; }
  catch { return 'prompt'; }
}

/** חיבור תיקיית העבודה (מתוך לחיצת משתמש). תיקיית המסמכים, אם לא נבחרה אחרת, היא אותה תיקייה */
export async function connectWorkFolder() {
  if (!supportsFolder()) throw new Error('הדפדפן אינו תומך בגישה לתיקיות (נתמך בכרום/אדג\' במחשב)');
  const handle = await window.showDirectoryPicker({ id: 'lexbudget-data', mode: 'readwrite', startIn: 'documents' });
  if (!(await ensurePermission(handle))) throw new Error('לא ניתנה הרשאת כתיבה לתיקייה');
  workRec = { key: WORK_KEY, handle, sig: '', savedAt: '' };
  await db.put('localPrefs', workRec);
  return handle.name;
}

/** חידוש ההרשאה אחרי הפעלה מחדש של הדפדפן (מתוך לחיצת משתמש) */
export async function grantWorkFolder() {
  const rec = await workFolderRec();
  return rec?.handle ? ensurePermission(rec.handle) : false;
}

export async function forgetWorkFolder() {
  workRec = null;
  await db.remove('localPrefs', WORK_KEY);
}

/** @returns {{exists:boolean, text:string}} */
export async function readWorkFile() {
  const rec = await workFolderRec();
  let fh;
  try { fh = await rec.handle.getFileHandle(DATA_FILE); }
  catch (err) { if (err?.name === 'NotFoundError') return { exists: false, text: '' }; throw err; }
  return { exists: true, text: await (await fh.getFile()).text() };
}

async function writeText(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

/** עותק בתת-התיקייה "גיבויים". שומרים רק את 30 הגיבויים היומיים האחרונים; עותקי התנגשות לא נמחקים */
export async function writeBackupCopy(name, text) {
  const rec = await workFolderRec();
  const dir = await rec.handle.getDirectoryHandle(BACKUP_DIR, { create: true });
  await writeText(dir, name, text);
  const daily = [];
  for await (const [entry] of dir.entries()) if (BACKUP_RE.test(entry)) daily.push(entry);
  daily.sort();
  for (const old of daily.slice(0, Math.max(0, daily.length - BACKUP_KEEP))) await dir.removeEntry(old).catch(() => {});
}

/** האם כבר קיים גיבוי יומי בשם הזה */
export async function hasBackup(name) {
  const rec = await workFolderRec();
  try {
    const dir = await rec.handle.getDirectoryHandle(BACKUP_DIR);
    await dir.getFileHandle(name);
    return true;
  } catch { return false; }
}

export async function writeWorkFile(text, { sig, savedAt }) {
  const rec = await workFolderRec();
  await writeText(rec.handle, DATA_FILE, text);
  await saveRec({ sig, savedAt });
}
