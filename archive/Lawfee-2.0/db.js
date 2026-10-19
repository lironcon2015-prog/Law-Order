/**
 * db.js — LexLedger IndexedDB Wrapper
 *
 * Stores:
 *  - clients    { id, name, createdAt }
 *  - cases      { id, clientId, caseNumber, description, caseType,
 *                 commissionRate, arrangementType, openDate, createdAt }
 *  - invoices   { id, caseId, month, year, amount, commissionRate,
 *                 commission, notes, source, createdAt }
 *  - payments   { id, year, month, amount, notes, createdAt }
 *  - balances   { year (keyPath), openingBalance }
 *  - settings   { key (keyPath), value }
 *
 * All methods return Promises. The DB is exposed as window.DB.
 */

const DB = (() => {
  const DB_NAME    = 'LexLedgerDB';
  const DB_VERSION = 1;
  let _db = null;

  // ── Open / Init ─────────────────────────────────────────
  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // clients
        if (!db.objectStoreNames.contains('clients')) {
          const cs = db.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
          cs.createIndex('name', 'name', { unique: false });
        }

        // cases
        if (!db.objectStoreNames.contains('cases')) {
          const cs = db.createObjectStore('cases', { keyPath: 'id', autoIncrement: true });
          cs.createIndex('clientId',    'clientId',    { unique: false });
          cs.createIndex('caseNumber',  'caseNumber',  { unique: false });
        }

        // invoices
        if (!db.objectStoreNames.contains('invoices')) {
          const is = db.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
          is.createIndex('caseId',  'caseId',  { unique: false });
          is.createIndex('year',    'year',    { unique: false });
          is.createIndex('yearMonth', ['year','month'], { unique: false });
        }

        // payments
        if (!db.objectStoreNames.contains('payments')) {
          const ps = db.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
          ps.createIndex('year',  'year',  { unique: false });
          ps.createIndex('yearMonth', ['year','month'], { unique: false });
        }

        // balances (keyed by year integer)
        if (!db.objectStoreNames.contains('balances')) {
          db.createObjectStore('balances', { keyPath: 'year' });
        }

        // settings (key-value)
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ── Generic helpers ─────────────────────────────────────
  function _tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction(store, mode);
      const obj = Array.isArray(store) ? store.map(s => tx.objectStore(s)) : tx.objectStore(store);
      tx.onerror   = (e) => reject(e.target.error);
      tx.onabort   = (e) => reject(e.target.error);
      resolve(fn(obj, tx));
    }));
  }

  function _req(idbReq) {
    return new Promise((resolve, reject) => {
      idbReq.onsuccess = (e) => resolve(e.target.result);
      idbReq.onerror   = (e) => reject(e.target.error);
    });
  }

  function _getAll(store) {
    return _tx(store, 'readonly', obj => _req(obj.getAll()));
  }

  function _get(store, key) {
    return _tx(store, 'readonly', obj => _req(obj.get(key)));
  }

  function _put(store, record) {
    return _tx(store, 'readwrite', obj => _req(obj.put(record)));
  }

  function _add(store, record) {
    return _tx(store, 'readwrite', obj => _req(obj.add(record)));
  }

  function _delete(store, key) {
    return _tx(store, 'readwrite', obj => _req(obj.delete(key)));
  }

  function _getAllByIndex(store, indexName, value) {
    return _tx(store, 'readonly', obj => _req(obj.index(indexName).getAll(value)));
  }

  function _clear(store) {
    return _tx(store, 'readwrite', obj => _req(obj.clear()));
  }

  // ── Clients ─────────────────────────────────────────────
  const clients = {
    getAll:  () => _getAll('clients'),
    get:     (id) => _get('clients', id),
    add:     (name) => {
      const now = Date.now();
      return _add('clients', { name: name.trim(), createdAt: now });
    },
    update:  (record) => _put('clients', record),
    delete:  (id) => _delete('clients', id),
  };

  // ── Cases ────────────────────────────────────────────────
  const cases = {
    getAll:  () => _getAll('cases'),
    get:     (id) => _get('cases', id),
    getByClient: (clientId) => _getAllByIndex('cases', 'clientId', clientId),

    add: (data) => {
      const record = {
        clientId:        data.clientId,
        caseNumber:      (data.caseNumber || '').trim(),
        description:     (data.description || '').trim(),
        caseType:        data.caseType || 'שוטף',      // שוטף | ליטיגציה | עסקה
        commissionRate:  parseFloat(data.commissionRate) || 0,
        arrangementType: (data.arrangementType || '').trim(),
        openDate:        data.openDate || null,
        createdAt:       Date.now(),
      };
      return _add('cases', record);
    },

    update: (record) => {
      if (record.commissionRate !== undefined) {
        record.commissionRate = parseFloat(record.commissionRate) || 0;
      }
      return _put('cases', record);
    },

    delete: (id) => _delete('cases', id),

    /** Find case by case number string (returns first match or null) */
    findByCaseNumber: async (caseNumber) => {
      const all = await _getAll('cases');
      return all.find(c => c.caseNumber === caseNumber.trim()) || null;
    },
  };

  // ── Invoices ─────────────────────────────────────────────
  const invoices = {
    getAll:    () => _getAll('invoices'),
    get:       (id) => _get('invoices', id),
    getByCase: (caseId) => _getAllByIndex('invoices', 'caseId', caseId),
    getByYear: (year)   => _getAllByIndex('invoices', 'year', year),

    /**
     * Add an invoice.
     * commissionRate is snapshotted from the case at time of entry.
     * commission is auto-computed unless provided.
     */
    add: (data) => {
      const amount         = parseFloat(data.amount) || 0;
      const commissionRate = parseFloat(data.commissionRate) || 0;
      const commission     = data.commission !== undefined
        ? parseFloat(data.commission)
        : +(amount * commissionRate / 100).toFixed(2);

      const record = {
        caseId:         data.caseId,
        month:          parseInt(data.month, 10),   // 1–12
        year:           parseInt(data.year, 10),
        amount:         amount,
        commissionRate: commissionRate,
        commission:     commission,
        notes:          (data.notes || '').trim(),
        source:         data.source || 'manual',    // 'manual' | 'pdf' | 'import'
        createdAt:      Date.now(),
      };
      return _add('invoices', record);
    },

    update: (record) => {
      // Recompute commission if amount or rate changed
      const amount = parseFloat(record.amount) || 0;
      const rate   = parseFloat(record.commissionRate) || 0;
      record.commission = +(amount * rate / 100).toFixed(2);
      return _put('invoices', record);
    },

    delete: (id) => _delete('invoices', id),

    /** Sum of commissions for a given year */
    totalCommissionForYear: async (year) => {
      const list = await _getAllByIndex('invoices', 'year', year);
      return list.reduce((s, inv) => s + (inv.commission || 0), 0);
    },

    /** Sum of amounts for a given year */
    totalAmountForYear: async (year) => {
      const list = await _getAllByIndex('invoices', 'year', year);
      return list.reduce((s, inv) => s + (inv.amount || 0), 0);
    },

    /** Grouped by month for a given year: { month: { amount, commission } } */
    byMonthForYear: async (year) => {
      const list = await _getAllByIndex('invoices', 'year', year);
      const result = {};
      for (let m = 1; m <= 12; m++) result[m] = { amount: 0, commission: 0 };
      list.forEach(inv => {
        if (!result[inv.month]) result[inv.month] = { amount: 0, commission: 0 };
        result[inv.month].amount     += inv.amount     || 0;
        result[inv.month].commission += inv.commission || 0;
      });
      return result;
    },
  };

  // ── Payments ─────────────────────────────────────────────
  const payments = {
    getAll:    () => _getAll('payments'),
    get:       (id) => _get('payments', id),
    getByYear: (year) => _getAllByIndex('payments', 'year', year),

    add: (data) => {
      const record = {
        year:      parseInt(data.year, 10),
        month:     data.month ? parseInt(data.month, 10) : null,
        amount:    parseFloat(data.amount) || 0,
        notes:     (data.notes || '').trim(),
        createdAt: Date.now(),
      };
      return _add('payments', record);
    },

    update: (record) => _put('payments', record),
    delete: (id)     => _delete('payments', id),

    totalForYear: async (year) => {
      const list = await _getAllByIndex('payments', 'year', year);
      return list.reduce((s, p) => s + (p.amount || 0), 0);
    },

    /** Grouped by month for a given year.
     *  Returns { 1: total, …, 12: total, 0: total_without_month }
     *  Key 0 holds payments where month is null/unknown.
     */
    byMonthForYear: async (year) => {
      const list = await _getAllByIndex('payments', 'year', year);
      const result = {};
      list.forEach(p => {
        const m = (p.month != null && p.month >= 1 && p.month <= 12) ? p.month : 0;
        result[m] = (result[m] || 0) + (p.amount || 0);
      });
      return result;
    },
  };

  // ── Balances ─────────────────────────────────────────────
  const balances = {
    get: (year) => _get('balances', year),

    set: (year, openingBalance) =>
      _put('balances', { year: parseInt(year, 10), openingBalance: parseFloat(openingBalance) || 0 }),

    getAll: () => _getAll('balances'),

    /**
     * Compute the full ledger for a given year:
     *   closingBalance = openingBalance + totalCommissions - totalPayments
     */
    computeLedger: async (year) => {
      const y = parseInt(year, 10);
      const balRecord     = await _get('balances', y);
      const openingBal    = balRecord ? (balRecord.openingBalance || 0) : 0;
      const totalComm     = await invoices.totalCommissionForYear(y);
      const totalPayments = await payments.totalForYear(y);
      const closingBal    = +(openingBal + totalComm - totalPayments).toFixed(2);
      return {
        year:           y,
        openingBalance: openingBal,
        totalCommissions: +totalComm.toFixed(2),
        totalPayments:    +totalPayments.toFixed(2),
        closingBalance:   closingBal,
      };
    },
  };

  // ── Settings ─────────────────────────────────────────────
  const settings = {
    get:    (key)         => _get('settings', key).then(r => r ? r.value : null),
    set:    (key, value)  => _put('settings', { key, value }),
    delete: (key)         => _delete('settings', key),

    /** Known years with data */
    getKnownYears: async () => {
      const [invList, payList, balList] = await Promise.all([
        _getAll('invoices'),
        _getAll('payments'),
        _getAll('balances'),
      ]);
      const years = new Set([
        ...invList.map(i => i.year),
        ...payList.map(p => p.year),
        ...balList.map(b => b.year),
      ]);
      return [...years].sort((a, b) => b - a); // descending
    },
  };

  // ── Backup / Restore ─────────────────────────────────────
  const backup = {
    /** Export full DB to a JSON-serialisable object */
    export: async () => {
      const [c, ca, inv, pay, bal, set_] = await Promise.all([
        _getAll('clients'),
        _getAll('cases'),
        _getAll('invoices'),
        _getAll('payments'),
        _getAll('balances'),
        _getAll('settings'),
      ]);
      return {
        version:  1,
        exported: new Date().toISOString(),
        clients:  c,
        cases:    ca,
        invoices: inv,
        payments: pay,
        balances: bal,
        settings: set_,
      };
    },

    /** Import from a backup JSON object (replaces ALL data) */
    import: async (data) => {
      if (!data || data.version !== 1) throw new Error('קובץ גיבוי לא תקין');

      const db = await open();
      const stores = ['clients','cases','invoices','payments','balances','settings'];
      const tx = db.transaction(stores, 'readwrite');

      await Promise.all(stores.map(s => _req(tx.objectStore(s).clear())));

      const writeAll = (storeName, records) =>
        Promise.all((records || []).map(r => _req(tx.objectStore(storeName).put(r))));

      await Promise.all([
        writeAll('clients',  data.clients),
        writeAll('cases',    data.cases),
        writeAll('invoices', data.invoices),
        writeAll('payments', data.payments),
        writeAll('balances', data.balances),
        writeAll('settings', data.settings),
      ]);

      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror    = e => rej(e.target.error);
      });
    },

    /** Wipe everything */
    clearAll: async () => {
      const db     = await open();
      const stores = ['clients','cases','invoices','payments','balances','settings'];
      const tx     = db.transaction(stores, 'readwrite');
      await Promise.all(stores.map(s => _req(tx.objectStore(s).clear())));
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror    = e => rej(e.target.error);
      });
    },
  };

  // ── Public API ───────────────────────────────────────────
  return { open, clients, cases, invoices, payments, balances, settings, backup };
})();

window.DB = DB;
