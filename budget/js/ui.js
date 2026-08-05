// ui.js — רינדור DOM. כל קלט משתמש נכנס כ-textContent/value בלבד (מניעת XSS).
// אייקונים וגרפים הם SVG שנבנה בקוד (ללא קלט משתמש גולמי) ולכן מותר להם innerHTML.

import {
  fmtMoney, fmtHours, fmtPct, STATUS_LABEL, DEAL_STATUSES, FEE_MODELS,
  ENTRY_KINDS, ENTRY_STATUSES, TEAM_COLORS, num, round2, computePortfolio, burnSeries,
  aggregateTeams,
} from './model.js';
import { barCompare, donut, burnLine, gauge, miniBar } from './charts.js';

/* ---------- אייקונים (Lucide-style, סטטי) ---------- */
export const ICONS = {
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>',
  trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.18-9.17 4.16a2 2 0 0 1-1.66 0L2 12.18"/><path d="m22 17.18-9.17 4.16a2 2 0 0 1-1.66 0L2 17.18"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 0-9h-1.8A7 7 0 1 0 4 16.3"/><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>',
};

/* ---------- helpers ---------- */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v; // SVG סטטי בלבד
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'value') node.value = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function icon(name, cls) {
  return el('span', { class: cls || 'ic', html: ICONS[name] || '', 'aria-hidden': 'true' });
}

const money = (n, deal) => fmtMoney(n, { currency: deal?.currency || '₪' });

/** תא מספרי מחושב — מסומן ב-data-calc כדי לעדכן אותו נקודתית בלי רינדור מלא */
function calcCell(key, text, extraClass = '') {
  return el('span', { class: `num ${extraClass}`.trim(), dataset: { calc: key }, text });
}

function statusPill(status, label, calcKey) {
  return el('span', {
    class: `pill pill--${status}`, text: label || STATUS_LABEL[status] || '',
    dataset: calcKey ? { calc: calcKey, pill: '1' } : null,
  });
}

function kpi(label, value, { sub = '', tone = '', icon: iconName = '' } = {}) {
  return el('div', { class: `kpi ${tone ? `kpi--${tone}` : ''}`.trim() }, [
    iconName ? icon(iconName, 'kpi__ic') : null,
    el('div', { class: 'kpi__body' }, [
      el('div', { class: 'kpi__label', text: label }),
      el('div', { class: 'kpi__value num', text: value }),
      sub ? el('div', { class: 'kpi__sub', text: sub }) : null,
    ]),
  ]);
}

function svgBox(markup, cls = 'chartbox') {
  return el('div', { class: cls, html: markup });
}

function emptyState(title, text, actionLabel, action) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'empty__icon', html: ICONS.wallet }),
    el('h2', { text: title }),
    el('p', { text }),
    actionLabel ? el('button', { class: 'btn btn--primary', type: 'button', dataset: { action } }, [icon('plus'), actionLabel]) : null,
  ]);
}

/* ============================================================
   טאבים של עסקאות (הדרישה: טאב לכל עסקה)
   ============================================================ */

export function renderDealTabs(container, { deals, snapshots, activeId }) {
  container.replaceChildren();
  const strip = el('div', { class: 'dtabs', role: 'tablist' });

  strip.append(el('button', {
    class: 'dtab dtab--home', type: 'button', role: 'tab',
    'aria-selected': String(activeId === null),
    dataset: { action: 'go-overview' }, title: 'סקירת כל העסקאות',
  }, [icon('grid'), 'סקירה']));

  for (const deal of deals) {
    const snap = snapshots.get(deal.id);
    const st = snap?.status || 'ok';
    strip.append(el('button', {
      class: 'dtab', type: 'button', role: 'tab',
      'aria-selected': String(deal.id === activeId),
      dataset: { action: 'select-deal', id: deal.id },
      draggable: 'true',
      title: `${deal.name}${deal.client ? ` · ${deal.client}` : ''}`,
    }, [
      el('span', { class: `dtab__dot dtab__dot--${st}` }),
      el('span', { class: 'dtab__name', text: deal.name }),
      snap ? el('span', { class: 'dtab__util num', text: fmtPct(snap.util) }) : null,
      el('span', {
        class: 'dtab__close', role: 'button', tabindex: '-1', title: `מחיקת ${deal.name}`,
        'aria-label': `מחיקת ${deal.name}`,
        dataset: { action: 'delete-deal', id: deal.id }, html: ICONS.close,
      }),
    ]));
  }

  strip.append(el('button', { class: 'dtab dtab--add', type: 'button', dataset: { action: 'new-deal' }, title: 'עסקה חדשה' }, [icon('plus')]));
  container.append(strip);
}

/* ============================================================
   סקירה — כל העסקאות
   ============================================================ */

export function renderOverview(root, { snapshots }) {
  root.replaceChildren();
  const list = [...snapshots.values()];
  if (!list.length) {
    root.append(emptyState('אין עדיין עסקאות', 'צור עסקה ראשונה כדי לבנות תקציב, להעלות חשבונות ולעקוב אחר עמידה בתקציב בזמן אמת.', 'עסקה חדשה', 'new-deal'));
    return;
  }
  const p = computePortfolio(list);

  root.append(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title', text: 'סקירת תיק העסקאות' }),
      el('p', { class: 'page-sub', text: `${p.deals} עסקאות · ${p.over} בחריגה · ${p.risk} בסיכון` }),
    ]),
    el('div', { class: 'page-actions' }, [
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'export-portfolio' } }, [icon('download'), 'ייצוא סקירה']),
      el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'new-deal' } }, [icon('plus'), 'עסקה חדשה']),
    ]),
  ]));

  root.append(el('div', { class: 'kpis' }, [
    kpi('תקציב מצטבר', fmtMoney(p.budgetCost), { sub: `${fmtHours(p.budgetHours)} שעות`, icon: 'target' }),
    kpi('ביצוע בפועל', fmtMoney(p.actualCost), { sub: `${fmtHours(p.actualHours)} שעות`, icon: 'receipt' }),
    kpi('יתרה', fmtMoney(p.remainingCost), { sub: `ניצול ${fmtPct(p.util)}`, tone: p.remainingCost < 0 ? 'neg' : 'pos', icon: 'wallet' }),
    kpi('שכ"ט מוסכם', fmtMoney(p.agreedFee), { sub: p.agreedFee > 0 ? `רווח גולמי ${fmtMoney(p.agreedFee - p.actualCost)}` : 'לא הוגדר', icon: 'trending' }),
  ]));

  const grid = el('div', { class: 'deal-grid' });
  for (const s of list) {
    grid.append(el('article', { class: 'dcard', dataset: { action: 'select-deal', id: s.deal.id }, tabindex: '0', role: 'button' }, [
      el('header', { class: 'dcard__head' }, [
        el('div', { class: 'dcard__id' }, [
          el('h3', { class: 'dcard__name', text: s.deal.name }),
          el('span', { class: 'dcard__client', text: s.deal.client || '—' }),
        ]),
        el('div', { class: 'dcard__head-tools' }, [
          statusPill(s.status),
          el('button', {
            class: 'iconbtn iconbtn--danger dcard__del', type: 'button', title: 'מחיקת העסקה',
            'aria-label': `מחיקת ${s.deal.name}`,
            dataset: { action: 'delete-deal', id: s.deal.id }, html: ICONS.trash,
          }),
        ]),
      ]),
      el('div', { class: 'dcard__bar', html: miniBar(s.util, s.status) }),
      el('div', { class: 'dcard__nums' }, [
        el('div', {}, [el('span', { class: 'lbl', text: 'תקציב' }), el('span', { class: 'num', text: money(s.budgetCost, s.deal) })]),
        el('div', {}, [el('span', { class: 'lbl', text: 'בפועל' }), el('span', { class: 'num', text: money(s.actualCost, s.deal) })]),
        el('div', {}, [el('span', { class: 'lbl', text: 'יתרה' }), el('span', { class: `num ${s.remainingCost < 0 ? 'neg' : ''}`, text: money(s.remainingCost, s.deal) })]),
      ]),
      el('footer', { class: 'dcard__foot' }, [
        el('span', { class: 'chip-mini', text: `${s.teams.length} צוותים` }),
        el('span', { class: 'chip-mini', text: `${s.entries.length} רישומים` }),
        s.eac !== null ? el('span', { class: `chip-mini ${s.eacVariance < 0 ? 'chip-mini--warn' : ''}`, text: `תחזית ${money(s.eac, s.deal)}` }) : null,
      ]),
    ]));
  }
  root.append(grid);

  const allAlerts = list.flatMap((s) => s.alerts.filter((a) => a.level === 'over' || a.level === 'risk').map((a) => ({ ...a, deal: s.deal })));
  if (allAlerts.length) {
    root.append(el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('alert'), 'התראות פתוחות']),
      el('ul', { class: 'alerts' }, allAlerts.slice(0, 12).map((a) => el('li', { class: `alert alert--${a.level}` }, [
        icon(a.level === 'over' ? 'alert' : 'info'),
        el('span', {}, [el('strong', { text: `${a.deal.name}: ` }), a.text]),
      ]))),
    ]));
  }
}

/* ============================================================
   כותרת עסקה + תת-טאבים
   ============================================================ */

export function renderDealHeader(root, { snap, tab }) {
  const d = snap.deal;
  const head = el('div', { class: 'deal-head' }, [
    el('div', { class: 'deal-head__top' }, [
      el('div', { class: 'deal-head__id' }, [
        el('h1', { class: 'page-title', text: d.name }),
        el('div', { class: 'deal-head__meta' }, [
          d.client ? el('span', { class: 'chip-mini', text: d.client }) : null,
          d.code ? el('span', { class: 'chip-mini', text: d.code }) : null,
          el('span', { class: 'chip-mini', text: (DEAL_STATUSES.find((s) => s.id === d.status) || {}).label || '' }),
          el('span', { class: 'chip-mini', text: (FEE_MODELS.find((f) => f.id === d.feeModel) || {}).label || '' }),
          el('span', { class: 'chip-mini', text: `מקדם חריגה ${fmtPct(d.overrunFactor)}` }),
        ]),
      ]),
      el('div', { class: 'page-actions' }, [
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'add-entry' } }, [icon('plus'), 'רישום ביצוע']),
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'import-entries' } }, [icon('upload'), 'העלאת חשבונות']),
      ]),
    ]),
    el('div', { class: 'strip' }, [
      stripItem('תקציב', money(snap.budgetCost, d), '', 'strip-budget'),
      stripItem('בפועל', money(snap.actualCost, d), '', 'strip-actual'),
      stripItem('יתרה', money(snap.remainingCost, d), snap.remainingCost < 0 ? 'neg' : 'pos', 'strip-remaining'),
      stripItem('ניצול', fmtPct(snap.util), snap.status === 'over' ? 'neg' : '', 'strip-util'),
      stripItem('שעות', `${fmtHours(snap.actualHours)} / ${fmtHours(snap.budgetHours)}`, '', 'strip-hours'),
      stripItem('בלנדד', money(snap.blendedRate, d), '', 'strip-blended'),
      snap.hasFee ? stripItem('רווח גולמי', money(snap.margin, d), snap.margin < 0 ? 'neg' : 'pos', 'strip-margin') : null,
    ]),
    el('nav', { class: 'subtabs', role: 'tablist' }, [
      subtab('budget', 'תקציב', 'target', tab),
      subtab('actuals', 'ביצוע', 'receipt', tab),
      subtab('control', 'בקרה', 'trending', tab),
      subtab('settings', 'הגדרות', 'settings', tab),
    ]),
  ]);
  root.append(head);
}

function stripItem(label, value, tone = '', calcKey = '') {
  return el('div', { class: `strip__item ${tone ? `strip__item--${tone}` : ''}`.trim() }, [
    el('span', { class: 'strip__label', text: label }),
    calcKey
      ? el('span', { class: 'strip__value num', dataset: { calc: calcKey }, text: value })
      : el('span', { class: 'strip__value num', text: value }),
  ]);
}

function subtab(id, label, iconName, active) {
  return el('button', {
    class: 'subtab', type: 'button', role: 'tab',
    'aria-selected': String(id === active),
    dataset: { action: 'set-tab', tab: id },
  }, [icon(iconName), label]);
}

/* ============================================================
   טאב תקציב — הגיליון החי
   ============================================================ */

export function renderBudgetTab(root, { snap, rateCard, selected = new Set() }) {
  const d = snap.deal;

  if (!snap.teams.length) {
    root.append(el('div', { class: 'empty' }, [
      el('h2', { text: 'אין צוותים בעסקה' }),
      el('p', { text: 'כל צוות מקבל את אותה מתודולוגיה: שורה לכל דרגה, שעות מוערכות, מקדם חריגה ותעריף.' }),
      el('div', { class: 'form-actions form-actions--wrap' }, [
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'add-team' } }, [icon('plus'), 'הוסף צוות']),
        // בלי הכפתור הזה אי אפשר היה לייבא תקציב לעסקה ריקה
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'import-budget' } }, [icon('upload'), 'ייבוא תקציב מאקסל']),
      ]),
    ]));
    return;
  }

  const wrap = el('div', { class: 'budget-wrap' });

  // סרגל בחירת צוותים — חישוב מצרפי לצוותים המסומנים
  const allBox = el('input', {
    type: 'checkbox', dataset: { pick: 'all' },
    checked: selected.size === snap.teams.length ? 'checked' : null,
  });
  allBox.indeterminate = selected.size > 0 && selected.size < snap.teams.length;
  wrap.append(el('div', { class: 'pickbar' }, [
    el('label', { class: 'inline-check' }, [allBox, el('span', { text: 'סמן את כל הצוותים' })]),
    el('span', { class: 'pickbar__hint', text: selected.size ? `${selected.size} צוותים מסומנים` : 'סמן צוותים כדי לקבל חישוב מצרפי' }),
    selected.size ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'clear-picks' } }, [icon('close'), 'נקה סימון']) : null,
  ]));

  for (const team of snap.teams) {
    wrap.append(renderTeamCard(team, { snap, rateCard, selected }));
  }

  wrap.append(el('div', { class: 'team-add-row' }, [
    el('button', { class: 'btn-add-row', type: 'button', dataset: { action: 'add-team' } }, [icon('plus'), 'הוסף צוות (אותה מתודולוגיה)']),
    el('button', { class: 'btn-add-row', type: 'button', dataset: { action: 'import-budget' } }, [icon('upload'), 'ייבוא תקציב מאקסל']),
  ]));

  // חישוב מצרפי לצוותים המסומנים
  if (selected.size) {
    const agg = aggregateTeams(snap, selected);
    wrap.append(el('section', { class: 'panel panel--agg' }, [
      el('h2', { class: 'panel__title' }, [
        icon('layers'),
        `חישוב מצרפי · ${agg.count} צוותים`,
        el('span', { class: 'agg__names', text: agg.names.join(' · ') }),
      ]),
      el('div', { class: 'totals' }, [
        totalItem('תקציב מצרפי', money(agg.budgetCost, d), 'agg-budget'),
        totalItem('בפועל', money(agg.actualCost, d), 'agg-actual'),
        totalItem('יתרה', money(agg.remainingCost, d), 'agg-remaining'),
        totalItem('ניצול', fmtPct(agg.util), 'agg-util'),
        totalItem('שעות תקציב', fmtHours(agg.budgetHours), 'agg-hours'),
        totalItem('שעות בפועל', fmtHours(agg.actualHours), 'agg-actual-hours'),
        totalItem('בלנדד (שעות ללא ג\'וניור)', money(agg.blendedRate, d), 'agg-blended'),
        totalItem('חלק מתקציב העסקה', fmtPct(agg.shareOfDeal), 'agg-share'),
      ]),
    ]));
  }

  // סיכום העסקה
  wrap.append(el('section', { class: 'panel panel--total' }, [
    el('h2', { class: 'panel__title' }, [icon('layers'), 'סיכום תקציב העסקה']),
    el('div', { class: 'totals' }, [
      totalItem('סה"כ תקציב', money(snap.budgetCost, d), 'total-budget'),
      totalItem('שעות תקציב', fmtHours(snap.budgetHours), 'total-hours'),
      totalItem('שעות מוערכות', fmtHours(snap.estHours), 'total-est'),
      totalItem('תעריף בלנדד (שעות ללא ג\'וניור)', money(snap.blendedRate, d), 'total-blended',
        'כל התקציב — כולל עלות הג\'וניורים — מחולק בשעות שאינן ג\'וניור. זה המחיר האפקטיבי לשעה "נמכרת".'),
      totalItem('תעריף ממוצע כולל', money(snap.blendedAll, d), 'total-blended-all', 'התקציב חלקי כל שעות התקציב.'),
      snap.hasFee ? totalItem('שכ"ט מוסכם', money(snap.agreedFee, d)) : null,
    ]),
    snap.baselineDelta ? el('div', { class: `baseline ${snap.baselineDelta.delta > 0 ? 'baseline--up' : ''}` }, [
      icon('flag'),
      el('span', { text: `מול תקציב הבסיס (${new Date(snap.baselineDelta.capturedAt).toLocaleDateString('he-IL')}): ` }),
      el('strong', { class: 'num', text: `${snap.baselineDelta.delta >= 0 ? '+' : ''}${money(snap.baselineDelta.delta, d)}` }),
      el('span', { class: 'num', text: snap.baselineDelta.pct === null ? '' : ` (${fmtPct(snap.baselineDelta.pct, 1)})` }),
    ]) : null,
  ]));

  root.append(wrap);
}

function totalItem(label, value, calcKey, hint) {
  return el('div', { class: 'total', title: hint || null }, [
    el('span', { class: 'total__label', text: label }),
    calcKey ? calcCell(calcKey, value, 'total__value') : el('span', { class: 'total__value num', text: value }),
  ]);
}

function renderTeamCard(team, { snap, rateCard, selected = new Set() }) {
  const d = snap.deal;
  const card = el('section', { class: 'team', dataset: { teamId: team.id }, style: `--team-color:${team.color}` });

  card.append(el('header', { class: 'team__head' }, [
    el('label', { class: 'team__pick', title: 'סימון הצוות לחישוב מצרפי' }, [
      el('input', {
        type: 'checkbox', dataset: { pick: 'team', teamId: team.id },
        checked: selected.has(team.id) ? 'checked' : null,
        'aria-label': `סימון הצוות ${team.name} לחישוב מצרפי`,
      }),
    ]),
    el('span', { class: 'team__swatch' }),
    el('input', {
      class: 'team__name', value: team.name, 'aria-label': 'שם הצוות',
      dataset: { field: 'name', teamId: team.id },
    }),
    el('div', { class: 'team__stats' }, [
      el('span', { class: 'team__stat' }, [el('span', { class: 'lbl', text: 'תקציב' }), calcCell(`team-budget-${team.id}`, money(team.budgetCost, d))]),
      el('span', { class: 'team__stat' }, [el('span', { class: 'lbl', text: 'בפועל' }), el('span', { class: 'num', text: money(team.actualCost, d) })]),
      el('span', { class: 'team__stat' }, [el('span', { class: 'lbl', text: 'יתרה' }), calcCell(`team-remaining-${team.id}`, money(team.remainingCost, d), team.remainingCost < 0 ? 'neg' : '')]),
      statusPill(team.status, `${STATUS_LABEL[team.status]} · ${fmtPct(team.util)}`, `team-status-${team.id}`),
    ]),
    el('div', { class: 'team__tools' }, [
      el('button', { class: 'iconbtn', type: 'button', title: 'שכפל צוות', dataset: { action: 'duplicate-team', teamId: team.id }, html: ICONS.copy }),
      el('button', { class: 'iconbtn iconbtn--danger', type: 'button', title: 'מחק צוות', dataset: { action: 'delete-team', teamId: team.id }, html: ICONS.trash }),
    ]),
  ]));

  card.append(el('div', { class: 'team__bar', html: miniBar(team.util, team.status) }));

  const table = el('table', { class: 'btable' });
  table.append(el('thead', {}, el('tr', {}, [
    el('th', { class: 'th-role', text: 'דרגה' }),
    el('th', { text: 'שעות מוערכות', title: 'ההערכה הראשונית של הצוות' }),
    el('th', { text: 'שעות תקציב', title: 'מעוגל כלפי מעלה: מוערך × (1 + מקדם חריגה)' }),
    el('th', { text: 'תעריף' }),
    el('th', { text: 'תקציב ₪' }),
    el('th', { text: 'שעות בפועל' }),
    el('th', { text: 'בפועל ₪' }),
    el('th', { text: 'יתרה ₪' }),
    el('th', { text: 'ניצול' }),
    el('th', { class: 'th-tools' }),
  ])));

  const tbody = el('tbody');
  for (const line of team.lines) {
    tbody.append(el('tr', { class: `bline bline--${line.status}`, dataset: { lineId: line.id, teamId: team.id } }, [
      el('td', { class: 'td-role' }, [
        el('select', {
          class: `cellinput cellinput--role${line.orphanRole ? ' cellinput--orphan' : ''}`,
          title: line.orphanRole ? 'הדרגה אינה קיימת בתעריפון הנוכחי — התעריף מוקפא בשורה. בחר דרגה מהתעריפון כדי לחבר מחדש.' : null,
          dataset: { field: 'roleId', teamId: team.id, lineId: line.id },
        }, [
          // דרגה שנעלמה מהתעריפון (הוחלף/נמחק) — מוצגת כדי שהשורה לא תיראה כדרגה אחרת
          line.orphanRole
            ? el('option', { value: line.roleId, selected: 'selected', text: `${line.roleName && line.roleName !== '—' ? line.roleName : 'דרגה שהוסרה'} · לא בתעריפון` })
            : null,
          ...rateCard.roles.map((r) => el('option', { value: r.id, selected: r.id === line.roleId ? 'selected' : null, text: r.name })),
        ]),
      ]),
      el('td', {}, [el('input', {
        class: 'cellinput num', type: 'number', step: '0.5', min: '0', value: String(line.estHours),
        dataset: { field: 'estHours', teamId: team.id, lineId: line.id },
      })]),
      el('td', {}, [el('input', {
        class: 'cellinput cellinput--calc num', type: 'number', step: '1', min: '0',
        value: String(line.budgetHours),
        placeholder: String(line.budgetHours),
        title: 'ניתן לדרוס ידנית. ריק = חישוב אוטומטי לפי המקדם.',
        dataset: { field: 'hoursOverride', teamId: team.id, lineId: line.id, auto: line.hoursOverride === null ? '1' : '0' },
      })]),
      el('td', {}, [el('input', {
        class: 'cellinput num', type: 'number', step: '10', min: '0', value: String(line.rate),
        title: 'תעריף מהתעריפון. שינוי כאן = דריסה לשורה זו בלבד.',
        dataset: { field: 'rateOverride', teamId: team.id, lineId: line.id, auto: line.rateOverride === null ? '1' : '0' },
      })]),
      el('td', { class: 'td-strong' }, [calcCell(`line-cost-${line.id}`, money(line.budgetCost, d))]),
      el('td', {}, [el('span', { class: 'num', text: fmtHours(line.actualHours) })]),
      el('td', {}, [el('span', { class: 'num', text: money(line.actualCost, d) })]),
      el('td', {}, [calcCell(`line-remaining-${line.id}`, money(line.remainingCost, d), line.remainingCost < 0 ? 'neg' : '')]),
      el('td', { class: 'td-util' }, [
        el('span', { class: `num pct pct--${line.status}`, dataset: { calc: `line-util-${line.id}` }, text: fmtPct(line.util) }),
        el('span', { class: 'mbar-wrap', html: miniBar(line.util, line.status) }),
      ]),
      el('td', { class: 'td-tools' }, [
        el('button', { class: 'iconbtn iconbtn--danger', type: 'button', title: 'מחק שורה', dataset: { action: 'delete-line', teamId: team.id, lineId: line.id }, html: ICONS.trash }),
      ]),
    ]));
  }
  table.append(tbody);

  table.append(el('tfoot', {}, el('tr', {}, [
    el('td', { class: 'td-role', text: 'סה"כ' }),
    el('td', {}, [calcCell(`team-est-${team.id}`, fmtHours(team.estHours))]),
    el('td', {}, [calcCell(`team-hours-${team.id}`, fmtHours(team.budgetHours))]),
    el('td', {}, ''),
    el('td', { class: 'td-strong' }, [calcCell(`team-cost-${team.id}`, money(team.budgetCost, d))]),
    el('td', {}, [el('span', { class: 'num', text: fmtHours(team.actualHours) })]),
    el('td', {}, [el('span', { class: 'num', text: money(team.actualCost, d) })]),
    el('td', {}, [el('span', { class: `num ${team.remainingCost < 0 ? 'neg' : ''}`, text: money(team.remainingCost, d) })]),
    el('td', { class: 'td-util' }, [el('span', { class: `num pct pct--${team.status}`, text: fmtPct(team.util) })]),
    el('td', {}, ''),
  ])));

  card.append(el('div', { class: 'btable-wrap' }, table));

  card.append(el('div', { class: 'team__foot' }, [
    el('button', { class: 'btn-add-row btn-add-row--sm', type: 'button', dataset: { action: 'add-line', teamId: team.id } }, [icon('plus'), 'הוסף שורה']),
    el('label', { class: 'inline-field' }, [
      el('span', { text: 'מקדם חריגה לצוות' }),
      el('input', {
        class: 'cellinput cellinput--sm num', type: 'number', step: '0.05', min: '0', max: '2',
        value: String(team.overrunFactor === null ? '' : team.overrunFactor),
        placeholder: String(snap.deal.overrunFactor),
        title: 'ריק = ירושה מהעסקה',
        dataset: { field: 'overrunFactor', teamId: team.id },
      }),
    ]),
    el('label', { class: 'inline-field' }, [
      el('span', { text: 'אחראי' }),
      el('input', { class: 'cellinput cellinput--sm', value: team.lead, placeholder: 'שם', dataset: { field: 'lead', teamId: team.id } }),
    ]),
  ]));

  return card;
}

/* ============================================================
   טאב ביצוע — רישומי חשבונות/שעות
   ============================================================ */

export function renderActualsTab(root, { snap, filters }) {
  const d = snap.deal;
  const teamName = new Map(snap.teams.map((t) => [t.id, t.name]));
  const roleName = new Map((snap.rateCard?.roles || []).map((r) => [r.id, r.name]));

  root.append(el('div', { class: 'toolbar' }, [
    el('label', { class: 'searchbox' }, [
      icon('search'),
      el('input', { class: 'searchbox__input', type: 'search', placeholder: 'חיפוש בתיאור / ספק / מסמך', value: filters.q || '', dataset: { filter: 'q' } }),
    ]),
    el('select', { class: 'select select--sm', dataset: { filter: 'teamId' } }, [
      el('option', { value: '', text: 'כל הצוותים', selected: !filters.teamId ? 'selected' : null }),
      ...snap.teams.map((t) => el('option', { value: t.id, text: t.name, selected: filters.teamId === t.id ? 'selected' : null })),
      el('option', { value: '__none', text: 'ללא שיוך', selected: filters.teamId === '__none' ? 'selected' : null }),
    ]),
    el('select', { class: 'select select--sm', dataset: { filter: 'kind' } }, [
      el('option', { value: '', text: 'כל הסוגים', selected: !filters.kind ? 'selected' : null }),
      ...ENTRY_KINDS.map((k) => el('option', { value: k.id, text: k.label, selected: filters.kind === k.id ? 'selected' : null })),
    ]),
    el('select', { class: 'select select--sm', dataset: { filter: 'status' } }, [
      el('option', { value: '', text: 'כל הסטטוסים', selected: !filters.status ? 'selected' : null }),
      ...ENTRY_STATUSES.map((s) => el('option', { value: s.id, text: s.label, selected: filters.status === s.id ? 'selected' : null })),
    ]),
    el('div', { class: 'toolbar__spacer' }),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'export-entries' } }, [icon('download'), 'ייצוא CSV']),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'add-entry' } }, [icon('plus'), 'רישום ידני']),
    el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'import-entries' } }, [icon('upload'), 'העלאת קובץ']),
  ]));

  root.append(el('div', { class: 'dropzone', dataset: { action: 'dropzone' } }, [
    icon('upload'),
    el('div', {}, [
      el('strong', { text: 'גרור לכאן קובץ חשבונות' }),
      el('span', { text: ' — XLSX או CSV. אפשר גם PDF/תמונה כצירוף לרישום.' }),
    ]),
  ]));

  // הטבלה בתוך מכל נפרד: חיפוש חופשי מרנדר רק אותה, כך שתיבת החיפוש לא נהרסת
  // בזמן ההקלדה (הריסה שלה גורמת לאיבוד פוקוס אחרי התו הראשון).
  const listWrap = el('div', { class: 'actuals-body' });
  renderActualsList(listWrap, { snap, filters });
  root.append(listWrap);
}

export function renderActualsList(root, { snap, filters }) {
  const d = snap.deal;
  const teamName = new Map(snap.teams.map((t) => [t.id, t.name]));
  const roleName = new Map((snap.rateCard?.roles || []).map((r) => [r.id, r.name]));
  root.replaceChildren();

  const rows = filterEntries(snap.entries, filters);
  const sum = rows.reduce((s, e) => s + num(e.amount), 0);
  const sumHours = rows.reduce((s, e) => s + num(e.hours), 0);

  if (!rows.length) {
    root.append(el('div', { class: 'list-empty', text: snap.entries.length ? 'אין רישומים התואמים לסינון.' : 'טרם נרשמו חשבונות או שעות בעסקה זו.' }));
    return;
  }

  const table = el('table', { class: 'etable' });
  table.append(el('thead', {}, el('tr', {}, [
    el('th', { text: 'תאריך' }), el('th', { text: 'תיאור' }), el('th', { text: 'צוות' }),
    el('th', { text: 'דרגה' }), el('th', { text: 'סוג' }), el('th', { text: 'שעות' }),
    el('th', { text: 'תעריף' }), el('th', { text: 'סכום' }), el('th', { text: 'סטטוס' }),
    el('th', { text: 'מסמך' }), el('th', { class: 'th-tools' }),
  ])));

  const tbody = el('tbody');
  for (const e of rows.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))) {
    tbody.append(el('tr', { dataset: { entryId: e.id } }, [
      el('td', { class: 'num', text: e.date }),
      el('td', { class: 'td-desc' }, [
        el('span', { text: e.description || '—' }),
        e.person ? el('span', { class: 'sub', text: e.person }) : null,
        e.supplier ? el('span', { class: 'sub', text: e.supplier }) : null,
      ]),
      el('td', { text: e.teamId ? (teamName.get(e.teamId) || '—') : '—', class: e.teamId ? '' : 'muted' }),
      el('td', { text: e.roleId ? (roleName.get(e.roleId) || '—') : '—' }),
      el('td', { text: (ENTRY_KINDS.find((k) => k.id === e.kind) || {}).label || '' }),
      el('td', { class: 'num', text: e.hours ? fmtHours(e.hours) : '—' }),
      el('td', { class: 'num', text: e.rate ? money(e.rate, d) : '—' }),
      el('td', { class: 'num td-strong', text: money(e.amount, d) }),
      el('td', {}, [el('span', { class: `pill pill--${e.status}`, text: (ENTRY_STATUSES.find((s) => s.id === e.status) || {}).label || '' })]),
      el('td', {}, [
        e.fileId
          ? el('button', { class: 'linkbtn', type: 'button', dataset: { action: 'open-file', fileId: e.fileId } }, [icon('file'), e.fileName || 'קובץ'])
          : el('span', { class: 'muted', text: e.docNumber || '—' }),
      ]),
      el('td', { class: 'td-tools' }, [
        el('button', { class: 'iconbtn', type: 'button', title: 'עריכה', dataset: { action: 'edit-entry', entryId: e.id }, html: ICONS.edit }),
        el('button', { class: 'iconbtn iconbtn--danger', type: 'button', title: 'מחיקה', dataset: { action: 'delete-entry', entryId: e.id }, html: ICONS.trash }),
      ]),
    ]));
  }
  table.append(tbody);
  table.append(el('tfoot', {}, el('tr', {}, [
    el('td', { text: `${rows.length} רישומים`, colspan: '5' }),
    el('td', { class: 'num', text: fmtHours(sumHours) }),
    el('td', {}, ''),
    el('td', { class: 'num td-strong', text: money(sum, d) }),
    el('td', { colspan: '3' }, ''),
  ])));

  root.append(el('div', { class: 'btable-wrap' }, table));
}

export function filterEntries(entries, filters = {}) {
  const q = (filters.q || '').trim().toLowerCase();
  return entries.filter((e) => {
    if (filters.teamId === '__none' && e.teamId) return false;
    if (filters.teamId && filters.teamId !== '__none' && e.teamId !== filters.teamId) return false;
    if (filters.kind && e.kind !== filters.kind) return false;
    if (filters.status && e.status !== filters.status) return false;
    if (q) {
      const hay = `${e.description} ${e.supplier} ${e.docNumber} ${e.person}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ============================================================
   טאב בקרה — תקציב מול ביצוע
   ============================================================ */

export function renderControlTab(root, { snap }) {
  const d = snap.deal;

  if (snap.alerts.length) {
    root.append(el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('alert'), 'בקרה והתראות']),
      el('ul', { class: 'alerts' }, snap.alerts.map((a) => el('li', { class: `alert alert--${a.level}` }, [
        icon(a.level === 'info' ? 'info' : 'alert'), el('span', { text: a.text }),
      ]))),
    ]));
  }

  root.append(el('div', { class: 'control-grid' }, [
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('target'), 'ניצול כולל']),
      svgBox(gauge(snap.util), 'chartbox chartbox--center'),
      el('div', { class: 'facts' }, [
        fact('תקציב', money(snap.budgetCost, d)),
        fact('בפועל', money(snap.actualCost, d)),
        fact('יתרה', money(snap.remainingCost, d), snap.remainingCost < 0 ? 'neg' : 'pos'),
        fact('התקדמות מדווחת', fmtPct(snap.progress)),
        snap.timePace !== null ? fact('התקדמות בזמן', fmtPct(snap.timePace)) : null,
      ]),
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('trending'), 'תחזית לסיום (EAC)']),
      el('div', { class: 'facts facts--lg' }, [
        fact('תחזית עלות בסיום', snap.eac === null ? '—' : money(snap.eac, d), snap.eacVariance !== null && snap.eacVariance < 0 ? 'neg' : 'pos'),
        fact('סטייה צפויה מהתקציב', snap.eacVariance === null ? '—' : money(snap.eacVariance, d), snap.eacVariance !== null && snap.eacVariance < 0 ? 'neg' : 'pos'),
        fact('בסיס החישוב', snap.eacBasis || 'אין נתונים מספיקים'),
        fact('תעריף אפקטיבי בפועל', money(snap.effectiveRate, d)),
        fact('תעריף בלנדד מתוכנן', money(snap.blendedRate, d)),
      ]),
      snap.hasFee ? el('div', { class: 'facts facts--lg' }, [
        fact('שכ"ט מוסכם', money(snap.agreedFee, d)),
        fact('רווח גולמי נוכחי', money(snap.margin, d), snap.margin < 0 ? 'neg' : 'pos'),
        fact('שיעור רווח', snap.marginPct === null ? '—' : fmtPct(snap.marginPct, 1), snap.margin < 0 ? 'neg' : 'pos'),
      ]) : null,
    ]),
  ]));

  root.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('users'), 'תקציב מול ביצוע — לפי צוות']),
    svgBox(barCompare(snap.teams.map((t) => ({ label: t.name, budget: t.budgetCost, actual: t.actualCost, status: t.status, color: t.color })))),
  ]));

  if (snap.byRole.length) {
    root.append(el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('layers'), 'תקציב מול ביצוע — לפי דרגה']),
      svgBox(barCompare(snap.byRole.map((r) => ({
        label: r.name, budget: r.budgetCost, actual: r.actualCost,
        status: r.util > 1 ? 'over' : r.util >= 0.9 ? 'risk' : r.util >= 0.75 ? 'watch' : 'ok',
      })))),
    ]));
  }

  const series = burnSeries(snap);
  if (series.length) {
    root.append(el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('clock'), 'שריפת תקציב מצטברת']),
      svgBox(burnLine(series, snap.budgetCost)),
    ]));
  }

  if (snap.teams.length) {
    root.append(el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('wallet'), 'הרכב התקציב']),
      el('div', { class: 'donut-row' }, [
        svgBox(donut(snap.teams.map((t) => ({ label: t.name, value: t.budgetCost, color: t.color })), {
          centerTop: fmtMoney(snap.budgetCost), centerSub: 'תקציב',
        }), 'chartbox chartbox--center'),
        el('ul', { class: 'legend' }, snap.teams.map((t) => el('li', {}, [
          el('span', { class: 'legend__dot', style: `background:${t.color}` }),
          el('span', { class: 'legend__label', text: t.name }),
          el('span', { class: 'legend__value num', text: money(t.budgetCost, d) }),
          el('span', { class: 'legend__pct num', text: snap.budgetCost > 0 ? fmtPct(t.budgetCost / snap.budgetCost) : '—' }),
        ]))),
      ]),
    ]));
  }
}

function fact(label, value, tone = '') {
  return el('div', { class: `fact ${tone ? `fact--${tone}` : ''}`.trim() }, [
    el('span', { class: 'fact__label', text: label }),
    el('span', { class: 'fact__value num', text: value }),
  ]);
}

/* ============================================================
   טאב הגדרות עסקה
   ============================================================ */

export function renderDealSettings(root, { snap, rateCards }) {
  const d = snap.deal;
  const form = el('form', { class: 'settings-form', id: 'deal-form', autocomplete: 'off' });

  form.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('info'), 'פרטי העסקה']),
    el('div', { class: 'grid-2' }, [
      field('שם העסקה', el('input', { class: 'input', name: 'name', value: d.name, required: 'required' })),
      field('לקוח', el('input', { class: 'input', name: 'client', value: d.client, placeholder: 'שם הלקוח' })),
      field('מספר עסקה / תיק', el('input', { class: 'input', name: 'code', value: d.code, placeholder: 'לדוגמה: M&A-2026-04' })),
      field('סטטוס', el('select', { class: 'select', name: 'status' }, DEAL_STATUSES.map((s) => el('option', { value: s.id, text: s.label, selected: s.id === d.status ? 'selected' : null })))),
      field('תאריך פתיחה', el('input', { class: 'input num', type: 'date', name: 'startDate', value: d.startDate })),
      field('תאריך סגירה יעד', el('input', { class: 'input num', type: 'date', name: 'targetDate', value: d.targetDate })),
    ]),
    field('הערות', el('textarea', { class: 'input', name: 'notes', rows: '3', text: d.notes })),
  ]));

  form.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('wallet'), 'מודל חיוב ותקציב']),
    el('div', { class: 'grid-2' }, [
      field('מודל שכר טרחה', el('select', { class: 'select', name: 'feeModel' }, FEE_MODELS.map((f) => el('option', { value: f.id, text: f.label, selected: f.id === d.feeModel ? 'selected' : null }))),
        (FEE_MODELS.find((f) => f.id === d.feeModel) || {}).hint),
      field('שכ"ט מוסכם / תקרה (₪)', el('input', { class: 'input num', type: 'number', step: '1000', min: '0', name: 'agreedFee', value: String(d.agreedFee) })),
      field('מקדם חריגה לתקציב', el('input', { class: 'input num', type: 'number', step: '0.05', min: '0', max: '2', name: 'overrunFactor', value: String(d.overrunFactor) }),
        'שעות התקציב = השעות המוערכות בתוספת המקדם, מעוגל כלפי מעלה. 0.2 = תוספת של 20 אחוז.'),
      field('שיעור מע"מ', el('input', { class: 'input num', type: 'number', step: '0.01', min: '0', max: '1', name: 'vatRate', value: String(d.vatRate) }),
        'משמש להמרת חשבונות שכוללים מע"מ לסכום נטו.'),
      field('תעריפון', el('select', { class: 'select', name: 'rateCardId' }, rateCards.map((c) => el('option', { value: c.id, text: c.name, selected: c.id === d.rateCardId ? 'selected' : null })))),
      field('התקדמות מדווחת (%)', el('input', { class: 'input num', type: 'number', step: '5', min: '0', max: '100', name: 'progressPct', value: String(d.progressPct) }),
        'בסיס לחישוב התחזית לסיום (EAC).'),
    ]),
    el('div', { class: 'form-actions' }, [
      el('button', { class: 'btn btn--primary', type: 'submit' }, [icon('check'), 'שמור שינויים']),
    ]),
  ]));

  root.append(form);

  root.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('flag'), 'תקציב בסיס (Baseline)']),
    el('p', { class: 'panel__hint', text: 'קיבוע תקציב מאושר לצורך זיהוי זחילת היקף. שינויים לאחר הקיבוע יוצגו כסטייה מהבסיס.' }),
    d.baseline
      ? el('div', { class: 'facts' }, [
        fact('תקציב הבסיס', money(d.baseline.budgetCost, d)),
        fact('נקבע בתאריך', new Date(d.baseline.capturedAt).toLocaleDateString('he-IL')),
        fact('התקציב הנוכחי', money(snap.budgetCost, d)),
        fact('סטייה', `${snap.baselineDelta.delta >= 0 ? '+' : ''}${money(snap.baselineDelta.delta, d)}`, snap.baselineDelta.delta > 0 ? 'neg' : 'pos'),
      ])
      : el('p', { class: 'panel__hint', text: 'טרם נקבע תקציב בסיס.' }),
    el('div', { class: 'form-actions' }, [
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'capture-baseline' } }, [icon('flag'), d.baseline ? 'עדכן בסיס לתקציב הנוכחי' : 'קבע תקציב בסיס']),
      d.baseline ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'clear-baseline' } }, 'בטל בסיס') : null,
    ]),
  ]));

  root.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('layers'), 'פעולות על העסקה']),
    el('div', { class: 'form-actions form-actions--wrap' }, [
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'duplicate-deal' } }, [icon('copy'), 'שכפל כתבנית']),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'sync-team-roles' } }, [icon('refresh'), 'סנכרן דרגות מהתעריפון']),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'export-deal' } }, [icon('download'), 'ייצוא העסקה (CSV)']),
      el('button', { class: 'btn btn--danger btn--sm', type: 'button', dataset: { action: 'delete-deal' } }, [icon('trash'), 'מחק עסקה']),
    ]),
  ]));
}

function field(label, control, hint) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field__label', text: label }),
    control,
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  ]);
}

/* ============================================================
   תעריפונים (מסך גלובלי)
   ============================================================ */

export function renderRatesView(root, { rateCards, deals }) {
  root.replaceChildren();
  root.append(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title', text: 'תעריפונים' }),
      el('p', { class: 'page-sub', text: 'הדרגות והתעריפים שמשמשים את כל העסקאות. אפשר להחזיק כמה תעריפונים (לקוח אסטרטגי, שנה קודמת, מטבע אחר).' }),
    ]),
    el('div', { class: 'page-actions' }, [
      el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'new-ratecard' } }, [icon('plus'), 'תעריפון חדש']),
    ]),
  ]));

  for (const card of rateCards) {
    const used = deals.filter((d) => d.rateCardId === card.id).length;
    const section = el('section', { class: 'panel', dataset: { cardId: card.id } }, [
      el('div', { class: 'rc-head' }, [
        el('input', { class: 'rc-name', value: card.name, dataset: { field: 'name', cardId: card.id }, 'aria-label': 'שם התעריפון' }),
        card.isDefault ? el('span', { class: 'pill pill--ok', text: 'ברירת מחדל' })
          : el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'set-default-ratecard', cardId: card.id } }, 'הפוך לברירת מחדל'),
        el('span', { class: 'muted', text: `${used} עסקאות` }),
        el('div', { class: 'toolbar__spacer' }),
        el('button', { class: 'iconbtn iconbtn--danger', type: 'button', title: 'מחק תעריפון', dataset: { action: 'delete-ratecard', cardId: card.id }, html: ICONS.trash }),
      ]),
      el('table', { class: 'btable btable--rates' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: 'דרגה' }), el('th', { text: 'תעריף לשעה (₪)' }),
          el('th', { text: 'ג\'וניור', title: 'דרגות ג\'וניור אינן נכללות בחישוב התעריף הבלנדד' }),
          el('th', { class: 'th-tools' }),
        ])),
        el('tbody', {}, card.roles.map((r) => el('tr', {}, [
          el('td', {}, [el('input', { class: 'cellinput', value: r.name, dataset: { field: 'roleName', cardId: card.id, roleId: r.id } })]),
          el('td', {}, [el('input', { class: 'cellinput num', type: 'number', step: '10', min: '0', value: String(r.rate), dataset: { field: 'roleRate', cardId: card.id, roleId: r.id } })]),
          el('td', {}, [el('input', { type: 'checkbox', checked: r.junior ? 'checked' : null, dataset: { field: 'roleJunior', cardId: card.id, roleId: r.id } })]),
          el('td', { class: 'td-tools' }, [
            el('button', { class: 'iconbtn iconbtn--danger', type: 'button', title: 'מחק דרגה', dataset: { action: 'delete-role', cardId: card.id, roleId: r.id }, html: ICONS.trash }),
          ]),
        ]))),
      ]),
      el('div', { class: 'team__foot' }, [
        el('button', { class: 'btn-add-row btn-add-row--sm', type: 'button', dataset: { action: 'add-role', cardId: card.id } }, [icon('plus'), 'הוסף דרגה']),
      ]),
    ]);
    root.append(section);
  }
}

/* ============================================================
   טפסים במודאל
   ============================================================ */

export function renderDealForm(deal, rateCards) {
  const d = deal || {};
  return el('form', { class: 'modal-form', id: 'deal-modal-form' }, [
    field('שם העסקה', el('input', { class: 'input', name: 'name', value: d.name || '', required: 'required', placeholder: 'רכישת חברת …' })),
    el('div', { class: 'grid-2' }, [
      field('לקוח', el('input', { class: 'input', name: 'client', value: d.client || '' })),
      field('מספר תיק', el('input', { class: 'input', name: 'code', value: d.code || '' })),
    ]),
    el('div', { class: 'grid-2' }, [
      field('מודל שכר טרחה', el('select', { class: 'select', name: 'feeModel' }, FEE_MODELS.map((f) => el('option', { value: f.id, text: f.label })))),
      field('שכ"ט מוסכם / תקרה (₪)', el('input', { class: 'input num', type: 'number', step: '1000', min: '0', name: 'agreedFee', value: '0' })),
    ]),
    el('div', { class: 'grid-2' }, [
      field('מקדם חריגה', el('input', { class: 'input num', type: 'number', step: '0.05', min: '0', max: '2', name: 'overrunFactor', value: '0.2' })),
      field('תעריפון', el('select', { class: 'select', name: 'rateCardId' }, rateCards.map((c) => el('option', { value: c.id, text: c.name, selected: c.isDefault ? 'selected' : null })))),
    ]),
    el('div', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'צוותים ראשוניים' }),
      el('div', { class: 'checkline', id: 'team-presets' }),
      el('span', { class: 'field__hint', text: 'כל צוות נוצר עם אותה מתודולוגיה — שורה לכל דרגה בתעריפון. אפשר להוסיף צוותים בהמשך.' }),
    ]),
  ]);
}

export function renderEntryForm(entry, { teams, roles, deal }) {
  const e = entry || {};
  return el('form', { class: 'modal-form', id: 'entry-form' }, [
    el('div', { class: 'grid-2' }, [
      field('תאריך', el('input', { class: 'input num', type: 'date', name: 'date', value: e.date || new Date().toISOString().slice(0, 10), required: 'required' })),
      field('סוג', el('select', { class: 'select', name: 'kind' }, ENTRY_KINDS.map((k) => el('option', { value: k.id, text: k.label, selected: k.id === e.kind ? 'selected' : null })))),
    ]),
    field('תיאור', el('input', { class: 'input', name: 'description', value: e.description || '', placeholder: 'בדיקת נאותות — סקירת הסכמי העסקה' })),
    el('div', { class: 'grid-2' }, [
      field('צוות', el('select', { class: 'select', name: 'teamId' }, [
        el('option', { value: '', text: '— ללא שיוך —' }),
        ...teams.map((t) => el('option', { value: t.id, text: t.name, selected: t.id === e.teamId ? 'selected' : null })),
      ])),
      field('דרגה', el('select', { class: 'select', name: 'roleId' }, [
        el('option', { value: '', text: '— ללא דרגה —' }),
        ...roles.map((r) => el('option', { value: r.id, text: `${r.name} · ${r.rate}₪`, selected: r.id === e.roleId ? 'selected' : null })),
      ])),
    ]),
    el('div', { class: 'grid-3' }, [
      field('שעות', el('input', { class: 'input num', type: 'number', step: '0.25', min: '0', name: 'hours', value: String(e.hours ?? '') })),
      field('תעריף', el('input', { class: 'input num', type: 'number', step: '10', min: '0', name: 'rate', value: String(e.rate ?? '') })),
      field('סכום (₪)', el('input', { class: 'input num', type: 'number', step: '1', name: 'amount', value: String(e.amount ?? ''), placeholder: 'אוטומטי' })),
    ]),
    el('div', { class: 'grid-3' }, [
      field('עורך דין / עובד', el('input', { class: 'input', name: 'person', value: e.person || '', placeholder: 'שם מפירוט השעות' })),
      field('ספק / גורם', el('input', { class: 'input', name: 'supplier', value: e.supplier || '' })),
      field('מספר מסמך', el('input', { class: 'input num', name: 'docNumber', value: e.docNumber || '' })),
    ]),
    el('div', { class: 'grid-2' }, [
      field('סטטוס', el('select', { class: 'select', name: 'status' }, ENTRY_STATUSES.map((s) => el('option', { value: s.id, text: s.label, selected: s.id === e.status ? 'selected' : null })))),
      el('label', { class: 'field field--check' }, [
        el('input', { type: 'checkbox', name: 'vatIncluded', checked: e.vatIncluded ? 'checked' : null }),
        el('span', { text: `הסכום כולל מע"מ (${fmtPct(deal.vatRate)})` }),
      ]),
    ]),
    field('צירוף קובץ החשבון', el('input', { class: 'input', type: 'file', name: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv' }),
      e.fileName ? `מצורף כעת: ${e.fileName}` : 'נשמר מקומית במכשיר — זמין גם ללא חיבור.'),
  ]);
}

/* ============================================================
   אשף ייבוא
   ============================================================ */

export function renderImportPreview({
  sheets, sheetIndex, headerRow, mapping, marked, teams, warnings, mode,
  people = [], peopleTeams = {}, peopleRemembered = {},
}) {
  const wrap = el('div', { class: 'import' });

  if (sheets.length > 1) {
    wrap.append(field('גיליון', el('select', { class: 'select', dataset: { imp: 'sheet' } },
      sheets.map((s, i) => el('option', { value: String(i), text: s.name, selected: i === sheetIndex ? 'selected' : null })))));
  }

  if (mode === 'entries') {
    wrap.append(el('div', { class: 'grid-2' }, [
      field('שורת כותרות', el('input', { class: 'input num', type: 'number', min: '1', value: String(headerRow + 1), dataset: { imp: 'headerRow' } }),
        'מספר השורה בגיליון שמכילה את שמות העמודות.'),
      field('שיוך ברירת מחדל לצוות', el('select', { class: 'select', dataset: { imp: 'defaultTeam' } }, [
        el('option', { value: '', text: '— ללא —' }),
        ...teams.map((t) => el('option', { value: t.id, text: t.name })),
      ]), 'ישמש לשורות שבהן לא זוהה צוות.'),
    ]));

    const rows = sheets[sheetIndex].rows;
    const header = rows[headerRow] || [];
    const mapTable = el('table', { class: 'btable btable--map' }, [
      el('thead', {}, el('tr', {}, [el('th', { text: 'עמודה בקובץ' }), el('th', { text: 'דוגמה' }), el('th', { text: 'שדה במערכת' })])),
      el('tbody', {}, header.map((h, idx) => {
        const sample = (rows.slice(headerRow + 1).find((r) => r && r[idx] !== null && r[idx] !== undefined) || [])[idx];
        const current = Object.entries(mapping).find(([, v]) => v === idx)?.[0] || '';
        return el('tr', {}, [
          el('td', { text: String(h ?? `עמודה ${idx + 1}`) }),
          el('td', { class: 'muted', text: sample === null || sample === undefined ? '—' : String(sample) }),
          el('td', {}, [el('select', { class: 'select select--sm', dataset: { imp: 'map', col: String(idx) } }, [
            el('option', { value: '', text: '— התעלם —' }),
            ...TARGET_FIELD_OPTIONS.map((f) => el('option', { value: f.id, text: f.label, selected: f.id === current ? 'selected' : null })),
          ])]),
        ]);
      })),
    ]);
    wrap.append(el('div', { class: 'btable-wrap btable-wrap--map' }, mapTable));

    // שיוך עורכי הדין שבפירוט לצוותים — נזכר לעסקאות הבאות
    if (people.length) {
      const unassigned = people.filter((p) => !peopleTeams[p.key]).length;
      const teamOptions = (selectedId) => [
        el('option', { value: '', text: '— ללא שיוך —' }),
        ...teams.map((t) => el('option', { value: t.id, text: t.name, selected: t.id === selectedId ? 'selected' : null })),
      ];
      wrap.append(el('section', { class: 'panel panel--people' }, [
        el('h3', { class: 'panel__title' }, [
          icon('users'), `שיוך עורכי דין לצוותים · ${people.length} שמות בקובץ`,
          unassigned ? el('span', { class: 'pill pill--watch', text: `${unassigned} ללא שיוך` }) : null,
        ]),
        el('p', { class: 'panel__hint', text: 'כל שורה בפירוט תשויך לצוות לפי עורך הדין שביצע. השיוך נשמר וייטען אוטומטית בייבוא הבא, גם בעסקאות אחרות.' }),
        el('div', { class: 'people-bulk' }, [
          el('span', { class: 'muted', text: 'שייך את כולם ל:' }),
          el('select', { class: 'select select--sm', dataset: { imp: 'personTeamAll' } }, teamOptions(undefined)),
        ]),
        el('div', { class: 'btable-wrap' }, el('table', { class: 'btable btable--people' }, [
          el('thead', {}, el('tr', {}, [
            el('th', { text: 'עורך דין / עובד' }), el('th', { text: 'שורות' }),
            el('th', { text: 'שעות' }), el('th', { text: 'צוות' }),
          ])),
          el('tbody', {}, people.map((p) => el('tr', { class: peopleTeams[p.key] ? '' : 'row--dupe' }, [
            el('td', {}, [
              el('span', { text: p.name }),
              peopleRemembered[p.key] ? el('span', { class: 'chip-mini', text: 'נזכר' }) : null,
            ]),
            el('td', { class: 'num', text: String(p.rows) }),
            el('td', { class: 'num', text: fmtHours(p.hours) }),
            el('td', {}, [el('select', {
              class: 'select select--sm',
              dataset: { imp: 'personTeam', personKey: p.key },
            }, teamOptions(peopleTeams[p.key]))]),
          ]))),
        ])),
        el('label', { class: 'inline-check' }, [
          el('input', { type: 'checkbox', checked: 'checked', dataset: { imp: 'rememberPeople' } }),
          el('span', { text: 'זכור את השיוך לעסקאות הבאות' }),
        ]),
      ]));
    }
  }

  if (warnings?.length) {
    wrap.append(el('ul', { class: 'alerts alerts--compact' }, warnings.map((w) => el('li', { class: 'alert alert--watch' }, [icon('info'), el('span', { text: w })]))));
  }

  if (marked) {
    const dupes = marked.filter((m) => m.duplicate).length;
    wrap.append(el('div', { class: 'import__summary' }, [
      el('strong', { text: `${marked.length} רישומים לייבוא` }),
      dupes ? el('span', { class: 'pill pill--watch', text: `${dupes} כפילויות אפשריות` }) : null,
      el('label', { class: 'inline-check' }, [
        el('input', { type: 'checkbox', checked: 'checked', dataset: { imp: 'skipDupes' } }),
        el('span', { text: 'דלג על כפילויות' }),
      ]),
    ]));

    const prev = el('table', { class: 'etable etable--preview' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'תאריך' }), el('th', { text: 'תיאור' }), el('th', { text: 'צוות' }),
        el('th', { text: 'דרגה' }), el('th', { text: 'שעות' }), el('th', { text: 'סכום' }), el('th', { text: '' }),
      ])),
      el('tbody', {}, marked.slice(0, 40).map(({ entry, duplicate }) => el('tr', { class: duplicate ? 'row--dupe' : '' }, [
        el('td', { class: 'num', text: entry.date }),
        el('td', { text: entry.description || '—' }),
        el('td', { text: teams.find((t) => t.id === entry.teamId)?.name || '—' }),
        el('td', { text: entry.roleId ? '✓' : '—' }),
        el('td', { class: 'num', text: entry.hours ? fmtHours(entry.hours) : '—' }),
        el('td', { class: 'num', text: fmtMoney(entry.amount) }),
        el('td', { text: duplicate ? 'כפילות' : '' }),
      ]))),
    ]);
    wrap.append(el('div', { class: 'btable-wrap' }, prev));
  }

  return wrap;
}

const TARGET_FIELD_OPTIONS = [
  { id: 'date', label: 'תאריך' }, { id: 'description', label: 'תיאור' },
  { id: 'teamName', label: 'צוות' }, { id: 'roleName', label: 'דרגה' },
  { id: 'hours', label: 'שעות' }, { id: 'rate', label: 'תעריף' },
  { id: 'amount', label: 'סכום' }, { id: 'supplier', label: 'ספק' },
  { id: 'docNumber', label: 'מס\' מסמך' },
];

export function renderBudgetImportPreview(parsed, { roles }) {
  const wrap = el('div', { class: 'import' });
  wrap.append(el('p', { class: 'panel__hint', text: 'זוהה מבנה התקציב הבא. הצוותים ייווצרו בעסקה הנוכחית עם השעות המוערכות שזוהו.' }));

  if (parsed.overrunFactor !== null) {
    wrap.append(el('div', { class: 'import__summary' }, [
      el('strong', { text: `מקדם חריגה שזוהה: ${fmtPct(parsed.overrunFactor)}` }),
      el('label', { class: 'inline-check' }, [
        el('input', { type: 'checkbox', checked: 'checked', dataset: { imp: 'applyFactor' } }),
        el('span', { text: 'החל על העסקה' }),
      ]),
    ]));
  }

  if (parsed.roles.length) {
    wrap.append(el('div', { class: 'import__summary' }, [
      el('strong', { text: 'תעריפים שזוהו: ' }),
      el('span', { text: parsed.roles.map((r) => `${r.name} ${fmtMoney(r.rate)}`).join(' · ') }),
      el('label', { class: 'inline-check' }, [
        el('input', { type: 'checkbox', dataset: { imp: 'applyRates' } }),
        el('span', { text: 'עדכן את התעריפון' }),
      ]),
    ]));
  }

  const roleNames = new Set(roles.map((r) => r.name.trim()));
  const table = el('table', { class: 'btable' }, [
    el('thead', {}, el('tr', {}, [el('th', { text: 'צוות' }), el('th', { text: 'דרגה' }), el('th', { text: 'שעות מוערכות' }), el('th', { text: 'שעות תקציב' }), el('th', { text: 'עלות' }), el('th', { text: 'התאמה' })])),
    el('tbody', {}, parsed.teams.flatMap((t) => (t.lines.length ? t.lines : [null]).map((l, i) => (l === null
      ? el('tr', {}, [
        el('td', { text: t.name }),
        el('td', { class: 'muted', colspan: '4', text: 'ללא שעות בגיליון — ייווצר עם שורה לכל דרגה' }),
        el('td', { class: 'muted', text: '—' }),
      ])
      : el('tr', {}, [
      el('td', { text: i === 0 ? t.name : '' }),
      el('td', { text: l.roleName }),
      el('td', { class: 'num', text: fmtHours(l.estHours) }),
      el('td', { class: 'num', text: fmtHours(l.budgetHours) }),
      el('td', { class: 'num', text: fmtMoney(l.cost) }),
      el('td', { class: roleNames.has(l.roleName.trim()) ? 'ok' : 'warn', text: roleNames.has(l.roleName.trim()) ? 'דרגה קיימת' : 'דרגה חדשה — תיווצר' }),
      ]))))),
  ]);
  wrap.append(el('div', { class: 'btable-wrap' }, table));

  if (parsed.notes.length) {
    wrap.append(el('ul', { class: 'alerts alerts--compact' }, parsed.notes.map((n) => el('li', { class: 'alert alert--watch' }, [icon('info'), el('span', { text: n })]))));
  }
  return wrap;
}

/* ============================================================
   Toast
   ============================================================ */

let toastTimer = null;
export function toast(message, tone = '') {
  let node = document.getElementById('toast');
  if (!node) {
    node = el('div', { class: 'toast', id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  node.className = `toast ${tone ? `toast--${tone}` : ''}`.trim();
  node.replaceChildren(icon(tone === 'error' ? 'alert' : 'check'), el('span', { text: message }));
  node.classList.remove('gone');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.add('gone');
    setTimeout(() => node.remove(), 320);
  }, 3200);
}

/* ============================================================
   עדכון תאים מחושבים ללא רינדור מלא (שמירה על פוקוס בהקלדה)
   ============================================================ */

export function refreshComputed(snap, selected = new Set()) {
  const d = snap.deal;
  const set = (key, text, tone) => {
    const node = document.querySelector(`[data-calc="${CSS.escape(key)}"]`);
    if (!node) return;
    node.textContent = text;
    if (tone !== undefined) node.classList.toggle('neg', !!tone);
  };
  const setStatus = (key, status, label) => {
    const node = document.querySelector(`[data-calc="${CSS.escape(key)}"]`);
    if (!node) return;
    node.textContent = label;
    node.className = `pill pill--${status}`;
  };

  for (const team of snap.teams) {
    set(`team-budget-${team.id}`, money(team.budgetCost, d));
    set(`team-cost-${team.id}`, money(team.budgetCost, d));
    set(`team-hours-${team.id}`, fmtHours(team.budgetHours));
    set(`team-est-${team.id}`, fmtHours(team.estHours));
    set(`team-remaining-${team.id}`, money(team.remainingCost, d), team.remainingCost < 0);
    setStatus(`team-status-${team.id}`, team.status, `${STATUS_LABEL[team.status]} · ${fmtPct(team.util)}`);
    const bar = document.querySelector(`.team[data-team-id="${CSS.escape(team.id)}"] .team__bar`);
    if (bar) bar.innerHTML = miniBar(team.util, team.status);
    for (const line of team.lines) {
      set(`line-cost-${line.id}`, money(line.budgetCost, d));
      set(`line-remaining-${line.id}`, money(line.remainingCost, d), line.remainingCost < 0);
      const util = document.querySelector(`[data-calc="line-util-${CSS.escape(line.id)}"]`);
      if (util) { util.textContent = fmtPct(line.util); util.className = `num pct pct--${line.status}`; }
      const input = document.querySelector(`input[data-field="hoursOverride"][data-line-id="${CSS.escape(line.id)}"]`);
      if (input && input.dataset.auto === '1' && document.activeElement !== input) input.value = String(line.budgetHours);
    }
  }

  set('total-budget', money(snap.budgetCost, d));
  set('total-hours', fmtHours(snap.budgetHours));
  set('total-est', fmtHours(snap.estHours));
  set('total-blended', money(snap.blendedRate, d));
  set('total-blended-all', money(snap.blendedAll, d));

  // סרגל הכותרת של העסקה — היה נשאר תקוע על הערכים מהרינדור האחרון
  set('strip-budget', money(snap.budgetCost, d));
  set('strip-actual', money(snap.actualCost, d));
  set('strip-remaining', money(snap.remainingCost, d));
  set('strip-util', fmtPct(snap.util));
  set('strip-hours', `${fmtHours(snap.actualHours)} / ${fmtHours(snap.budgetHours)}`);
  set('strip-blended', money(snap.blendedRate, d));
  if (snap.hasFee) set('strip-margin', money(snap.margin, d));

  if (selected.size) {
    const agg = aggregateTeams(snap, selected);
    set('agg-budget', money(agg.budgetCost, d));
    set('agg-actual', money(agg.actualCost, d));
    set('agg-remaining', money(agg.remainingCost, d), agg.remainingCost < 0);
    set('agg-util', fmtPct(agg.util));
    set('agg-hours', fmtHours(agg.budgetHours));
    set('agg-actual-hours', fmtHours(agg.actualHours));
    set('agg-blended', money(agg.blendedRate, d));
    set('agg-share', fmtPct(agg.shareOfDeal));
  }

  // אחוז הניצול על טאב העסקה
  const tabUtil = document.querySelector(`.dtab[data-id="${CSS.escape(snap.deal.id)}"] .dtab__util`);
  if (tabUtil) tabUtil.textContent = fmtPct(snap.util);
  const tabDot = document.querySelector(`.dtab[data-id="${CSS.escape(snap.deal.id)}"] .dtab__dot`);
  if (tabDot) tabDot.className = `dtab__dot dtab__dot--${snap.status}`;
}

export { round2 };
