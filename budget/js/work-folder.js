// work-folder.js — תיקיית העבודה: קובץ הנתונים שבתיקייה הוא **מקור האמת**, והדפדפן רק מטמון עבודה.
//
// למה: IndexedDB נמחק בניקוי נתוני גלישה, לא עובר בין דפדפנים/מחשבים, ואין לו גיבוי. לכן (כמו
// במערכת משימות הצוות) כל מה שנדרש לעבודה יושב בקובץ אחד בתיקייה שהמשתמש בחר — למשל בתוך OneDrive:
//   • בפתיחה ובכל 20 שניות / חזרה לחלון — אם הקובץ בתיקייה השתנה (מכשיר אחר), הוא נטען.
//   • כל שינוי נכתב לקובץ תוך שנייה וחצי.
//   • לפני הכתיבה הראשונה בכל יום — הגרסה הקודמת נשמרת ב"גיבויים" (30 ימים אחרונים).
//   • שני הצדדים השתנו → המשתמש בוחר, והצד שנדחה נשמר ב"גיבויים". שום דבר לא נדרס בשקט.
// הדפדפן מבקש אישור גישה לתיקייה אחרי כל הפעלה מחדש (לחיצה אחת) — מגבלת דפדפן, לא ניתן לעקוף.

import * as db from './db.js';
import * as store from './store.js';
import * as fileStore from './file-store.js';
import { uid, todayISO } from './model.js';

const DIRTY_KEY = 'lb_wfDirty';
const DEVICE_KEY = 'lb_device';
const WRITE_DELAY = 1500;
const POLL_MS = 20000;

const status = { state: 'none', name: '', savedAt: '', err: '', waiting: false };
let hooks = { onLoaded() {}, onStatus() {}, canLoad: () => true, resolveConflict: async () => null };
let applying = false;      // טעינה מהתיקייה כותבת ל-DB — אסור שתיחשב שינוי של המשתמש
let mutSeq = 0;
let timer = null;
let chain = Promise.resolve();

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* מצב פרטי */ } },
};
const isDirty = () => ls.get(DIRTY_KEY) === '1';
function deviceId() {
  let id = ls.get(DEVICE_KEY);
  if (!id) { id = uid('dev'); ls.set(DEVICE_KEY, id); }
  return id;
}

const sigOf = (meta) => `${meta?.revision || 0}|${meta?.savedAt || ''}|${meta?.device || ''}`;
function parse(text) {
  try { const d = JSON.parse(text); return store.isValidBackup(d) ? d : null; } catch { return null; }
}

export const getStatus = () => ({ ...status, dirty: isDirty(), supported: fileStore.supportsFolder() });

function setStatus(patch) {
  Object.assign(status, patch);
  hooks.onStatus(getStatus());
}

async function refreshState() {
  if (!fileStore.supportsFolder()) return setStatus({ state: 'unsup' });
  const rec = await fileStore.workFolderRec();
  if (!rec?.handle) return setStatus({ state: 'none', name: '', savedAt: '', err: '' });
  const perm = await fileStore.workFolderPermission();
  setStatus({ state: perm === 'granted' ? 'ready' : 'prompt', name: rec.handle.name, savedAt: rec.savedAt || '', err: '' });
}

/** כל פעולות הסנכרון רצות בתור אחד — כתיבה וטעינה לעולם לא חופפות */
function enqueue(fn) {
  chain = chain.then(fn).catch((err) => {
    console.warn('תיקיית העבודה', err);
    setStatus({ state: 'err', err: err?.message || 'הגישה לתיקייה נכשלה' });
  });
  return chain;
}

async function load(remote, sig) {
  applying = true;
  try { await store.applyBackup(remote); } finally { applying = false; }
  await fileStore.setWorkSig(sig, remote.meta?.savedAt || '');
  ls.set(DIRTY_KEY, null);
  setStatus({ savedAt: remote.meta?.savedAt || '', waiting: false });
  hooks.onLoaded(remote);
}

async function write(prevText, remote) {
  const seq = mutSeq;
  const rec = await fileStore.workFolderRec();
  // הגרסה שהייתה בתיקייה בתחילת היום נשמרת פעם אחת — לפני שדורסים אותה
  if (prevText) {
    const name = `lexbudget-${todayISO()}.json`;
    if (!(await fileStore.hasBackup(name))) await fileStore.writeBackupCopy(name, prevText);
  }
  const data = await store.collectBackup();
  const revision = Math.max(Number(remote?.meta?.revision) || 0, Number(String(rec?.sig || '').split('|')[0]) || 0) + 1;
  data.meta = { revision, savedAt: new Date().toISOString(), device: deviceId(), saved_by: 'LexBudget' };
  await fileStore.writeWorkFile(JSON.stringify(data), { sig: sigOf(data.meta), savedAt: data.meta.savedAt });
  if (seq === mutSeq) ls.set(DIRTY_KEY, null); else schedule();   // שינוי שנכנס תוך כדי כתיבה — ייכתב בסבב הבא
  setStatus({ state: 'ready', savedAt: data.meta.savedAt, err: '', waiting: false });
}

const stampName = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

async function syncNow() {
  if (status.state !== 'ready' && status.state !== 'err') return;
  if ((await fileStore.workFolderPermission()) !== 'granted') return refreshState();
  const rec = await fileStore.workFolderRec();
  const file = await fileStore.readWorkFile();
  const remote = file.exists ? parse(file.text) : null;
  // קובץ בשם שלנו שאינו קריא (נפגם / באמצע סנכרון ענן) — לא דורסים אותו
  if (file.exists && !remote) return setStatus({ state: 'err', err: `הקובץ ${fileStore.DATA_FILE} בתיקייה אינו קריא — לא נדרס. בדוק אותו או שחזר מ"${fileStore.BACKUP_DIR}".` });
  if (status.state === 'err') setStatus({ state: 'ready', err: '' });

  const localEmpty = !store.cache.deals.length;
  const remoteSig = remote ? sigOf(remote.meta) : '';
  if (remote && remoteSig !== (rec.sig || '')) {
    // בתיקייה יש גרסה שהדפדפן הזה עוד לא ראה (מכשיר אחר, או חיבור ראשון לתיקייה קיימת)
    const unsynced = !localEmpty && (isDirty() || !rec.sig);
    if (!unsynced) {
      if (!hooks.canLoad()) return setStatus({ waiting: true });   // באמצע עריכה — ייטען בבדיקה הבאה
      return load(remote, remoteSig);
    }
    const choice = await hooks.resolveConflict({ remote, firstConnect: !rec.sig });
    if (!choice) return setStatus({ waiting: true });
    if (choice === 'remote') {
      await fileStore.writeBackupCopy(`התנגשות-${stampName()}-מהדפדפן.json`, JSON.stringify(await store.collectBackup()));
      return load(remote, remoteSig);
    }
    await fileStore.writeBackupCopy(`התנגשות-${stampName()}-מהתיקייה.json`, file.text);
    return write('', remote);
  }
  if (isDirty() || !file.exists) await write(file.exists ? file.text : '', remote);
  else if (status.waiting) setStatus({ waiting: false });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => enqueue(syncNow), WRITE_DELAY);
}

/** בדיקה/שמירה מיידית (כפתור "שמור עכשיו", חזרה לחלון, טיימר) */
export function check() { clearTimeout(timer); return enqueue(syncNow); }

export async function init(h) {
  hooks = { ...hooks, ...h };
  db.onDataWrite(() => {
    if (applying) return;
    mutSeq += 1;
    ls.set(DIRTY_KEY, '1');
    if (status.state === 'ready') schedule();
    else hooks.onStatus(getStatus());
  });
  await refreshState();
  if (status.state === 'ready') await check();
  setInterval(() => { if (status.state === 'ready' || status.state === 'err') check(); }, POLL_MS);
  const wake = () => { if (document.visibilityState === 'visible' && status.state === 'ready') check(); };
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', wake);
}

/** חיבור תיקייה (לחיצת משתמש) */
export async function connect() {
  const name = await fileStore.connectWorkFolder();
  await refreshState();
  await check();
  return name;
}

/** חידוש ההרשאה אחרי הפעלת הדפדפן (לחיצת משתמש) */
export async function grant() {
  const ok = await fileStore.grantWorkFolder();
  await refreshState();
  if (ok) await check();
  return ok;
}

export async function disconnect() {
  clearTimeout(timer);
  await fileStore.forgetWorkFolder();
  await refreshState();
}
