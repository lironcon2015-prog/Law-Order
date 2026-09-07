// db.js — עטיפת IndexedDB ל-LexBudget. מסד נפרד לחלוטין מה-CRM (maCrmDB).

const DB_NAME = 'lexBudgetDB';
// v4: יישור מול סכימה שכבר קיימת אצל משתמשים (store בשם `people`). אסור להוריד גרסה:
// דפדפן שכבר יצר מסד v4 זורק VersionError אם פותחים אותו ב-3 — ראו openDB.
const DB_VERSION = 4;

export const STORES = ['deals', 'teams', 'entries', 'files', 'rateCards', 'settings', 'progress', 'localPrefs', 'people'];

let dbPromise = null;

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

/** יצירת ה-stores החסרים. רץ בכל upgradeneeded, ולכן בטוח לכל קפיצת גרסה. */
function upgrade(db) {
  if (!db.objectStoreNames.contains('deals')) {
    const s = db.createObjectStore('deals', { keyPath: 'id' });
    s.createIndex('status', 'status', { unique: false });
  }
  if (!db.objectStoreNames.contains('teams')) {
    const s = db.createObjectStore('teams', { keyPath: 'id' });
    s.createIndex('dealId', 'dealId', { unique: false });
  }
  if (!db.objectStoreNames.contains('entries')) {
    const s = db.createObjectStore('entries', { keyPath: 'id' });
    s.createIndex('dealId', 'dealId', { unique: false });
    s.createIndex('teamId', 'teamId', { unique: false });
    s.createIndex('date', 'date', { unique: false });
  }
  // קבצי חשבונות מצורפים (Blob) — נשמרים מקומית כדי לעבוד אופליין
  if (!db.objectStoreNames.contains('files')) {
    db.createObjectStore('files', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('rateCards')) {
    db.createObjectStore('rateCards', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' });
  }
  // העדפות מקומיות למכשיר (handle של תיקיית המסמכים) — לא נכלל בגיבוי
  if (!db.objectStoreNames.contains('localPrefs')) {
    db.createObjectStore('localPrefs', { keyPath: 'key' });
  }
  // עדכוני ביצוע (מעקב ידני): כל רשומה = שעות שדווחו לתאריך מסוים, ידנית או מדוח שיובא
  if (!db.objectStoreNames.contains('progress')) {
    const s = db.createObjectStore('progress', { keyPath: 'id' });
    s.createIndex('dealId', 'dealId', { unique: false });
    s.createIndex('lineId', 'lineId', { unique: false });
    s.createIndex('batchId', 'batchId', { unique: false });
    s.createIndex('date', 'date', { unique: false });
  }
  // ספריית אנשי הצוות — נוצר כדי לשמור סכימה זהה בין גרסאות הקוד
  if (!db.objectStoreNames.contains('people')) {
    const s = db.createObjectStore('people', { keyPath: 'id' });
    s.createIndex('key', 'key', { unique: false });
  }
}

/** פתיחה בגרסה מבוקשת; `version` ריק = בגרסה הקיימת במכשיר, כמו שהיא */
function openAt(version) {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('פתיחת מסד הנתונים חסומה ע"י חיבור פתוח אחר'));
  });
}

/**
 * פתיחת המסד. אם במכשיר כבר קיים מסד **חדש יותר** (נוצר בגרסת קוד מאוחרת, למשל
 * קובץ אופליין עדכני יותר) — IndexedDB זורק `VersionError` ואינו מרשה הורדת גרסה.
 * במקרה כזה נפתחים בגרסה הקיימת ולא מוחקים כלום; אם חסר store שהאפליקציה צריכה,
 * מעלים גרסה בשלב אחד ויוצרים אותו. כך גרסה ישנה יותר של הקוד לא נועלת את הנתונים.
 */
export function openDB() {
  if (dbPromise) return dbPromise;
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB אינו נתמך בדפדפן זה'));

  dbPromise = openAt(DB_VERSION).catch(async (err) => {
    if (err?.name !== 'VersionError') throw err;
    const db = await openAt(null);
    if (STORES.every((name) => db.objectStoreNames.contains(name))) return db;
    const next = db.version + 1;
    db.close();
    return openAt(next);
  });
  // כישלון לא ישאיר promise דחוי תקוע — ניסיון הבא ייפתח מחדש
  dbPromise.catch(() => { dbPromise = null; });

  return dbPromise;
}

async function withStore(storeName, mode, fn) {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await fn(store);
  await promisifyTx(tx);
  return result;
}

export async function getAll(storeName) {
  return withStore(storeName, 'readonly', (s) => promisifyRequest(s.getAll()));
}

export async function get(storeName, id) {
  return withStore(storeName, 'readonly', (s) => promisifyRequest(s.get(id)));
}

export async function put(storeName, obj) {
  return withStore(storeName, 'readwrite', (s) => promisifyRequest(s.put(obj)));
}

/** שומר מספר רשומות בטרנזקציה אחת */
export async function putMany(storeName, objs) {
  return withStore(storeName, 'readwrite', (s) => { for (const o of objs || []) s.put(o); });
}

export async function remove(storeName, id) {
  return withStore(storeName, 'readwrite', (s) => promisifyRequest(s.delete(id)));
}

export async function removeMany(storeName, ids) {
  return withStore(storeName, 'readwrite', (s) => { for (const id of ids || []) s.delete(id); });
}

export async function queryIndex(storeName, indexName, value) {
  return withStore(storeName, 'readonly', (s) => promisifyRequest(s.index(indexName).getAll(value)));
}

export async function replaceAll(storeName, records) {
  return withStore(storeName, 'readwrite', (s) => {
    s.clear();
    for (const r of records || []) s.put(r);
  });
}

export async function clear(storeName) {
  return withStore(storeName, 'readwrite', (s) => promisifyRequest(s.clear()));
}
