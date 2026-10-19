// analysis.js — חישובי מסך האנליזה (טהור: בלי DOM ובלי DB — ניתן לבדיקה ב-node).
// השנה הנבחרת מתחילת השנה (עד החודש האחרון שיש בו נתונים) מול אותה תקופה בשנה הקודמת.

export const CASE_TYPES = ['שוטף', 'עסקה', 'ליטיגציה'];

const zeros = () => Array(12).fill(0);
const sumTo = (arr, m) => arr.slice(0, m).reduce((s, v) => s + v, 0);

/** שינוי יחסי. null = אין בסיס להשוואה (לקוח/סוג חדש) */
export const change = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) : null);

/**
 * @param {object} p
 * @param {Array} p.invoices      חשבוניות השנה הנבחרת ({ caseId, month, amount, commission })
 * @param {Array} p.prevInvoices  חשבוניות השנה הקודמת
 * @param {Array} p.payments / p.prevPayments ({ month, amount })
 * @param {Array} p.cases ({ id, clientId, caseNumber, description, caseType, commissionRate })
 * @param {Function} p.clientName (id) → שם
 * @param {Function} p.statusOf (id) → 'active' | 'oneoff' | 'ended' — לא פעילים נספרים בסכומים אך לא מתריעים
 * @param {number} p.openingBalance
 * @param {number} p.uptoFallback  חודש סיום כשאין נתונים (בד"כ החודש הנוכחי)
 */
export function analysisModel({ invoices = [], prevInvoices = [], payments = [], prevPayments = [], cases = [], clientName = String, statusOf = () => 'active', openingBalance = 0, uptoFallback = 12 }) {
  const caseById = new Map(cases.map((c) => [c.id, c]));
  // חודש הסיום: החודש האחרון שיש בו חשבונית או תשלום — כך ההשוואה לשנה הקודמת הוגנת
  const lastMonth = Math.max(0, ...invoices.map((i) => i.month || 0), ...payments.map((p) => p.month || 0));
  const upto = Math.max(1, Math.min(12, lastMonth || uptoFallback));

  const totals = { a: zeros(), c: zeros(), pa: zeros(), pc: zeros(), pay: zeros(), ppay: zeros() };
  const clients = new Map();
  const touch = (cs) => {
    if (!clients.has(cs.clientId)) clients.set(cs.clientId, { id: cs.clientId, name: clientName(cs.clientId), cases: new Map() });
    const cl = clients.get(cs.clientId);
    if (!cl.cases.has(cs.id)) cl.cases.set(cs.id, { cs, a: zeros(), c: zeros(), pa: zeros(), pc: zeros() });
    return cl.cases.get(cs.id);
  };
  const add = (list, prev) => {
    for (const inv of list) {
      const cs = caseById.get(inv.caseId);
      const m = (inv.month || 0) - 1;
      if (!cs || m < 0 || m > 11) continue;
      const row = touch(cs);
      const a = inv.amount || 0, c = inv.commission || 0;
      if (prev) { row.pa[m] += a; row.pc[m] += c; totals.pa[m] += a; totals.pc[m] += c; }
      else { row.a[m] += a; row.c[m] += c; totals.a[m] += a; totals.c[m] += c; }
    }
  };
  add(invoices, false);
  add(prevInvoices, true);
  for (const p of payments) if (p.month >= 1 && p.month <= 12) totals.pay[p.month - 1] += p.amount || 0;
  for (const p of prevPayments) if (p.month >= 1 && p.month <= 12) totals.ppay[p.month - 1] += p.amount || 0;
  const unassignedPay = payments.filter((p) => !(p.month >= 1 && p.month <= 12)).reduce((s, p) => s + (p.amount || 0), 0);

  // ---- 1. פס הפתיחה ----
  const kpi = {
    amount: sumTo(totals.a, upto), prevAmount: sumTo(totals.pa, upto),
    commission: sumTo(totals.c, upto), prevCommission: sumTo(totals.pc, upto),
    payments: sumTo(totals.pay, upto) + unassignedPay, prevPayments: sumTo(totals.ppay, upto),
  };
  kpi.rate = kpi.amount ? kpi.commission / kpi.amount : 0;
  kpi.balance = openingBalance + totals.c.reduce((s, v) => s + v, 0) - totals.pay.reduce((s, v) => s + v, 0) - unassignedPay;

  // ---- לקוחות ----
  const clientRows = [...clients.values()].map((cl) => {
    const caseRows = [...cl.cases.values()].map((r) => ({
      id: r.cs.id, caseNumber: r.cs.caseNumber || '', description: r.cs.description || '',
      caseType: r.cs.caseType || 'שוטף', rate: r.cs.commissionRate || 0,
      amount: sumTo(r.a, upto), commission: sumTo(r.c, upto), prevAmount: sumTo(r.pa, upto),
      months: r.a, monthsC: r.c,
      trail: [...r.pa.slice(upto), ...r.a.slice(0, upto)],
    })).filter((r) => r.amount || r.prevAmount);
    const months = zeros(), monthsC = zeros(), prevMonths = zeros();
    for (const r of cl.cases.values()) for (let m = 0; m < 12; m++) { months[m] += r.a[m]; monthsC[m] += r.c[m]; prevMonths[m] += r.pa[m]; }
    const amount = sumTo(months, upto), prevAmount = sumTo(prevMonths, upto);
    const last = months.slice(0, upto).reduce((L, v, m) => (v ? m + 1 : L), 0);   // 1..12, 0 = לא חויב השנה
    const prevLast = prevMonths.reduce((L, v, m) => (v ? m + 1 : L), 0);
    return {
      id: cl.id, name: cl.name, status: statusOf(cl.id),
      // חודשים מאז החיוב האחרון (בחלון השנתיים הטעון); null = לא חויב בחלון
      prevLast,
      since: last ? upto - last : prevLast ? upto + 12 - prevLast : null, cases: caseRows.sort((x, y) => y.amount - x.amount),
      amount, prevAmount, commission: sumTo(monthsC, upto), months, monthsC,
      change: change(amount, prevAmount), last,
      // 12 החודשים שמסתיימים בחודש הסיום (חלק מהשנה הקודמת + השנה)
      trail: [...prevMonths.slice(upto), ...months.slice(0, upto)],
    };
  }).filter((r) => r.amount || r.prevAmount);
  const total = clientRows.reduce((s, r) => s + r.amount, 0);
  for (const r of clientRows) r.share = total ? r.amount / total : 0;

  // ---- 3. לפי סוג תיק ----
  const types = CASE_TYPES.map((t) => {
    const rs = clientRows.flatMap((c) => c.cases).filter((r) => r.caseType === t);
    const amount = rs.reduce((s, r) => s + r.amount, 0);
    const prevAmount = rs.reduce((s, r) => s + r.prevAmount, 0);
    return { type: t, amount, prevAmount, change: change(amount, prevAmount), active: rs.filter((r) => r.amount > 0).length, share: total ? amount / total : 0 };
  });

  // ---- 4. דורש תשומת לב — פריט אחד ללקוח, החמור מביניהם. רק לקוחות פעילים ----
  const STALE = 3, JUMP = 0.5, MIN_BASE = 10000, DORMANT = 12;
  const attention = [];
  const seen = new Set();
  const push = (item) => { if (!seen.has(item.clientId)) { seen.add(item.clientId); attention.push(item); } };
  const active = clientRows.filter((r) => r.status === 'active');
  // שנה בלי חיוב → הצעה לסמן "הסתיים" (לא מסמנים לבד)
  for (const r of active) if (r.since !== null && r.since >= DORMANT) push({ kind: 'dormant', clientId: r.id, name: r.name, months: r.since, prevLast: r.prevLast });
  for (const r of active) if (r.amount > 0 && upto - r.last >= STALE) push({ kind: 'stale', clientId: r.id, name: r.name, months: upto - r.last, last: r.last });
  for (const r of active) if (r.amount === 0 && r.prevAmount >= MIN_BASE) push({ kind: 'stopped', clientId: r.id, name: r.name, prevAmount: r.prevAmount });
  for (const r of active) if (r.prevAmount >= MIN_BASE && r.change !== null && r.change <= -JUMP) push({ kind: 'down', clientId: r.id, name: r.name, change: r.change, amount: r.amount });
  for (const r of active) if (r.prevAmount >= MIN_BASE && r.change !== null && r.change >= JUMP) push({ kind: 'up', clientId: r.id, name: r.name, change: r.change, amount: r.amount });
  for (const r of active) if (!r.prevAmount && r.amount > 0) push({ kind: 'new', clientId: r.id, name: r.name, amount: r.amount });

  // ---- פירוט חודשי עם יתרה מתגלגלת ----
  let running = openingBalance;
  const ledger = [];
  for (let m = 0; m < upto; m++) {
    running += totals.c[m] - totals.pay[m];
    ledger.push({ month: m + 1, amount: totals.a[m], commission: totals.c[m], payments: totals.pay[m], balance: running });
  }

  // הכנסה מלקוחות חד-פעמיים (מול הבסיס החוזר)
  kpi.oneoff = clientRows.filter((r) => r.status === 'oneoff').reduce((s, r) => s + r.amount, 0);

  return { upto, kpi, totals, clients: clientRows, total, types, attention, ledger, openingBalance, unassignedPay };
}
