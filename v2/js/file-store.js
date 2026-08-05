// file-store.js — ארכיון מסמכי המקור של החשבוניות. הכל מקומי, בלי רשת.
//
// שני מצבי אחסון:
//   'folder' — תיקייה אמיתית בדיסק שהמשתמש בחר (File System Access API).
//              ה-handle נשמר ב-IndexedDB (`localPrefs`) ומחזיק בין הפעלות; הרשאה
//              מתחדשת בלחיצה (requestPermission דורש אינטראקציה).
//   'db'     — נפילה כשאין תמיכה/תיקייה: הקובץ עצמו נשמר כ-Blob ב-`invoiceFiles`.
//
// שני ה-stores **מקומיים למכשיר** ולא נכללים בגיבוי Drive/ייצוא JSON — הקבצים
// לא נודדים בין מכשירים, וזה מכוון (גיבוי של מאות PDF ב-JSON אינו סביר).

import * as db from './db.js';

const DIR_KEY = 'invoiceDir';

/* ---------- זמינות ---------- */
export const supportsFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/* ---------- תיקייה ---------- */
async function storedHandle() {
  const rec = await db.get('localPrefs', DIR_KEY);
  return rec ? rec.handle : null;
}

/** שם התיקייה המחוברת (או '' אם אין) */
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

/** מבקש הרשאה מחדש אם צריך (חייב להיקרא מתוך לחיצת משתמש) */
async function ensurePermission(handle) {
  if (!handle) return false;
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch { return false; }
}

/** בחירת תיקיית הארכיון (מתוך לחיצת משתמש). מחזיר את שם התיקייה. */
export async function pickFolder() {
  if (!supportsFolder()) throw new Error('הדפדפן אינו תומך בבחירת תיקייה');
  const handle = await window.showDirectoryPicker({ id: 'lexledger-invoices', mode: 'readwrite', startIn: 'documents' });
  if (!(await ensurePermission(handle))) throw new Error('לא ניתנה הרשאת כתיבה לתיקייה');
  await db.put('localPrefs', { key: DIR_KEY, handle });
  return handle.name;
}

/** ניתוק התיקייה (הקבצים שכבר נכתבו נשארים בדיסק) */
export async function forgetFolder() {
  await db.remove('localPrefs', DIR_KEY);
}

/* ---------- שמירה ---------- */
/** שם פנוי בתיקייה: "חשבונית.pdf" → "חשבונית (2).pdf" אם תפוס */
async function freeName(dir, name) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? name : `${base} (${i})${ext}`;
    try { await dir.getFileHandle(candidate); }       // קיים → ננסה את הבא
    catch { return candidate; }                        // NotFoundError → פנוי
  }
  return `${base} (${Date.now()})${ext}`;
}

/**
 * שומר עותק של קובץ המקור ומחזיר רשומת מטא-דאטה `{ id, name, storage }`.
 * לא זורק — אם כתיבה לתיקייה נכשלה, נופל לאחסון בתוך המערכת.
 */
export async function saveInvoiceFile(file) {
  const meta = { name: file.name, type: file.type || '', size: file.size, addedAt: Date.now() };
  const handle = await storedHandle();

  if (handle && (await ensurePermission(handle))) {
    try {
      const name = await freeName(handle, file.name);
      const fh = await handle.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(file);
      await w.close();
      const id = await db.addAuto('invoiceFiles', { ...meta, name, storage: 'folder', dir: handle.name });
      return { id, name, storage: 'folder', dir: handle.name };
    } catch (err) {
      console.warn('כתיבה לתיקייה נכשלה — נשמר בתוך המערכת', err);
    }
  }

  const id = await db.addAuto('invoiceFiles', { ...meta, storage: 'db', blob: file });
  return { id, name: file.name, storage: 'db' };
}

/* ---------- קריאה / פתיחה ---------- */
export const getFileMeta = (id) => db.get('invoiceFiles', id);

/** מחזיר Blob של קובץ המקור. זורק Error עם הודעה בעברית אם אינו זמין. */
export async function readInvoiceFile(id) {
  const rec = await db.get('invoiceFiles', id);
  if (!rec) throw new Error('רשומת הקובץ לא נמצאה');
  if (rec.storage === 'db') {
    if (!rec.blob) throw new Error('הקובץ אינו זמין במכשיר זה');
    return rec.blob;
  }
  const handle = await storedHandle();
  if (!handle) throw new Error(`התיקייה "${rec.dir || ''}" אינה מחוברת — חבר אותה בהגדרות כספים`);
  if (!(await ensurePermission(handle))) throw new Error('אין הרשאת גישה לתיקייה');
  try {
    const fh = await handle.getFileHandle(rec.name);
    return await fh.getFile();
  } catch {
    throw new Error(`"${rec.name}" לא נמצא בתיקייה — ייתכן שהוזז או נמחק`);
  }
}

/** פותח את קובץ המקור בלשונית חדשה (חייב להיקרא מתוך לחיצת משתמש). */
export async function openInvoiceFile(id) {
  const blob = await readInvoiceFile(id);
  const rec = await db.get('invoiceFiles', id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  // PDF נפתח בצפייה; פורמטים אחרים (Excel/CSV) יורדים כקובץ
  if (!/pdf/i.test(blob.type || rec?.type || '') && !/\.pdf$/i.test(rec?.name || '')) a.download = rec?.name || 'invoice';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** מחיקת קובץ מהארכיון הפנימי (קובץ בתיקייה נשאר בדיסק — לא מוחקים מדיסק המשתמש) */
export const removeInvoiceFile = (id) => db.remove('invoiceFiles', id);
