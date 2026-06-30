// sync.js — סנכרון Google Drive (קובץ JSON יחיד = מקור אמת).
// OAuth client-side (GIS), scope מצומצם drive.file, last-writer-wins + שאלת המשתמש.
// מותאם ל-IndexedDB (store.js / db.js). העקרונות לפי ה-spec של המשתמש.

import * as store from './store.js';
import * as db from './db.js';
import * as billing from './billing.js';

/* ============================================================
   הגדרות — מזינים כאן את ה-OAuth Client ID לאחר יצירתו
   (Google Cloud Console → Web application, origin https://lironcon.com)
   ============================================================ */
export const CLIENT_ID = '674619661713-rcurrqdj0cngb9sv6k3r2phd8r499pfd.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const UNIFIED_FILE = 'lexledger-unified-backup.json'; // הקובץ המאוחד (CRM + חיוב)
const LEGACY_CRM_FILE = 'laworder-crm-backup.json';   // גיבוי ה-CRM הישן — למיגרציה חד-פעמית בלבד

const LS = {
  enabled: 'lo_autoSyncEnabled', // flag: כבר התחבר פעם → ננסה silent
  fileId: 'lo_unifiedFileId',    // הקובץ המאוחד ש"נעולים" עליו
  lastPull: 'lo_lastPullAt',     // לוגיקת קונפליקט בלבד
  lastSync: 'lo_lastSyncAt',     // תצוגה בלבד
  migrated: 'lo_unifiedMigrated', // מיגרציה חד-פעמית מקובץ ה-CRM הישן הושלמה
  legacyTime: 'lo_legacyTimeAtMigrate', // modifiedTime של הקובץ הישן בזמן המיגרציה/מיזוג אחרון
  legacyDismiss: 'lo_legacyDriftDismiss', // גרסת קובץ ישן שהמשתמש בחר להתעלם ממנה
};

/* ---------- module state ---------- */
let _token = null;        // access token — בזיכרון בלבד (לא נשמר)
let _tokenClient = null;
let _pendingAction = null; // 'backup' | 'restore' | null
let _silentResolve = null;
let _state = 'off';
let _debounceTimer = null;
let _pushing = false;
let _dirty = false;
let _suppressPush = false;
let _onChange = null;
let toastFn = () => {};

const enabled = () => localStorage.getItem(LS.enabled) === '1';

/* ============================================================
   helpers טהורים — מיוצאים לבדיקות יחידה
   ============================================================ */
export function isValidShape(data) {
  return !!data && typeof data === 'object' && !Array.isArray(data)
    && (Array.isArray(data.contacts) || Array.isArray(data.companies));
}
export function chooseRemote(byId, byName) {
  let best = byId || byName || null;
  if (byId && byName && byName.modifiedTime > byId.modifiedTime) best = byName;
  return best;
}
export function isConflict(fileModifiedTime, lastPullAt) {
  return !!lastPullAt && !!fileModifiedTime && fileModifiedTime > lastPullAt;
}

/* ============================================================
   badge / state
   ============================================================ */
const STATE_TXT = {
  off: 'סנכרון כבוי',
  'signed-out': 'התחבר לסנכרון',
  idle: 'מסונכרן',
  syncing: 'מסנכרן…',
  offline: 'לא מקוון',
  error: 'שגיאת סנכרון',
};
function setState(s) {
  _state = s;
  const txt = STATE_TXT[s] || STATE_TXT.off;
  let title = txt;
  if (s === 'idle' && localStorage.getItem(LS.lastSync)) {
    title = txt + ' · ' + new Date(localStorage.getItem(LS.lastSync)).toLocaleString('he-IL');
  }
  document.querySelectorAll('.sync-status').forEach((el) => {
    el.dataset.state = s;
    el.title = title;
    const lbl = el.querySelector('.sync-status__label');
    if (lbl) lbl.textContent = txt;
  });
}
export function getState() { return _state; }
export function isSignedIn() { return !!_token; }
export function isConfigured() { return !!CLIENT_ID; }

/* ============================================================
   OAuth (GIS)
   ============================================================ */
function _initClient() {
  if (_tokenClient) return true;
  if (!window.google?.accounts?.oauth2 || !CLIENT_ID) return false;
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      if (resp && resp.error) {
        if (_silentResolve) { const r = _silentResolve; _silentResolve = null; r(false); return; }
        setState('error'); toastFn('התחברות נכשלה', 'alert');
        return;
      }
      _token = resp.access_token;
      localStorage.setItem(LS.enabled, '1');
      if (_silentResolve) { const r = _silentResolve; _silentResolve = null; r(true); return; }
      const action = _pendingAction; _pendingAction = null;
      if (action === 'backup') { backup(); return; }
      if (action === 'restore') { restore(); return; }
      setState('syncing');
      migrateFromLegacy().then(autoPull).then(checkLegacyDrift).then(() => setState('idle')).catch(() => setState('error'));
    },
  });
  return true;
}

export function signIn() {
  if (!CLIENT_ID) { toastFn('חסר Client ID — ראו הוראות התקנה', 'alert'); return; }
  if (!_initClient()) { toastFn('שירות Google עדיין נטען — נסו שוב', 'alert'); return; }
  _tokenClient.requestAccessToken({ prompt: _token ? '' : 'consent' });
}
export function signOut() {
  if (_token && window.google?.accounts?.oauth2) {
    try { window.google.accounts.oauth2.revoke(_token, () => {}); } catch (e) { void e; }
  }
  _token = null;
  localStorage.removeItem(LS.enabled);
  setState('off');
  toastFn('הסנכרון נותק');
}
function silentSignIn() {
  return new Promise((resolve) => {
    if (!window.google?.accounts?.oauth2 || !CLIENT_ID) return resolve(false);
    if (!_initClient()) return resolve(false);
    _silentResolve = resolve;
    try { _tokenClient.requestAccessToken({ prompt: '' }); }
    catch { _silentResolve = null; return resolve(false); }
    setTimeout(() => { if (_silentResolve) { _silentResolve = null; resolve(false); } }, 5000);
  });
}

/* ============================================================
   authed fetch (+ cache-buster, 401)
   ============================================================ */
async function _authedFetch(method, url, body, contentType) {
  if (!_token) throw new Error('not signed in');
  const headers = { Authorization: 'Bearer ' + _token };
  if (contentType) headers['Content-Type'] = contentType;
  let u = url;
  if (method === 'GET') u += (u.includes('?') ? '&' : '?') + '_t=' + Date.now();
  const res = await fetch(u, { method, headers, body, cache: 'no-store' });
  if (res.status === 401) { _token = null; setState('signed-out'); throw new Error('פג תוקף החיבור — התחבר מחדש'); }
  if (!res.ok) throw new Error('Drive API ' + res.status);
  return res;
}

/* ============================================================
   איתור הקובץ בענן (split-brain)
   ============================================================ */
async function tryGetFile(id) {
  try {
    const res = await _authedFetch('GET', `https://www.googleapis.com/drive/v3/files/${id}?fields=id,modifiedTime`);
    return await res.json();
  } catch { return null; }
}
/** חיפוש קובץ לפי שם בלבד (ללא side-effects) — משמש למיגרציה */
async function findByName(name) {
  try {
    const q = encodeURIComponent(`name='${name}' and trashed=false`);
    const res = await _authedFetch('GET',
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=5`);
    const j = await res.json();
    return (j.files && j.files[0]) || null;
  } catch { return null; }
}
async function findRemoteFile() {
  const byName = await findByName(UNIFIED_FILE);
  const savedId = localStorage.getItem(LS.fileId);
  const byId = savedId ? await tryGetFile(savedId) : null;
  const best = chooseRemote(byId, byName);
  if (best) localStorage.setItem(LS.fileId, best.id);
  return best;
}

/* ============================================================
   collect / apply (adapter ל-IndexedDB)
   ============================================================ */
async function collectBackupData() {
  const [contacts, companies] = await Promise.all([store.getContacts(), store.getCompanies()]);
  const bil = await billing.collectBackupData(); // clients/cases/invoices/payments/balances/billingSettings
  return { app: 'lexledger-unified', version: 2, exportedAt: new Date().toISOString(), contacts, companies, ...bil };
}
async function applyBackupData(data) {
  if (!isValidShape(data)) throw new Error('schema');
  _suppressPush = true;
  try {
    if (Array.isArray(data.companies)) await db.replaceAll('companies', data.companies);
    if (Array.isArray(data.contacts)) await db.replaceAll('contacts', data.contacts);
    // חיוב (v2+) — מיושם רק אם קיים בקובץ (תאימות לאחור עם גיבוי CRM ישן v1)
    if (data.clients || data.cases || data.invoices || data.payments || data.balances || data.billingSettings) {
      await billing.applyBackupData({
        clients: data.clients, cases: data.cases, invoices: data.invoices,
        payments: data.payments, balances: data.balances,
        billingSettings: data.billingSettings || data.settings,
      });
    }
  } finally { _suppressPush = false; }
  if (_onChange) await _onChange();
}

/* ============================================================
   מיגרציה חד-פעמית: איחוד גיבוי ה-CRM הישן לקובץ המאוחד החדש
   ============================================================ */
async function migrateFromLegacy() {
  if (localStorage.getItem(LS.migrated) === '1') return;
  // אם כבר קיים קובץ מאוחד בענן — אין מה למזג, רק לנעול עליו
  const unified = await findByName(UNIFIED_FILE);
  if (unified) {
    localStorage.setItem(LS.fileId, unified.id);
    localStorage.setItem(LS.migrated, '1');
    return;
  }
  // משיכת גיבוי ה-CRM הישן (אם קיים) ומיזוגו עם הנתונים המקומיים (כולל חיוב שיובא)
  try {
    const legacy = await findByName(LEGACY_CRM_FILE);
    if (legacy) {
      const res = await _authedFetch('GET', `https://www.googleapis.com/drive/v3/files/${legacy.id}?alt=media`);
      const data = await res.json();
      _suppressPush = true;
      try {
        if (Array.isArray(data.companies)) await db.replaceAll('companies', data.companies);
        if (Array.isArray(data.contacts)) await db.replaceAll('contacts', data.contacts);
        if (data.clients || data.cases || data.invoices || data.payments || data.balances || data.billingSettings) {
          await billing.applyBackupData({
            clients: data.clients, cases: data.cases, invoices: data.invoices,
            payments: data.payments, balances: data.balances,
            billingSettings: data.billingSettings || data.settings,
          });
        }
      } finally { _suppressPush = false; }
      if (_onChange) await _onChange();
      localStorage.setItem(LS.legacyTime, legacy.modifiedTime || ''); // נקודת-ייחוס לזיהוי דריפט עתידי
    }
  } catch (e) { console.warn('[sync] legacy migrate pull', e); }
  // כתיבת הקובץ המאוחד החדש (CRM מהישן + חיוב מקומי). אם אין מה לגבות — נדלג.
  try {
    const payload = JSON.stringify(await collectBackupData());
    const result = await uploadFile(payload, null, UNIFIED_FILE);
    if (result.id) localStorage.setItem(LS.fileId, result.id);
    localStorage.setItem(LS.lastPull, result.modifiedTime || new Date().toISOString());
    localStorage.setItem(LS.lastSync, new Date().toISOString());
    localStorage.setItem(LS.migrated, '1');
  } catch (e) { console.warn('[sync] migrate upload', e); }
}

/* ============================================================
   זיהוי דריפט: עדכון בקובץ ה-CRM הישן אחרי המיגרציה → הצעת מיזוג
   ============================================================ */
async function checkLegacyDrift() {
  if (localStorage.getItem(LS.migrated) !== '1') return;
  let legacy;
  try { legacy = await findByName(LEGACY_CRM_FILE); } catch { return; }
  if (!legacy || !legacy.modifiedTime) return;
  const ref = localStorage.getItem(LS.legacyTime) || '';
  const dismissed = localStorage.getItem(LS.legacyDismiss) || '';
  if (!ref || legacy.modifiedTime <= ref) return;          // אין שינוי חדש בישן
  if (dismissed && legacy.modifiedTime <= dismissed) return; // המשתמש כבר דחה את הגרסה הזו

  const ok = confirm(
    'גיבוי ה-CRM הישן עודכן אחרי המעבר לאפליקציה המאוחדת.\n\n' +
    'אישור = למשוך את נתוני ה-CRM (אנשי קשר/חברות) מהאפליקציה הישנה ולהחליף בהם את אלה שבמאוחדת. נתוני החיוב לא יושפעו.\n' +
    'ביטול = להתעלם מהעדכון הזה.'
  );
  if (!ok) { localStorage.setItem(LS.legacyDismiss, legacy.modifiedTime); return; }

  try {
    setState('syncing');
    const res = await _authedFetch('GET', `https://www.googleapis.com/drive/v3/files/${legacy.id}?alt=media`);
    const data = await res.json();
    _suppressPush = true;
    try {
      if (Array.isArray(data.companies)) await db.replaceAll('companies', data.companies);
      if (Array.isArray(data.contacts)) await db.replaceAll('contacts', data.contacts);
    } finally { _suppressPush = false; }
    if (_onChange) await _onChange();
    localStorage.setItem(LS.legacyTime, legacy.modifiedTime);
    localStorage.removeItem(LS.legacyDismiss);
    await push(); // העלאת הקובץ המאוחד עם ה-CRM הממוזג
    toastFn('שינויי ה-CRM מהאפליקציה הישנה מוזגו');
  } catch (e) { console.warn('[sync] legacy drift merge', e); setState('error'); }
}

/* ============================================================
   העלאה (create-or-update)
   ============================================================ */
async function uploadFile(payload, existingId, name = UNIFIED_FILE) {
  if (existingId) {
    const res = await _authedFetch('PATCH',
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&fields=id,modifiedTime`,
      payload, 'application/json');
    return res.json();
  }
  const boundary = '----laworder' + Date.now();
  const meta = { name, mimeType: 'application/json' };
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--`;
  const res = await _authedFetch('POST',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
    multipart, `multipart/related; boundary=${boundary}`);
  return res.json();
}

/* ============================================================
   גיבוי / שחזור ידני
   ============================================================ */
export async function backup() {
  if (!_token) { _pendingAction = 'backup'; signIn(); return; }
  setState('syncing');
  try {
    const payload = JSON.stringify(await collectBackupData());
    const existing = await findRemoteFile();
    const result = await uploadFile(payload, existing && existing.id);
    if (result.id) localStorage.setItem(LS.fileId, result.id);
    localStorage.setItem(LS.lastPull, result.modifiedTime || new Date().toISOString());
    localStorage.setItem(LS.lastSync, new Date().toISOString());
    _dirty = false; setState('idle'); toastFn('גובה לדרייב');
  } catch (e) { console.warn('[sync] backup', e); setState('error'); toastFn('גיבוי נכשל', 'alert'); }
}
export async function restore() {
  if (!_token) { _pendingAction = 'restore'; signIn(); return; }
  if (!confirm('שחזור יחליף את כל הנתונים הנוכחיים בגרסה מהדרייב.\nשינויים מקומיים שלא גובו עדיין — יאבדו. להמשיך?')) return;
  setState('syncing');
  try {
    const file = await findRemoteFile();
    if (!file) { setState('idle'); toastFn('לא נמצא גיבוי בדרייב', 'alert'); return; }
    const res = await _authedFetch('GET', `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
    const data = await res.json();
    if (!isValidShape(data)) { setState('error'); toastFn('קובץ הגיבוי בדרייב פגום — לא בוצע שחזור', 'alert'); return; }
    await applyBackupData(data);
    localStorage.setItem(LS.fileId, file.id);
    localStorage.setItem(LS.lastPull, file.modifiedTime);
    localStorage.setItem(LS.lastSync, new Date().toISOString());
    setState('idle'); toastFn('שוחזר מהדרייב');
  } catch (e) { console.warn('[sync] restore', e); setState('error'); toastFn('שחזור נכשל', 'alert'); }
}

/* ============================================================
   auto-pull (שקט) + push (קונפליקט-מודע)
   ============================================================ */
async function autoPull() {
  const file = await findRemoteFile();
  if (!file) return;
  const lastPull = localStorage.getItem(LS.lastPull) || '';
  if (lastPull && file.modifiedTime <= lastPull) return; // אין חדש
  const res = await _authedFetch('GET', `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
  const data = await res.json();
  if (!isValidShape(data)) return;
  await applyBackupData(data);
  localStorage.setItem(LS.fileId, file.id);
  localStorage.setItem(LS.lastPull, file.modifiedTime);
  localStorage.setItem(LS.lastSync, new Date().toISOString());
}

export async function push() {
  if (_pushing) return;
  if (!navigator.onLine) { setState('offline'); return; }
  if (!_token) { setState('signed-out'); return; }
  _pushing = true; setState('syncing');
  try {
    const file = await findRemoteFile();
    if (file && isConflict(file.modifiedTime, localStorage.getItem(LS.lastPull) || '')) {
      const pull = confirm('מכשיר אחר עדכן את הענן מאז הסנכרון האחרון.\n\nאישור = למשוך מהענן (יאבדו שינויים מקומיים שטרם נדחפו).\nביטול = לדרוס את הענן בגרסה המקומית.');
      if (pull) {
        const res = await _authedFetch('GET', `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
        const data = await res.json();
        if (isValidShape(data)) {
          await applyBackupData(data);
          localStorage.setItem(LS.lastPull, file.modifiedTime);
          localStorage.setItem(LS.lastSync, new Date().toISOString());
        }
        _dirty = false; setState('idle'); _pushing = false; return;
      }
    }
    const payload = JSON.stringify(await collectBackupData());
    const result = await uploadFile(payload, file && file.id);
    if (result.id) localStorage.setItem(LS.fileId, result.id);
    localStorage.setItem(LS.lastPull, result.modifiedTime || new Date().toISOString());
    localStorage.setItem(LS.lastSync, new Date().toISOString());
    _dirty = false; setState('idle');
  } catch (e) { console.warn('[sync] push', e); setState('error'); }
  finally { _pushing = false; }
}

/* ============================================================
   hook מוטציה (debounced) + init
   ============================================================ */
export function notifyMutation() {
  if (_suppressPush) return;
  if (!enabled() || !_token) return;
  _dirty = true;
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(push, 5000);
}

function waitFor(pred, tries, interval) {
  return new Promise((resolve) => {
    let n = 0;
    const t = setInterval(() => {
      if (pred() || ++n >= tries) { clearInterval(t); resolve(!!pred()); }
    }, interval);
  });
}
async function autoSyncInit() {
  if (!enabled()) { setState('signed-out'); return; }
  setState('signed-out');
  await waitFor(() => window.google?.accounts?.oauth2, 50, 100); // GIS נטען async
  const ok = await silentSignIn();
  if (!ok) { setState('signed-out'); return; }
  setState('syncing');
  try { await migrateFromLegacy(); await autoPull(); await checkLegacyDrift(); setState('idle'); } catch { setState('error'); }
}

export function init({ onChange, toast } = {}) {
  _onChange = onChange || null;
  if (toast) toastFn = toast;
  if (!CLIENT_ID) { setState('off'); return; } // לא מוגדר — רדום
  autoSyncInit();
  window.addEventListener('online', () => { if (_dirty) push(); });
  window.addEventListener('offline', () => setState('offline'));
}
