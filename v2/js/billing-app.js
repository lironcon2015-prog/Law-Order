// billing-app.js — controller + רינדור למסכי החיוב (כספים) בעיצוב Obsidian Gold.
// self-contained: state משלו, delegation עם namespace data-bil*, modal מקומי.
// מסכים: clients (לקוחות ותיקים) · invoices (חשבוניות) · payments (תשלומים) · fin-settings (הגדרות).

import * as billing from './billing.js';
import { ICONS, toast, formatCurrency, formatCompactCurrency, buildToday } from './ui.js';
import { barChart, donut } from './charts.js';
import * as importer from './importer.js';
import * as invImport from './invoice-import.js';

const MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const TYPE_TONE = { 'שוטף': 'info', 'ליטיגציה': 'neg', 'עסקה': 'plum' };

/* ---------- state ---------- */
const state = {
  year: new Date().getFullYear(),
  knownYears: [],
  clients: [],
  cases: [],
  invoices: [],   // לשנה הנבחרת
  payments: [],   // לשנה הנבחרת
  ledger: null,
  loaded: false,
  crmCtx: { contacts: [], companies: [] }, // נשמר עבור הדשבורד המאוחד
  donutMetric: 'amount',  // 'amount' (הכנסות) | 'commission' (עמלות) — דונאט בדשבורד
  cmMetric: 'amount',     // 'amount' | 'commission' — טבלת פירוט חודשי לפי לקוח
};

const MONTHS_SHORT = ['', 'ינ', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const DONUT_PALETTE = ['#f2ca50', '#86dfff', '#c084fc', '#34d399', '#f87171', '#fbbf24'];
const fmtNum = (v) => Math.round(v || 0).toLocaleString('he-IL');
const maxMonthFor = (year) => (year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);

let refs = {};
let onMutate = null; // callback ל-app (רענון/סנכרון)

/* ---------- el helper (מקומי) ---------- */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}
const icon = (name, cls = 'ic') => el('span', { class: cls, html: ICONS[name] || '' });
const num = (v) => el('span', { class: 'num', text: formatCurrency(v) });

/* ============================================================ init + data ============================================================ */
export function init(containers, appRefresh) {
  refs = containers; // { clients, invoices, payments, finSettings, analysis, dashboard }
  onMutate = appRefresh; // רענון CRM מלא (loadData+render) — מופעל אחרי ייבוא
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  setupDropZone();
}

/* ---------- Drag & Drop: זריקת מסמך חשבונית לכל מקום באפליקציה ---------- */
function setupDropZone() {
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  let overlay = null;
  let depth = 0; // מונה dragenter/leave כדי לא להבהב בין אלמנטים מקוננים
  const show = () => {
    if (overlay) return;
    overlay = el('div', { class: 'drop-overlay' }, [
      el('div', { class: 'drop-overlay__card' }, [
        icon('cloudDown', 'ic-lg'),
        el('div', { class: 'drop-overlay__title', text: 'שחרר כאן לייבוא חשבונית' }),
        el('div', { class: 'drop-overlay__sub muted', text: 'PDF · Excel · CSV — המערכת תזהה ותסווג אוטומטית' }),
      ]),
    ]);
    document.body.append(overlay);
  };
  const hide = () => { depth = 0; overlay?.remove(); overlay = null; };

  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; show(); });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth--; if (depth <= 0) hide(); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hide();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) processInvoiceFile(file);
  });
}

export async function loadData() {
  state.knownYears = await billing.getKnownYears();
  if (!state.knownYears.includes(state.year)) state.year = state.knownYears[0];
  const [clients, cases, invoices, payments, ledger] = await Promise.all([
    billing.clients.getAll(),
    billing.cases.getAll(),
    billing.invoices.getByYear(state.year),
    billing.payments.getByYear(state.year),
    billing.balances.computeLedger(state.year),
  ]);
  state.clients = clients;
  state.cases = cases;
  state.invoices = invoices;
  state.payments = payments;
  state.ledger = ledger;
  state.loaded = true;
}

async function reload(view) {
  await loadData();
  renderView(view);
}

/* ============================================================ render dispatch ============================================================ */
export async function renderView(view) {
  if (!state.loaded) await loadData();
  if (view === 'clients') renderClients(refs.clients);
  else if (view === 'invoices') renderInvoices(refs.invoices);
  else if (view === 'payments') renderPayments(refs.payments);
  else if (view === 'fin-settings') renderSettings(refs.finSettings);
  else if (view === 'analysis') renderAnalysis(refs.analysis);
  else if (view === 'dashboard') renderDashboard(refs.dashboard, state.crmCtx);
}

/** דשבורד מאוחד — נקרא מ-app.js עם הקשר ה-CRM (אנשי קשר/חברות) */
export async function renderDashboard(container, crmCtx) {
  if (crmCtx) state.crmCtx = crmCtx;
  if (!state.loaded) await loadData();
  drawDashboard(container || refs.dashboard);
}

const clientName = (id) => (state.clients.find((c) => c.id === id) || {}).name || '—';
const caseLabel = (id) => {
  const c = state.cases.find((x) => x.id === id);
  return c ? `${c.caseNumber || '—'} · ${c.description || ''}`.trim() : '—';
};
const caseRate = (id) => { const c = state.cases.find((x) => x.id === id); return c ? c.commissionRate : 0; };

/* ---------- view header ---------- */
function viewHeader(title, subtitle, actionBtn) {
  return el('div', { class: 'view-h' }, [
    el('div', {}, [el('h1', { text: title }), subtitle && el('p', { text: subtitle })]),
    actionBtn,
  ]);
}
function yearSelect() {
  const sel = el('select', { class: 'bil-year', 'data-bil-action': 'year', 'aria-label': 'שנה' });
  state.knownYears.forEach((y) => sel.append(el('option', { value: y, selected: y === state.year, text: String(y) })));
  return el('label', { class: 'bil-year-wrap' }, [icon('calendar'), sel]);
}
function typeBadge(type) {
  return el('span', { class: `bil-type bil-type--${TYPE_TONE[type] || 'info'}`, text: type || 'שוטף' });
}

/* ============================================================ מסך: לקוחות ותיקים ============================================================ */
function renderClients(container) {
  const addBtn = el('button', { class: 'btn btn--primary btn--sm', 'data-bil-action': 'new-client' }, [icon('plus'), el('span', { text: 'לקוח חדש' })]);
  const wrap = el('div', { class: 'fin-wrap' }, [viewHeader('לקוחות ותיקים', `${state.clients.length} לקוחות · ${state.cases.length} תיקים`, addBtn)]);

  if (!state.clients.length) {
    wrap.append(el('div', { class: 'fin-empty' }, [icon('users', 'ic-lg'), el('p', { text: 'אין לקוחות עדיין' }), el('button', { class: 'btn btn--ghost btn--sm', 'data-bil-action': 'new-client', text: 'הוסף לקוח ראשון' })]));
    container.replaceChildren(wrap);
    return;
  }

  const sorted = [...state.clients].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  for (const cl of sorted) {
    const cCases = state.cases.filter((x) => x.clientId === cl.id);
    const card = el('div', { class: 'fin-client' }, [
      el('div', { class: 'fin-client__head' }, [
        el('div', { class: 'fin-client__id' }, [
          el('span', { class: 'fin-client__name', text: cl.name }),
          el('span', { class: 'fin-client__sub muted', text: `${cCases.length} תיקים` }),
        ]),
        el('div', { class: 'fin-row__tools' }, [
          el('button', { class: 'icon-btn', title: 'תיק חדש', 'data-bil-action': 'new-case', 'data-client': cl.id }, [icon('plus')]),
          el('button', { class: 'icon-btn', title: 'עריכה', 'data-bil-action': 'edit-client', 'data-id': cl.id }, [icon('edit')]),
          el('button', { class: 'icon-btn icon-btn--danger', title: 'מחיקה', 'data-bil-action': 'del-client', 'data-id': cl.id }, [icon('trash')]),
        ]),
      ]),
      cCases.length
        ? el('div', { class: 'fin-cases' }, cCases.map((cs) => el('div', { class: 'fin-case' }, [
            typeBadge(cs.caseType),
            el('div', { class: 'fin-case__id' }, [
              el('span', { class: 'fin-case__num', text: cs.caseNumber || '—' }),
              cs.description && el('span', { class: 'fin-case__desc muted', text: cs.description }),
            ]),
            cs.arrangementType && el('span', { class: 'tag', text: cs.arrangementType }),
            el('span', { class: 'fin-case__rate num', text: `${cs.commissionRate}%` }),
            el('div', { class: 'fin-row__tools' }, [
              el('button', { class: 'icon-btn', title: 'עריכה', 'data-bil-action': 'edit-case', 'data-id': cs.id }, [icon('edit')]),
              el('button', { class: 'icon-btn icon-btn--danger', title: 'מחיקה', 'data-bil-action': 'del-case', 'data-id': cs.id }, [icon('trash')]),
            ]),
          ])))
        : el('div', { class: 'fin-cases-empty muted', text: 'אין תיקים — הוסף תיק' }),
    ]);
    wrap.append(card);
  }
  container.replaceChildren(wrap);
}

/* ============================================================ מסך: חשבוניות ============================================================ */
/** אזור גרירה גלוי (discoverability ל-drag&drop) — קליק פותח את בורר הקבצים */
function invDropzone() {
  const dz = el('button', { class: 'fin-dropzone', type: 'button', 'aria-label': 'גרירת חשבונית לייבוא' }, [
    icon('cloudDown'),
    el('span', { class: 'fin-dropzone__txt', html: '<strong>גרור לכאן חשבונית</strong> — PDF · Excel · CSV, או לחץ לבחירת קובץ' }),
  ]);
  dz.addEventListener('click', () => document.getElementById('fin-inv-file')?.click());
  return dz;
}

function renderInvoices(container) {
  const addBtn = el('button', { class: 'btn btn--primary btn--sm', 'data-bil-action': 'new-invoice' }, [icon('plus'), el('span', { text: 'חשבונית חדשה' })]);
  const importBtn = el('label', { class: 'btn btn--ghost btn--sm', title: 'ייבוא חשבוניות מקובץ PDF / Excel / CSV — המערכת מזהה ומסווגת אוטומטית' }, [
    icon('cloudDown'), el('span', { text: 'ייבוא מקובץ' }),
    el('input', { id: 'fin-inv-file', type: 'file', accept: '.pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv', hidden: true }),
  ]);
  const wrap = el('div', { class: 'fin-wrap' }, [
    viewHeader('חשבוניות', null, el('div', { class: 'view-h__tools' }, [yearSelect(), importBtn, addBtn])),
  ]);

  const list = [...state.invoices].sort((a, b) => (b.month - a.month) || (b.createdAt - a.createdAt));
  const totalAmount = list.reduce((s, i) => s + (i.amount || 0), 0);
  const totalComm = list.reduce((s, i) => s + (i.commission || 0), 0);

  wrap.append(el('div', { class: 'fin-kpis' }, [
    kpiSmall('סה״כ חיובים', totalAmount),
    kpiSmall('עמלות שנצברו', totalComm, 'accent'),
    kpiSmall('חשבוניות', list.length, 'plain'),
  ]));

  wrap.append(invDropzone());

  if (!list.length) {
    wrap.append(el('div', { class: 'fin-empty' }, [icon('receipt', 'ic-lg'), el('p', { text: `אין חשבוניות לשנת ${state.year}` })]));
    container.replaceChildren(wrap);
    return;
  }

  const head = ['חודש', 'תיק / לקוח', 'סכום', 'עמלה %', 'עמלה', ''];
  const rows = list.map((inv) => {
    const cs = state.cases.find((x) => x.id === inv.caseId);
    return el('tr', {}, [
      el('td', { text: MONTHS[inv.month] || '—' }),
      el('td', {}, [el('div', { class: 'fin-cell-2' }, [
        el('span', { text: cs ? (cs.caseNumber || '—') : '—' }),
        el('span', { class: 'muted', text: cs ? clientName(cs.clientId) : '' }),
      ])]),
      el('td', { class: 'num', text: formatCurrency(inv.amount) }),
      el('td', { class: 'num muted', text: `${inv.commissionRate}%` }),
      el('td', { class: 'num accent', text: formatCurrency(inv.commission) }),
      el('td', { class: 'fin-td-tools' }, [
        el('button', { class: 'icon-btn', title: 'עריכה', 'data-bil-action': 'edit-invoice', 'data-id': inv.id }, [icon('edit')]),
        el('button', { class: 'icon-btn icon-btn--danger', title: 'מחיקה', 'data-bil-action': 'del-invoice', 'data-id': inv.id }, [icon('trash')]),
      ]),
    ]);
  });
  const foot = el('tr', { class: 'fin-table__total' }, [
    el('td', { text: 'סה״כ' }), el('td', {}),
    el('td', { class: 'num', text: formatCurrency(totalAmount) }), el('td', {}),
    el('td', { class: 'num accent', text: formatCurrency(totalComm) }), el('td', {}),
  ]);
  wrap.append(finTable(head, rows, foot));
  container.replaceChildren(wrap);
}

/* ============================================================ מסך: תשלומים ============================================================ */
function renderPayments(container) {
  const addBtn = el('button', { class: 'btn btn--primary btn--sm', 'data-bil-action': 'new-payment' }, [icon('plus'), el('span', { text: 'תשלום חדש' })]);
  const wrap = el('div', { class: 'fin-wrap' }, [
    viewHeader('תשלומים', null, el('div', { class: 'view-h__tools' }, [yearSelect(), addBtn])),
  ]);

  const list = [...state.payments].sort((a, b) => ((b.month || 0) - (a.month || 0)) || (b.createdAt - a.createdAt));
  const total = list.reduce((s, p) => s + (p.amount || 0), 0);

  wrap.append(el('div', { class: 'fin-kpis' }, [
    kpiSmall('תשלומים שהתקבלו', total, 'pos'),
    kpiSmall('מספר תשלומים', list.length, 'plain'),
  ]));

  if (!list.length) {
    wrap.append(el('div', { class: 'fin-empty' }, [icon('wallet', 'ic-lg'), el('p', { text: `אין תשלומים לשנת ${state.year}` })]));
    container.replaceChildren(wrap);
    return;
  }

  const head = ['חודש', 'הערה', 'סכום', ''];
  const rows = list.map((p) => el('tr', {}, [
    el('td', { text: p.month ? MONTHS[p.month] : '—' }),
    el('td', { class: 'muted', text: p.notes || '—' }),
    el('td', { class: 'num pos', text: formatCurrency(p.amount) }),
    el('td', { class: 'fin-td-tools' }, [
      el('button', { class: 'icon-btn', title: 'עריכה', 'data-bil-action': 'edit-payment', 'data-id': p.id }, [icon('edit')]),
      el('button', { class: 'icon-btn icon-btn--danger', title: 'מחיקה', 'data-bil-action': 'del-payment', 'data-id': p.id }, [icon('trash')]),
    ]),
  ]));
  const foot = el('tr', { class: 'fin-table__total' }, [
    el('td', { text: 'סה״כ' }), el('td', {}),
    el('td', { class: 'num pos', text: formatCurrency(total) }), el('td', {}),
  ]);
  wrap.append(finTable(head, rows, foot));
  container.replaceChildren(wrap);
}

/* ============================================================ מסך: הגדרות (יתרת פתיחה + ledger) ============================================================ */
function renderSettings(container) {
  const L = state.ledger || {};
  const wrap = el('div', { class: 'fin-wrap' }, [
    viewHeader('הגדרות כספים', null, yearSelect()),
    el('div', { class: 'panel fin-settings' }, [
      el('div', { class: 'panel__title' }, [icon('calendar'), el('h3', { text: `יתרת פתיחה — ${state.year}` })]),
      el('div', { class: 'fin-balance-row' }, [
        el('input', { class: 'input num', id: 'fin-opening', type: 'number', step: '0.01', value: L.openingBalance ?? 0, 'aria-label': 'יתרת פתיחה' }),
        el('button', { class: 'btn btn--primary btn--sm', 'data-bil-action': 'save-opening' }, [icon('check'), el('span', { text: 'שמירה' })]),
      ]),
      el('p', { class: 'muted fin-hint', text: 'יתרה לתשלום = יתרת פתיחה + עמלות שנצברו − תשלומים שהתקבלו.' }),
    ]),
    el('div', { class: 'panel fin-ledger' }, [
      el('div', { class: 'panel__title' }, [icon('scale'), el('h3', { text: 'מאזן שנתי' })]),
      ledgerRow('יתרת פתיחה', L.openingBalance),
      ledgerRow('עמלות שנצברו', L.totalCommissions, 'accent'),
      ledgerRow('תשלומים שהתקבלו', L.totalPayments, 'pos'),
      ledgerRow('יתרה לתשלום', L.closingBalance, 'total'),
    ]),
    el('div', { class: 'panel' }, [
      el('div', { class: 'panel__title' }, [icon('cloud'), el('h3', { text: 'ייבוא וייצוא נתונים' })]),
      el('p', { class: 'muted fin-hint', text: 'ייבא גיבוי קיים — CRM (אנשי קשר/חברות) או חיוב (לקוחות/חשבוניות). האפליקציה מזהה את הפורמט אוטומטית ומחליפה את אותו דומיין בלבד, כך שאפשר לייבא את שני הגיבויים. ייצוא יוצר קובץ גיבוי מאוחד יחיד.' }),
      el('div', { class: 'fin-io-row' }, [
        el('label', { class: 'btn btn--ghost btn--sm' }, [icon('cloudDown'), el('span', { text: 'ייבוא גיבוי' }), el('input', { id: 'fin-import', type: 'file', accept: 'application/json,.json', hidden: true })]),
        el('button', { class: 'btn btn--ghost btn--sm', 'data-bil-action': 'export-backup' }, [icon('cloudUp'), el('span', { text: 'ייצוא גיבוי מאוחד' })]),
      ]),
    ]),
  ]);
  container.replaceChildren(wrap);
}
function ledgerRow(label, val, tone) {
  return el('div', { class: `fin-ledger__row${tone === 'total' ? ' fin-ledger__row--total' : ''}` }, [
    el('span', { text: label }),
    el('span', { class: `num ${tone === 'accent' ? 'accent' : tone === 'pos' ? 'pos' : ''}`, text: formatCurrency(val) }),
  ]);
}

/* ============================================================ דשבורד מאוחד ============================================================ */
const TYPE_COLOR = { 'שוטף': '#7dd3fc', 'ליטיגציה': '#f87171', 'עסקה': '#c084fc' };

function monthlySeries() {
  const comm = Array(12).fill(0);
  const pay = Array(12).fill(0);
  state.invoices.forEach((inv) => { if (inv.month >= 1 && inv.month <= 12) comm[inv.month - 1] += inv.commission || 0; });
  state.payments.forEach((p) => { if (p.month >= 1 && p.month <= 12) pay[p.month - 1] += p.amount || 0; });
  return { comm, pay };
}
/** פילוח לפי לקוח (top-5 + "אחרים"), לפי המטריקה הנבחרת */
function clientSegments(metric) {
  const byClient = {};
  state.invoices.forEach((inv) => {
    const cs = state.cases.find((c) => c.id === inv.caseId);
    if (!cs) return;
    byClient[cs.clientId] = (byClient[cs.clientId] || 0) + (metric === 'commission' ? (inv.commission || 0) : (inv.amount || 0));
  });
  let rows = Object.entries(byClient)
    .map(([cid, v]) => ({ name: clientName(parseInt(cid, 10)), val: v }))
    .filter((r) => r.val > 0)
    .sort((a, b) => b.val - a.val);
  if (rows.length > 5) {
    const rest = rows.slice(5);
    rows = [...rows.slice(0, 5), { name: `${rest.length} אחרים`, val: rest.reduce((s, r) => s + r.val, 0) }];
  }
  return rows.map((r, i) => ({ label: r.name, value: r.val, color: DONUT_PALETTE[i] || '#9ca3af' }));
}

function donutPanel() {
  const metric = state.donutMetric;
  const segs = clientSegments(metric);
  const total = segs.reduce((s, x) => s + x.value, 0);
  const title = metric === 'commission' ? 'פילוח עמלות לפי לקוח' : 'פילוח הכנסות לפי לקוח';
  const toggle = el('button', { class: 'btn btn--ghost btn--sm panel__toggle', 'data-bil-action': 'toggle-donut', text: metric === 'commission' ? 'הצג הכנסות' : 'הצג עמלות' });
  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__title' }, [icon('coins'), el('h3', { text: title }), toggle]),
    segs.length
      ? donut({ segments: segs, centerLabel: 'סה״כ', centerValue: formatCompactCurrency(total) || '₪0' })
      : el('div', { class: 'fin-empty', text: `אין נתונים לשנת ${state.year}` }),
  ]);
}

function drawDashboard(container) {
  const L = state.ledger || {};
  const { comm, pay } = monthlySeries();
  const monthLabels = ['ינ', 'פב', 'מר', 'אפ', 'מא', 'יו', 'יל', 'אג', 'ספ', 'אק', 'נו', 'דצ'];

  const hero = el('div', { class: 'dash-hero' }, [
    el('div', { class: 'dash-hero__top' }, [
      el('span', { class: 'dash-hero__brand', text: 'LexLedger' }),
      el('span', { class: 'dash-hero__label', text: `הכנסה כוללת · ${state.year}` }),
    ]),
    el('div', { class: 'dash-hero__val num', text: formatCurrency(L.totalAmount) }),
  ]);

  // סדר לוגי לפי זרימת המאזן: פתיחה → עמלות → תשלומים → יתרה לתשלום
  const kpis = el('div', { class: 'fin-kpis dash-kpis' }, [
    kpiSmall('יתרת פתיחה', L.openingBalance),
    kpiSmall('עמלות שנצברו', L.totalCommissions, 'accent'),
    kpiSmall('תשלומים שהתקבלו', L.totalPayments, 'pos'),
    kpiSmall('יתרה לתשלום', L.closingBalance, 'total'),
  ]);

  const charts = el('div', { class: 'dash-charts' }, [
    el('div', { class: 'panel' }, [
      el('div', { class: 'panel__title' }, [icon('trending'), el('h3', { text: 'תזרים חודשי' })]),
      barChart({ labels: monthLabels, series: [
        { name: 'עמלות', color: '#f2ca50', values: comm },
        { name: 'תשלומים', color: '#34d399', values: pay },
      ] }),
    ]),
    donutPanel(),
  ]);

  const todaySection = el('div', { class: 'dash-today' }, [
    el('div', { class: 'panel__title dash-section-h' }, [icon('zap'), el('h3', { text: 'היום — פעולות פתוחות' })]),
    buildToday(state.crmCtx.contacts, state.crmCtx.companies),
  ]);

  const wrap = el('div', { class: 'fin-wrap dash-wrap' }, [
    el('div', { class: 'view-h' }, [
      el('div', {}, [el('h1', { text: 'לוח בקרה' }), el('p', { text: 'סקירה מאוחדת — כספים ופיתוח עסקי' })]),
      yearSelect(),
    ]),
    hero, kpis, charts, todaySection,
  ]);
  container.replaceChildren(wrap);
}

/* ============================================================ אנליזה — בדיוק כמו עמוד הבית של Lawfee ============================================================ */
const expName = (name, cid, scope) => el('span', { class: 'exp-name' }, [el('span', { class: 'chevron', html: ICONS.back }), name]);
const caseMap = () => Object.fromEntries(state.cases.map((c) => [c.id, c]));

function renderAnalysis(container) {
  const wrap = el('div', { class: 'fin-wrap' }, [
    el('div', { class: 'view-h' }, [
      el('div', {}, [el('h1', { text: 'אנליזה' }), el('p', { text: 'פירוט חשבוניות, לקוחות ותיקים' })]),
      yearSelect(),
    ]),
  ]);

  if (!state.invoices.length) {
    wrap.append(el('div', { class: 'fin-empty' }, [icon('receipt', 'ic-lg'), el('p', { text: `אין נתוני חשבוניות לשנת ${state.year}` })]));
    container.replaceChildren(wrap);
    return;
  }

  wrap.append(el('div', { class: 'panel-h', text: 'פירוט חודשי' }), monthlyBreakdownTable());
  wrap.append(el('div', { class: 'panel-h', text: 'פירוט לפי לקוח' }), clientBreakdownTable());
  wrap.append(clientMonthlyHeader(), clientMonthlyTable());
  container.replaceChildren(wrap);
}

/* —— טבלה 1: פירוט חודשי (יתרה מתגלגלת) —— */
function monthlyBreakdownTable() {
  const L = state.ledger || {};
  const invM = {}, payM = {};
  state.invoices.forEach((i) => { invM[i.month] = invM[i.month] || { a: 0, c: 0 }; invM[i.month].a += i.amount || 0; invM[i.month].c += i.commission || 0; });
  state.payments.forEach((p) => { const m = (p.month >= 1 && p.month <= 12) ? p.month : 0; payM[m] = (payM[m] || 0) + (p.amount || 0); });

  const maxM = maxMonthFor(state.year);
  let running = L.openingBalance || 0, tA = 0, tC = 0, tP = 0;
  const rows = [];
  for (let m = 1; m <= maxM; m++) {
    const inv = invM[m] || { a: 0, c: 0 }; const pay = payM[m] || 0;
    running += inv.c - pay; tA += inv.a; tC += inv.c; tP += pay;
    const has = inv.a > 0 || pay > 0;
    rows.push(el('tr', { class: has ? '' : 'row-dim' }, [
      el('td', { text: MONTHS[m] }),
      el('td', { class: 'num', text: inv.a ? fmtNum(inv.a) : '—' }),
      el('td', { class: 'num accent', text: inv.c ? fmtNum(inv.c) : '—' }),
      el('td', { class: 'num pos', text: pay ? fmtNum(pay) : '—' }),
      el('td', { class: `num ${running < 0 ? 'neg' : ''}`, text: fmtNum(running) }),
    ]));
  }
  if (payM[0]) { running -= payM[0]; tP += payM[0];
    rows.push(el('tr', { class: 'row-dim' }, [el('td', { text: 'ללא חודש' }), el('td', { class: 'num', text: '—' }), el('td', { class: 'num', text: '—' }), el('td', { class: 'num pos', text: fmtNum(payM[0]) }), el('td', { class: 'num', text: fmtNum(running) })]));
  }
  const foot = el('tr', { class: 'fin-table__total' }, [
    el('td', { text: 'סה״כ' }),
    el('td', { class: 'num', text: fmtNum(tA) }),
    el('td', { class: 'num accent', text: fmtNum(tC) }),
    el('td', { class: 'num pos', text: fmtNum(tP) }),
    el('td', { class: 'num', text: fmtNum(L.closingBalance) }),
  ]);
  return finTable(['חודש', 'הכנסות', 'עמלות', 'תשלומים', 'יתרה'], rows, foot);
}

/* —— טבלה 2: פירוט לפי לקוח (נפתח לתיקים) —— */
function clientBreakdownTable() {
  const cm = caseMap();
  const byCase = {};
  state.invoices.forEach((inv) => { byCase[inv.caseId] = byCase[inv.caseId] || { a: 0, c: 0 }; byCase[inv.caseId].a += inv.amount || 0; byCase[inv.caseId].c += inv.commission || 0; });
  const byClient = {};
  Object.entries(byCase).forEach(([cid, agg]) => {
    const cs = cm[cid]; if (!cs) return;
    const k = cs.clientId;
    byClient[k] = byClient[k] || { a: 0, c: 0, cases: [] };
    byClient[k].a += agg.a; byClient[k].c += agg.c; byClient[k].cases.push({ ...agg, cs });
  });
  const sorted = Object.entries(byClient).sort((a, b) => b[1].c - a[1].c);

  let tA = 0, tC = 0; const rows = [];
  sorted.forEach(([cid, data]) => {
    tA += data.a; tC += data.c;
    data.cases.sort((a, b) => b.c - a.c);
    rows.push(el('tr', { class: 'client-row', 'data-bil-action': 'exp-client', dataset: { cid, scope: 'cb' } }, [
      el('td', {}, [expName(clientName(parseInt(cid, 10)))]),
      el('td', { class: 'muted', text: `${data.cases.length} תיקים` }),
      el('td', { class: 'num muted', text: '—' }),
      el('td', { class: 'num', text: fmtNum(data.a) }),
      el('td', { class: 'num accent', text: fmtNum(data.c) }),
      el('td', { class: 'ta-c muted', text: '—' }),
    ]));
    data.cases.forEach((r) => {
      const c = r.cs;
      rows.push(el('tr', { class: 'case-row', hidden: true, dataset: { parent: `cb-${cid}` } }, [
        el('td', {}),
        el('td', {}, [el('span', { class: 'case-num', text: c.caseNumber || '—' }), c.description && c.description !== c.caseNumber ? el('span', { class: 'muted', text: ' ' + c.description }) : null]),
        el('td', { class: 'num muted', text: `${c.commissionRate}%` }),
        el('td', { class: 'num', text: fmtNum(r.a) }),
        el('td', { class: 'num accent', text: fmtNum(r.c) }),
        el('td', { class: 'ta-c' }, [el('span', { class: `bil-type bil-type--${TYPE_TONE[c.caseType] || 'info'}`, text: c.caseType })]),
      ]));
    });
  });
  const foot = el('tr', { class: 'fin-table__total' }, [
    el('td', { colspan: '3', text: 'סה״כ' }),
    el('td', { class: 'num', text: fmtNum(tA) }),
    el('td', { class: 'num accent', text: fmtNum(tC) }),
    el('td', {}),
  ]);
  return finTable(['לקוח / תיק', 'תיקים', 'אחוז', 'הכנסות', 'עמלות', 'סטטוס'], rows, foot);
}

/* —— טבלה 3: פירוט חודשי לפי לקוח (pivot, נפתח, מתג מטריקה) —— */
function clientMonthlyHeader() {
  return el('div', { class: 'panel-h panel-h--row' }, [
    el('span', { text: 'פירוט חודשי לפי לקוח' }),
    el('button', { class: 'btn btn--ghost btn--sm', 'data-bil-action': 'toggle-cm', text: state.cmMetric === 'commission' ? 'הצג הכנסות' : 'הצג עמלות' }),
  ]);
}
function clientMonthlyTable() {
  const cm = caseMap();
  const metric = state.cmMetric === 'commission' ? 'c' : 'a';
  const maxM = maxMonthFor(state.year);
  const clients = {};
  state.invoices.forEach((inv) => {
    const cs = cm[inv.caseId]; if (!cs) return;
    const k = cs.clientId;
    clients[k] = clients[k] || { months: {}, cases: {} };
    clients[k].months[inv.month] = clients[k].months[inv.month] || { a: 0, c: 0 };
    clients[k].months[inv.month].a += inv.amount || 0; clients[k].months[inv.month].c += inv.commission || 0;
    clients[k].cases[inv.caseId] = clients[k].cases[inv.caseId] || { months: {}, cs };
    clients[k].cases[inv.caseId].months[inv.month] = clients[k].cases[inv.caseId].months[inv.month] || { a: 0, c: 0 };
    clients[k].cases[inv.caseId].months[inv.month].a += inv.amount || 0; clients[k].cases[inv.caseId].months[inv.month].c += inv.commission || 0;
  });
  const sortedIds = Object.keys(clients).sort((a, b) => clientName(parseInt(a, 10)).localeCompare(clientName(parseInt(b, 10)), 'he'));

  const monthCells = (months) => {
    let total = 0; const cells = [];
    for (let m = 1; m <= maxM; m++) { const v = (months[m] || {})[metric] || 0; total += v; cells.push(el('td', { class: `num ${v ? '' : 'muted'}`, text: v ? fmtNum(v) : '—' })); }
    return { cells, total };
  };

  const monthTotals = {}; let grand = 0; const rows = [];
  sortedIds.forEach((cid) => {
    const data = clients[cid];
    const { cells, total } = monthCells(data.months);
    for (let m = 1; m <= maxM; m++) monthTotals[m] = (monthTotals[m] || 0) + ((data.months[m] || {})[metric] || 0);
    grand += total;
    rows.push(el('tr', { class: 'client-row', 'data-bil-action': 'exp-client', dataset: { cid, scope: 'cm' } }, [
      el('td', { class: 'nowrap' }, [expName(clientName(parseInt(cid, 10)))]),
      ...cells,
      el('td', { class: `num ${metric === 'c' ? 'accent' : ''}`, text: fmtNum(total) }),
    ]));
    Object.keys(data.cases).sort((a, b) => (data.cases[a].cs.caseNumber || '').localeCompare(data.cases[b].cs.caseNumber || '')).forEach((caseId) => {
      const cd = data.cases[caseId]; const c = cd.cs;
      const { cells: ccells, total: ctotal } = monthCells(cd.months);
      rows.push(el('tr', { class: 'case-row', hidden: true, dataset: { parent: `cm-${cid}` } }, [
        el('td', { class: 'nowrap' }, [el('span', { class: 'case-num', text: (c.caseNumber || '—') + (c.description && c.description !== c.caseNumber ? ' — ' + c.description : '') })]),
        ...ccells,
        el('td', { class: 'num muted', text: fmtNum(ctotal) }),
      ]));
    });
  });
  const totalCells = []; for (let m = 1; m <= maxM; m++) { const v = monthTotals[m] || 0; totalCells.push(el('td', { class: 'num', text: v ? fmtNum(v) : '—' })); }
  const foot = el('tr', { class: 'fin-table__total' }, [el('td', { text: 'סה״כ חודשי' }), ...totalCells, el('td', { class: `num ${metric === 'c' ? 'accent' : ''}`, text: fmtNum(grand) })]);

  // כותרת עמודת התווית ללא class num (נשארת RTL כמו תאיה); עמודות החודשים והסה״כ מיושרות לימין כמספרים
  const monthHeads = Array.from({ length: maxM }, (_, i) => MONTHS_SHORT[i + 1]);
  const headRow = el('tr', {}, [
    el('th', { text: 'לקוח / תיק' }),
    ...monthHeads.map((h) => el('th', { class: 'num', text: h })),
    el('th', { class: 'num', text: 'סה״כ' }),
  ]);
  const thead = el('thead', {}, [headRow]);
  return el('div', { class: 'fin-table-wrap fin-table-wrap--scroll' }, [el('table', { class: 'fin-table fin-table--pivot' }, [thead, el('tbody', {}, rows), el('tfoot', {}, [foot])])]);
}

/* ---------- shared widgets ---------- */
function kpiSmall(label, value, tone) {
  const isCurrency = tone !== 'plain';
  const valTone = tone === 'accent' || tone === 'total' ? 'accent' : tone === 'pos' ? 'pos' : '';
  return el('div', { class: `fin-kpi${tone === 'total' ? ' fin-kpi--hl' : ''}` }, [
    el('span', { class: 'fin-kpi__label', text: label }),
    el('span', { class: `fin-kpi__val num ${valTone}`, text: isCurrency ? formatCurrency(value) : String(value) }),
  ]);
}
function finTable(headCells, rows, footRow) {
  const thead = el('thead', {}, [el('tr', {}, headCells.map((h) => el('th', { text: h })))]);
  const tbody = el('tbody', {}, rows);
  const tfoot = footRow ? el('tfoot', {}, [footRow]) : null;
  return el('div', { class: 'fin-table-wrap' }, [el('table', { class: 'fin-table' }, [thead, tbody, tfoot].filter(Boolean))]);
}

/* ============================================================ events ============================================================ */
function currentView() {
  const b = document.body.classList;
  if (b.contains('view-clients')) return 'clients';
  if (b.contains('view-invoices')) return 'invoices';
  if (b.contains('view-payments')) return 'payments';
  if (b.contains('view-fin-settings')) return 'fin-settings';
  if (b.contains('view-analysis')) return 'analysis';
  if (b.contains('view-today')) return 'dashboard';
  return null;
}

async function onChange(e) {
  if (e.target.id === 'fin-import') { handleImport(e.target); return; }
  if (e.target.id === 'fin-inv-file') { handleInvoiceFile(e.target); return; }
  const t = e.target.closest('[data-bil-action="year"]');
  if (!t) return;
  state.year = parseInt(t.value, 10);
  await reload(currentView());
}

/* ---------- ייבוא / ייצוא ---------- */
async function handleImport(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = ''; // לאפשר ייבוא חוזר של אותו קובץ
  if (!file) return;
  let data;
  try { data = await importer.readJsonFile(file); } catch { toast('קובץ JSON לא תקין', 'alert'); return; }
  const fmt = importer.detectFormat(data);
  if (!fmt) { toast('פורמט גיבוי לא מזוהה', 'alert'); return; }
  if (!confirm(`זוהה: ${importer.describeFormat(fmt)}\n${importer.summarize(data, fmt)}\n\nהייבוא יחליף את הנתונים הקיימים בדומיין זה. להמשיך?`)) return;
  try {
    await importer.applyImport(data, fmt);
    await loadData();
    if (onMutate) await onMutate(); // רענון CRM + render
    renderView(currentView() || 'fin-settings');
    toast('הנתונים יובאו בהצלחה');
  } catch (err) { console.error(err); toast('הייבוא נכשל', 'alert'); }
}

/* ---------- ייבוא חשבוניות מקובץ (PDF / Excel / CSV) ---------- */
async function handleInvoiceFile(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = '';
  if (file) processInvoiceFile(file);
}

/** פענוח קובץ (מ-input או מ-drag&drop) → מסך סיווג. משותף לשני מסלולי הקלט. */
async function processInvoiceFile(file) {
  if (!state.loaded) await loadData();
  const kind = invImport.detectKind(file);
  if (!kind) { toast('סוג קובץ לא נתמך — PDF, Excel או CSV בלבד', 'alert'); return; }
  toast('מפענח את הקובץ…');
  let result;
  try {
    result = await invImport.parseFile(file, { clients: state.clients, cases: state.cases, defaultYear: state.year });
  } catch (err) {
    console.error(err);
    toast(err.message || 'פענוח הקובץ נכשל', 'alert');
    return;
  }
  if (!result.candidates.length) {
    toast('לא זוהו חשבוניות בקובץ — ודא שיש בו סכום או שורת סה״כ', 'alert');
    return;
  }
  // סימון כפולות מול כל החשבוניות הקיימות (לא רק השנה הנבחרת)
  const existing = await billing.invoices.getAll();
  for (const c of result.candidates) {
    c.duplicate = existing.some((inv) => inv.caseId === c.caseId && inv.month === c.month && inv.year === c.year && inv.amount === c.amount);
    if (c.duplicate) c.include = false;
  }
  reviewImportModal(result, file.name);
}

const NEW_CLIENT = '__new__';   // צור לקוח חדש + תיק
const NEW_CASE = '__newcase__'; // צור תיק חדש אצל לקוח קיים

/** מסך סיווג: טבלת מועמדים לעריכה/אישור לפני שמירה */
function reviewImportModal(result, fileName) {
  const existingOpts = state.cases.map((c) => ({ value: c.id, label: `${c.caseNumber || '—'} · ${clientName(c.clientId)}` }));
  const kindLabel = result.kind === 'pdf' ? 'PDF' : 'Excel';
  const needCase = result.candidates.filter((c) => !c.caseId).length;

  const rows = result.candidates.map((c, i) => {
    const isNewClient = c.clientGuess && !c.clientExists;                  // לקוח שלא במערכת → הקמה
    const isNewCase = c.clientExists && !c.caseId && c.clientId != null;   // לקוח קיים, תיק לא זוהה → תיק חדש
    const caseOpts = [];
    if (isNewClient) caseOpts.push({ value: NEW_CLIENT, label: `➕ צור לקוח: ${c.clientGuess}${c.caseNumber ? ` · תיק ${c.caseNumber}` : ''}` });
    if (isNewCase) caseOpts.push({ value: NEW_CASE, label: `➕ צור תיק ${c.caseNumber || 'חדש'} · ${c.clientGuess}` });
    caseOpts.push({ value: '', label: '— בחר תיק קיים —' }, ...existingOpts);
    const defaultVal = c.caseId ?? (isNewClient ? NEW_CLIENT : (isNewCase ? NEW_CASE : ''));
    const caseSel = selectEl(`imp-case-${i}`, caseOpts, defaultVal, { class: 'select imp-in' });

    // שדה מספר תיק — לעריכה/השלמה כשמקימים תיק חדש
    const caseNoWrap = el('label', { class: 'imp-caseno' }, [
      el('span', { class: 'imp-caseno__lbl muted', text: 'מס׳ תיק' }),
      input(`imp-caseno-${i}`, { value: c.caseNumber || '', placeholder: '—', class: 'input imp-in imp-in--sm' }),
    ]);
    const creating = (v) => v === NEW_CLIENT || v === NEW_CASE;
    caseNoWrap.style.display = creating(defaultVal) ? '' : 'none';

    const rateIn = input(`imp-rate-${i}`, { type: 'number', step: '0.5', min: '0', max: '100', value: c.rate, class: 'input imp-in imp-in--sm num' });
    caseSel.addEventListener('change', () => {
      caseNoWrap.style.display = creating(caseSel.value) ? '' : 'none';
      const cs = state.cases.find((x) => x.id === parseInt(caseSel.value, 10));
      if (cs) rateIn.value = cs.commissionRate;
    });
    const badge = c.duplicate
      ? el('span', { class: 'imp-badge imp-badge--dup', text: 'כפולה?' })
      : el('span', { class: `imp-badge imp-badge--${c.confidence}`, text: c.confidence === 'high' ? 'זוהה' : c.confidence === 'medium' ? 'חלקי' : 'לבדיקה' });
    // תת-שורת "זוהה": לקוח · מספר תיק · שם תיק · מזהה חיצוני
    const detected = [
      c.clientGuess && `לקוח: ${c.clientGuess}`,
      c.caseNumber && `תיק: ${c.caseNumber}`,
      c.caseName && `שם: ${c.caseName}`,
      c.externalClientId && `מזהה ${c.externalClientId}`,
    ].filter(Boolean).join(' · ');
    return el('tr', {}, [
      el('td', {}, [el('input', { id: `imp-inc-${i}`, type: 'checkbox', checked: c.include || null })]),
      el('td', {}, [caseSel, caseNoWrap, detected ? el('div', { class: 'muted imp-guess', text: `זוהה — ${detected}` }) : null]),
      el('td', {}, [selectEl(`imp-month-${i}`, monthOptions(), c.month || new Date().getMonth() + 1, { class: 'select imp-in imp-in--sm' })]),
      el('td', {}, [input(`imp-year-${i}`, { type: 'number', value: c.year, class: 'input imp-in imp-in--sm num' })]),
      el('td', {}, [input(`imp-amount-${i}`, { type: 'number', step: '0.01', min: '0', value: c.amount, class: 'input imp-in num' })]),
      el('td', {}, [rateIn]),
      el('td', {}, [input(`imp-notes-${i}`, { value: c.notes, class: 'input imp-in' })]),
      el('td', {}, [badge]),
    ]);
  });

  const body = el('div', { class: 'imp-review' }, [
    el('p', { class: 'muted imp-summary', text: `זוהו ${result.candidates.length} חשבוניות בקובץ ${kindLabel} (${fileName}). כל שדה ניתן לעריכה. סכום ברירת המחדל = לפני מע״מ (בסיס העמלה).` + (needCase ? ` שורות של לקוח/תיק שאינו במערכת יוקמו אוטומטית לפי מספר התיק שזוהה.` : '') }),
    el('div', { class: 'fin-table-wrap fin-table-wrap--scroll' }, [
      el('table', { class: 'fin-table imp-table' }, [
        el('thead', {}, [el('tr', {}, ['', 'תיק / לקוח', 'חודש', 'שנה', 'סכום', 'עמלה %', 'הערה', 'סטטוס'].map((h) => el('th', { text: h })))]),
        el('tbody', {}, rows),
      ]),
    ]),
  ]);

  openModal('סיווג חשבוניות מהקובץ', body, async () => {
    let added = 0, skipped = 0;
    const clientIdByName = new Map();  // שם לקוח חדש → clientId (הקמה חד-פעמית)
    const caseIdByKey = new Map();     // clientId|מס׳תיק → caseId (הקמה חד-פעמית)
    const getCaseNo = (i) => document.getElementById(`imp-caseno-${i}`).value.trim();
    const makeCase = async (clientId, caseNo, c, rate) => {
      const key = `${clientId}|${caseNo}`;
      if (caseIdByKey.has(key)) return caseIdByKey.get(key);
      const id = await billing.cases.add({ clientId, caseNumber: caseNo, description: c.caseName || '', caseType: c.caseType || 'שוטף', commissionRate: rate });
      caseIdByKey.set(key, id);
      return id;
    };
    for (let i = 0; i < result.candidates.length; i++) {
      if (!document.getElementById(`imp-inc-${i}`)?.checked) continue;
      const c = result.candidates[i];
      const selVal = document.getElementById(`imp-case-${i}`).value;
      const amount = parseFloat(document.getElementById(`imp-amount-${i}`).value);
      const rate = document.getElementById(`imp-rate-${i}`).value;
      if (!(amount > 0)) { skipped++; continue; }

      let caseId;
      if (selVal === NEW_CLIENT && c.clientGuess) {
        const name = c.clientGuess.trim();
        let clientId = clientIdByName.get(name);
        if (clientId == null) { clientId = await billing.clients.add(name); clientIdByName.set(name, clientId); }
        caseId = await makeCase(clientId, getCaseNo(i), c, rate);
      } else if (selVal === NEW_CASE && c.clientId != null) {
        caseId = await makeCase(c.clientId, getCaseNo(i), c, rate);
      } else {
        caseId = parseInt(selVal, 10);
      }
      if (!caseId) { skipped++; continue; }

      await billing.invoices.add({
        caseId,
        month: document.getElementById(`imp-month-${i}`).value,
        year: document.getElementById(`imp-year-${i}`).value,
        amount,
        commissionRate: rate,
        notes: document.getElementById(`imp-notes-${i}`).value,
        source: 'file-import',
      });
      added++;
    }
    if (!added) { toast(skipped ? 'לא יובא דבר — בחר תיק/לקוח לשורות המסומנות' : 'לא סומנו שורות לייבוא', 'alert'); return false; }
    toast(`נוספו ${added} חשבוניות` + (skipped ? ` (${skipped} דולגו — חסר תיק/סכום)` : ''));
    // ניווט למסך חשבוניות (חשוב כשהקובץ נזרק ממסך CRM אחר); נופל ל-reload אם אין ניווט
    const navBtn = document.getElementById('view-invoices');
    if (navBtn && !document.body.classList.contains('view-invoices')) { await loadData(); navBtn.click(); }
    else reload('invoices');
    return true;
  }, { wide: true });
}

async function exportBackup() {
  try {
    const data = await importer.collectAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `lexledger-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('קובץ הגיבוי נוצר');
  } catch (err) { console.error(err); toast('הייצוא נכשל', 'alert'); }
}

async function onClick(e) {
  const t = e.target.closest('[data-bil-action]');
  if (!t) return;
  const action = t.dataset.bilAction;
  const id = t.dataset.id ? parseInt(t.dataset.id, 10) : null;
  const view = currentView();

  switch (action) {
    case 'new-client': return clientForm();
    case 'edit-client': return clientForm(state.clients.find((c) => c.id === id));
    case 'del-client': return delClient(id);
    case 'new-case': return caseForm(null, parseInt(t.dataset.client, 10));
    case 'edit-case': return caseForm(state.cases.find((c) => c.id === id));
    case 'del-case': return delCase(id);
    case 'new-invoice': return invoiceForm();
    case 'edit-invoice': return invoiceForm(state.invoices.find((i) => i.id === id));
    case 'del-invoice': return delInvoice(id);
    case 'new-payment': return paymentForm();
    case 'edit-payment': return paymentForm(state.payments.find((p) => p.id === id));
    case 'del-payment': return delPayment(id);
    case 'save-opening': return saveOpening();
    case 'export-backup': return exportBackup();
    case 'toggle-donut':
      state.donutMetric = state.donutMetric === 'commission' ? 'amount' : 'commission';
      return renderDashboard(refs.dashboard, state.crmCtx);
    case 'toggle-cm':
      state.cmMetric = state.cmMetric === 'commission' ? 'amount' : 'commission';
      return renderAnalysis(refs.analysis);
    case 'exp-client': return toggleExpand(t);
    default: void view;
  }
}

/** הרחבת/כיווץ שורת לקוח → תיקים (טבלאות אנליזה) */
function toggleExpand(rowEl) {
  const tr = rowEl.closest('tr');
  const { cid, scope } = tr.dataset;
  const open = tr.classList.toggle('expanded');
  tr.querySelector('.chevron')?.classList.toggle('open', open);
  tr.closest('table').querySelectorAll(`tr.case-row[data-parent="${scope}-${cid}"]`).forEach((r) => { r.hidden = !open; });
}

/* ---------- delete handlers ---------- */
async function delClient(id) {
  const cl = state.clients.find((c) => c.id === id); if (!cl) return;
  const n = state.cases.filter((c) => c.clientId === id).length;
  if (!confirm(n ? `למחוק את "${cl.name}"? ${n} תיקים משויכים יישארו ללא לקוח.` : `למחוק את "${cl.name}"?`)) return;
  await billing.clients.remove(id);
  toast('הלקוח נמחק', 'trash');
  reload('clients');
}
async function delCase(id) {
  const cs = state.cases.find((c) => c.id === id); if (!cs) return;
  if (!confirm(`למחוק את התיק "${cs.caseNumber || cs.description}"?`)) return;
  await billing.cases.remove(id);
  toast('התיק נמחק', 'trash');
  reload('clients');
}
async function delInvoice(id) {
  if (!confirm('למחוק את החשבונית?')) return;
  await billing.invoices.remove(id);
  toast('החשבונית נמחקה', 'trash');
  reload('invoices');
}
async function delPayment(id) {
  if (!confirm('למחוק את התשלום?')) return;
  await billing.payments.remove(id);
  toast('התשלום נמחק', 'trash');
  reload('payments');
}
async function saveOpening() {
  const v = document.getElementById('fin-opening')?.value;
  await billing.balances.set(state.year, v);
  toast('יתרת הפתיחה נשמרה');
  reload('fin-settings');
}

/* ============================================================ forms (modal) ============================================================ */
function field(label, inputEl, hint) {
  return el('div', { class: 'field' }, [
    el('label', { text: label }),
    inputEl,
    hint && el('span', { class: 'field__hint muted', text: hint }),
  ]);
}
function input(id, props = {}) { return el('input', { id, class: 'input', ...props }); }
function selectEl(id, options, selected, props = {}) {
  const s = el('select', { id, class: 'select', ...props });
  options.forEach((o) => s.append(el('option', { value: o.value, selected: String(o.value) === String(selected), text: o.label })));
  return s;
}
const monthOptions = () => MONTHS.slice(1).map((m, i) => ({ value: i + 1, label: m }));

function clientForm(client) {
  const body = el('div', { class: 'form' }, [field('שם הלקוח', input('f-cl-name', { value: client ? client.name : '', placeholder: 'שם מלא' }))]);
  openModal(client ? 'עריכת לקוח' : 'לקוח חדש', body, async () => {
    const name = document.getElementById('f-cl-name').value.trim();
    if (!name) { toast('יש להזין שם', 'alert'); return false; }
    if (client) await billing.clients.update({ ...client, name });
    else await billing.clients.add(name);
    toast(client ? 'הלקוח עודכן' : 'הלקוח נוסף');
    reload('clients');
    return true;
  });
}

function caseForm(caseRec, presetClientId) {
  const clientOpts = state.clients.map((c) => ({ value: c.id, label: c.name }));
  const body = el('div', { class: 'form' }, [
    field('לקוח', selectEl('f-case-client', clientOpts, caseRec ? caseRec.clientId : presetClientId)),
    el('div', { class: 'field--row' }, [
      field('מספר תיק', input('f-case-num', { value: caseRec ? caseRec.caseNumber : '' })),
      field('סוג תיק', selectEl('f-case-type', billing.CASE_TYPES.map((t) => ({ value: t, label: t })), caseRec ? caseRec.caseType : 'שוטף')),
    ]),
    field('תיאור', input('f-case-desc', { value: caseRec ? caseRec.description : '' })),
    el('div', { class: 'field--row' }, [
      field('אחוז עמלה', input('f-case-rate', { type: 'number', step: '0.5', min: '0', max: '100', value: caseRec ? caseRec.commissionRate : '' })),
      field('סוג הסדר', input('f-case-arr', { value: caseRec ? caseRec.arrangementType : '', placeholder: 'אופציונלי' })),
    ]),
    field('תאריך פתיחה', input('f-case-date', { type: 'date', value: caseRec ? (caseRec.openDate || '') : '' })),
  ]);
  openModal(caseRec ? 'עריכת תיק' : 'תיק חדש', body, async () => {
    const data = {
      clientId: parseInt(document.getElementById('f-case-client').value, 10),
      caseNumber: document.getElementById('f-case-num').value,
      caseType: document.getElementById('f-case-type').value,
      description: document.getElementById('f-case-desc').value,
      commissionRate: document.getElementById('f-case-rate').value,
      arrangementType: document.getElementById('f-case-arr').value,
      openDate: document.getElementById('f-case-date').value || null,
    };
    if (!data.clientId) { toast('יש לבחור לקוח', 'alert'); return false; }
    if (caseRec) await billing.cases.update({ ...caseRec, ...data });
    else await billing.cases.add(data);
    toast(caseRec ? 'התיק עודכן' : 'התיק נוסף');
    reload('clients');
    return true;
  });
}

function invoiceForm(inv) {
  if (!state.cases.length) { toast('צריך להגדיר תיק לפני חשבונית', 'alert'); return; }
  const caseOpts = state.cases.map((c) => ({ value: c.id, label: `${c.caseNumber || '—'} · ${clientName(c.clientId)}` }));
  const rateInput = input('f-inv-rate', { type: 'number', step: '0.5', min: '0', max: '100', value: inv ? inv.commissionRate : caseRate(state.cases[0].id) });
  const amountInput = input('f-inv-amount', { type: 'number', step: '0.01', min: '0', value: inv ? inv.amount : '' });
  const commOut = el('span', { class: 'num accent fin-comm-out', text: formatCurrency(inv ? inv.commission : 0) });
  const recompute = () => { commOut.textContent = formatCurrency((parseFloat(amountInput.value) || 0) * (parseFloat(rateInput.value) || 0) / 100); };
  amountInput.addEventListener('input', recompute);
  rateInput.addEventListener('input', recompute);
  const caseSel = selectEl('f-inv-case', caseOpts, inv ? inv.caseId : state.cases[0].id);
  caseSel.addEventListener('change', () => { rateInput.value = caseRate(parseInt(caseSel.value, 10)); recompute(); });

  const body = el('div', { class: 'form' }, [
    field('תיק', caseSel),
    el('div', { class: 'field--row' }, [
      field('חודש', selectEl('f-inv-month', monthOptions(), inv ? inv.month : new Date().getMonth() + 1)),
      field('שנה', input('f-inv-year', { type: 'number', value: inv ? inv.year : state.year })),
    ]),
    el('div', { class: 'field--row' }, [field('סכום', amountInput), field('אחוז עמלה', rateInput)]),
    el('div', { class: 'fin-comm-preview' }, [el('span', { class: 'muted', text: 'עמלה מחושבת' }), commOut]),
    field('הערה', input('f-inv-notes', { value: inv ? inv.notes : '', placeholder: 'אופציונלי' })),
  ]);
  openModal(inv ? 'עריכת חשבונית' : 'חשבונית חדשה', body, async () => {
    const data = {
      caseId: parseInt(document.getElementById('f-inv-case').value, 10),
      month: document.getElementById('f-inv-month').value,
      year: document.getElementById('f-inv-year').value,
      amount: amountInput.value,
      commissionRate: rateInput.value,
      notes: document.getElementById('f-inv-notes').value,
    };
    if (!data.amount) { toast('יש להזין סכום', 'alert'); return false; }
    if (inv) await billing.invoices.update({ ...inv, ...data });
    else await billing.invoices.add(data);
    state.year = parseInt(data.year, 10);
    toast(inv ? 'החשבונית עודכנה' : 'החשבונית נוספה');
    reload('invoices');
    return true;
  });
}

function paymentForm(pay) {
  const body = el('div', { class: 'form' }, [
    el('div', { class: 'field--row' }, [
      field('חודש', selectEl('f-pay-month', [{ value: '', label: '— ללא —' }, ...monthOptions()], pay ? (pay.month || '') : new Date().getMonth() + 1)),
      field('שנה', input('f-pay-year', { type: 'number', value: pay ? pay.year : state.year })),
    ]),
    field('סכום', input('f-pay-amount', { type: 'number', step: '0.01', min: '0', value: pay ? pay.amount : '' })),
    field('הערה', input('f-pay-notes', { value: pay ? pay.notes : '', placeholder: 'אופציונלי' })),
  ]);
  openModal(pay ? 'עריכת תשלום' : 'תשלום חדש', body, async () => {
    const data = {
      month: document.getElementById('f-pay-month').value || null,
      year: document.getElementById('f-pay-year').value,
      amount: document.getElementById('f-pay-amount').value,
      notes: document.getElementById('f-pay-notes').value,
    };
    if (!data.amount) { toast('יש להזין סכום', 'alert'); return false; }
    if (pay) await billing.payments.update({ ...pay, ...data, year: parseInt(data.year, 10), month: data.month ? parseInt(data.month, 10) : null, amount: parseFloat(data.amount) });
    else await billing.payments.add(data);
    state.year = parseInt(data.year, 10);
    toast(pay ? 'התשלום עודכן' : 'התשלום נוסף');
    reload('payments');
    return true;
  });
}

/* ---------- modal (מקומי, אותו DOM/CSS כמו app.js) ---------- */
function openModal(title, bodyEl, onSubmit, opts = {}) {
  const modal = document.getElementById('modal');
  modal.classList.toggle('modal--wide', !!opts.wide);
  modal.replaceChildren();
  const close = () => modal.close();

  const head = el('div', { class: 'modal__head' }, [
    el('h2', { text: title }),
    el('button', { class: 'modal__close', type: 'button', 'aria-label': 'סגירה', html: ICONS.close, onClick: close }),
  ]);
  const body = el('div', { class: 'modal__body' }, [bodyEl]);
  const save = el('button', { class: 'btn btn--primary', type: 'button', html: ICONS.check + '<span>שמירה</span>' });
  const foot = el('div', { class: 'modal__foot' }, [save, el('button', { class: 'btn btn--ghost', type: 'button', text: 'ביטול', onClick: close })]);

  save.addEventListener('click', async () => {
    save.disabled = true;
    try { const ok = await onSubmit(); if (ok !== false) close(); }
    catch (err) { console.error(err); toast('שמירה נכשלה', 'alert'); }
    finally { save.disabled = false; }
  });
  bodyEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.shiftKey) { e.preventDefault(); save.click(); }
  });

  modal.append(head, body, foot);
  modal.showModal();
  bodyEl.querySelector('input,select,textarea')?.focus();
}

/* ---------- demo seed (לפיתוח/אימות) ---------- */
export async function seedDemo() {
  const c1 = await billing.clients.add('נכסי הצפון בע״מ');
  const c2 = await billing.clients.add('גרין טק תעשיות');
  const case1 = await billing.cases.add({ clientId: c1, caseNumber: 'M-1042', description: 'מיזוג חברות', caseType: 'עסקה', commissionRate: 8, arrangementType: 'Success fee', openDate: '2026-01-12' });
  const case2 = await billing.cases.add({ clientId: c1, caseNumber: 'L-2231', description: 'תביעה מסחרית', caseType: 'ליטיגציה', commissionRate: 5, openDate: '2026-02-01' });
  const case3 = await billing.cases.add({ clientId: c2, caseNumber: 'R-3310', description: 'ייעוץ שוטף', caseType: 'שוטף', commissionRate: 10, openDate: '2026-03-15' });
  const y = state.year;
  await billing.invoices.add({ caseId: case1, month: 2, year: y, amount: 120000, commissionRate: 8 });
  await billing.invoices.add({ caseId: case3, month: 3, year: y, amount: 24000, commissionRate: 10 });
  await billing.invoices.add({ caseId: case2, month: 5, year: y, amount: 16000, commissionRate: 5 });
  await billing.payments.add({ month: 3, year: y, amount: 5200, notes: 'העברה בנקאית' });
  await billing.payments.add({ month: 4, year: y, amount: 3532 });
  await billing.balances.set(y, 3193);
  await loadData();
}
