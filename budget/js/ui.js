// ui.js — רינדור DOM. כל קלט משתמש נכנס כ-textContent/value בלבד (מניעת XSS).
// אייקונים וגרפים הם SVG שנבנה בקוד (ללא קלט משתמש גולמי) ולכן מותר להם innerHTML.

import {
  fmtMoney, fmtHours, fmtPct, STATUS_LABEL, DEAL_STATUSES, FEE_MODELS,
  ENTRY_KINDS, ENTRY_STATUSES, TEAM_COLORS, num, round2, computePortfolio, burnSeries,
  aggregateTeams, progressByPeriod, sourceLabel, dealReview,
} from './model.js';
import { barCompare, donut, burnLine, gauge, miniBar } from './charts.js';
import { TARGET_FIELDS } from './importer.js';

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
  grip: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
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

/** הניצול שמייצג את העסקה — שעות שנשרפו מתוך שעות התקציב */
export function headlineUtil(snap) {
  return snap ? snap.util : 0;
}

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
    const st = snap ? statusOfUtil(headlineUtil(snap)) : 'ok';
    strip.append(el('button', {
      class: 'dtab', type: 'button', role: 'tab',
      'aria-selected': String(deal.id === activeId),
      dataset: { action: 'select-deal', id: deal.id },
      draggable: 'true',
      title: `${deal.name}${deal.client ? ` · ${deal.client}` : ''}`,
    }, [
      el('span', { class: `dtab__dot dtab__dot--${st}` }),
      el('span', { class: 'dtab__name', text: deal.name }),
      snap ? el('span', { class: 'dtab__util num', text: fmtPct(headlineUtil(snap)) }) : null,
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
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'export-portfolio' } }, [icon('download'), 'ייצוא סקירה לאקסל']),
      el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'new-deal' } }, [icon('plus'), 'עסקה חדשה']),
    ]),
  ]));

  root.append(el('div', { class: 'kpis' }, [
    kpi('תקציב מצטבר', fmtMoney(p.budgetCost), { sub: `${fmtHours(p.budgetHours)} שעות`, icon: 'target' }),
    kpi('בוצע בפועל', fmtMoney(p.actualCost), { sub: `${fmtHours(p.actualHours)} שעות · ניצול ${fmtPct(p.util)}`, icon: 'clock' }),
    kpi('יתרה', fmtMoney(p.remainingCost), { sub: `${fmtHours(p.remainingHours)} שעות`, tone: p.remainingCost < 0 ? 'neg' : 'pos', icon: 'wallet' }),
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
          statusPill(statusOfUtil(headlineUtil(s))),
          el('button', {
            class: 'iconbtn iconbtn--danger dcard__del', type: 'button', title: 'מחיקת העסקה',
            'aria-label': `מחיקת ${s.deal.name}`,
            dataset: { action: 'delete-deal', id: s.deal.id }, html: ICONS.trash,
          }),
        ]),
      ]),
      el('div', { class: 'dcard__bar', html: miniBar(headlineUtil(s), statusOfUtil(headlineUtil(s))) }),
      el('div', { class: 'dcard__nums' }, [
        el('div', {}, [el('span', { class: 'lbl', text: 'תקציב' }), el('span', { class: 'num', text: money(s.budgetCost, s.deal) })]),
        el('div', {}, [el('span', { class: 'lbl', text: 'בפועל' }), el('span', { class: 'num', text: money(s.actualCost, s.deal) })]),
        el('div', {}, [el('span', { class: 'lbl', text: 'יתרה' }), el('span', { class: `num ${s.remainingCost < 0 ? 'neg' : ''}`, text: money(s.remainingCost, s.deal) })]),
        el('div', {}, [el('span', { class: 'lbl', text: 'שעות' }), el('span', { class: 'num', text: `${fmtHours(s.actualHours)} / ${fmtHours(s.budgetHours)}` })]),
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
    dealBand(snap),
    factsRow(snap),
    el('nav', { class: 'subtabs', role: 'tablist' }, [
      subtab('budget', 'תקציב', 'target', tab),
      subtab('progress', 'דיווח ומעקב', 'clock', tab),
      subtab('actuals', 'חשבונות ומסמכים', 'receipt', tab),
      subtab('control', 'בקרה', 'trending', tab),
      subtab('review', 'תחקיר', 'flag', tab),
      subtab('settings', 'הגדרות', 'settings', tab),
    ]),
  ]);
  root.append(head);
}

/**
 * הפס העליון = שלוש שאלות בלבד, בשלושה גדלים: כמה נשרף · כמה נשאר · לאן זה הולך.
 * כל שאר המדדים יורדים לשורת העובדות (factsRow) — כדי שתהיה רמה ראשונה אחת.
 */
function dealBand(snap) {
  const d = snap.deal;
  const eacOver = snap.eacVariance !== null && snap.eacVariance < 0;

  const cell = (cls, label, valueNode, subNode) => el('div', { class: `hero3__cell ${cls}`.trim() }, [
    el('span', { class: 'hero3__label', text: label }),
    valueNode,
    subNode || null,
  ]);

  const main = el('div', { class: 'hero3__cell hero3__cell--main' }, [
    el('span', { class: 'hero3__label', text: 'ניצול התקציב' }),
    el('span', { class: 'hero3__val num', dataset: { calc: 'hero-util' }, text: fmtPct(snap.util) }),
    el('span', { class: 'hero3__bar', dataset: { calc: 'hero-bar', html: '1' }, html: miniBar(snap.util, snap.status) }),
    el('span', {
      class: 'hero3__sub num', dataset: { calc: 'hero-util-sub' },
      text: `${fmtHours(snap.actualHours)} מתוך ${fmtHours(snap.budgetHours)} שעות · ${money(snap.actualCost, d)} מתוך ${money(snap.budgetCost, d)}`,
    }),
  ]);

  const remaining = cell('', 'יתרה',
    el('span', {
      class: `hero3__mid num ${snap.remainingCost < 0 ? 'neg' : 'pos'}`,
      dataset: { calc: 'hero-remaining' }, text: money(snap.remainingCost, d),
    }),
    el('span', { class: 'hero3__sub num', dataset: { calc: 'hero-remaining-sub' }, text: `${fmtHours(snap.remainingHours)} שעות נותרו` }));

  // התחזית היא המספר שדורש פעולה — ולכן היא תא נפרד ולא עוד פריט ברצועה
  const forecast = snap.eac === null
    ? cell('', 'תעריף בלנדד (ללא ג\'וניור)',
      el('span', { class: 'hero3__mid num', dataset: { calc: 'hero-blended' }, text: money(snap.blendedRate, d) }),
      el('span', { class: 'hero3__sub', text: 'אין עדיין דיווח ביצוע לתחזית' }))
    : cell(`hero3__cell--risk${eacOver ? ' is-over' : ''}`, 'תחזית לסיום',
      el('span', { class: `hero3__mid num ${eacOver ? 'warn' : 'pos'}`, dataset: { calc: 'hero-eac' }, text: money(snap.eac, d) }),
      el('span', {
        class: 'hero3__sub num', dataset: { calc: 'hero-eac-sub' },
        text: `${money(Math.abs(snap.eacVariance), d)} ${eacOver ? 'מעל התקציב' : 'מתחת לתקציב'} · ${snap.eacBasis}`,
      }));

  const map = teamMap(snap);
  return el('div', { class: `band ${map ? '' : 'band--solo'}`.trim() }, [
    el('div', { class: 'hero3' }, [main, remaining, forecast]),
    map,
  ]);
}

/** מפת התקציב — רוחב המקטע הוא חלקו של הצוות. פרופורציה שמספר לא מעביר. */
function teamMap(snap) {
  const teams = snap.teams.filter((t) => t.budgetCost > 0).sort((a, b) => b.budgetCost - a.budgetCost);
  if (teams.length < 2) return null;
  const total = snap.budgetCost || 1;
  return el('section', { class: 'tmap' }, [
    el('div', { class: 'tmap__head' }, [
      el('span', { class: 'tmap__title', text: `מפת התקציב · ${snap.teams.length} צוותים` }),
      el('span', { class: 'tmap__hint', text: 'רוחב = חלק מהתקציב' }),
    ]),
    el('div', { class: 'tmap__stack' }, teams.map((t) => el('button', {
      class: `tmap__seg${t.status === 'over' ? ' tmap__seg--over' : ''}`, type: 'button',
      style: `flex:${t.budgetCost};background:${t.color}`,
      title: `${t.name} · ${money(t.budgetCost, snap.deal)}`,
      dataset: { action: 'focus-team', teamId: t.id },
    }, [el('span', { class: 'num', text: fmtPct(t.budgetCost / total) })]))),
    el('div', { class: 'tmap__legend' }, teams.map((t) => el('span', { class: 'tmap__key' }, [
      el('i', { style: `background:${t.color}` }), t.name,
    ]))),
  ]);
}

/** רמה שנייה — כל המדדים הנגזרים, בגודל אחיד וקטן. מחליף את פאנל "סיכום העסקה". */
function factsRow(snap) {
  const d = snap.deal;
  const item = (label, value, key, tone = '') => el('div', { class: 'frow__item' }, [
    el('span', { class: 'frow__label', text: label }),
    calcCell(key, value, `frow__val ${tone}`.trim()),
  ]);
  return el('div', { class: 'frow' }, [
    item('שעות תקציב', fmtHours(snap.budgetHours), 'f-budget-hours'),
    item('שעות מוערכות', fmtHours(snap.estHours), 'f-est-hours'),
    item('תעריף בלנדד (ללא ג\'וניור)', money(snap.blendedRate, d), 'f-blended'),
    item('תעריף ממוצע כולל', money(snap.blendedAll, d), 'f-blended-all'),
    item('בלנדד בפועל', money(snap.blendedActual, d), 'f-blended-actual'),
    snap.capBudget.applies ? item('בלנדד אחרי תקרה', money(snap.effectiveRates.blended, d), 'f-blended-eff', 'neg') : null,
    snap.hasFee ? item('שכ"ט מוסכם', money(snap.agreedFee, d), 'f-fee') : null,
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

export function renderBudgetTab(root, { snap, rateCard, selected = new Set(), expanded = new Set(), sort = 'priority' }) {
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
  const sortBtn = (id, label, title) => el('button', {
    class: `segbtn${sort === id ? ' is-on' : ''}`, type: 'button', title,
    'aria-pressed': String(sort === id), dataset: { action: 'set-team-sort', sort: id },
  }, [label]);

  wrap.append(el('div', { class: 'pickbar' }, [
    el('label', { class: 'inline-check' }, [allBox, el('span', { text: 'סמן את כל הצוותים' })]),
    el('span', { class: 'pickbar__hint', text: selected.size ? `${selected.size} צוותים מסומנים` : 'סמן צוותים כדי לקבל חישוב מצרפי' }),
    selected.size ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'clear-picks' } }, [icon('close'), 'נקה סימון']) : null,
    el('div', { class: 'seg' }, [
      el('span', { class: 'seg__label', text: 'מיון' }),
      sortBtn('priority', 'לפי דחיפות', 'צוותים שחרגו או בסיכון עולים לראש הרשימה'),
      sortBtn('manual', 'הסדר שלי', 'הסדר שקבעת בגרירה'),
    ]),
  ]));

  const section = (label, list, tone) => {
    if (!list.length) return;
    wrap.append(el('div', { class: `tsec ${tone ? `tsec--${tone}` : ''}`.trim(), text: `${label} · ${list.length}` }));
    wrap.append(teamListHead());
    const list_ = el('div', { class: 'tlist', dataset: { droplist: 'teams' } });
    for (const team of list) {
      for (const node of renderTeamRow(team, { snap, rateCard, selected, expanded })) list_.append(node);
    }
    wrap.append(list_);
  };

  if (sort === 'manual') {
    // הסדר שנקבע בגרירה — רשימה אחת, בלי קיבוץ שדורס אותו
    section('צוותים', snap.teams);
  } else {
    // הצוותים שדורשים טיפול עולים לראש הרשימה — העין מוצאת אותם בלי לסרוק
    const needsWork = snap.teams.filter((t) => t.status === 'over' || t.status === 'risk');
    const onTrack = snap.teams.filter((t) => !(t.status === 'over' || t.status === 'risk'));
    section('דורש טיפול', needsWork, 'alert');
    section(needsWork.length ? 'בתוואי' : 'צוותים', onTrack);
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
        totalItem('בוצע בפועל', money(agg.actualCost, d), 'agg-actual'),
        totalItem('יתרה', money(agg.remainingCost, d), 'agg-remaining'),
        totalItem('ניצול', fmtPct(agg.util), 'agg-util'),
        totalItem('שעות: בפועל / תקציב', `${fmtHours(agg.actualHours)} / ${fmtHours(agg.budgetHours)}`, 'agg-hours'),
        totalItem('בלנדד (ללא ג\'וניור)', money(agg.blendedRate, d), 'agg-blended'),
        totalItem('חלק מתקציב העסקה', fmtPct(agg.shareOfDeal), 'agg-share'),
      ]),
    ]));
  }

  // תעריפים אפקטיביים אחרי תקרת שכ"ט
  const capPanel = renderCapPanel(snap);
  if (capPanel) wrap.append(capPanel);

  // סיכום העסקה חי בפס העליון (dealBand + factsRow) — כאן נשאר רק מה שאין שם
  if (snap.baselineDelta) {
    wrap.append(el('div', { class: `baseline ${snap.baselineDelta.delta > 0 ? 'baseline--up' : ''}` }, [
      icon('flag'),
      el('span', { text: `מול תקציב הבסיס (${new Date(snap.baselineDelta.capturedAt).toLocaleDateString('he-IL')}): ` }),
      el('strong', { class: 'num', text: `${snap.baselineDelta.delta >= 0 ? '+' : ''}${money(snap.baselineDelta.delta, d)}` }),
      el('span', { class: 'num', text: snap.baselineDelta.pct === null ? '' : ` (${fmtPct(snap.baselineDelta.pct, 1)})` }),
    ]));
  }

  root.append(wrap);
}

/**
 * תקרת שכ"ט: כשהעלות עוברת את התקרה, מה שנגבה בפועל נמוך מהעלות —
 * ולכן כל תעריף (כולל הבלנדד והממוצע) מקבל את אותו מקדם הנחה.
 */
/**
 * מה באמת התקבל לשעה: שכ"ט שייגבה (תקרה/פיקס) חלקי השעות שדווחו בפועל.
 * זה המספר שמתדרדר עם כל שעה נוספת — ולכן הוא המדד האמיתי של רווחיות העסקה.
 */
function renderRealizedPanel(snap) {
  const d = snap.deal;
  const r = snap.realized;
  if (!r?.applies) return null;
  const gap = r.blendedSenior - snap.blendedRate;

  const row = (label, planned, actual, hint) => el('tr', {}, [
    el('td', {}, [el('span', { text: label }), hint ? el('span', { class: 'sub', text: hint }) : null]),
    el('td', { class: 'num', text: money(planned, d) }),
    el('td', { class: 'num td-strong', text: money(actual, d) }),
    el('td', { class: `num ${actual < planned ? 'neg' : 'pos'}`, text: `${actual > planned ? '+' : ''}${money(actual - planned, d)}` }),
    el('td', { class: `num ${actual < planned ? 'neg' : 'pos'}`, text: planned > 0 ? fmtPct(actual / planned - 1, 1) : '—' }),
  ]);

  return el('section', { class: `panel panel--cap${gap < 0 ? ' panel--cap-on' : ''}` }, [
    el('h2', { class: 'panel__title' }, [
      icon('wallet'), 'תעריף בלנדד שהתקבל בפועל',
      el('span', { class: `pill pill--${gap < 0 ? 'over' : 'ok'}`, text: gap < 0 ? `${fmtPct(Math.abs(gap / (snap.blendedRate || 1)), 1)} מתחת למתוכנן` : 'מעל המתוכנן' }),
    ]),
    el('p', { class: 'panel__hint', text: `${fmtMoney(r.collected)} שנגבים על העסקה, מחולקים לשעות שדווחו בפועל. כל שעה נוספת מדללת את התעריף — בלי קשר לתעריפון.` }),
    el('div', { class: 'facts facts--lg' }, [
      fact('שכ"ט שייגבה', money(r.collected, d)),
      fact('שעות בפועל', fmtHours(r.hours)),
      fact('מהן ללא ג\'וניורים', fmtHours(r.seniorHours)),
      fact('שעות ג\'וניורים', fmtHours(r.juniorHours)),
    ]),
    el('div', { class: 'btable-wrap' }, el('table', { class: 'btable btable--rates' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'תעריף בלנדד' }), el('th', { text: 'מתוכנן' }), el('th', { text: 'בפועל' }),
        el('th', { text: 'הפרש' }), el('th', { text: 'שינוי' }),
      ])),
      el('tbody', {}, [
        row('ללא ג\'וניורים', snap.blendedRate, r.blendedSenior, 'השכ"ט חלקי שעות הדרגות הבכירות — עבודת הג\'וניורים כלולה במחיר'),
        row('כולל כל השעות', snap.blendedAll, r.blendedAll, 'השכ"ט חלקי כל השעות שדווחו'),
      ]),
    ])),
  ]);
}

function renderCapPanel(snap) {
  const d = snap.deal;
  const cap = snap.capBudget;
  if (!snap.hasFee) return null;

  const rows = snap.effectiveRates.roles.filter((r) => r.rate > 0);
  return el('section', { class: `panel panel--cap${cap.applies ? ' panel--cap-on' : ''}` }, [
    el('h2', { class: 'panel__title' }, [
      icon('wallet'), 'תקרת שכ"ט ותעריפים אפקטיביים',
      cap.applies
        ? el('span', { class: 'pill pill--over', text: `הנחה אפקטיבית ${fmtPct(cap.discountPct, 1)}` })
        : el('span', { class: 'pill pill--ok', text: 'התקציב בתוך התקרה' }),
    ]),
    el('p', { class: 'panel__hint', text: cap.applies
      ? `התקציב ${fmtMoney(cap.cost)} מול תקרה ${fmtMoney(cap.collected)} — פער של ${fmtMoney(cap.discount)}. כל תעריף נגבה בפועל לפי ${fmtPct(cap.factor, 1)} מערכו.`
      : `התקציב ${fmtMoney(cap.cost)} אינו עובר את התקרה ${fmtMoney(snap.agreedFee)} — התעריפים נגבים במלואם.` }),
    // התעריף שהתקבל בפועל: התקרה חלקי השעות שכבר דווחו (ולא חלקי שעות התקציב)
    snap.realized?.applies ? el('div', { class: 'facts facts--lg' }, [
      fact('תקרת שכ"ט', money(snap.agreedFee, d)),
      fact('שעות שדווחו בפועל', fmtHours(snap.realized.hours)),
      fact('תעריף בפועל (תקרה ÷ שעות)', money(snap.realized.blendedAll, d),
        snap.realized.blendedAll < snap.blendedAll ? 'neg' : 'pos'),
      fact('תעריף בפועל ללא ג\'וניורים', money(snap.realized.blendedSenior, d),
        snap.realized.blendedSenior < snap.blendedRate ? 'neg' : 'pos'),
    ]) : null,
    el('div', { class: 'btable-wrap' }, el('table', { class: 'btable btable--rates' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'דרגה' }), el('th', { text: 'תעריף' }), el('th', { text: 'תעריף אפקטיבי' }), el('th', { text: 'הפרש' }),
      ])),
      el('tbody', {}, [
        ...rows.map((r) => el('tr', {}, [
          el('td', { text: r.name + (r.junior ? ' (ג\'וניור)' : '') }),
          el('td', { class: 'num', text: money(r.rate, d) }),
          el('td', { class: 'num td-strong', text: money(r.effective, d) }),
          el('td', { class: `num ${r.effective < r.rate ? 'neg' : ''}`, text: money(r.effective - r.rate, d) }),
        ])),
        el('tr', { class: 'row--total' }, [
          el('td', { text: 'בלנדד (ללא ג\'וניור)' }),
          el('td', { class: 'num', text: money(snap.blendedRate, d) }),
          el('td', { class: 'num td-strong', text: money(snap.effectiveRates.blended, d) }),
          el('td', { class: `num ${snap.effectiveRates.blended < snap.blendedRate ? 'neg' : ''}`, text: money(snap.effectiveRates.blended - snap.blendedRate, d) }),
        ]),
        el('tr', { class: 'row--total' }, [
          el('td', { text: 'ממוצע כולל' }),
          el('td', { class: 'num', text: money(snap.blendedAll, d) }),
          el('td', { class: 'num td-strong', text: money(snap.effectiveRates.blendedAll, d) }),
          el('td', { class: `num ${snap.effectiveRates.blendedAll < snap.blendedAll ? 'neg' : ''}`, text: money(snap.effectiveRates.blendedAll - snap.blendedAll, d) }),
        ]),
      ]),
    ])),
  ]);
}

function totalItem(label, value, calcKey, hint) {
  return el('div', { class: 'total', title: hint || null }, [
    el('span', { class: 'total__label', text: label }),
    calcKey ? calcCell(calcKey, value, 'total__value') : el('span', { class: 'total__value num', text: value }),
  ]);
}

/** כותרות העמודות של רשימת הצוותים — פעם אחת מעל הרשימה, לא תווית בכל שורה */
function teamListHead() {
  const c = (text) => el('span', { class: 'trow__head-cell', text });
  return el('div', { class: 'trow trow--head' }, [
    el('span', {}), el('span', {}), el('span', {}), c('צוות'), c('ניצול שעות'),
    c('בוצע / תקציב'), c('עלות בפועל'), c('יתרה'), el('span', {}), el('span', {}),
  ]);
}

/**
 * צוות = שורה אחת ברשימה; הגיליון נפתח מתחתיה.
 * כך רואים את כל הצוותים במסך אחד, והפרופורציה ביניהם נקראת בלי לקרוא מספרים.
 */
function renderTeamRow(team, { snap, rateCard, selected = new Set(), expanded = new Set() }) {
  const d = snap.deal;
  const isOpen = expanded.has(team.id);
  const share = snap.budgetCost > 0 ? team.budgetCost / snap.budgetCost : 0;

  const cell = (calcKey, value, tone = '') => el('div', { class: 'trow__cell' }, [
    calcCell(calcKey, value, `trow__val ${tone}`.trim()),
  ]);

  const row = el('div', {
    class: `trow${isOpen ? ' trow--open' : ''}${team.status === 'over' ? ' trow--alert' : ''}`,
    dataset: { teamId: team.id, action: 'toggle-team' },
    style: `--team-color:${team.color}`,
  }, [
    el('span', { class: 'trow__rail' }),
    // ידית גרירה: השורה נעשית draggable רק בלחיצה עליה, אחרת אי אפשר לסמן טקסט בשדות
    el('button', {
      class: 'trow__grip', type: 'button', html: ICONS.grip,
      title: 'גרירה לשינוי סדר · Alt+↑ / Alt+↓',
      'aria-label': `שינוי מיקום הצוות ${team.name}`,
      dataset: { grip: 'team', teamId: team.id },
    }),
    el('label', { class: 'trow__pick', title: 'סימון הצוות לחישוב מצרפי' }, [
      el('input', {
        type: 'checkbox', dataset: { pick: 'team', teamId: team.id },
        checked: selected.has(team.id) ? 'checked' : null,
        'aria-label': `סימון הצוות ${team.name} לחישוב מצרפי`,
      }),
    ]),
    el('div', { class: 'trow__id' }, [
      el('input', {
        class: 'trow__name', value: team.name, 'aria-label': 'שם הצוות',
        dataset: { field: 'name', teamId: team.id },
      }),
      el('span', { class: 'trow__meta num', dataset: { calc: `team-share-${team.id}` }, text: `${fmtPct(share)} מהתקציב · ${money(team.budgetCost, d)}` }),
    ]),
    el('div', { class: 'trow__bar', title: fmtPct(team.util), dataset: { calc: `team-bar-${team.id}`, html: '1' }, html: miniBar(team.util, team.status) }),
    cell(`team-hours-live-${team.id}`, `${fmtHours(team.actualHours)} / ${fmtHours(team.budgetHours)}`),
    cell(`team-actual-${team.id}`, money(team.actualCost, d), 'quiet'),
    cell(`team-remaining-${team.id}`, money(team.remainingCost, d), team.remainingCost < 0 ? 'neg' : ''),
    statusPill(team.status, `${STATUS_LABEL[team.status]} · ${fmtPct(team.util)}`, `team-status-${team.id}`),
    el('div', { class: 'trow__tools' }, [
      el('button', { class: 'iconbtn', type: 'button', title: 'שכפל צוות', dataset: { action: 'duplicate-team', teamId: team.id }, html: ICONS.copy }),
      el('button', { class: 'iconbtn iconbtn--danger', type: 'button', title: 'מחק צוות', dataset: { action: 'delete-team', teamId: team.id }, html: ICONS.trash }),
      el('span', { class: 'trow__chev', 'aria-hidden': 'true', text: isOpen ? '▲' : '▼' }),
    ]),
  ]);

  if (!isOpen) return [row];
  return [row, el('div', { class: `tsheet${team.status === 'over' ? ' tsheet--alert' : ''}`, dataset: { teamBody: team.id } }, [
    el('div', { class: 'btable-wrap' }, teamSheet(team, { snap, rateCard })),
    el('div', { class: 'team__foot' }, [
      el('button', { class: 'btn-add-row btn-add-row--sm', type: 'button', dataset: { action: 'add-line', teamId: team.id } }, [icon('plus'), 'הוסף שורה']),
      el('button', { class: 'btn-add-row btn-add-row--sm', type: 'button', dataset: { action: 'split-by-person', teamId: team.id }, title: 'שורה לכל עורך דין — לתמחור לפי אדם' }, [icon('users'), 'פרוס לפי אנשי צוות']),
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
    ]),
  ])];
}

/** פער השעות של שורה — מוצג רק כשיש חריגה, כדי שדיו יופיע רק איפה שיש בעיה */
function overText(actual, budget) {
  const delta = round2(actual - budget);
  return delta > 0.05 ? `+${fmtHours(delta)} ש׳` : '—';
}

/**
 * הגיליון בשלוש רמות בולטוּת:
 * עוגן (שעות בוצע/תקציב + מד) ← תוצר מחושב (₪) ← קלט תכנון (מוערכות/תעריף).
 */
function teamSheet(team, { snap, rateCard }) {
  const d = snap.deal;
  const maxHours = Math.max(1, ...team.lines.map((l) => l.budgetHours || 0));
  const table = el('table', { class: 'btable btable--sheet' });

  table.append(el('thead', {}, [
    el('tr', { class: 'btable__groups' }, [
      el('th', { colspan: '4', text: 'ביצוע מול תקציב' }),
      el('th', { colspan: '3', class: 'grp grp--money', text: 'כסף נגזר' }),
      el('th', { colspan: '2', class: 'grp grp--plan', text: 'קלט תכנון' }),
      el('th', { class: 'th-tools' }),
    ]),
    el('tr', {}, [
      el('th', { class: 'th-role', text: 'דרגה' }),
      el('th', { class: 'th-anchor', text: 'שעות · בוצע מתוך תקציב', title: 'המספר הגדול = שעות שדווחו (מכל המקורות). לידו שעות התקציב, וניתן לדרוס אותן.' }),
      el('th', { class: 'th-util', text: 'ניצול' }),
      el('th', { class: 'th-delta', text: 'חריגה' }),
      el('th', { class: 'col-sep', text: 'תקציב ₪' }),
      el('th', { text: 'עלות בפועל ₪', title: 'שעות בפועל × תעריף התכנון' }),
      el('th', { text: 'יתרה ₪' }),
      el('th', { class: 'th-plan', text: 'מוערכות', title: 'ההערכה הראשונית של הצוות' }),
      el('th', { class: 'th-plan', text: 'תעריף' }),
      el('th', { class: 'th-tools' }),
    ]),
  ]));

  const tbody = el('tbody');
  for (const line of team.lines) {
    tbody.append(el('tr', { class: `bline bline--${line.status}`, dataset: { lineId: line.id, teamId: team.id } }, [
      el('td', { class: 'td-role' }, [
        el('button', {
          class: 'trow__grip line__grip', type: 'button', html: ICONS.grip, tabindex: '-1',
          title: 'גרירה לשינוי סדר השורות · Alt+↑ / Alt+↓',
          'aria-label': `שינוי מיקום השורה ${line.roleName || ''}`,
          dataset: { grip: 'line', lineId: line.id, teamId: team.id },
        }),
        el('select', {
          class: `cellinput cellinput--role${line.orphanRole ? ' cellinput--orphan' : ''}`,
          title: line.orphanRole ? 'הדרגה אינה קיימת בתעריפון הנוכחי — התעריף מוקפא בשורה. בחר דרגה מהתעריפון כדי לחבר מחדש.' : null,
          dataset: { field: 'roleId', teamId: team.id, lineId: line.id },
        }, [
          line.orphanRole
            ? el('option', { value: line.roleId, selected: 'selected', text: `${line.roleName && line.roleName !== '—' ? line.roleName : 'דרגה שהוסרה'} · לא בתעריפון` })
            : null,
          ...rateCard.roles.map((r) => el('option', { value: r.id, selected: r.id === line.roleId ? 'selected' : null, text: r.name })),
        ]),
        el('input', {
          class: 'cellinput cellinput--person', value: line.person || '', placeholder: 'שם (אופציונלי)',
          dataset: { field: 'person', teamId: team.id, lineId: line.id },
        }),
      ]),

      // ---- העוגן: מה שהעין צריכה למצוא ראשון ----
      el('td', { class: 'td-anchor' }, [
        el('div', { class: 'anchor__nums' }, [
          el('input', {
            class: 'cellinput cellinput--done num', type: 'number', step: '0.25', min: '0',
            value: line.actualHours ? String(line.actualHours) : '', placeholder: '0',
            title: line.lastReportAt
              ? `סך השעות שדווחו. דיווח אחרון: ${line.lastReportAt}. שינוי כאן נרשם כעדכון מתוארך בטאב "דיווח ומעקב".`
              : 'סך השעות שבוצעו עד היום. כל שינוי נרשם כעדכון מתוארך בטאב "דיווח ומעקב".',
            dataset: { field: 'manualHours', teamId: team.id, lineId: line.id },
          }),
          el('span', { class: 'anchor__sep', text: '/' }),
          el('input', {
            class: 'cellinput cellinput--plan-h num', type: 'number', step: '1', min: '0',
            value: String(line.budgetHours), placeholder: String(line.budgetHours),
            title: 'שעות התקציב. ניתן לדרוס ידנית; ריק = חישוב אוטומטי לפי המקדם.',
            dataset: { field: 'hoursOverride', teamId: team.id, lineId: line.id, auto: line.hoursOverride === null ? '1' : '0' },
          }),
        ]),
        // אורך המד יחסי לגודל השורה — כך רואים גם ניצול וגם משקל
        el('div', {
          class: 'anchor__track', dataset: { calc: `line-bar-${line.id}`, html: '1' },
          style: `width:${Math.max(34, Math.round((line.budgetHours / maxHours) * 100))}%`,
          html: miniBar(line.util, line.status),
        }),
      ]),
      el('td', { class: 'td-util' }, [
        el('span', { class: `num pct pct--${line.status}`, dataset: { calc: `line-util-${line.id}` }, text: fmtPct(line.util) }),
      ]),
      el('td', { class: 'td-delta' }, [
        calcCell(`line-delta-${line.id}`, overText(line.actualHours, line.budgetHours),
          line.actualHours > line.budgetHours ? 'delta' : 'delta delta--none'),
      ]),

      // ---- תוצר מחושב ----
      el('td', { class: 'td-strong col-sep' }, [calcCell(`line-cost-${line.id}`, money(line.budgetCost, d))]),
      el('td', {}, [calcCell(`line-actual-cost-${line.id}`, money(line.actualCost, d))]),
      el('td', {}, [calcCell(`line-remaining-${line.id}`, money(line.remainingCost, d), line.remainingCost < 0 ? 'neg' : '')]),

      // ---- קלט תכנון ----
      el('td', { class: 'td-plan' }, [el('input', {
        class: 'cellinput cellinput--quiet num', type: 'number', step: '0.5', min: '0', value: String(line.estHours),
        dataset: { field: 'estHours', teamId: team.id, lineId: line.id },
      })]),
      el('td', { class: 'td-plan' }, [el('input', {
        class: 'cellinput cellinput--quiet num', type: 'number', step: '10', min: '0', value: String(line.rate),
        title: 'תעריף מהתעריפון. שינוי כאן = דריסה לשורה זו בלבד.',
        dataset: { field: 'rateOverride', teamId: team.id, lineId: line.id, auto: line.rateOverride === null ? '1' : '0' },
      })]),
      el('td', { class: 'td-tools' }, [
        // מחוץ לסדר ה-Tab: מקש Tab צריך לזרום בין תאי הנתונים, לא דרך כפתורי המחיקה
        el('button', { class: 'iconbtn iconbtn--danger', type: 'button', tabindex: '-1', title: 'מחק שורה', dataset: { action: 'delete-line', teamId: team.id, lineId: line.id }, html: ICONS.trash }),
      ]),
    ]));
  }
  table.append(tbody);

  table.append(el('tfoot', {}, el('tr', {}, [
    el('td', { class: 'td-role', text: 'סה"כ הצוות' }),
    el('td', { class: 'td-anchor' }, [
      el('div', { class: 'anchor__nums anchor__nums--total' }, [
        calcCell(`team-actual-hours-${team.id}`, fmtHours(team.actualHours), 'anchor__done'),
        el('span', { class: 'anchor__sep', text: '/' }),
        calcCell(`team-hours-${team.id}`, fmtHours(team.budgetHours), 'anchor__plan'),
      ]),
      el('div', { class: 'anchor__track', dataset: { calc: `team-foot-bar-${team.id}`, html: '1' }, html: miniBar(team.util, team.status) }),
    ]),
    el('td', { class: 'td-util' }, [
      el('span', { class: `num pct pct--${team.status}`, dataset: { calc: `team-util-${team.id}` }, text: fmtPct(team.util) }),
    ]),
    el('td', { class: 'td-delta' }, [
      calcCell(`team-delta-${team.id}`, overText(team.actualHours, team.budgetHours),
        team.actualHours > team.budgetHours ? 'delta' : 'delta delta--none'),
    ]),
    el('td', { class: 'td-strong col-sep' }, [calcCell(`team-cost-${team.id}`, money(team.budgetCost, d))]),
    el('td', {}, [calcCell(`team-actual-cost-${team.id}`, money(team.actualCost, d))]),
    el('td', {}, [calcCell(`team-rem-${team.id}`, money(team.remainingCost, d), team.remainingCost < 0 ? 'neg' : '')]),
    el('td', { class: 'td-plan' }, [calcCell(`team-est-${team.id}`, fmtHours(team.estHours))]),
    el('td', {}, ''),
    el('td', {}, ''),
  ])));

  return table;
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
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'export-entries' } }, [icon('download'), 'ייצוא לאקסל']),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'add-entry' } }, [icon('plus'), 'רישום ידני']),
    el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'import-entries' } }, [icon('upload'), 'העלאת קובץ']),
  ]));

  root.append(el('p', { class: 'panel__hint', text: 'חשבונות ומסמכים שהתקבלו. מהם נלקחות **שעות** בלבד — הן נכנסות לביצוע יחד עם שאר מקורות הדיווח. סכום החיוב בפועל, הנחות ותיקונים מול הלקוח אינם חלק מהניתוח.' }));

  root.append(el('div', { class: 'dropzone', dataset: { action: 'import-entries' } }, [
    icon('upload'),
    el('div', {}, [
      el('strong', { text: 'גרור לכאן קובץ חשבונות' }),
      el('span', { text: ' — XLSX, CSV או PDF. אפשר גם תמונה כצירוף לרישום.' }),
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

/* ============================================================
   טאב מעקב שוטף — היסטוריית עדכוני הביצוע (ידני + דוחות שיובאו)
   ============================================================ */

const PERIODS = [['day', 'יומי'], ['week', 'שבועי'], ['month', 'חודשי']];

export function renderProgressTab(root, { snap, period = 'week', sources = [] }) {
  const d = snap.deal;
  const teamName = new Map(snap.teams.map((t) => [t.id, t.name]));
  const lineLabel = new Map();
  for (const t of snap.teams) for (const l of t.lines) {
    lineLabel.set(l.id, l.person ? `${l.person} · ${l.roleName}` : l.roleName);
  }

  root.append(el('div', { class: 'toolbar' }, [
    el('div', { class: 'seg' }, PERIODS.map(([id, label]) => el('button', {
      class: `seg__btn${period === id ? ' is-on' : ''}`, type: 'button',
      dataset: { action: 'set-period', period: id },
    }, label))),
    el('div', { class: 'toolbar__spacer' }),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'export-progress' } }, [icon('download'), 'ייצוא לאקסל']),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'add-progress' } }, [icon('plus'), 'עדכון ידני']),
    el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'import-progress' } }, [icon('upload'), 'ייבוא דוח שעות']),
  ]));

  root.append(el('div', { class: 'dropzone', dataset: { action: 'import-progress' } }, [
    icon('upload'),
    el('div', {}, [
      el('strong', { text: 'גרור לכאן דוח שעות או חשבון' }),
      el('span', { text: ' — XLSX, CSV או PDF. המערכת תחלץ את השורות ותציג אותן לאישור לפני הכנסה למעקב.' }),
    ]),
  ]));

  const rows = progressByPeriod(snap, period);
  if (!rows.length) {
    root.append(el('div', { class: 'empty' }, [
      el('h2', { text: 'טרם דווח ביצוע' }),
      el('p', { text: 'אפשר להזין שעות ישירות בגיליון התקציב, להוסיף עדכון ידני, או לגרור לכאן דוח שעות (XLSX / CSV / PDF).' }),
      el('div', { class: 'form-actions form-actions--wrap' }, [
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'import-progress' } }, [icon('upload'), 'ייבוא דוח שעות']),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'add-progress' } }, [icon('plus'), 'עדכון ידני']),
      ]),
    ]));
    return;
  }

  // סיכום לפי תקופה
  root.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('clock'), `סיכום ${PERIODS.find(([p]) => p === period)?.[1] || ''}`]),
    el('div', { class: 'btable-wrap' }, el('table', { class: 'btable' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'תקופה' }), el('th', { text: 'שעות' }), el('th', { text: 'עלות' }),
        el('th', { text: 'מצטבר — שעות' }), el('th', { text: 'מצטבר — עלות' }), el('th', { text: 'ניצול מצטבר' }),
      ])),
      el('tbody', {}, rows.map((r) => el('tr', {}, [
        el('td', { text: periodLabel(r.key, period) }),
        el('td', { class: 'num', text: fmtHours(r.hours) }),
        el('td', { class: 'num', text: money(r.cost, d) }),
        el('td', { class: 'num', text: fmtHours(r.cumulativeHours) }),
        el('td', { class: 'num td-strong', text: money(r.cumulativeCost, d) }),
        el('td', { class: 'num', text: snap.budgetCost > 0 ? fmtPct(r.cumulativeCost / snap.budgetCost) : '—' }),
      ]))),
    ])),
    svgBox(burnLine(rows.map((r) => ({ month: periodLabel(r.key, period), cumulative: r.cumulativeCost })), snap.budgetCost)),
  ]));

  // מקורות המידע — מאיפה הגיעו השעות, ואפשרות למחוק מקור על כל מה שנגזר ממנו
  if (sources.length) {
    const kindPill = { import: ['watch', 'דוח שעות'], invoice: ['info', 'חשבון'], manual: ['ok', 'ידני'] };
    root.append(el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('file'), `מקורות המידע · ${sources.length}`]),
      el('p', { class: 'panel__hint', text: 'כל מקור והשעות שנגזרו ממנו. מחיקת מקור מוחקת את כל הדיווחים שהגיעו ממנו ואת הקובץ השמור.' }),
      el('div', { class: 'btable-wrap' }, el('table', { class: 'etable' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: 'מקור' }), el('th', { text: 'סוג' }), el('th', { text: 'תקופת חיוב' }),
          el('th', { text: 'טווח תאריכים' }), el('th', { text: 'רשומות' }), el('th', { text: 'שעות' }), el('th', { class: 'th-tools' }),
        ])),
        el('tbody', {}, sources.map((s) => el('tr', {}, [
          el('td', {}, [
            s.fileId
              ? el('button', { class: 'linkbtn', type: 'button', dataset: { action: 'open-file', fileId: s.fileId } }, [icon('file'), s.label])
              : el('span', { text: s.label }),
          ]),
          el('td', {}, [el('span', { class: `pill pill--${kindPill[s.kind]?.[0] || 'info'}`, text: kindPill[s.kind]?.[1] || s.kind })]),
          el('td', { class: 'muted', text: s.periods.length ? s.periods.join(', ') : '—' }),
          el('td', { class: 'num muted', text: s.from ? (s.from === s.to ? s.from : `${s.from} – ${s.to}`) : '—' }),
          el('td', { class: 'num', text: String(s.count) }),
          el('td', { class: 'num td-strong', text: fmtHours(s.hours) }),
          el('td', { class: 'td-tools' }, [
            s.deletable
              ? el('button', {
                class: 'iconbtn iconbtn--danger', type: 'button', title: 'מחיקת המקור וכל מה שנלקח ממנו',
                dataset: { action: 'delete-source', sourceKey: s.key }, html: ICONS.trash,
              })
              : el('span', { class: 'muted', text: '—' }),
          ]),
        ]))),
      ])),
    ]));
  }

  // היסטוריית העדכונים
  const list = [...(snap.execution || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  root.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('layers'), `עדכוני ביצוע · ${list.length}`]),
    snap.unassignedHours ? el('p', { class: 'panel__hint', text: `${fmtHours(snap.unassignedHours)} שעות דווחו בלי שיוך לשורת תקציב — אין להן תעריף ולכן אינן נכללות בעלות.` }) : null,
    el('div', { class: 'btable-wrap' }, el('table', { class: 'etable' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'תאריך' }), el('th', { text: 'צוות' }), el('th', { text: 'שורה' }),
        el('th', { text: 'שעות' }), el('th', { text: 'מקור' }), el('th', { text: 'הערה' }), el('th', { class: 'th-tools' }),
      ])),
      el('tbody', {}, list.map((p) => el('tr', { class: p.superseded ? 'row--superseded' : '' }, [
        el('td', { class: 'num', text: p.date }),
        el('td', { text: teamName.get(p.teamId) || '—' }),
        el('td', {}, [
          el('span', { text: lineLabel.get(p.lineId) || (p.person ? p.person : '— ללא שיוך —') }),
          p.person && lineLabel.get(p.lineId) && !lineLabel.get(p.lineId).includes(p.person)
            ? el('span', { class: 'sub', text: p.person }) : null,
        ]),
        el('td', { class: `num ${p.hours < 0 ? 'neg' : ''}`, text: fmtHours(p.hours) }),
        el('td', {}, [el('span', { class: `pill pill--${p.source === 'invoice' ? 'info' : p.source === 'import' ? 'watch' : 'ok'}`, text: sourceLabel(p.source) })]),
        el('td', { class: 'muted', text: p.superseded ? `הוחלף ע"י ${p.supersededBy}` : (p.note || p.fileName || '') }),
        el('td', { class: 'td-tools' }, [
          el('button', { class: 'iconbtn', type: 'button', title: 'עריכה', dataset: { action: 'edit-progress', progressId: p.id }, html: ICONS.edit }),
          el('button', { class: 'iconbtn iconbtn--danger', type: 'button', title: 'מחיקה', dataset: { action: 'delete-progress', progressId: p.id }, html: ICONS.trash }),
        ]),
      ]))),
    ])),
  ]));
}

function periodLabel(key, period) {
  if (period === 'month') return key;
  if (period === 'week') return `שבוע ${key}`;
  return key;
}

/** טופס עדכון ביצוע ידני */
export function renderProgressForm(record, { snap }) {
  const p = record || {};
  const lineOptions = [];
  for (const t of snap.teams) {
    for (const l of t.lines) {
      lineOptions.push(el('option', {
        value: `${t.id}|${l.id}`,
        text: `${t.name} · ${l.person ? `${l.person} (${l.roleName})` : l.roleName}`,
        selected: p.lineId === l.id ? 'selected' : null,
      }));
    }
  }
  return el('form', { class: 'modal-form', id: 'progress-form' }, [
    el('div', { class: 'grid-2' }, [
      field('תאריך', el('input', { class: 'input num', type: 'date', name: 'date', value: p.date || new Date().toISOString().slice(0, 10), required: 'required' })),
      field('שעות שבוצעו בתקופה', el('input', { class: 'input num', type: 'number', step: '0.25', name: 'hours', value: String(p.hours ?? ''), required: 'required' }),
        'אפשר גם מספר שלילי לתיקון דיווח קודם.'),
    ]),
    field('שורת תקציב', el('select', { class: 'select', name: 'target' }, [
      el('option', { value: '', text: '— ללא שיוך לשורה —' }),
      ...lineOptions,
    ]), 'העלות נגזרת מהתעריף של השורה שנבחרה.'),
    field('הערה', el('input', { class: 'input', name: 'note', value: p.note || '', placeholder: 'לדוגמה: דוח שעות 12–18 במאי' })),
  ]);
}

/* ============================================================
   טאב תחקיר — איפה חרגנו, ומה זה אומר לתמחור הבא
   ============================================================ */

export function renderReviewTab(root, { snap }) {
  const d = snap.deal;
  const r = dealReview(snap);
  const sign = (n) => (n > 0 ? '+' : '');
  const tone = (n) => (n > 0 ? 'neg' : n < 0 ? 'pos' : '');

  if (!r.actualHours) {
    root.append(el('div', { class: 'empty' }, [
      el('h2', { text: 'אין עדיין ביצוע לתחקר' }),
      el('p', { text: 'התחקיר משווה את הביצוע לתכנון. דווח שעות (ידנית או מייבוא דוח) והוא ייבנה מעצמו.' }),
    ]));
    return;
  }

  /* --- 1. שלוש נקודות הייחוס --- */
  root.append(el('section', { class: 'panel panel--total' }, [
    el('h2', { class: 'panel__title' }, [icon('flag'), 'הערכה → תקציב → ביצוע']),
    el('div', { class: 'totals' }, [
      totalItem('שעות שהוערכו', fmtHours(r.estHours), null, 'ההערכה המקורית, לפני מקדם החריגה.'),
      totalItem('שעות תקציב', fmtHours(r.budgetHours), null, 'ההערכה בתוספת מקדם החריגה, מעוגלת כלפי מעלה.'),
      totalItem('שעות בפועל', fmtHours(r.actualHours), null, 'כל השעות שדווחו, מכל מקורות הדיווח.'),
      totalItem('חריגה מהתקציב', `${sign(r.deltaHours)}${fmtHours(r.deltaHours)} שעות`, null),
      totalItem('שווי ההערכה', money(r.estCost, d), null, 'שעות ההערכה × תעריפי התכנון — כמה היה צריך להיות אילו נצמדנו להערכה.'),
      totalItem('שווי התקציב', money(r.budgetCost, d)),
      totalItem('שווי הביצוע', money(r.actualCost, d)),
      totalItem('חריגה בכסף', `${sign(r.deltaCost)}${money(r.deltaCost, d)}`),
    ]),
  ]));

  /* --- 2. פירוק החריגה: כמות מול תמהיל --- */
  const totalEffect = Math.abs(r.volumeEffect) + Math.abs(r.mixEffect);
  const pct = (v) => (totalEffect > 0 ? Math.round((Math.abs(v) / totalEffect) * 100) : 0);
  root.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('layers'), 'ממה נובעת החריגה']),
    el('p', { class: 'panel__hint', text: 'הפער בכסף מול התקציב מפוצל לשניים: כמה נובע מעוד שעות, וכמה מכך שהשעות היו יקרות יותר מהמתוכנן (תמהיל דרגות שונה).' }),
    el('div', { class: 'facts facts--lg' }, [
      fact(`עוד שעות (${pct(r.volumeEffect)}%)`, `${sign(r.volumeEffect)}${money(r.volumeEffect, d)}`, tone(r.volumeEffect)),
      fact(`תמהיל יקר יותר (${pct(r.mixEffect)}%)`, `${sign(r.mixEffect)}${money(r.mixEffect, d)}`, tone(r.mixEffect)),
      fact('בלנדד מתוכנן', money(r.blendedPlanned, d)),
      fact('בלנדד בפועל', money(r.blendedActual, d), r.blendedActual < r.blendedPlanned ? 'neg' : 'pos'),
    ]),
  ]));

  /* --- 3. מוקדי החריגה --- */
  root.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('alert'), 'מוקדי החריגה']),
    el('p', { class: 'panel__hint', text: 'כל שורות התקציב, ממוינות לפי גודל הסטייה בכסף. "מקדם שנדרש" = כמה היה צריך להוסיף להערכה כדי שהתקציב יכסה את הביצוע.' }),
    el('div', { class: 'btable-wrap' }, el('table', { class: 'btable' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'צוות' }), el('th', { text: 'דרגה / אדם' }),
        el('th', { text: 'הוערך' }), el('th', { text: 'תוקצב' }), el('th', { text: 'בפועל' }),
        el('th', { text: 'Δ שעות' }), el('th', { text: 'Δ ₪' }), el('th', { text: 'ניצול' }), el('th', { text: 'מקדם שנדרש' }),
      ])),
      el('tbody', {}, r.hotspots.map((l) => el('tr', {}, [
        el('td', {}, [el('span', { class: 'legend__dot', style: `background:${l.teamColor}` }), el('span', { text: ` ${l.teamName}` })]),
        el('td', { text: l.person ? `${l.person} · ${l.roleName}` : l.roleName }),
        el('td', { class: 'num', text: fmtHours(l.estHours) }),
        el('td', { class: 'num', text: fmtHours(l.budgetHours) }),
        el('td', { class: 'num td-strong', text: fmtHours(l.actualHours) }),
        el('td', { class: `num ${tone(l.deltaHours)}`, text: `${sign(l.deltaHours)}${fmtHours(l.deltaHours)}` }),
        el('td', { class: `num ${tone(l.deltaCost)}`, text: `${sign(l.deltaCost)}${money(l.deltaCost, d)}` }),
        el('td', { class: `num pct pct--${statusOfUtil(l.util)}`, text: fmtPct(l.util) }),
        el('td', { class: 'num', text: l.vsEstimate === null ? '—' : fmtPct(l.vsEstimate) }),
      ]))),
    ])),
  ]));

  /* --- 4. תמהיל הדרגות --- */
  if (r.byRole.length) {
    root.append(el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('users'), 'תמהיל הדרגות — מתוכנן מול בפועל']),
      el('div', { class: 'btable-wrap' }, el('table', { class: 'btable' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: 'דרגה' }), el('th', { text: 'תעריף' }),
          el('th', { text: 'שעות מתוכננות' }), el('th', { text: '% מהתכנון' }),
          el('th', { text: 'שעות בפועל' }), el('th', { text: '% מהביצוע' }),
          el('th', { text: 'Δ שעות' }), el('th', { text: 'Δ ₪' }),
        ])),
        el('tbody', {}, r.byRole.map((x) => el('tr', {}, [
          el('td', { text: x.name + (x.junior ? ' (ג\'וניור)' : '') }),
          el('td', { class: 'num', text: money(x.rate, d) }),
          el('td', { class: 'num', text: fmtHours(x.budgetHours) }),
          el('td', { class: 'num', text: fmtPct(x.plannedShare) }),
          el('td', { class: 'num td-strong', text: fmtHours(x.actualHours) }),
          el('td', { class: `num ${x.actualShare > x.plannedShare && !x.junior ? 'neg' : ''}`, text: fmtPct(x.actualShare) }),
          el('td', { class: `num ${tone(x.deltaHours)}`, text: `${sign(x.deltaHours)}${fmtHours(x.deltaHours)}` }),
          el('td', { class: `num ${tone(x.deltaCost)}`, text: `${sign(x.deltaCost)}${money(x.deltaCost, d)}` }),
        ]))),
      ])),
    ]));
  }

  /* --- 5. לפי אדם --- */
  if (r.people.length) {
    root.append(el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('users'), 'לפי אדם']),
      el('div', { class: 'btable-wrap' }, el('table', { class: 'btable' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: 'עורך דין' }), el('th', { text: 'צוותים' }),
          el('th', { text: 'תוקצב' }), el('th', { text: 'בפועל' }), el('th', { text: 'Δ שעות' }), el('th', { text: 'Δ ₪' }), el('th', { text: 'ניצול' }),
        ])),
        el('tbody', {}, r.people.map((x) => el('tr', {}, [
          el('td', { text: x.name }),
          el('td', { class: 'muted', text: x.teams.join(' · ') }),
          el('td', { class: 'num', text: fmtHours(x.budgetHours) }),
          el('td', { class: 'num td-strong', text: fmtHours(x.actualHours) }),
          el('td', { class: `num ${tone(x.deltaHours)}`, text: `${sign(x.deltaHours)}${fmtHours(x.deltaHours)}` }),
          el('td', { class: `num ${tone(x.deltaCost)}`, text: `${sign(x.deltaCost)}${money(x.deltaCost, d)}` }),
          el('td', { class: `num pct pct--${statusOfUtil(x.util)}`, text: fmtPct(x.util) }),
        ]))),
      ])),
    ]));
  }

  /* --- 6. מסקנות לתמחור הבא --- */
  root.append(el('section', { class: 'panel panel--cap panel--cap-on' }, [
    el('h2', { class: 'panel__title' }, [icon('trending'), 'מסקנות לתמחור הבא']),
    el('div', { class: 'facts facts--lg' }, [
      fact('מקדם החריגה שהיה בשימוש', fmtPct(r.usedFactor)),
      fact('המקדם שהיה נדרש בפועל', r.requiredFactor === null ? '—' : fmtPct(r.requiredFactor), r.requiredFactor > r.usedFactor ? 'neg' : 'pos'),
      fact('מקדם מוצע לעסקה דומה', r.suggestedFactor === null ? '—' : fmtPct(r.suggestedFactor)),
      fact('שכ"ט שהיה מכסה את הביצוע', money(r.actualCost, d)),
      r.hasFee ? fact('מול שכ"ט מוסכם', money(r.agreedFee, d)) : null,
      r.hasFee ? fact('פער', `${sign(r.feeGap)}${money(r.feeGap, d)}`, tone(r.feeGap)) : null,
      snap.realized?.applies ? fact('בלנדד שהתקבל (ללא ג\'וניור)', money(snap.realized.blendedSenior, d),
        snap.realized.blendedSenior < r.blendedPlanned ? 'neg' : 'pos') : null,
      snap.realized?.applies ? fact('בלנדד שהתקבל (כל השעות)', money(snap.realized.blendedAll, d),
        snap.realized.blendedAll < snap.blendedAll ? 'neg' : 'pos') : null,
    ]),
    el('p', { class: 'panel__hint', text: r.requiredFactor === null
      ? 'אין שעות מוערכות להשוואה — הזן הערכות בגיליון כדי לקבל המלצת מקדם.'
      : r.requiredFactor > r.usedFactor
        ? `ההערכה הייתה נמוכה ב-${fmtPct(r.requiredFactor)} מהביצוע. בעסקה דומה כדאי מקדם ${fmtPct(r.suggestedFactor)} — או הערכת שעות גבוהה יותר מלכתחילה.`
        : 'התקציב כיסה את הביצוע. אפשר לשקול מקדם נמוך יותר בהצעה הבאה כדי להיות תחרותי יותר.' }),
    el('div', { class: 'form-actions form-actions--wrap' }, [
      el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'clone-from-actual' } },
        [icon('copy'), 'צור עסקה חדשה לפי הביצוע בפועל']),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'export-review' } },
        [icon('download'), 'ייצוא התחקיר לאקסל']),
    ]),
  ]));
}

/** גישה לסיכום התקופתי מחוץ למודול (לייצוא) */
export const progressPeriods = (snap, period) => progressByPeriod(snap, period);

/** מסך ייבוא דוח שעות: מיפוי עמודות + שיוך כל אדם לשורת תקציב */
export function renderProgressImportPreview({
  sheets, sheetIndex, headerRow, mapping, people, peopleLines, cumulative, teams, records,
  unmatched, skipped, duplicates = 0, dateRange = null, overlap = 'skip',
  billPeriods = [], knownPeriods = [], peopleMatch = {},
}) {
  const wrap = el('div', { class: 'import' });

  const sheet = sheets[sheetIndex] || {};
  const nums = sheet.pageNumbers || [];
  if (sheet.pages > 1 || sheets.length > 1) {
    const spread = nums.length > 1 ? ` (עמודים ${nums[0]}–${nums[nums.length - 1]})` : nums.length ? ` (עמוד ${nums[0]})` : '';
    wrap.append(el('div', { class: 'alert alert--watch' }, [
      icon('info'),
      el('span', { text: sheet.pages > 1
        ? `הטבלה משתרעת על ${sheet.pages} עמודים${spread} — כולם נקראו לרשת עמודות אחת וההגדרות כאן חלות על כולם.${sheets.length > 1 ? ' בקובץ יש טבלאות נוספות במבנה אחר — אפשר לעבור אליהן בבורר הטבלה.' : ''}`
        : `בקובץ זוהו ${sheets.length} טבלאות במבנה שונה. נבחרה הגדולה ביותר${spread}; אפשר להחליף בבורר הטבלה.` }),
    ]));
  }

  if (sheets.length > 1) {
    wrap.append(field('טבלה / גיליון', el('select', { class: 'select', dataset: { imp: 'sheet' } },
      sheets.map((s, i) => el('option', {
        value: String(i),
        text: s.rows ? `${s.name} · ${s.rows.length} שורות` : s.name,
        selected: i === sheetIndex ? 'selected' : null,
      })))));
  }

  wrap.append(el('div', { class: 'grid-2' }, [
    field('שורת כותרות', el('input', { class: 'input num', type: 'number', min: '1', value: String(headerRow + 1), dataset: { imp: 'headerRow' } })),
    field('סוג הדוח', el('select', { class: 'select', dataset: { imp: 'cumulative' } }, [
      el('option', { value: '0', text: 'שעות לתקופה (מצטבר לדוח)', selected: cumulative ? null : 'selected' }),
      el('option', { value: '1', text: 'סך מצטבר מתחילת העסקה', selected: cumulative ? 'selected' : null }),
    ]), cumulative
      ? 'המערכת תרשום רק את ההפרש מול מה שכבר דווח — כדי לא לספור פעמיים.'
      : 'כל שורה בדוח נוספת לשעות שכבר דווחו.'),
  ]));

  // תקופת החיוב שזוהתה בדוח — זו הזהות שמונעת כפילות בין דוחות
  if (billPeriods.length) {
    const already = billPeriods.filter((b) => knownPeriods.includes(b));
    wrap.append(el('div', { class: `alert alert--${already.length ? 'over' : 'watch'}` }, [
      icon(already.length ? 'alert' : 'info'),
      el('span', { text: already.length
        ? `תקופת חיוב ${already.join(', ')} כבר יובאה לעסקה — השורות המשויכות אליה יזוהו ככפילות.`
        : `זוהתה תקופת חיוב: ${billPeriods.join(', ')}. הזיהוי מול דוחות אחרים ייעשה לפיה.` }),
    ]));
  }

  // חפיפה בין דוחות — רלוונטי רק בדוח לתקופה
  if (!cumulative) {
    wrap.append(field('שורות שכבר דווחו בעבר', el('select', { class: 'select', dataset: { imp: 'overlap' } }, [
      el('option', { value: 'skip', text: 'דלג עליהן (מומלץ)', selected: overlap === 'skip' ? 'selected' : null }),
      el('option', { value: 'replace', text: 'החלף את מה שיובא בטווח התאריכים של הדוח', selected: overlap === 'replace' ? 'selected' : null }),
      el('option', { value: 'add', text: 'הוסף בכל זאת (ייספר פעמיים)', selected: overlap === 'add' ? 'selected' : null }),
    ]),
    `זיהוי לפי שורת תקציב + ${billPeriods.length ? 'תקופת חיוב' : 'תאריך'} + שם. ${duplicates ? `זוהו ${duplicates} שורות שכבר דווחו.` : 'לא זוהתה חפיפה עם דיווחים קיימים.'}${
      dateRange ? ` הדוח מכסה ${dateRange.from} עד ${dateRange.to}.` : ''}`));

    if (overlap === 'replace' && dateRange) {
      wrap.append(el('p', { class: 'alert alert--watch', text: `כל הדיווחים שיובאו בעבר לטווח ${dateRange.from}–${dateRange.to} (לשורות שבדוח) יימחקו ויוחלפו בתוכן הקובץ. דיווחים שהוזנו ידנית לא ייפגעו.` }));
    }
  }

  const rows = sheets[sheetIndex].rows;
  const header = rows[headerRow] || [];
  wrap.append(el('div', { class: 'btable-wrap btable-wrap--map' }, el('table', { class: 'btable btable--map' }, [
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
  ])));

  // שיוך אנשים לשורות התקציב
  const lineOptions = (selected) => [
    el('option', { value: '', text: '— ללא שיוך —' }),
    ...teams.flatMap((t) => t.lines.map((l) => el('option', {
      value: `${t.id}|${l.id}`,
      text: `${t.name} · ${l.person ? `${l.person} (${l.roleName})` : l.roleName}`,
      selected: `${t.id}|${l.id}` === selected ? 'selected' : null,
    }))),
  ];
  if (people.length) {
    const missing = people.filter((p) => !peopleLines[p.key]).length;
    wrap.append(el('section', { class: 'panel panel--people' }, [
      el('h3', { class: 'panel__title' }, [
        icon('users'), `שיוך לשורות התקציב · ${people.length} שמות`,
        missing ? el('span', { class: 'pill pill--watch', text: `${missing} ללא שיוך` }) : null,
      ]),
      el('p', { class: 'panel__hint', text: 'העלות נגזרת מהתעריף של השורה שנבחרה. שם שמשויך פעם אחת ייזכר לייבוא הבא ולעסקאות אחרות.' }),
      // שיוך מהיר: בוחרים צוות וכל אדם מוצמד לשורה שלו בו (לפי שם, ואם אין — לפי הדרגה שבדוח)
      el('div', { class: 'people-bulk' }, [
        el('span', { class: 'muted', text: 'שיוך מהיר — כל האנשים לצוות:' }),
        el('select', { class: 'select select--sm', dataset: { imp: 'personTeamBulk' } }, [
          el('option', { value: '', text: '— בחר צוות —' }),
          ...teams.map((t) => el('option', { value: t.id, text: t.name })),
        ]),
      ]),
      el('div', { class: 'btable-wrap' }, el('table', { class: 'btable btable--people' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: 'עורך דין / עובד' }), el('th', { text: 'שורות' }), el('th', { text: 'שעות' }),
          el('th', { text: 'תעריף בדוח' }), el('th', { text: 'שורת תקציב' }),
        ])),
        el('tbody', {}, people.map((p) => el('tr', { class: peopleLines[p.key] ? '' : 'row--dupe' }, [
          el('td', {}, [
            el('span', { text: p.name }),
            peopleMatch[p.key] ? el('span', { class: 'sub', text: peopleMatch[p.key] }) : null,
            (p.variants || []).length > 1 ? el('span', { class: 'sub', text: `בדוח: ${p.variants.join(' · ')}` }) : null,
          ]),
          el('td', { class: 'num', text: String(p.rows) }),
          el('td', { class: 'num', text: fmtHours(p.hours) }),
          el('td', { class: 'num muted', text: p.rateHint ? `${p.rateHint.toLocaleString('he-IL')} ₪` : '—' }),
          el('td', {}, [el('select', { class: 'select select--sm', dataset: { imp: 'personLine', personKey: p.key } }, lineOptions(peopleLines[p.key]))]),
        ]))),
      ])),
      el('label', { class: 'inline-check' }, [
        el('input', { type: 'checkbox', checked: 'checked', dataset: { imp: 'rememberPeople' } }),
        el('span', { text: 'זכור את השיוך לייבוא הבא' }),
      ]),
    ]));
  }

  const counted = cumulative || overlap !== 'skip' ? records : records.filter((r) => !r.duplicate);
  const totalHours = counted.reduce((s, r) => s + num(r.hours), 0);
  wrap.append(el('div', { class: 'import__summary' }, [
    el('strong', { text: `${counted.length} עדכונים · ${fmtHours(totalHours)} שעות` }),
    duplicates ? el('span', { class: 'pill pill--watch', text: `${duplicates} כבר דווחו` }) : null,
    skipped ? el('span', { class: 'pill pill--watch', text: `${skipped} שורות דולגו` }) : null,
    unmatched.length ? el('span', { class: 'pill pill--over', text: `ללא שיוך: ${unmatched.slice(0, 4).join(', ')}${unmatched.length > 4 ? '…' : ''}` }) : null,
  ]));

  if (records.length) {
    wrap.append(el('div', { class: 'btable-wrap' }, el('table', { class: 'etable etable--preview' }, [
      el('thead', {}, el('tr', {}, [el('th', { text: 'תאריך' }), el('th', { text: 'עורך דין' }), el('th', { text: 'שעות' }), el('th', { text: 'הערה' })])),
      el('tbody', {}, records.slice(0, 40).map((r) => el('tr', { class: (!r.lineId || (r.duplicate && overlap === 'skip')) ? 'row--dupe' : '' }, [
        el('td', { class: 'num', text: r.date }),
        el('td', { text: r.person || '—' }),
        el('td', { class: 'num', text: fmtHours(r.hours) }),
        el('td', { class: 'muted', text: r.note
          || (!r.lineId ? 'לא שויך לשורה — לא ייובא'
            : r.duplicate ? `כבר דווחו ${fmtHours(r.existingHours)} שעות לתאריך הזה${overlap === 'skip' ? ' — ידולג' : ''}` : '') }),
      ]))),
    ])));
  }
  return wrap;
}

/** טופס פריסת צוות לשורות לפי אנשים */
export function renderSplitForm({ team, roles, people }) {
  const form = el('form', { class: 'modal-form', id: 'split-form' }, [
    el('p', { class: 'modal-text', text: `כל שם ייצור שורה נפרדת בצוות "${team.name}", עם דרגה משלו ואפשרות לתעריף אישי. שורות דרגה ריקות שלא דווח עליהן יוסרו.` }),
  ]);
  const list = el('div', { class: 'split-list' });

  const row = (name = '', roleId = '') => el('div', { class: 'split-row', dataset: { personRow: '1' } }, [
    el('input', { class: 'input', placeholder: 'שם עורך הדין', value: name, dataset: { personName: '1' } }),
    el('select', { class: 'select', dataset: { personRole: '1' } },
      roles.map((r) => el('option', { value: r.id, text: `${r.name} · ${r.rate}₪`, selected: r.id === roleId ? 'selected' : null }))),
    el('input', { class: 'input num', type: 'number', step: '10', min: '0', placeholder: 'תעריף אישי (רשות)', dataset: { personRate: '1' } }),
  ]);

  const roleByName = new Map(roles.map((r) => [String(r.name).trim().toLowerCase(), r.id]));
  for (const p of people) list.append(row(p.name, roleByName.get(String(p.roleName || '').trim().toLowerCase()) || ''));
  for (let i = people.length; i < Math.max(3, people.length + 2); i++) list.append(row());

  form.append(list);
  const add = el('button', { class: 'btn-add-row btn-add-row--sm', type: 'button' }, [icon('plus'), 'הוסף שורה']);
  add.addEventListener('click', () => list.append(row()));
  form.append(add);
  return form;
}

/** מצב תיקיית המסמכים במסך ההגדרות */
export function renderFolderState(root, { supported, name, ready, dealFolder }) {
  if (!root) return;
  root.replaceChildren();
  if (!supported) {
    root.append(fact('סטטוס', 'הדפדפן אינו תומך — הקבצים נשמרים בתוך המערכת', 'neg'));
    return;
  }
  root.append(
    fact('תיקייה מחוברת', name || 'לא נבחרה', name ? '' : 'neg'),
    fact('הרשאת כתיבה', name ? (ready ? 'בתוקף' : 'נדרשת חידוש בלחיצה') : '—', name && !ready ? 'neg' : 'pos'),
    fact('תת-התיקייה של העסקה', dealFolder || '—'),
  );
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
    el('section', { class: 'panel panel--manual' }, [
      el('h2', { class: 'panel__title' }, [icon('target'), 'ניצול התקציב']),
      svgBox(gauge(snap.util), 'chartbox chartbox--center'),
      el('div', { class: 'facts' }, [
        fact('שעות תקציב', fmtHours(snap.budgetHours)),
        fact('שעות בפועל', fmtHours(snap.actualHours)),
        fact('יתרת שעות', fmtHours(snap.remainingHours), snap.remainingHours < 0 ? 'neg' : 'pos'),
        fact('תקציב', money(snap.budgetCost, d)),
        fact('בפועל (בתעריפי התכנון)', money(snap.actualCost, d)),
        fact('יתרה', money(snap.remainingCost, d), snap.remainingCost < 0 ? 'neg' : 'pos'),
        snap.lastReportAt ? fact('דיווח אחרון', snap.lastReportAt) : null,
      ]),
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('layers'), 'מקורות הדיווח']),
      el('div', { class: 'facts' }, [
        fact('הזנה ידנית', `${fmtHours(snap.hoursBySource.manual)} שעות`),
        fact('דוחות שעות', `${fmtHours(snap.hoursBySource.import)} שעות`),
        fact('חשבונות', `${fmtHours(snap.hoursBySource.invoice)} שעות`),
        fact('בלנדד מתוכנן', money(snap.blendedRate, d)),
        fact('בלנדד בפועל', money(snap.blendedActual, d), snap.blendedActual > snap.blendedRate ? 'pos' : 'neg'),
        fact('תעריף ממוצע לשעה', money(snap.effectiveRate, d)),
        snap.capActual.applies ? fact('התקבל בפועל לשעה (אחרי תקרה)', money(snap.realizedRate, d), 'neg') : null,
        snap.unassignedHours ? fact('שעות ללא שיוך', fmtHours(snap.unassignedHours), 'neg') : null,
      ]),
      el('p', { class: 'panel__hint', text: 'מקור ודאי יותר מחליף את הפחות ודאי לאותו אדם ואותה תקופה — אין ספירה כפולה.' }),
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('trending'), 'תחזית לסיום (EAC)']),
      el('div', { class: 'facts facts--lg' }, [
        fact('תחזית שעות בסיום', snap.eacHours === null ? '—' : fmtHours(snap.eacHours), snap.eacHoursVariance !== null && snap.eacHoursVariance < 0 ? 'neg' : 'pos'),
        fact('תחזית עלות בסיום', snap.eac === null ? '—' : money(snap.eac, d), snap.eacVariance !== null && snap.eacVariance < 0 ? 'neg' : 'pos'),
        fact('סטייה צפויה מהתקציב', snap.eacVariance === null ? '—' : money(snap.eacVariance, d), snap.eacVariance !== null && snap.eacVariance < 0 ? 'neg' : 'pos'),
        fact('בסיס החישוב', snap.eacBasis || 'אין נתונים מספיקים'),
        fact('התקדמות מדווחת', fmtPct(snap.progress)),
        snap.timePace !== null ? fact('התקדמות בזמן', fmtPct(snap.timePace)) : null,
        fact('תעריף בלנדד מתוכנן', money(snap.blendedRate, d)),
      ]),
      snap.hasFee ? el('div', { class: 'facts facts--lg' }, [
        fact('שכ"ט מוסכם', money(snap.agreedFee, d)),
        fact('רווח גולמי נוכחי', money(snap.margin, d), snap.margin < 0 ? 'neg' : 'pos'),
        fact('שיעור רווח', snap.marginPct === null ? '—' : fmtPct(snap.marginPct, 1), snap.margin < 0 ? 'neg' : 'pos'),
      ]) : null,
    ]),
  ]));

  const capPanel = renderCapPanel(snap);
  if (capPanel) root.append(capPanel);
  const realizedPanel = renderRealizedPanel(snap);
  if (realizedPanel) root.append(realizedPanel);

  root.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('users'), 'תקציב מול ביצוע — לפי צוות']),
    svgBox(barCompare(snap.teams.map((t) => ({
      label: t.name, budget: t.budgetCost, color: t.color,
      series: [{ name: 'בפועל', value: t.actualCost, status: t.status }],
    })))),
  ]));

  if (snap.byRole.length) {
    root.append(el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title' }, [icon('layers'), 'תקציב מול ביצוע — לפי דרגה']),
      svgBox(barCompare(snap.byRole.map((r) => ({
        label: r.name, budget: r.budgetCost,
        series: [{ name: 'בפועל', value: r.actualCost, status: statusOfUtil(r.util) }],
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

const statusOfUtil = (u) => (u > 1 ? 'over' : u >= 0.9 ? 'risk' : u >= 0.75 ? 'watch' : 'ok');

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

  // תיקיית המסמכים — מקומית למכשיר, לא חלק מנתוני העסקה
  root.append(el('section', { class: 'panel', id: 'docs-folder-panel' }, [
    el('h2', { class: 'panel__title' }, [icon('file'), 'תיקיית המסמכים']),
    el('p', { class: 'panel__hint', text: 'כל דוח שעות, חשבון או מסמך שמועלים למערכת נשמרים כקובץ בתיקייה שתבחר, בתת-תיקייה נפרדת לכל עסקה — נוצרת אוטומטית בעת החיבור. אין צורך ליצור אותה ידנית. בלי תיקייה מחוברת הקבצים נשמרים בתוך המערכת בלבד.' }),
    el('div', { class: 'facts', id: 'docs-folder-state' }, [fact('סטטוס', 'נטען…')]),
    el('div', { class: 'form-actions form-actions--wrap' }, [
      el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'pick-folder' } }, [icon('upload'), 'בחר תיקייה']),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'test-folder' } }, [icon('check'), 'בדוק כתיבה']),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'reconnect-folder' } }, [icon('refresh'), 'חדש הרשאה']),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'forget-folder' } }, [icon('close'), 'נתק תיקייה']),
    ]),
  ]));

  root.append(el('section', { class: 'panel' }, [
    el('h2', { class: 'panel__title' }, [icon('layers'), 'פעולות על העסקה']),
    el('div', { class: 'form-actions form-actions--wrap' }, [
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'duplicate-deal' } }, [icon('copy'), 'שכפל כתבנית']),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'sync-team-roles' } }, [icon('refresh'), 'סנכרן דרגות מהתעריפון']),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'export-deal' } }, [icon('download'), 'ייצוא העסקה לאקסל']),
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
    wrap.append(field('טבלה / גיליון', el('select', { class: 'select', dataset: { imp: 'sheet' } },
      sheets.map((s, i) => el('option', {
        value: String(i),
        text: s.rows ? `${s.name} · ${s.rows.length} שורות` : s.name,
        selected: i === sheetIndex ? 'selected' : null,
      })))));
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

// מקור אמת יחיד עם importer.js — רשימה כפולה כאן גרמה לכך שעמודת "עובד"
// הוצגה כ"התעלם" ולא ניתן היה לתקן מיפוי שגוי של עמודת האדם.
const TARGET_FIELD_OPTIONS = TARGET_FIELDS.map((f) => ({ id: f.id, label: f.label }));

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

/**
 * טוסט עם ביטול — לפעולות שמוחקות מידע. נשאר על המסך יותר זמן מטוסט רגיל,
 * ומציג ספירה לאחור כדי שיהיה ברור כמה זמן נשאר לבטל.
 */
export function undoToast(message, onUndo, seconds = 8) {
  let node = document.getElementById('toast');
  if (!node) {
    node = el('div', { class: 'toast', id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  clearTimeout(toastTimer);
  clearInterval(undoToast._tick);

  let left = seconds;
  const counter = el('span', { class: 'toast__count num', text: String(left) });
  const undoBtn = el('button', { class: 'toast__undo', type: 'button' }, [icon('refresh'), 'בטל']);
  node.className = 'toast toast--undo';
  node.replaceChildren(icon('trash'), el('span', { text: message }), undoBtn, counter);
  node.classList.remove('gone');

  const close = () => {
    clearInterval(undoToast._tick);
    node.classList.add('gone');
    setTimeout(() => node.remove(), 320);
  };
  undoBtn.addEventListener('click', async () => { close(); await onUndo(); });
  undoToast._tick = setInterval(() => {
    left -= 1;
    counter.textContent = String(Math.max(0, left));
    if (left <= 0) close();
  }, 1000);
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
  const setBar = (key, util, status) => {
    const node = document.querySelector(`[data-calc="${CSS.escape(key)}"]`);
    if (node) { node.innerHTML = miniBar(util, status); node.title = fmtPct(util); }
  };

  const setDelta = (key, actual, budget) => {
    const node = document.querySelector(`[data-calc="${CSS.escape(key)}"]`);
    if (!node) return;
    const over = actual > budget + 0.05;
    node.textContent = overText(actual, budget);
    node.className = `num delta${over ? '' : ' delta--none'}`;
  };

  for (const team of snap.teams) {
    const share = snap.budgetCost > 0 ? team.budgetCost / snap.budgetCost : 0;
    set(`team-budget-${team.id}`, money(team.budgetCost, d));
    set(`team-cost-${team.id}`, money(team.budgetCost, d));
    set(`team-hours-${team.id}`, fmtHours(team.budgetHours));
    set(`team-est-${team.id}`, fmtHours(team.estHours));
    set(`team-actual-${team.id}`, money(team.actualCost, d));
    set(`team-actual-cost-${team.id}`, money(team.actualCost, d));
    set(`team-actual-hours-${team.id}`, fmtHours(team.actualHours));
    set(`team-hours-live-${team.id}`, `${fmtHours(team.actualHours)} / ${fmtHours(team.budgetHours)}`);
    set(`team-share-${team.id}`, `${fmtPct(share)} מהתקציב · ${money(team.budgetCost, d)}`);
    set(`team-remaining-${team.id}`, money(team.remainingCost, d), team.remainingCost < 0);
    set(`team-rem-${team.id}`, money(team.remainingCost, d), team.remainingCost < 0);
    set(`team-util-${team.id}`, fmtPct(team.util));
    setDelta(`team-delta-${team.id}`, team.actualHours, team.budgetHours);
    setStatus(`team-status-${team.id}`, team.status, `${STATUS_LABEL[team.status]} · ${fmtPct(team.util)}`);
    setBar(`team-bar-${team.id}`, team.util, team.status);
    setBar(`team-foot-bar-${team.id}`, team.util, team.status);
    const maxHours = Math.max(1, ...team.lines.map((l) => l.budgetHours || 0));
    for (const line of team.lines) {
      set(`line-cost-${line.id}`, money(line.budgetCost, d));
      set(`line-actual-cost-${line.id}`, money(line.actualCost, d));
      set(`line-remaining-${line.id}`, money(line.remainingCost, d), line.remainingCost < 0);
      setDelta(`line-delta-${line.id}`, line.actualHours, line.budgetHours);
      const util = document.querySelector(`[data-calc="line-util-${CSS.escape(line.id)}"]`);
      if (util) { util.textContent = fmtPct(line.util); util.className = `num pct pct--${line.status}`; }
      setBar(`line-bar-${line.id}`, line.util, line.status);
      // רוחב המד יחסי לגודל השורה — צריך להתעדכן גם כששעות התקציב משתנות תוך כדי הקלדה
      const track = document.querySelector(`[data-calc="line-bar-${CSS.escape(line.id)}"]`);
      if (track) track.style.width = `${Math.max(34, Math.round((line.budgetHours / maxHours) * 100))}%`;
      const input = document.querySelector(`input[data-field="hoursOverride"][data-line-id="${CSS.escape(line.id)}"]`);
      if (input && input.dataset.auto === '1' && document.activeElement !== input) input.value = String(line.budgetHours);
    }
  }

  // הפס העליון
  set('hero-util', fmtPct(snap.util));
  setBar('hero-bar', snap.util, snap.status);
  set('hero-util-sub', `${fmtHours(snap.actualHours)} מתוך ${fmtHours(snap.budgetHours)} שעות · ${money(snap.actualCost, d)} מתוך ${money(snap.budgetCost, d)}`);
  set('hero-remaining', money(snap.remainingCost, d));
  const heroRem = document.querySelector('[data-calc="hero-remaining"]');
  if (heroRem) heroRem.className = `hero3__mid num ${snap.remainingCost < 0 ? 'neg' : 'pos'}`;
  set('hero-remaining-sub', `${fmtHours(snap.remainingHours)} שעות נותרו`);
  set('hero-blended', money(snap.blendedRate, d));
  if (snap.eac !== null) {
    const eacOver = snap.eacVariance !== null && snap.eacVariance < 0;
    set('hero-eac', money(snap.eac, d));
    const eacNode = document.querySelector('[data-calc="hero-eac"]');
    if (eacNode) eacNode.className = `hero3__mid num ${eacOver ? 'warn' : 'pos'}`;
    set('hero-eac-sub', `${money(Math.abs(snap.eacVariance), d)} ${eacOver ? 'מעל התקציב' : 'מתחת לתקציב'} · ${snap.eacBasis}`);
  }

  set('f-budget-hours', fmtHours(snap.budgetHours));
  set('f-est-hours', fmtHours(snap.estHours));
  set('f-blended', money(snap.blendedRate, d));
  set('f-blended-all', money(snap.blendedAll, d));
  set('f-blended-actual', money(snap.blendedActual, d));
  set('f-blended-eff', money(snap.effectiveRates.blended, d));

  if (selected.size) {
    const agg = aggregateTeams(snap, selected);
    set('agg-budget', money(agg.budgetCost, d));
    set('agg-actual', money(agg.actualCost, d));
    set('agg-remaining', money(agg.remainingCost, d), agg.remainingCost < 0);
    set('agg-util', fmtPct(agg.util));
    set('agg-hours', `${fmtHours(agg.actualHours)} / ${fmtHours(agg.budgetHours)}`);
    set('agg-blended', money(agg.blendedRate, d));
    set('agg-share', fmtPct(agg.shareOfDeal));
  }

  // פאנל התקרה נבנה מחדש (אין בו קלט של המשתמש) — אחרת הוא נשאר על תקציב ישן
  for (const node of document.querySelectorAll('.panel--cap')) {
    const fresh = renderCapPanel(snap);
    if (fresh) node.replaceWith(fresh);
  }

  // אחוז הניצול על טאב העסקה — לפי המסלול השוטף אם הוזנו נתונים ידניים
  const tabUtil = document.querySelector(`.dtab[data-id="${CSS.escape(snap.deal.id)}"] .dtab__util`);
  if (tabUtil) tabUtil.textContent = fmtPct(headlineUtil(snap));
  const tabDot = document.querySelector(`.dtab[data-id="${CSS.escape(snap.deal.id)}"] .dtab__dot`);
  if (tabDot) tabDot.className = `dtab__dot dtab__dot--${statusOfUtil(headlineUtil(snap))}`;
}

export { round2 };
