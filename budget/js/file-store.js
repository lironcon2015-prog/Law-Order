// file-store.js — ארכיון הקבצים של LexBudget (דוחות שעות, חשבונות, מסמכים).
//
// שני מצבי אחסון:
//   'folder' — תיקייה אמיתית בדיסק שהמשתמש בחר (File System Access API).
//              המערכת פותחת בתוכה **תת-תיקייה לכל עסקה** אוטומטית.
//              ה-handle נשמר ב-IndexedDB (`localPrefs`) ומחזיק בין הפעלות;
//              ההרשאה מתחדשת רק מתוך לחיצת משתמש (requestPermission).
//   'db'     — נפילה כשאין תמיכה/תיקייה: הקובץ נשמר כ-Blob ב-`files`.
//
// `localPrefs` הוא **מקומי למכשיר** ואינו נכלל בגיבוי ה-JSON.

import * as db from './db.js';
import { uid } from './model.js';

const DIR_KEY = 'docsDir';

export const supportsFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/* ---------- תיקיית השורש ---------- */

async function storedHandle() {
  const rec = await db.get('localPrefs', DIR_KEY);
  return rec ? rec.handle : null;
}

/** שם תיקיית השורש המחוברת (או '' אם אין) */
export async function folderName() {
  const h = await storedHandle();
  return h ? h.name : '';
}

/** האם יש הרשאת כתיבה בתוקף כרגע (בלי לבקש) */
export async function folderReady() {
  const h = await storedHandle();
  if (!h) return false;
  try { return (await h.queryPermission({ mode: 'readwrite' })) === 'granted'; }
  catch { return false; }
}

async function ensurePermission(handle) {
  if (!handle) return false;
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch { return false; }
}

/** בחירת תיקיית המסמכים (מתוך לחיצת משתמש). מחזיר את שם התיקייה. */
export async function pickFolder() {
  if (!supportsFolder()) throw new Error('הדפדפן אינו תומך בבחירת תיקייה (נתמך בכרום/אדג\' במחשב)');
  const handle = await window.showDirectoryPicker({ id: 'lexbudget-docs', mode: 'readwrite', startIn: 'documents' });
  if (!(await ensurePermission(handle))) throw new Error('לא ניתנה הרשאת כתיבה לתיקייה');
  await db.put('localPrefs', { key: DIR_KEY, handle });
  return handle.name;
}

/** מבקש מחדש את ההרשאה לתיקייה הקיימת (מתוך לחיצת משתמש) */
export async function reconnectFolder() {
  const h = await storedHandle();
  if (!h) return false;
  return ensurePermission(h);
}

/** ניתוק התיקייה (הקבצים שכבר נכתבו נשארים בדיסק) */
export async function forgetFolder() {
  await db.remove('localPrefs', DIR_KEY);
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
  if (!root) return { ok: false, error: 'לא מחוברת תיקייה' };
  if (!(await ensurePermission(root))) return { ok: false, error: 'אין הרשאת כתיבה לתיקייה' };
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
  if (!root) return { ok: false, error: 'לא מחוברת תיקייה' };
  if (!(await ensurePermission(root))) return { ok: false, error: 'אין הרשאת כתיבה — לחץ "חדש הרשאה"' };
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
export async function saveDocument(file, deal, { kind = 'doc' } = {}) {
  const base = {
    id: uid('file'), name: file.name, type: file.type || '', size: file.size,
    dealId: deal?.id || '', kind, createdAt: new Date().toISOString(),
  };
  const root = await storedHandle();
  let fallbackReason = '';

  if (root && (await ensurePermission(root))) {
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
    fallbackReason = 'אין הרשאת כתיבה לתיקייה';
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
  const root = await storedHandle();
  if (!root) throw new Error(`התיקייה "${rec.dir || ''}" אינה מחוברת — חבר אותה במסך ההגדרות`);
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
      const root = await storedHandle();
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
