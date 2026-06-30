// billing.js — דומיין החיוב (פורט מ-Lawfee db.js) מעל שכבת ה-IndexedDB של v2.
// stores: clients · cases · invoices · payments · balances · billingSettings.
// כל הכתיבות מפעילות notifyMutation → סנכרון מאוחד (Phase 4).

import * as db from './db.js';

/* ---------- מאזין מוטציות (כמו store.js) ---------- */
let mutationListener = null;
export function setMutationListener(fn) { mutationListener = fn; }
function notify() { if (mutationListener) { try { mutationListener(); } catch { /* noop */ } } }

const round2 = (n) => +(Number(n) || 0).toFixed(2);
const computeCommission = (amount, rate) => round2((Number(amount) || 0) * (Number(rate) || 0) / 100);

/* ============================================================ Clients ============================================================ */
export const clients = {
  getAll: () => db.getAll('clients'),
  get: (id) => db.get('clients', id),
  add: async (name) => {
    const id = await db.addAuto('clients', { name: String(name || '').trim(), createdAt: Date.now() });
    notify();
    return id;
  },
  update: async (record) => { const r = await db.put('clients', record); notify(); return r; },
  remove: async (id) => { await db.remove('clients', id); notify(); },
};

/* ============================================================ Cases (תיקים) ============================================================ */
export const CASE_TYPES = ['שוטף', 'ליטיגציה', 'עסקה'];

export const cases = {
  getAll: () => db.getAll('cases'),
  get: (id) => db.get('cases', id),
  getByClient: (clientId) => db.queryIndex('cases', 'clientId', clientId),
  add: async (data) => {
    const record = {
      clientId: data.clientId,
      caseNumber: String(data.caseNumber || '').trim(),
      description: String(data.description || '').trim(),
      caseType: data.caseType || 'שוטף',
      commissionRate: parseFloat(data.commissionRate) || 0,
      arrangementType: String(data.arrangementType || '').trim(),
      openDate: data.openDate || null,
      createdAt: Date.now(),
    };
    const id = await db.addAuto('cases', record);
    notify();
    return id;
  },
  update: async (record) => {
    const r = { ...record, commissionRate: parseFloat(record.commissionRate) || 0 };
    const res = await db.put('cases', r);
    notify();
    return res;
  },
  remove: async (id) => { await db.remove('cases', id); notify(); },
};

/* ============================================================ Invoices (חשבוניות) ============================================================ */
export const invoices = {
  getAll: () => db.getAll('invoices'),
  get: (id) => db.get('invoices', id),
  getByCase: (caseId) => db.queryIndex('invoices', 'caseId', caseId),
  getByYear: (year) => db.queryIndex('invoices', 'year', parseInt(year, 10)),

  add: async (data) => {
    const amount = parseFloat(data.amount) || 0;
    const commissionRate = parseFloat(data.commissionRate) || 0;
    const commission = data.commission !== undefined ? round2(data.commission) : computeCommission(amount, commissionRate);
    const record = {
      caseId: data.caseId,
      month: parseInt(data.month, 10),
      year: parseInt(data.year, 10),
      amount,
      commissionRate,
      commission,
      notes: String(data.notes || '').trim(),
      source: data.source || 'manual',
      createdAt: Date.now(),
    };
    const id = await db.addAuto('invoices', record);
    notify();
    return id;
  },

  update: async (record) => {
    const amount = parseFloat(record.amount) || 0;
    const rate = parseFloat(record.commissionRate) || 0;
    const r = { ...record, amount, commissionRate: rate, commission: computeCommission(amount, rate) };
    const res = await db.put('invoices', r);
    notify();
    return res;
  },

  remove: async (id) => { await db.remove('invoices', id); notify(); },

  totalCommissionForYear: async (year) => {
    const list = await invoices.getByYear(year);
    return list.reduce((s, inv) => s + (inv.commission || 0), 0);
  },
  totalAmountForYear: async (year) => {
    const list = await invoices.getByYear(year);
    return list.reduce((s, inv) => s + (inv.amount || 0), 0);
  },
  byMonthForYear: async (year) => {
    const list = await invoices.getByYear(year);
    const result = {};
    for (let m = 1; m <= 12; m++) result[m] = { amount: 0, commission: 0 };
    list.forEach((inv) => {
      if (!result[inv.month]) result[inv.month] = { amount: 0, commission: 0 };
      result[inv.month].amount += inv.amount || 0;
      result[inv.month].commission += inv.commission || 0;
    });
    return result;
  },
};

/* ============================================================ Payments (תשלומים) ============================================================ */
export const payments = {
  getAll: () => db.getAll('payments'),
  get: (id) => db.get('payments', id),
  getByYear: (year) => db.queryIndex('payments', 'year', parseInt(year, 10)),

  add: async (data) => {
    const record = {
      year: parseInt(data.year, 10),
      month: data.month ? parseInt(data.month, 10) : null,
      amount: parseFloat(data.amount) || 0,
      notes: String(data.notes || '').trim(),
      createdAt: Date.now(),
    };
    const id = await db.addAuto('payments', record);
    notify();
    return id;
  },
  update: async (record) => { const r = await db.put('payments', record); notify(); return r; },
  remove: async (id) => { await db.remove('payments', id); notify(); },

  totalForYear: async (year) => {
    const list = await payments.getByYear(year);
    return list.reduce((s, p) => s + (p.amount || 0), 0);
  },
  byMonthForYear: async (year) => {
    const list = await payments.getByYear(year);
    const result = {};
    list.forEach((p) => {
      const m = (p.month != null && p.month >= 1 && p.month <= 12) ? p.month : 0;
      result[m] = (result[m] || 0) + (p.amount || 0);
    });
    return result;
  },
};

/* ============================================================ Balances + Ledger ============================================================ */
export const balances = {
  get: (year) => db.get('balances', parseInt(year, 10)),
  getAll: () => db.getAll('balances'),
  set: async (year, openingBalance) => {
    const r = await db.put('balances', { year: parseInt(year, 10), openingBalance: parseFloat(openingBalance) || 0 });
    notify();
    return r;
  },
  /** closingBalance = openingBalance + totalCommissions − totalPayments */
  computeLedger: async (year) => {
    const y = parseInt(year, 10);
    const balRecord = await db.get('balances', y);
    const openingBalance = balRecord ? (balRecord.openingBalance || 0) : 0;
    const totalCommissions = await invoices.totalCommissionForYear(y);
    const totalPayments = await payments.totalForYear(y);
    const totalAmount = await invoices.totalAmountForYear(y);
    return {
      year: y,
      openingBalance: round2(openingBalance),
      totalAmount: round2(totalAmount),
      totalCommissions: round2(totalCommissions),
      totalPayments: round2(totalPayments),
      closingBalance: round2(openingBalance + totalCommissions - totalPayments),
    };
  },
};

/* ============================================================ Settings ============================================================ */
export const settings = {
  get: (key) => db.get('billingSettings', key).then((r) => (r ? r.value : null)),
  set: async (key, value) => { const r = await db.put('billingSettings', { key, value }); notify(); return r; },
  getAll: () => db.getAll('billingSettings'),
};

/** שנים שיש בהן נתונים (יורד) */
export async function getKnownYears() {
  const [invList, payList, balList] = await Promise.all([
    db.getAll('invoices'), db.getAll('payments'), db.getAll('balances'),
  ]);
  const years = new Set([
    ...invList.map((i) => i.year),
    ...payList.map((p) => p.year),
    ...balList.map((b) => b.year),
  ]);
  if (years.size === 0) years.add(new Date().getFullYear());
  return [...years].filter(Boolean).sort((a, b) => b - a);
}

/* ============================================================ גיבוי מאוחד (Phase 4) ============================================================ */
export async function collectBackupData() {
  const [clientsArr, casesArr, invArr, payArr, balArr, setArr] = await Promise.all([
    db.getAll('clients'), db.getAll('cases'), db.getAll('invoices'),
    db.getAll('payments'), db.getAll('balances'), db.getAll('billingSettings'),
  ]);
  return { clients: clientsArr, cases: casesArr, invoices: invArr, payments: payArr, balances: balArr, billingSettings: setArr };
}

export async function applyBackupData(data) {
  if (!data) return;
  await Promise.all([
    db.replaceAll('clients', data.clients),
    db.replaceAll('cases', data.cases),
    db.replaceAll('invoices', data.invoices),
    db.replaceAll('payments', data.payments),
    db.replaceAll('balances', data.balances),
    db.replaceAll('billingSettings', data.billingSettings),
  ]);
}
