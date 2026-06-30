// db.js — שכבת IndexedDB גנרית מבוססת Promises
// DB יחיד מאוחד: CRM (companies, contacts) + חיוב (clients, cases, invoices,
// payments, balances, billingSettings). v2 הוסיף את ה-stores של החיוב.

const DB_NAME = 'maCrmDB';
const DB_VERSION = 2;

let dbPromise = null;

/** עוטף IDBRequest ב-Promise */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** עוטף transaction בהבטחה שתושלם (complete/abort/error) */
function promisifyTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

/** פותח (פעם אחת) את ה-DB ויוצר stores/indexes ב-onupgradeneeded */
export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB אינו נתמך בדפדפן זה'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;

      if (!db.objectStoreNames.contains('companies')) {
        const companies = db.createObjectStore('companies', { keyPath: 'id' });
        companies.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains('contacts')) {
        const contacts = db.createObjectStore('contacts', { keyPath: 'id' });
        contacts.createIndex('fullName', 'fullName', { unique: false });
        contacts.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        contacts.createIndex('currentCompanyId', 'currentCompanyId', { unique: false });
        contacts.createIndex('status', 'status', { unique: false });
      }

      /* ---------- חיוב (Lawfee) — נוסף ב-v2 ---------- */
      if (!db.objectStoreNames.contains('clients')) {
        const clients = db.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
        clients.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('cases')) {
        const cases = db.createObjectStore('cases', { keyPath: 'id', autoIncrement: true });
        cases.createIndex('clientId', 'clientId', { unique: false });
        cases.createIndex('caseNumber', 'caseNumber', { unique: false });
      }
      if (!db.objectStoreNames.contains('invoices')) {
        const invoices = db.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
        invoices.createIndex('caseId', 'caseId', { unique: false });
        invoices.createIndex('year', 'year', { unique: false });
        invoices.createIndex('yearMonth', ['year', 'month'], { unique: false });
      }
      if (!db.objectStoreNames.contains('payments')) {
        const payments = db.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
        payments.createIndex('year', 'year', { unique: false });
        payments.createIndex('yearMonth', ['year', 'month'], { unique: false });
      }
      if (!db.objectStoreNames.contains('balances')) {
        db.createObjectStore('balances', { keyPath: 'year' });
      }
      if (!db.objectStoreNames.contains('billingSettings')) {
        db.createObjectStore('billingSettings', { keyPath: 'key' });
      }
      void event;
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

/** מחזיר את כל הרשומות מ-store */
export async function getAll(storeName) {
  return withStore(storeName, 'readonly', (store) => promisifyRequest(store.getAll()));
}

/** מחזיר רשומה בודדת לפי מפתח */
export async function get(storeName, id) {
  return withStore(storeName, 'readonly', (store) => promisifyRequest(store.get(id)));
}

/** שומר/מעדכן רשומה (put). מחזיר את ה-key */
export async function put(storeName, obj) {
  return withStore(storeName, 'readwrite', (store) => promisifyRequest(store.put(obj)));
}

/** מוסיף רשומה ל-store עם autoIncrement; מחזיר את ה-key שנוצר */
export async function addAuto(storeName, obj) {
  return withStore(storeName, 'readwrite', (store) => promisifyRequest(store.add(obj)));
}

/** מוחק רשומה לפי מפתח */
export async function remove(storeName, id) {
  return withStore(storeName, 'readwrite', (store) => promisifyRequest(store.delete(id)));
}

/** מחליף את כל תוכן ה-store ברשומות נתונות (clear + put-all) בטרנזקציה אחת.
 *  משמש לשחזור/משיכה מ-Drive (last-writer-wins על כל הקובץ). */
export async function replaceAll(storeName, records) {
  return withStore(storeName, 'readwrite', (store) => {
    store.clear();
    for (const r of (records || [])) store.put(r);
  });
}

/** שאילתה לפי אינדקס וערך מדויק */
export async function queryIndex(storeName, indexName, value) {
  return withStore(storeName, 'readonly', (store) =>
    promisifyRequest(store.index(indexName).getAll(value))
  );
}

/** סופר רשומות ב-store */
export async function count(storeName) {
  return withStore(storeName, 'readonly', (store) => promisifyRequest(store.count()));
}
