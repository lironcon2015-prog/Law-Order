// billing-app.js — controller + רינדור למסכי החיוב (כספים) בעיצוב Obsidian Gold.
// self-contained: state משלו, delegation עם namespace data-bil*, modal מקומי.
// מסכים: clients (לקוחות ותיקים) · invoices (חשבוניות) · payments (תשלומים) · fin-settings (הגדרות).

import * as billing from './billing.js';
import { ICONS, toast, formatCurrency } from './ui.js';

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
};

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
export function init(containers, mutateCb) {
  refs = containers; // { clients, invoices, payments, finSettings }
  onMutate = mutateCb;
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
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
  if (onMutate) onMutate();
}

/* ============================================================ render dispatch ============================================================ */
export async function renderView(view) {
  if (!state.loaded) await loadData();
  if (view === 'clients') renderClients(refs.clients);
  else if (view === 'invoices') renderInvoices(refs.invoices);
  else if (view === 'payments') renderPayments(refs.payments);
  else if (view === 'fin-settings') renderSettings(refs.finSettings);
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
function renderInvoices(container) {
  const addBtn = el('button', { class: 'btn btn--primary btn--sm', 'data-bil-action': 'new-invoice' }, [icon('plus'), el('span', { text: 'חשבונית חדשה' })]);
  const wrap = el('div', { class: 'fin-wrap' }, [
    viewHeader('חשבוניות', null, el('div', { class: 'view-h__tools' }, [yearSelect(), addBtn])),
  ]);

  const list = [...state.invoices].sort((a, b) => (b.month - a.month) || (b.createdAt - a.createdAt));
  const totalAmount = list.reduce((s, i) => s + (i.amount || 0), 0);
  const totalComm = list.reduce((s, i) => s + (i.commission || 0), 0);

  wrap.append(el('div', { class: 'fin-kpis' }, [
    kpiSmall('סה״כ חיובים', totalAmount),
    kpiSmall('עמלות שנצברו', totalComm, 'accent'),
    kpiSmall('חשבוניות', list.length, 'plain'),
  ]));

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
  ]);
  container.replaceChildren(wrap);
}
function ledgerRow(label, val, tone) {
  return el('div', { class: `fin-ledger__row${tone === 'total' ? ' fin-ledger__row--total' : ''}` }, [
    el('span', { text: label }),
    el('span', { class: `num ${tone === 'accent' ? 'accent' : tone === 'pos' ? 'pos' : ''}`, text: formatCurrency(val) }),
  ]);
}

/* ---------- shared widgets ---------- */
function kpiSmall(label, value, tone) {
  const isCurrency = tone !== 'plain';
  return el('div', { class: 'fin-kpi' }, [
    el('span', { class: 'fin-kpi__label', text: label }),
    el('span', { class: `fin-kpi__val num ${tone === 'accent' ? 'accent' : tone === 'pos' ? 'pos' : ''}`, text: isCurrency ? formatCurrency(value) : String(value) }),
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
  if (document.body.classList.contains('view-clients')) return 'clients';
  if (document.body.classList.contains('view-invoices')) return 'invoices';
  if (document.body.classList.contains('view-payments')) return 'payments';
  if (document.body.classList.contains('view-fin-settings')) return 'fin-settings';
  return null;
}

async function onChange(e) {
  const t = e.target.closest('[data-bil-action="year"]');
  if (!t) return;
  state.year = parseInt(t.value, 10);
  await reload(currentView());
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
    default: void view;
  }
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
function openModal(title, bodyEl, onSubmit) {
  const modal = document.getElementById('modal');
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
