// db.js — עטיפת IndexedDB ל-LexBudget. מסד נפרד לחלוטין מה-CRM (maCrmDB).

const DB_NAME = 'lexBudgetDB';
const DB_VERSION = 2;   // v2: הוספת store‏ progress (עדכוני ביצוע במעקב הידני)

export const STORES = ['deals', 'teams', 'entries', 'files', 'rateCards', 'settings', 'progress'];

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

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB אינו נתמך בדפדפן זה'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

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
      // עדכוני ביצוע (מעקב ידני): כל רשומה = שעות שדווחו לתאריך מסוים, ידנית או מדוח שיובא
      if (!db.objectStoreNames.contains('progress')) {
        const s = db.createObjectStore('progress', { keyPath: 'id' });
        s.createIndex('dealId', 'dealId', { unique: false });
        s.createIndex('lineId', 'lineId', { unique: false });
        s.createIndex('batchId', 'batchId', { unique: false });
        s.createIndex('date', 'date', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('פתיחת מסד הנתונים חסומה ע"י חיבור פתוח אחר'));
  });

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
