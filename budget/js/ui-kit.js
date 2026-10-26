// ui-kit.js — יסודות הממשק: יצירת DOM, אייקונים, עיצוב מספרים לפי יחידה (שעות / ₪)
// ורכיבים קטנים שכל המסכים חולקים. כל קלט משתמש נכנס כ-textContent/value בלבד (מניעת XSS);
// אייקונים הם SVG סטטי ולכן מותר להם innerHTML.

import { fmtMoney, fmtHours, fmtPct, STATUS_LABEL, TEAM_COLORS } from './model.js';

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
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>',
  coins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  sidebar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
};

/* ---------- DOM ---------- */

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

/* ---------- צבעי זהות: צוותים ועסקאות ----------
 * שישה גוונים (‎--id-0..5 ב-CSS), בסדר שנבדק לעיוורון צבעים בשתי הערכות. הצבע הולך עם הישות
 * ולא עם המיקום שלה ברשימה: צוות — לפי הצבע ששמור עליו מאז שנוצר, עסקה — לפי המזהה שלה.
 * הגוונים לא כוללים אדום/ענבר — אלה שמורים לחריגה ולסיכון.
 */
export const ID_SLOTS = 6;
const hashId = (s) => { let h = 7; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
export const teamSlot = (team) => {
  const i = TEAM_COLORS.indexOf(team?.color);
  return (i >= 0 ? i : hashId(team?.id)) % ID_SLOTS;
};
export const dealSlot = (deal) => hashId(deal?.id) % ID_SLOTS;
export const personSlot = (person) => hashId(person?.id) % ID_SLOTS;

/** ראשי תיבות לסמל: שתי המילים הראשונות ("רכישת אלפא טכנולוגיות" → "רא") */
export function initials(name, n = 2) {
  const words = String(name || '').replace(/["'׳״—–\-·]/g, ' ').split(/\s+/).filter(Boolean);
  return words.slice(0, n).map((w) => w[0]).join('') || '·';
}

/** סמל זהות: ריבוע מעוגל בצבע הישות עם ראשי התיבות שלה */
export function avatar(name, slot, { size = '', alert = '' } = {}) {
  return el('span', {
    class: `av${size ? ` av--${size}` : ''}`, 'aria-hidden': 'true',
    dataset: alert ? { slot: String(slot), alert } : { slot: String(slot) }, text: initials(name),
  });
}

/* ---------- יחידה: שעות או ₪ ----------
 * כל מספר על המסך מוצג ביחידה אחת שנבחרה במתג. אחוזים, מקדמים וספירות הם בלי יחידה
 * ומוצגים בשתיהן; תעריפים (₪ לשעה) — רק בתצוגת ₪.
 */
export const UNIT_LABEL = { hours: 'שעות', money: '₪' };

/** הערכים של שורה / צוות / עסקה / מצרף — ביחידה שנבחרה */
export function measure(o, unit) {
  if (unit === 'money') {
    return { budget: o.budgetCost, actual: o.actualCost, remaining: o.remainingCost, util: o.costUtil, status: o.costStatus, est: o.estCost };
  }
  return { budget: o.budgetHours, actual: o.actualHours, remaining: o.remainingHours, util: o.util, status: o.status, est: o.estHours };
}

/** מספר ביחידה כטקסט: ₪ עם סימן המטבע, שעות כמספר בלבד (היחידה בכותרת או בסיומת נפרדת) */
export function fmtU(n, unit, deal) {
  if (unit === 'money') return fmtMoney(n, { currency: deal?.currency || '₪' });
  const v = Number(n) || 0;
  return v < 0 ? `−${fmtHours(-v)}` : fmtHours(v);
}

/** מספר עם סימן (+/−) — לפערים */
export function fmtDelta(n, unit, deal) {
  const v = Number(n) || 0;
  if (Math.abs(v) < 0.005) return unit === 'money' ? fmtMoney(0) : '0';
  return `${v > 0 ? '+' : ''}${fmtU(v, unit, deal)}`;
}

/**
 * ערך + יחידה כצמתים: המספר ב-span LTR מבודד והמילה "שעות" מחוצה לו — כך סדר הקריאה
 * בעברית נשמר ("296 שעות" ולא "שעות 296"). ב-₪ הסימן כבר חלק מהמספר.
 */
export function valueNodes(n, unit, { deal, cls = '', calc = '', short = false, signed = false } = {}) {
  const text = signed ? fmtDelta(n, unit, deal) : fmtU(n, unit, deal);
  const numNode = el('span', { class: `num ${cls}`.trim(), dataset: calc ? { calc } : null, text });
  if (unit === 'money') return [numNode];
  return [numNode, el('span', { class: 'unit', text: short ? ' ש׳' : ' שעות' })];
}

/** אחוז לתצוגה — עם סימן מינוס טיפוגרפי (−) כמו בשאר המספרים */
export const pctText = (u) => (Number.isFinite(u) ? fmtPct(u).replace('-', '−') : (u > 0 ? '—' : '0%'));
export const toneOf = (status) => (status === 'over' ? 'is-over' : status === 'risk' ? 'is-risk' : '');

/* ---------- תאריכים ---------- */
const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** "2026-05" → "מאי 2026" */
export function monthLabel(ym) {
  const [y, m] = String(ym || '').split('-');
  return HE_MONTHS[Number(m) - 1] ? `${HE_MONTHS[Number(m) - 1]} ${y}` : (ym || 'ללא תאריך');
}

/** "2026-10-06" → "06.10.2026" */
export function fmtDate(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return d ? `${d}.${m}.${y}` : (iso || '');
}

/* ---------- מד ניצול ----------
 * עד 100% — מילוי יחסי. מעל 100% המסלול "מתארך": המילוי מלא, וקו דק מסמן היכן נגמר התקציב —
 * כך רואים גם שיש חריגה וגם כמה גדולה היא. צבע רק לסיכון (כתום) ולחריגה (אדום).
 */
export function meter(util, status, { size = '', calc = '' } = {}) {
  const node = el('span', { class: 'meter', role: 'img', dataset: calc ? { calc } : null });
  paintMeter(node, util, status, size);
  return node;
}

export function paintMeter(node, util, status, size) {
  if (!node) return;
  const u = Number.isFinite(util) ? Math.max(0, util) : (util > 0 ? 2 : 0);
  const scale = Math.max(1, u);
  const fill = Math.round((u / scale) * 1000) / 10;
  const keep = size !== undefined ? size : (node.dataset.size || '');
  node.dataset.size = keep;
  node.className = `meter${keep ? ` meter--${keep}` : ''}${status === 'over' ? ' meter--over' : status === 'risk' ? ' meter--risk' : ''}`;
  node.setAttribute('aria-label', `ניצול ${pctText(util)}`);
  node.replaceChildren(el('span', { class: 'meter__fill', style: `width:${fill}%` }));
  if (u > 1) node.append(el('span', { class: 'meter__mark', style: `inset-inline-start:${Math.round((1 / scale) * 1000) / 10}%` }));
}

/** מד + אחוז — לתאי טבלה ושורות. calc = מפתח לעדכון חי (‎<key>-meter / <key>-pct) */
export function meterCell(util, status, { calc = '', size = '' } = {}) {
  return el('div', { class: 'mcell' }, [
    meter(util, status, { size, calc: calc ? `${calc}-meter` : '' }),
    el('span', { class: `mcell__pct num ${toneOf(status)}`.trim(), dataset: calc ? { calc: `${calc}-pct` } : null, text: pctText(util) }),
  ]);
}

/** תג סטטוס — רק כשיש מה לומר (סיכון / חריגה). "תקין" אינו צריך תג */
export function statusPill(status, label) {
  if (status !== 'over' && status !== 'risk') return null;
  return el('span', { class: `pill pill--${status}`, text: label || STATUS_LABEL[status] });
}

/* ---------- בקרים ---------- */

/** מתג מקטעים. items = [[value, label, title?]] */
export function seg(items, current, action, key, { cls = '', label = '' } = {}) {
  return el('div', { class: `seg ${cls}`.trim(), role: 'group', 'aria-label': label || null }, items.map(([value, text, title]) => el('button', {
    class: `seg__btn${value === current ? ' is-on' : ''}`, type: 'button', title: title || null,
    'aria-pressed': String(value === current), dataset: { action, [key]: value },
  }, text)));
}

/** מתג היחידה — אותו רכיב בכל המסכים */
export function unitSwitch(unit) {
  return seg([['hours', 'שעות', 'כל המספרים בשעות'], ['money', '₪', 'כל המספרים בשקלים']], unit, 'set-unit', 'unit', { cls: 'seg--unit', label: 'יחידת תצוגה' });
}

/**
 * תפריט נפתח. items = [{ label, action, icon, danger, dataset }] או '-' למפריד.
 * הפתיחה/סגירה מטופלת ב-app.js (data-action="toggle-menu"), וכל פריט מפעיל את ה-action שלו.
 */
export function menu({ label = '', iconName = '', title = '', cls = 'btn btn--sm', items = [], iconOnly = false }) {
  const trigger = el('button', {
    class: cls, type: 'button', title: title || null, 'aria-label': iconOnly ? (title || label) : null,
    'aria-haspopup': 'menu', 'aria-expanded': 'false', dataset: { action: 'toggle-menu' },
  }, iconOnly
    ? [icon(iconName)]
    : [iconName ? icon(iconName) : null, label, icon('chevronDown')]);
  const list = el('div', { class: 'menu', role: 'menu', hidden: '' }, items.filter(Boolean).map((it) => {
    if (it === '-') return el('div', { class: 'menu__sep', role: 'separator' });
    if (it.heading) return el('div', { class: 'menu__label', text: it.heading });
    return el('button', {
      class: `menu__item${it.danger ? ' menu__item--danger' : ''}`, type: 'button', role: 'menuitem',
      dataset: { action: it.action, ...(it.dataset || {}) },
    }, [it.icon ? icon(it.icon) : null, it.label]);
  }));
  return el('div', { class: 'menu-wrap' }, [trigger, list]);
}

/**
 * שדה טופס. hint = הסבר — מוצג כ-ⓘ ליד התווית (בריחוף/פוקוס), לא כמשפט מתחת לשדה.
 * note:true — כשהטקסט הוא מצב ולא הסבר (למשל "זוהו 3 שורות שכבר דווחו") ולכן חייב להיראות תמיד.
 */
export function field(label, control, hint, { note = false } = {}) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field__label' }, [label, hint && !note ? infoTip(hint) : null]),
    control,
    hint && note ? el('span', { class: 'field__hint', text: hint }) : null,
  ]);
}

export function fact(label, value, tone = '') {
  // ערך עם אותיות עבריות הוא טקסט ולא מספר — בלי num (שהופך כיוון ל-LTR ושובר את סדר המילים)
  const isText = /[\u0590-\u05FF]/.test(String(value ?? ''));
  return el('div', { class: `fact ${tone ? `fact--${tone}` : ''}`.trim() }, [
    el('span', { class: 'fact__label', text: label }),
    el('span', { class: `fact__value${isText ? '' : ' num'}`, text: value }),
  ]);
}

export function emptyState(title, text, actions = []) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'empty__icon', html: ICONS.wallet }),
    el('h2', { text: title }),
    text ? el('p', { text }) : null,
    actions.length ? el('div', { class: 'form-actions form-actions--wrap' }, actions) : null,
  ]);
}

export function button(label, { action, iconName, kind = '', size = 'sm', dataset = {}, title = '' } = {}) {
  return el('button', {
    class: `btn${kind ? ` btn--${kind}` : ''}${size ? ` btn--${size}` : ''}`, type: 'button', title: title || null,
    dataset: action ? { action, ...dataset } : dataset,
  }, [iconName ? icon(iconName) : null, label]);
}

export function iconButton(iconName, { action, title, danger = false, dataset = {}, tabindex = null, cls = '' } = {}) {
  return el('button', {
    class: `iconbtn${danger ? ' iconbtn--danger' : ''}${cls ? ` ${cls}` : ''}`, type: 'button', title, 'aria-label': title,
    tabindex, dataset: { action, ...dataset }, html: ICONS[iconName] || '',
  });
}

/* ---------- קיפול: פאנלים מתקפלים ורשימות ארוכות ---------- */

// מצב הקיפול נזכר לכל מפתח (פאנל / חודש) — כך רינדור מחדש לא פותח הכל מחדש
const FOLD_KEY = 'lb_folds';
const folds = (() => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch { return {}; } })();
export function isFoldOpen(key, fallback) { return key in folds ? !!folds[key] : fallback; }
export function setFold(key, open) {
  folds[key] = !!open;
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(folds)); } catch { /* מצב קיפול אינו קריטי */ }
}

/**
 * פאנל מתקפל: הכותרת נלחצת ומקפלת את כל התוכן. `meta` מוצג ליד הכותרת גם כשהפאנל סגור
 * (למשל "6 מקורות"), כדי שהמידע החשוב לא ייעלם עם הקיפול.
 */
export function foldPanel(key, { title, meta = null, open = true, cls = '' }, children) {
  const details = el('details', { class: `fold ${cls}`.trim(), open: isFoldOpen(key, open) ? '' : null });
  details.addEventListener('toggle', () => setFold(key, details.open));
  details.append(
    el('summary', { class: 'fold__head' }, [
      el('h2', { class: 'fold__title' }, [title, meta]),
      el('span', { class: 'fold__chev', html: ICONS.chevronDown, 'aria-hidden': 'true' }),
    ]),
    el('div', { class: 'fold__body' }, children),
  );
  return details;
}

/**
 * רשימה ארוכה: מציג את `limit` הראשונים ואת השאר מאחורי "הצג עוד". עובד גם על שורות טבלה
 * (מחזיר שורת כפתור) וגם על פריטי רשימה. המכל צריך את המחלקה has-more.
 */
export function limitItems(items, limit, { colspan = 0, noun = 'פריטים' } = {}) {
  if (items.length <= limit) return items;
  items.forEach((n, i) => { if (i >= limit) n.classList.add('is-extra'); });
  const rest = items.length - limit;
  const label = () => `הצג עוד ${rest} ${noun}`;
  const btn = el('button', { class: 'linkbtn more-btn', type: 'button' }, [label()]);
  btn.addEventListener('click', () => {
    const host = btn.closest('.has-more');
    const all = host.classList.toggle('show-all');
    btn.textContent = all ? 'הצג פחות' : label();
  });
  const holder = colspan
    ? el('tr', { class: 'more-row' }, [el('td', { colspan: String(colspan) }, [btn])])
    : el('li', { class: 'more-row' }, [btn]);
  return [...items, holder];
}

/** כרטיס עם כותרת. body = מערך צמתים; flush = בלי ריפוד (לטבלאות) */
export function card({ title, sub = '', info = '', tools = null, count = null, cls = '', flush = false, id = null }, body = []) {
  return el('section', { class: `card ${cls}`.trim(), id }, [
    title ? el('header', { class: 'card__head' }, [
      el('div', {}, [
        el('h2', { class: 'card__title' }, [title, count !== null ? el('span', { class: 'count', text: String(count) }) : null, info ? infoTip(info) : null]),
        sub ? el('p', { class: 'card__sub', text: sub }) : null,
      ]),
      tools ? el('div', { class: 'card__tools' }, [].concat(tools)) : null,
    ]) : null,
    ...(flush ? [].concat(body) : [el('div', { class: 'card__body' }, body)]),
  ]);
}

/**
 * טבלה. head = [text | {text, cls, title, sort}], rows = מערך tr. more = כמה שורות להציג לפני "הצג עוד".
 * sort = { key, dir, action } — כל כותרת עם sort הופכת לכפתור מיון (aria-sort מסמן את המצב).
 */
export function table(head, rows, { cls = '', foot = null, more = 0, noun = 'שורות', sort = null } = {}) {
  const th = head.map((h) => {
    if (typeof h === 'string') return el('th', { text: h });
    const on = !!(sort && h.sort && sort.key === h.sort);
    return el('th', {
      class: h.cls || null, title: h.title || null,
      'aria-sort': sort && h.sort ? (on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : null,
    }, sort && h.sort ? [sortButton(h.text, h.sort, on ? sort.dir : '', sort.action)] : (h.text || ''));
  });
  const body = el('tbody', { class: more ? 'has-more' : null }, more ? limitItems(rows, more, { colspan: head.length, noun }) : rows);
  return el('div', { class: 'tbl-wrap' }, el('table', { class: `tbl ${cls}`.trim() }, [
    el('thead', {}, el('tr', {}, th)),
    body,
    foot ? el('tfoot', {}, foot) : null,
  ]));
}

/** כפתור מיון בכותרת עמודה — החץ מציג את הכיוון; בלי מיון החץ מופיע רק בריחוף */
export function sortButton(text, key, dir, action) {
  const state = dir ? (dir === 'asc' ? 'ממוין בסדר עולה' : 'ממוין בסדר יורד') : '';
  return el('button', {
    class: `sortbtn${dir ? ` is-${dir}` : ''}`, type: 'button', dataset: { action, sort: key },
    title: dir ? `${state} — לחיצה להפוך` : 'מיון לפי העמודה',
    'aria-label': `${text || 'התראות'}${state ? ` — ${state}` : ' — מיון'}`,
  }, [text, el('span', { class: 'sortbtn__arrow', 'aria-hidden': 'true' })]);
}

/** צ'יפים לסינון: items = [[value, label, count]] */
export function chips(items, current, action, key, { label = '' } = {}) {
  return el('div', { class: 'chips', role: 'group', 'aria-label': label || null }, items.map(([value, text, count]) => el('button', {
    class: `chip${value === current ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(value === current),
    disabled: count === 0 && value !== current ? '' : null, dataset: { action, [key]: value },
  }, [text, count !== undefined ? el('span', { class: 'chip__n num', text: String(count) }) : null])));
}

/* ---------- אריח מדד (KPI) ---------- */

/** אריח: תווית (+ ⓘ), ערך, שורת הקשר, ותוספת חזותית (פס יחסי / קו מגמה / טבעת) */
export function tile({ label, value, sub = null, tip = '', cls = '', extra = null }) {
  return el('div', { class: `tile ${cls}`.trim() }, [
    el('span', { class: 'tile__label' }, [label, tip ? infoTip(tip) : null]),
    value,
    sub ? el('span', { class: 'tile__sub' }, [].concat(sub)) : null,
    extra,
  ]);
}

/** פס יחסי באריח — ההשוואה בין האריחים נקראת בלי לקרוא מספרים */
export function tileBar(amount, top, tone = '') {
  const w = top > 0 ? Math.max(2, Math.min(100, (amount / top) * 100)) : 0;
  return el('span', { class: `tile__bar${tone ? ` tile__bar--${tone}` : ''}`, 'aria-hidden': 'true' }, [el('i', { style: `width:${Math.round(w * 10) / 10}%` })]);
}

/* ---------- טולטיפים ----------
 * רכיב אחד לכל האפליקציה: כל אלמנט עם data-tip מציג את הטקסט בריחוף (עכבר) או בפוקוס (מקלדת);
 * במגע — הקשה על ⓘ. הסברים ארוכים יושבים מאחורי ⓘ ולא כמשפטים מתחת לנתונים.
 * גרף עם data-pts (נקודות ביחידות ה-viewBox) ו-data-tips (JSON של טקסטים) מציג את הערך המדויק
 * של הנקודה הקרובה לסמן.
 */

/** ⓘ עם הסבר. span ולא button: בתוך <label> כפתור היה "חוטף" את התווית מהשדה */
export function infoTip(text, { label = 'הסבר' } = {}) {
  return el('span', { class: 'infotip', tabindex: '0', role: 'img', 'aria-label': `${label}: ${text}`, dataset: { tip: text }, html: ICONS.info });
}

let tipNode = null;
let tipDot = null;
let tipTimer = null;
let tipFor = null;

function tipEls() {
  if (!tipNode || !tipNode.isConnected) {
    tipNode = el('div', { class: 'tip', role: 'tooltip', id: 'tip' });
    tipDot = el('span', { class: 'tip-dot', 'aria-hidden': 'true' });
    document.body.append(tipNode, tipDot);
  }
  return tipNode;
}

/** מציג טולטיפ מעל עוגן (מלבן או נקודה); אם אין מקום מעל — מתחת */
export function showTip(text, anchor, { dot = false } = {}) {
  const node = tipEls();
  node.textContent = text;
  node.classList.add('is-on');
  const r = anchor.width !== undefined ? anchor : { left: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const cx = r.left + r.width / 2;
  let top = r.top - h - 10;
  const below = top < 8;
  if (below) top = r.bottom + 10;
  const left = Math.min(Math.max(8, cx - w / 2), window.innerWidth - w - 8);
  node.style.top = `${Math.round(top)}px`;
  node.style.left = `${Math.round(left)}px`;
  node.style.setProperty('--arrow-x', `${Math.round(Math.min(Math.max(12, cx - left), w - 12))}px`);
  node.classList.toggle('tip--below', below);
  tipDot.classList.toggle('is-on', dot);
  if (dot) {
    tipDot.style.left = `${Math.round(anchor.x)}px`;
    tipDot.style.top = `${Math.round(anchor.y)}px`;
  }
}

export function hideTip() {
  clearTimeout(tipTimer);
  tipFor = null;
  tipNode?.classList.remove('is-on');
  tipDot?.classList.remove('is-on');
  for (const g of document.querySelectorAll('.ch-guide.is-on')) g.classList.remove('is-on');
}

/** הנקודה בגרף הקרובה לסמן (לפי ציר X בלבד — כמו קו אנכי שעוקב אחרי העכבר) */
function chartPoint(svg, clientX) {
  const pts = (svg.dataset.pts || '').split(' ').filter(Boolean).map((p) => p.split(',').map(Number));
  if (!pts.length) return null;
  const vb = svg.viewBox.baseVal;
  const r = svg.getBoundingClientRect();
  if (!vb || !vb.width || !r.width) return null;
  const x = ((clientX - r.left) / r.width) * vb.width;
  let best = 0;
  pts.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(pts[best][0] - x)) best = i; });
  let tips = [];
  try { tips = JSON.parse(svg.dataset.tips || '[]'); } catch { /* בלי טקסטים — בלי טולטיפ */ }
  return {
    vx: pts[best][0], text: tips[best] || '',
    x: r.left + (pts[best][0] / vb.width) * r.width,
    y: r.top + (pts[best][1] / vb.height) * r.height,
  };
}

/** מחבר את הטולטיפים לכל המסמך — פעם אחת, באתחול */
export function initTips() {
  const target = (e) => e.target.closest?.('[data-tip]');
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = target(e);
    if (!t || t === tipFor) return;
    clearTimeout(tipTimer);
    tipFor = t;
    tipTimer = setTimeout(() => { if (tipFor === t && t.isConnected) showTip(t.dataset.tip, t.getBoundingClientRect()); }, 260);
  });
  document.addEventListener('pointerout', (e) => {
    const t = target(e);
    if (t && t === tipFor && !t.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const t = target(e);
    if (t && t.matches(':focus-visible')) { tipFor = t; showTip(t.dataset.tip, t.getBoundingClientRect()); }
  });
  document.addEventListener('focusout', (e) => { if (target(e) && target(e) === tipFor) hideTip(); });
  // מגע ולחיצה: ⓘ מציג/מסתיר — ולא מפעיל את השורה או התווית שהוא יושב בהן
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('.infotip');
    if (!t) return;
    e.preventDefault();
    if (tipFor === t && tipNode?.classList.contains('is-on')) hideTip();
    else { clearTimeout(tipTimer); tipFor = t; showTip(t.dataset.tip, t.getBoundingClientRect()); }
  });
  // גרפים: הערך המדויק של הנקודה הקרובה לסמן
  document.addEventListener('pointermove', (e) => {
    const svg = e.target.closest?.('svg[data-pts]');
    if (!svg) { if (tipFor?.matches?.('svg[data-pts]')) hideTip(); return; }
    const p = chartPoint(svg, e.clientX);
    if (!p || !p.text) return;
    clearTimeout(tipTimer);
    tipFor = svg;
    showTip(p.text, { x: p.x, y: p.y }, { dot: true });
    const guide = svg.querySelector('.ch-guide');
    if (guide) { guide.setAttribute('x1', p.vx); guide.setAttribute('x2', p.vx); guide.classList.add('is-on'); }
  });
  document.addEventListener('pointerleave', hideTip);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  window.addEventListener('scroll', hideTip, { capture: true, passive: true });
  window.addEventListener('resize', hideTip);
}

/* ---------- Toast ---------- */

let toastTimer = null;
export function toast(message, tone = '') {
  let node = document.getElementById('toast');
  if (!node) {
    node = el('div', { class: 'toast', id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  clearInterval(undoToast._tick);
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
