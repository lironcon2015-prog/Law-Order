// ui.js — רינדור DOM. כל קלט משתמש מוזרק כ-textContent/value (מניעת XSS).
// אייקונים הם SVG סטטי (ללא קלט משתמש) ולכן מותר innerHTML עבורם בלבד.

import {
  LEAD_STATUSES, statusMeta, withCompanyNames, companyNameMap,
  isOverdue, daysSinceContact, followUpRatio,
  dealValue, urgency, groupByStatus,
  CONTACT_TYPES, contactTypeLabel,
  actionBuckets, actionReason,
  companyConnections, rankIntroLinks, topRelationshipsByValue,
} from './store.js';

/* ---------- אייקונים (Lucide-style, סטטי) ---------- */
export const ICONS = {
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  handshake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>',
  kanban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v16"/><path d="M5 3h4v10H5z"/><path d="M12 3h4v6h-4z"/><path d="M19 3h0v16"/><path d="M12 3v16"/><path d="M19 3h-7"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  coins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 0-9h-1.8A7 7 0 1 0 4 16.3"/><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/></svg>',
  cloudUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="m8 17 4-4 4 4"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',
  cloudDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="m8 17 4 4 4-4"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><path d="M21 12H9"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
  network: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>',
  trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
};

/* ---------- DOM helpers ---------- */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v; // אייקונים סטטיים בלבד
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
function icon(name, cls) {
  return el('span', { class: cls || 'ic', html: ICONS[name] || '', 'aria-hidden': 'true' });
}
function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

/** avatar עם תמונה (אם קיימת) או ראשי-תיבות, וטבעת לפי שלב הליד */
function avatarEl(contact, cls = 'avatar') {
  const tier = statusMeta(contact.status).tier;
  const node = el('span', { class: cls, 'aria-hidden': 'true', dataset: { tier: String(tier) } });
  if (contact.photoUrl) {
    node.classList.add('has-photo');
    node.style.backgroundImage = `url("${contact.photoUrl}")`;
  } else {
    node.textContent = initials(contact.fullName);
  }
  return node;
}

/** "לפני X" יחסי, לתצוגת אינטראקציה אחרונה */
function timeAgo(iso) {
  if (!iso) return 'אין קשר';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  if (days < 365) return `לפני ${Math.floor(days / 30)} חודשים`;
  return `לפני ${Math.floor(days / 365)} שנים`;
}

/* ---------- formatting ---------- */
const ILS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
export function formatCurrency(v) {
  if (v == null || v === '') return '—';
  return ILS.format(v).replace('ILS', '₪').trim();
}
export function formatCompactCurrency(v) {
  if (!v) return '';
  const abs = Math.abs(v);
  let s;
  if (abs >= 1e9) s = (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  else if (abs >= 1e6) s = (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  else if (abs >= 1e3) s = Math.round(v / 1e3) + 'K';
  else s = String(v);
  return '₪' + s;
}
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

/* ---------- status pill ---------- */
export function statusPill(statusKey) {
  const meta = statusMeta(statusKey);
  return el('span', { class: 'status', dataset: { tier: String(meta.tier) }, title: meta.label }, [
    el('span', { class: 'dot' }),
    meta.label,
  ]);
}

/* ============================================================
   רשימת אנשי קשר (sidebar)
   ============================================================ */
export function renderList(container, contacts, companies, state) {
  container.replaceChildren();
  const enriched = withCompanyNames(contacts, companies);

  if (!enriched.length) {
    container.append(el('div', { class: 'list-empty' }, [
      state.searchTerm
        ? 'לא נמצאו תוצאות לחיפוש.'
        : (state.view === 'followup'
            ? 'אין כרגע אנשי קשר שדורשים מעקב. כל הכבוד 👌'
            : 'אין עדיין אנשי קשר. הוסיפו את הראשון עם כפתור “+”.'),
    ]));
    return;
  }

  for (const c of enriched) {
    const overdue = isOverdue(c);
    const card = el('button', {
      class: 'card',
      type: 'button',
      dataset: { id: c.id, action: 'open-contact' },
      'aria-current': state.selectedContactId === c.id ? 'true' : 'false',
    }, [
      el('div', { class: 'card__head' }, [
        avatarEl(c, 'avatar'),
        el('span', { class: 'card__id' }, [
          el('span', { class: 'card__name', text: c.fullName || 'ללא שם' }),
          el('span', { class: 'card__company', text: [c.role, c.companyName].filter(Boolean).join(' · ') || '—' }),
        ]),
      ]),
      el('div', { class: 'card__meta' }, [
        statusPill(c.status),
        overdue ? el('span', { class: 'badge-overdue' }, [icon('alert'), 'פיגור בקשר']) : null,
        ...(c.tags || []).slice(0, 2).map((t) => el('span', { class: 'tag', text: t })),
      ]),
    ]);
    container.append(card);
  }
}

/* ---------- status filter chips ---------- */
export function renderChips(container, contacts, activeStatus) {
  container.replaceChildren();
  const counts = new Map();
  for (const c of contacts) counts.set(c.status, (counts.get(c.status) || 0) + 1);

  const all = el('button', {
    class: 'chip', type: 'button', dataset: { status: 'all', action: 'filter-status' },
    'aria-pressed': activeStatus === 'all' ? 'true' : 'false',
  }, [`הכל (${contacts.length})`]);
  container.append(all);

  for (const s of LEAD_STATUSES) {
    const n = counts.get(s.key) || 0;
    if (!n) continue;
    const chip = el('button', {
      class: 'chip', type: 'button',
      dataset: { status: s.key, action: 'filter-status' },
      'aria-pressed': activeStatus === s.key ? 'true' : 'false',
    }, [
      el('span', { class: 'dot', style: dotColorForTier(s.tier) }),
      `${s.label} (${n})`,
    ]);
    container.append(chip);
  }
}
function dotColorForTier(tier) {
  const map = { '-1': '#6b7280', '0': '#6b7280', '1': '#c9c5be', '2': '#d9be7a', '3': '#e6c468', '4': '#f2ca50', '5': '#f2ca50' };
  return `background:${map[String(tier)] || '#6b7280'}`;
}

/* ============================================================
   "היום" — מנוע פעולה
   ============================================================ */
export function renderToday(container, contacts, companies, state) {
  container.replaceChildren();
  const names = companyNameMap(companies);
  const { overdue, soon, noContact } = actionBuckets(contacts);
  const openValue = [...overdue, ...soon, ...noContact].reduce((s, c) => s + dealValue(c), 0);

  const wrap = el('div', { class: 'screen today' });
  wrap.append(el('div', { class: 'today__summary' }, [
    statCard(String(overdue.length), 'בפיגור', 'over'),
    statCard(String(soon.length), 'השבוע', 'warn'),
    statCard(formatCompactCurrency(openValue) || '₪0', 'שווי פתוח', 'gold'),
  ]));

  if (!(overdue.length + soon.length + noContact.length)) {
    wrap.append(el('div', { class: 'panel' }, [
      el('div', { class: 'tab-empty' }, [icon('check'), el('div', { text: 'הכל מעודכן — אין פעולות פתוחות היום 👌' })]),
    ]));
  } else {
    if (overdue.length) wrap.append(actionGroup('בפיגור — תפוס עכשיו', 'alert', overdue, names, 'over'));
    if (noContact.length) wrap.append(actionGroup('ללא תיעוד קשר', 'info', noContact, names, 'new'));
    if (soon.length) wrap.append(actionGroup('מתקרב לסף — השבוע', 'clock', soon, names, 'warn'));
  }
  container.append(wrap);
}

function statCard(num, label, tone) {
  return el('div', { class: `stat-card stat-card--${tone}` }, [
    el('span', { class: 'stat-card__num num', text: num }),
    el('span', { class: 'stat-card__label', text: label }),
  ]);
}
function actionGroup(title, ic, items, names, tone) {
  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__title' }, [icon(ic), el('h3', { text: title }), el('span', { class: 'pill-count', text: String(items.length) })]),
    el('div', { class: 'action-list' }, items.map((c) => actionRow(c, names, tone))),
  ]);
}
function actionRow(c, names, tone) {
  const company = names.get(c.currentCompanyId) || '';
  const val = dealValue(c);
  const ci = c.contactInfo || {};
  const chan = (cond, ic, href, label, ext) => cond
    ? el('a', { class: 'chan-btn', href, title: label, 'aria-label': label, target: ext ? '_blank' : null, rel: ext ? 'noopener noreferrer' : null }, [icon(ic)])
    : null;
  return el('div', { class: `action-row tone-${tone}` }, [
    el('button', { class: 'action-row__main', type: 'button', dataset: { action: 'open-contact', id: c.id } }, [
      avatarEl(c, 'avatar avatar--sm'),
      el('div', { class: 'action-row__id' }, [
        el('span', { class: 'action-row__name', text: c.fullName || 'ללא שם' }),
        el('span', { class: 'action-row__sub', text: [c.role, company].filter(Boolean).join(' · ') || '—' }),
        el('span', { class: 'why-chip', text: actionReason(c) }),
      ]),
      val ? el('span', { class: 'action-row__val num', text: formatCompactCurrency(val) }) : null,
    ]),
    el('div', { class: 'action-row__tools' }, [
      el('div', { class: 'action-row__chans' }, [
        chan(ci.phone, 'phone', `tel:${ci.phone}`, 'חיוג'),
        chan(ci.email, 'mail', `mailto:${ci.email}`, 'מייל'),
        chan(ci.linkedin, 'linkedin', linkedinHref(ci.linkedin), 'לינקדאין', true),
      ]),
      el('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { action: 'log-contact', id: c.id } }, [icon('check'), 'תועד קשר']),
    ]),
  ]);
}

/* ============================================================
   רשת — warm-intro + ROI
   ============================================================ */
export function renderNetwork(container, contacts, companies, state) {
  container.replaceChildren();
  const conns = companyConnections(contacts, companies);
  const names = companyNameMap(companies);
  const wrap = el('div', { class: 'screen network' });

  const introPanel = el('div', { class: 'panel' }, [
    el('div', { class: 'panel__title' }, [icon('network'), el('h3', { text: 'מסלול חם — מי ברשת שלך מקשר ליעד' })]),
  ]);
  if (!conns.length) {
    introPanel.append(el('div', { class: 'tab-empty' }, [icon('network'),
      el('div', { text: 'אין עדיין נתוני קריירה לבניית רשת. הוסיפו תפקידים/חברות לאנשי הקשר.' })]));
  } else {
    const sel = el('select', { class: 'select', dataset: { action: 'network-target' } });
    sel.append(el('option', { value: '', text: '— בחרו חברת יעד —' }));
    conns.forEach((co) => {
      const o = el('option', { value: co.name, text: `${co.name} (${co.links.length})` });
      if (co.name === state.networkTarget) o.selected = true;
      sel.append(o);
    });
    introPanel.append(el('div', { class: 'field' }, [sel]));
    introPanel.append(el('div', { class: 'intro-results' }, introResults(conns, state.networkTarget)));
  }
  wrap.append(introPanel);

  const roi = topRelationshipsByValue(contacts);
  const roiPanel = el('div', { class: 'panel' }, [
    el('div', { class: 'panel__title' }, [icon('trending'), el('h3', { text: 'קשרים בעלי הערך הגבוה' }), el('span', { class: 'pill-count', text: String(roi.length) })]),
  ]);
  if (!roi.length) {
    roiPanel.append(el('div', { class: 'tab-empty' }, [icon('handshake'), el('div', { text: 'אין עדיין הפניות עם שווי שנתי.' })]));
  } else {
    roiPanel.append(el('div', { class: 'roi-list' }, roi.map((r, i) => roiRow(r, i, names))));
  }
  wrap.append(roiPanel);
  container.append(wrap);
}

function introResults(conns, target) {
  if (!target) return [el('div', { class: 'muted', style: 'padding:10px 2px', text: 'בחרו חברת יעד כדי לראות מי ברשת שלך מקושר אליה.' })];
  const co = conns.find((c) => c.name === target);
  if (!co) return [el('div', { class: 'muted', text: '—' })];
  return rankIntroLinks(co.links).map((lnk) => el('button', {
    class: 'intro-row', type: 'button', dataset: { action: 'open-contact', id: lnk.contact.id },
  }, [
    avatarEl(lnk.contact, 'avatar avatar--sm'),
    el('div', { class: 'intro-row__id' }, [
      el('span', { class: 'intro-row__name', text: lnk.contact.fullName || 'ללא שם' }),
      el('span', { class: 'intro-row__sub', text: lnk.contact.role || '—' }),
    ]),
    el('span', { class: `rel-chip rel-${lnk.relation}`, text: lnk.relation === 'current' ? 'עובד שם כעת' : 'עבר שם' }),
    statusPill(lnk.contact.status),
  ]));
}
function roiRow(r, i, names) {
  const company = names.get(r.contact.currentCompanyId) || '';
  return el('button', { class: 'roi-row', type: 'button', dataset: { action: 'open-contact', id: r.contact.id } }, [
    el('span', { class: 'roi-row__rank num', text: String(i + 1) }),
    avatarEl(r.contact, 'avatar avatar--sm'),
    el('div', { class: 'roi-row__id' }, [
      el('span', { class: 'roi-row__name', text: r.contact.fullName || 'ללא שם' }),
      el('span', { class: 'roi-row__sub', text: [r.contact.role, company].filter(Boolean).join(' · ') || '—' }),
    ]),
    el('div', { class: 'roi-row__val' }, [
      el('span', { class: 'roi-row__amount num', text: formatCompactCurrency(r.value) }),
      el('span', { class: 'roi-row__count', text: `${r.count} הפניות` }),
    ]),
  ]);
}

/* ============================================================
   Pipeline (לוח קנבן לפי שלבי משפך)
   ============================================================ */
export function renderPipeline(container, contacts, companies, state) {
  container.replaceChildren();
  const names = companyNameMap(companies);
  const groups = groupByStatus(contacts);

  const lanes = el('div', { class: 'board__lanes' });
  for (const s of LEAD_STATUSES) {
    const items = groups.get(s.key) || [];
    const total = items.reduce((sum, c) => sum + dealValue(c), 0);

    const cards = el('div', { class: 'lane__cards', dataset: { drop: s.key } });
    if (items.length) {
      items.forEach((c) => cards.append(pipelineCard(c, names, state)));
    } else {
      cards.append(el('div', { class: 'lane__empty', text: 'גררו לכאן כרטיס' }));
    }

    lanes.append(el('div', { class: 'lane', dataset: { stage: s.key, tier: String(s.tier) } }, [
      el('div', { class: 'lane__head' }, [
        el('span', { class: 'lane__dot' }),
        el('div', { class: 'lane__titles' }, [
          el('span', { class: 'lane__name', text: s.label }),
          el('span', { class: 'lane__sub' }, [
            el('span', { class: 'lane__count num', text: String(items.length) }),
            total ? el('span', { class: 'lane__value num', text: formatCompactCurrency(total) }) : null,
          ]),
        ]),
      ]),
      cards,
    ]));
  }
  container.append(lanes);
}

function pipelineCard(c, names, state) {
  const company = names.get(c.currentCompanyId) || '';
  const u = urgency(c);
  const val = dealValue(c);
  const ci = c.contactInfo || {};
  const channel = ci.linkedin ? 'linkedin' : ci.email ? 'mail' : ci.phone ? 'phone' : 'clock';
  const tags = (c.tags || []).slice(0, 2);

  return el('button', {
    class: 'pcard', type: 'button', draggable: 'true',
    dataset: { id: c.id, action: 'open-contact', tier: String(statusMeta(c.status).tier) },
    'aria-current': state.selectedContactId === c.id ? 'true' : 'false',
  }, [
    el('div', { class: 'pcard__head' }, [
      avatarEl(c, 'avatar avatar--sm'),
      el('div', { class: 'pcard__id' }, [
        el('span', { class: 'pcard__name', text: c.fullName || 'ללא שם' }),
        el('span', { class: 'pcard__role', text: [c.role, company].filter(Boolean).join(' · ') || '—' }),
      ]),
      u !== 'ok' ? el('span', { class: `prio prio--${u}` }, [
        el('span', { class: 'dot' }), u === 'overdue' ? 'פיגור' : 'למעקב',
      ]) : null,
    ]),
    (val || tags.length) ? el('div', { class: 'pcard__metarow' }, [
      val ? el('span', { class: 'pcard__value num' }, [icon('coins', 'pcard__coins'), formatCompactCurrency(val)]) : null,
      ...tags.map((t) => el('span', { class: 'tag', text: t })),
    ]) : null,
    el('div', { class: 'pcard__foot' }, [
      icon(channel, 'pcard__chan'),
      el('span', { class: 'pcard__time', text: timeAgo(c.lastContactDate) }),
    ]),
  ]);
}

/* ============================================================
   תצוגת פרטים (detail)
   ============================================================ */
const DETAIL_TABS = [
  { key: 'overview',  label: 'סקירה',   ic: 'info' },
  { key: 'career',    label: 'קריירה',  ic: 'briefcase' },
  { key: 'referrals', label: 'הפניות',  ic: 'handshake' },
  { key: 'notes',     label: 'הערות',   ic: 'notes' },
];

export function renderDetail(container, contact, companies, activeTab = 'overview') {
  container.replaceChildren();
  const [enriched] = withCompanyNames([contact], companies);
  const companyName = enriched.companyName;
  if (!DETAIL_TABS.some((t) => t.key === activeTab)) activeTab = 'overview';

  const detail = el('div', { class: 'detail' });

  // mobile back
  detail.append(el('button', { class: 'btn-back', type: 'button', dataset: { action: 'back' } }, [icon('back'), 'חזרה לרשימה']));

  // header
  detail.append(el('div', { class: 'detail__top' }, [
    avatarEl(contact, 'detail__avatar'),
    el('div', { class: 'detail__headings' }, [
      el('h1', { class: 'detail__name', text: contact.fullName || 'ללא שם' }),
      el('div', { class: 'detail__role', text: [contact.role, companyName].filter(Boolean).join(' · ') || '—' }),
      el('div', { class: 'card__meta', style: 'margin-top:10px' }, [
        statusPill(contact.status),
        contact.contactType ? el('span', { class: 'type-chip' }, [contactTypeLabel(contact.contactType)]) : null,
        isOverdue(contact) ? el('span', { class: 'badge-overdue' }, [icon('alert'), 'פיגור בקשר']) : null,
      ]),
    ]),
    el('div', { class: 'detail__actions' }, [
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { action: 'edit-contact', id: contact.id } }, [icon('edit'), 'עריכה']),
      el('button', { class: 'btn btn--danger btn--icon', type: 'button', title: 'מחיקה', 'aria-label': 'מחיקה', dataset: { action: 'delete-contact', id: contact.id } }, [icon('trash')]),
    ]),
  ]));

  // tab bar
  const counts = {
    career: contact.careerTimeline?.length || 0,
    referrals: contact.referrals?.length || 0,
    notes: contact.chronologicalNotes?.length || 0,
  };
  const tabs = el('div', { class: 'tabs', role: 'tablist' },
    DETAIL_TABS.map((t) => el('button', {
      class: 'tab', type: 'button', role: 'tab',
      'aria-selected': t.key === activeTab ? 'true' : 'false',
      dataset: { action: 'detail-tab', tab: t.key, id: contact.id },
    }, [
      icon(t.ic, 'ic'),
      t.label,
      counts[t.key] ? el('span', { class: 'tab-count', text: String(counts[t.key]) }) : null,
    ])));
  detail.append(el('div', { class: 'detail__tabs' }, tabs));

  // active tab panels
  const panels = el('div', { class: 'detail__panels', style: 'view-transition-name: detail' });
  if (activeTab === 'overview') {
    panels.append(buildFollowUpPanel(contact), buildInfoPanel(contact));
  } else if (activeTab === 'career') {
    panels.append(contact.careerTimeline?.length
      ? buildTimelinePanel(contact, companies)
      : tabEmpty('briefcase', 'אין עדיין מסלול קריירה. הוסיפו תפקידים דרך עריכת איש הקשר.'));
  } else if (activeTab === 'referrals') {
    panels.append(contact.referrals?.length
      ? buildReferralsPanel(contact)
      : tabEmpty('handshake', 'אין עדיין הפניות או עסקאות. הוסיפו דרך עריכת איש הקשר.'));
  } else {
    panels.append(buildNotesPanel(contact));
  }
  detail.append(panels);

  container.append(detail);
}

function tabEmpty(iconName, text) {
  return el('div', { class: 'panel' }, [
    el('div', { class: 'tab-empty' }, [icon(iconName), el('div', { text })]),
  ]);
}

function buildFollowUpPanel(contact) {
  const days = daysSinceContact(contact);
  const freq = contact.contactFrequencyDays;
  const ratio = followUpRatio(contact);
  const pct = Math.max(4, Math.min(100, ratio * 100));
  const cls = ratio >= 1 ? 'over' : ratio >= 0.75 ? 'warn' : 'ok';

  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__title' }, [icon('clock'), el('h3', { text: 'מעקב וקשר' })]),
    el('div', { class: 'followup' }, [
      el('div', { class: 'followup__stat' }, [
        el('span', { class: 'followup__num num', text: days == null ? '—' : String(days) }),
        el('span', { class: 'followup__label', text: 'ימים מאז קשר' }),
      ]),
      el('div', { class: 'followup__stat' }, [
        el('span', { class: 'followup__num num', text: String(freq) }),
        el('span', { class: 'followup__label', text: 'סף תדירות (ימים)' }),
      ]),
      el('div', { class: 'meter', title: `${Math.round(ratio * 100)}%` }, [
        el('div', { class: `meter__fill ${cls}`, style: `width:${pct}%` }),
      ]),
    ]),
    el('div', { class: 'kv', style: 'margin-top:14px' }, [
      el('dt', { text: 'קשר אחרון' }),
      el('dd', { class: 'num', text: formatDate(contact.lastContactDate) }),
    ]),
  ]);
}

function infoRow(dt, value, opts = {}) {
  if (!value) return null;
  const dd = el('dd', opts.ltr ? { class: 'ltr' } : {});
  if (opts.href) dd.append(el('a', { href: opts.href, class: opts.ltr ? 'ltr' : '', target: opts.external ? '_blank' : null, rel: opts.external ? 'noopener noreferrer' : null, text: value }));
  else dd.textContent = value;
  if (opts.num) dd.classList.add('num');
  return [el('dt', { text: dt }), dd];
}

function buildInfoPanel(contact) {
  const ci = contact.contactInfo || {};
  const kv = el('dl', { class: 'kv' });
  const rows = [
    infoRow('טלפון', ci.phone, { ltr: true, href: ci.phone ? `tel:${ci.phone}` : null }),
    infoRow('אימייל', ci.email, { ltr: true, href: ci.email ? `mailto:${ci.email}` : null }),
    infoRow('לינקדאין', ci.linkedin, { ltr: true, href: linkedinHref(ci.linkedin), external: true }),
    infoRow('מקור היכרות', contact.origin),
  ].filter(Boolean);
  rows.forEach((r) => kv.append(...r));

  const children = [
    el('div', { class: 'panel__title' }, [icon('info'), el('h3', { text: 'פרטי קשר' })]),
  ];
  if (rows.length) children.push(kv);
  else children.push(el('div', { class: 'muted', text: 'לא הוזנו פרטי קשר.' }));

  if (contact.tags?.length) {
    children.push(el('div', { class: 'card__meta', style: 'margin-top:14px' },
      contact.tags.map((t) => el('span', { class: 'tag', text: t }))));
  }
  return el('div', { class: 'panel' }, children);
}
function linkedinHref(v) {
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return 'https://' + v.replace(/^\/+/, '');
}

function buildTimelinePanel(contact, companies) {
  const names = new Map(companies.map((c) => [c.id, c.name]));
  // מיון כרונולוגי עולה: מהמוקדם למאוחר (לפי שנת התחלה, נפילה לשנת סיום).
  // תפקידים ללא שנה כלל — בסוף, בסדר שהוזנו.
  const yearOf = (e) => Number(e.startYear) || Number(e.endYear) || null;
  const items = contact.careerTimeline
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ay = yearOf(a.e), by = yearOf(b.e);
      if (ay == null && by == null) return a.i - b.i;
      if (ay == null) return 1;
      if (by == null) return -1;
      return ay - by || a.i - b.i;
    })
    .map((x) => x.e);
  const ul = el('ul', { class: 'timeline' });
  items.forEach((e) => {
    const name = e.companyName || names.get(e.companyId) || '—';
    const isCurrent = !e.endYear && (e.companyId === contact.currentCompanyId || !!e.companyName);
    const years = [e.startYear, e.endYear || (e.startYear ? 'היום' : '')].filter((x) => x !== null && x !== '').join('–');
    ul.append(el('li', { class: isCurrent ? 'current' : '' }, [
      el('div', { class: 'tl-role', text: e.role || '—' }),
      el('div', { class: 'tl-company', text: name }),
      years ? el('div', { class: 'tl-years num', text: years }) : null,
    ]));
  });
  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__title' }, [icon('briefcase'), el('h3', { text: 'מסלול קריירה' }),
      el('span', { class: 'pill-count', text: String(items.length) })]),
    ul,
  ]);
}

function buildReferralsPanel(contact) {
  const table = el('table', { class: 'deals' }, [
    el('thead', {}, el('tr', {}, [
      el('th', { text: 'עסקה / הפניה' }),
      el('th', { text: 'סטטוס' }),
      el('th', { text: 'שווי שנתי', style: 'text-align:start' }),
    ])),
  ]);
  const tbody = el('tbody');
  contact.referrals.forEach((r) => {
    tbody.append(el('tr', {}, [
      el('td', { text: r.dealName || '—' }),
      el('td', { text: r.status || '—' }),
      el('td', { class: 'amount num', text: formatCurrency(r.estimatedValue) }),
    ]));
  });
  table.append(tbody);
  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__title' }, [icon('handshake'), el('h3', { text: 'הפניות ועסקאות' }),
      el('span', { class: 'pill-count', text: String(contact.referrals.length) })]),
    el('div', { class: 'table-wrap' }, table),
  ]);
}

function buildNotesPanel(contact) {
  const notes = [...(contact.chronologicalNotes || [])].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const list = el('div', { class: 'notes' });
  if (notes.length) {
    notes.forEach((n) => list.append(el('div', { class: 'note' }, [
      el('div', { class: 'note__time', text: formatDateTime(n.timestamp) }),
      el('div', { class: 'note__text', text: n.noteText }),
    ])));
  } else {
    list.append(el('div', { class: 'muted', text: 'אין עדיין הערות. הוסיפו תיעוד אינטראקציה למטה.' }));
  }

  const addBox = el('div', { class: 'note-add' }, [
    el('textarea', { class: 'input', rows: '1', placeholder: 'תיעוד שיחה / פגישה / עדכון…', dataset: { role: 'note-input' } }),
    el('button', { class: 'btn btn--primary', type: 'button', dataset: { action: 'add-note', id: contact.id } }, [icon('plus'), 'הוסף']),
  ]);

  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__title' }, [icon('notes'), el('h3', { text: 'הערות כרונולוגיות' }),
      el('span', { class: 'pill-count', text: String(notes.length) })]),
    list,
    addBox,
  ]);
}

/* ---------- empty detail state ---------- */
export function renderDetailEmpty(container) {
  container.replaceChildren(el('div', { class: 'empty' }, [
    el('div', { class: 'empty__icon', html: ICONS.scale }),
    el('h2', { text: 'פיתוח עסקי, מאורגן.' }),
    el('p', { text: 'בחרו איש קשר מהרשימה כדי לראות את כל הפרטים, מסלול הקריירה, ההפניות והמעקב — או הוסיפו פוטנציאלי חדש.' }),
    el('button', { class: 'btn btn--primary', type: 'button', dataset: { action: 'new-contact' } }, [icon('plus'), 'איש קשר חדש']),
  ]));
}

/* ============================================================
   טפסים
   ============================================================ */

/** טופס איש קשר (הוספה/עריכה). מחזיר אלמנט <form>. */
export function renderContactForm(contact, companies) {
  const c = contact || {};
  const ci = c.contactInfo || {};
  const isEdit = !!c.id;

  const form = el('form', { class: 'contact-form', id: 'contact-form', novalidate: 'true' });

  // basics
  form.append(field('שם מלא', input({ name: 'fullName', value: c.fullName, required: true, placeholder: 'שם פרטי ומשפחה' })));
  form.append(photoField(c.photoUrl, c.fullName));
  form.append(el('div', { class: 'field--row' }, [
    field('סוג איש קשר', contactTypeSelect(c.contactType)),
    field('שלב במשפך', statusSelect(c.status)),
  ]));
  form.append(field('תפקיד', input({ name: 'role', value: c.role, placeholder: 'למשל: סמנכ"ל כספים / שותף / מתווך' })));

  // company select + new (אופציונלי — לא חובה לאיש קשר שאינו עובד בחברה)
  form.append(field('חברה (אופציונלי)', companySelect(companies, c.currentCompanyId)));
  form.append(field('או הוספת חברה חדשה', input({ name: 'newCompanyName', placeholder: 'שם חברה חדשה (תיווצר אוטומטית)' })));

  // contact info
  form.append(sectionLabel('פרטי קשר'));
  form.append(el('div', { class: 'field--row' }, [
    field('טלפון', input({ name: 'phone', value: ci.phone, type: 'tel', dir: 'ltr', placeholder: '050-0000000' })),
    field('אימייל', input({ name: 'email', value: ci.email, type: 'email', dir: 'ltr', placeholder: 'name@company.com' })),
  ]));
  form.append(field('לינקדאין', input({ name: 'linkedin', value: ci.linkedin, dir: 'ltr', placeholder: 'linkedin.com/in/…' })));
  form.append(field('מקור היכרות', input({ name: 'origin', value: c.origin, placeholder: 'איך נוצרה ההיכרות?' })));
  form.append(field('תגיות (מופרדות בפסיק)', input({ name: 'tags', value: (c.tags || []).join(', '), placeholder: 'M&A, השקעות, היי-טק' })));

  // follow-up
  form.append(sectionLabel('מעקב'));
  form.append(el('div', { class: 'field--row' }, [
    field('תאריך קשר אחרון', input({ name: 'lastContactDate', value: c.lastContactDate, type: 'date' })),
    field('תדירות קשר (ימים)', input({ name: 'contactFrequencyDays', value: c.contactFrequencyDays ?? 90, type: 'number', min: '1', class: 'input num' })),
  ]));

  // career timeline
  form.append(sectionLabel('מסלול קריירה'));
  const careerWrap = el('div', { class: 'subform', dataset: { sub: 'career' } });
  (c.careerTimeline || []).forEach((e) => careerWrap.append(careerRow(e)));
  form.append(careerWrap);
  form.append(addRowBtn('הוסף תפקיד', 'career'));

  // referrals
  form.append(sectionLabel('הפניות ועסקאות'));
  const refWrap = el('div', { class: 'subform', dataset: { sub: 'referral' } });
  (c.referrals || []).forEach((r) => refWrap.append(referralRow(r)));
  form.append(refWrap);
  form.append(addRowBtn('הוסף הפניה', 'referral'));

  // local delegation for add/remove rows
  form.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-row]');
    if (add) {
      e.preventDefault();
      const kind = add.dataset.addRow;
      const wrap = form.querySelector(`.subform[data-sub="${kind}"]`);
      wrap.append(kind === 'career' ? careerRow() : referralRow());
      wrap.lastElementChild.querySelector('input,select')?.focus();
      return;
    }
    const del = e.target.closest('.subrow__del');
    if (del) { e.preventDefault(); del.closest('.subrow').remove(); }
  });

  // hidden id
  if (isEdit) form.append(el('input', { type: 'hidden', name: 'id', value: c.id }));

  return form;
}

/** מנהל חברות: רשימת חברות קיימות (עם מחיקה) + טופס הוספה. מחזיר <form>. */
export function renderCompanyManager(companies, contacts) {
  const form = el('form', { class: 'company-form', id: 'company-form', novalidate: 'true' });
  form.append(sectionLabel('החברות שלי'));
  form.append(companyList(companies, contacts));
  form.append(sectionLabel('הוספת חברה חדשה'));
  form.append(field('שם החברה', input({ name: 'name', placeholder: 'שם החברה' })));
  form.append(el('div', { class: 'field--row' }, [
    field('סקטור', input({ name: 'sector', placeholder: 'היי-טק / נדל"ן / פיננסים' })),
    field('אתר', input({ name: 'website', dir: 'ltr', placeholder: 'example.com' })),
  ]));
  form.append(field('משקיעים (מופרדים בפסיק)', input({ name: 'investors', placeholder: 'קרן א, קרן ב' })));
  return form;
}

/** רשימת חברות עם כפתור מחיקה לכל אחת (מציג גם כמה אנשי קשר משויכים). */
export function companyList(companies, contacts) {
  const wrap = el('div', { class: 'company-list' });
  if (!companies.length) {
    wrap.append(el('div', { class: 'muted', style: 'padding:8px 2px', text: 'אין עדיין חברות.' }));
    return wrap;
  }
  companies.forEach((c) => {
    const count = (contacts || []).filter((x) => x.currentCompanyId === c.id).length;
    wrap.append(el('div', { class: 'company-row' }, [
      el('div', { class: 'company-row__info' }, [
        el('span', { class: 'company-row__name', text: c.name || '—' }),
        el('span', { class: 'company-row__meta', text: [c.sector, count ? `${count} אנשי קשר` : ''].filter(Boolean).join(' · ') || '—' }),
      ]),
      el('button', {
        class: 'subrow__del', type: 'button', title: 'מחיקת חברה', 'aria-label': 'מחיקת חברה',
        dataset: { action: 'delete-company', id: c.id }, html: ICONS.trash,
      }),
    ]));
  });
  return wrap;
}

/** טופס חברה. מחזיר <form>. */
export function renderCompanyForm(company) {
  const c = company || {};
  const form = el('form', { class: 'company-form', id: 'company-form', novalidate: 'true' });
  form.append(field('שם החברה', input({ name: 'name', value: c.name, required: true, placeholder: 'שם החברה' })));
  form.append(el('div', { class: 'field--row' }, [
    field('סקטור', input({ name: 'sector', value: c.sector, placeholder: 'היי-טק / נדל"ן / פיננסים' })),
    field('אתר', input({ name: 'website', value: c.website, dir: 'ltr', placeholder: 'example.com' })),
  ]));
  form.append(field('משקיעים (מופרדים בפסיק)', input({ name: 'investors', value: (c.investors || []).join(', '), placeholder: 'קרן א, קרן ב' })));
  if (c.id) form.append(el('input', { type: 'hidden', name: 'id', value: c.id }));
  return form;
}

/* ---------- form serialization ---------- */
export function readContactForm(form) {
  const get = (n) => form.elements[n]?.value.trim() ?? '';
  const careerTimeline = [...form.querySelectorAll('.subrow--career')].map((row) => ({
    companyName: row.querySelector('[name="c_company"]').value.trim(),
    role: row.querySelector('[name="c_role"]').value.trim(),
    startYear: row.querySelector('[name="c_start"]').value.trim(),
    endYear: row.querySelector('[name="c_end"]').value.trim(),
  })).filter((e) => e.companyName || e.role);
  const referrals = [...form.querySelectorAll('.subrow--referral')].map((row) => ({
    dealName: row.querySelector('[name="r_name"]').value.trim(),
    status: row.querySelector('[name="r_status"]').value.trim(),
    estimatedValue: row.querySelector('[name="r_value"]').value.trim(),
  })).filter((r) => r.dealName);

  return {
    data: {
      id: get('id') || undefined,
      fullName: get('fullName'),
      role: get('role'),
      contactType: get('contactType'),
      status: get('status'),
      currentCompanyId: get('currentCompanyId'),
      origin: get('origin'),
      photoUrl: get('photoUrl'),
      contactInfo: { phone: get('phone'), email: get('email'), linkedin: get('linkedin') },
      tags: get('tags').split(',').map((t) => t.trim()).filter(Boolean),
      lastContactDate: get('lastContactDate'),
      contactFrequencyDays: get('contactFrequencyDays'),
      careerTimeline,
      referrals,
    },
    newCompanyName: get('newCompanyName'),
  };
}

export function readCompanyForm(form) {
  const get = (n) => form.elements[n]?.value.trim() ?? '';
  return {
    id: get('id') || undefined,
    name: get('name'),
    sector: get('sector'),
    website: get('website'),
    investors: get('investors').split(',').map((t) => t.trim()).filter(Boolean),
  };
}

/* ---------- small form builders ---------- */
function field(label, control) {
  return el('div', { class: 'field' }, [el('label', { text: label }), control]);
}

/** שדה תמונת פרופיל — העלאת קובץ (נשמר מקומית) או הדבקת URL, עם תצוגה מקדימה */
function photoField(photoUrl, fullName) {
  const preview = el('span', { class: 'photo-preview', 'aria-hidden': 'true' });
  const setPreview = (url) => {
    if (url) { preview.classList.add('has-photo'); preview.style.backgroundImage = `url("${url}")`; preview.textContent = ''; }
    else { preview.classList.remove('has-photo'); preview.style.backgroundImage = ''; preview.textContent = initials(fullName); }
  };
  setPreview(photoUrl);

  const urlInput = input({ name: 'photoUrl', value: photoUrl, dir: 'ltr', placeholder: 'הדביקו קישור לתמונה — או העלו קובץ' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'photo-file' });
  const uploadBtn = el('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, [icon('camera'), 'העלאת תמונה']);

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try { const data = await downscaleImage(f, 256); urlInput.value = data; setPreview(data); }
    catch { toast('טעינת התמונה נכשלה', 'alert'); }
  });
  urlInput.addEventListener('input', () => setPreview(urlInput.value.trim()));

  return el('div', { class: 'field' }, [
    el('label', { text: 'תמונת פרופיל' }),
    el('div', { class: 'photo-row' }, [
      preview,
      el('div', { class: 'photo-controls' }, [urlInput, uploadBtn, fileInput]),
    ]),
  ]);
}

/** מקטין תמונה לריבוע ~max px ומחזיר dataURL (JPEG) — לאחסון מקומי קומפקטי */
function downscaleImage(file, max) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function input(opts = {}) {
  const props = { class: opts.class || 'input', name: opts.name };
  if (opts.type) props.type = opts.type;
  if (opts.value != null && opts.value !== '') props.value = opts.value;
  if (opts.placeholder) props.placeholder = opts.placeholder;
  if (opts.required) props.required = 'required';
  if (opts.dir) props.dir = opts.dir;
  if (opts.min) props.min = opts.min;
  return el('input', props);
}
function statusSelect(value) {
  const sel = el('select', { class: 'select', name: 'status' });
  LEAD_STATUSES.forEach((s) => {
    const o = el('option', { value: s.key, text: s.label });
    if (s.key === (value || 'cold')) o.selected = true;
    sel.append(o);
  });
  return sel;
}
function contactTypeSelect(value) {
  const sel = el('select', { class: 'select', name: 'contactType' });
  CONTACT_TYPES.forEach((t) => {
    const o = el('option', { value: t.key, text: t.label });
    if (t.key === (value || '')) o.selected = true;
    sel.append(o);
  });
  return sel;
}
function companySelect(companies, value) {
  const sel = el('select', { class: 'select', name: 'currentCompanyId' });
  sel.append(el('option', { value: '', text: '— ללא / בחרו חברה —' }));
  companies.forEach((c) => {
    const o = el('option', { value: c.id, text: c.name });
    if (c.id === value) o.selected = true;
    sel.append(o);
  });
  return sel;
}
function sectionLabel(text) { return el('div', { class: 'section-label', text }); }
function addRowBtn(text, kind) {
  return el('button', { class: 'btn-add-row', type: 'button', dataset: { addRow: kind } }, [icon('plus'), text]);
}
function careerRow(e = {}) {
  return el('div', { class: 'subrow subrow--career' }, [
    input({ name: 'c_company', value: e.companyName, placeholder: 'חברה' }),
    input({ name: 'c_role', value: e.role, placeholder: 'תפקיד' }),
    input({ name: 'c_start', value: e.startYear, type: 'number', placeholder: 'משנה', class: 'input num' }),
    input({ name: 'c_end', value: e.endYear, type: 'number', placeholder: 'עד', class: 'input num' }),
    el('button', { class: 'subrow__del', type: 'button', 'aria-label': 'הסר', title: 'הסר', html: ICONS.trash }),
  ]);
}
function referralRow(r = {}) {
  return el('div', { class: 'subrow subrow--referral' }, [
    input({ name: 'r_name', value: r.dealName, placeholder: 'שם עסקה / הפניה' }),
    input({ name: 'r_status', value: r.status, placeholder: 'סטטוס' }),
    input({ name: 'r_value', value: r.estimatedValue, type: 'number', placeholder: 'שווי שנתי ₪', class: 'input num' }),
    el('button', { class: 'subrow__del', type: 'button', 'aria-label': 'הסר', title: 'הסר', html: ICONS.trash }),
  ]);
}

/* ---------- sync menu (popover) ---------- */
export function syncMenu({ signedIn, lastSync }) {
  const items = [];
  if (signedIn) {
    items.push(menuItem('cloudUp', 'גבה עכשיו', 'backup'));
    items.push(menuItem('cloudDown', 'שחזר מהדרייב', 'restore'));
    items.push(el('div', { class: 'sync-menu__sep' }));
    items.push(menuItem('logout', 'התנתק', 'signout', true));
  } else {
    items.push(menuItem('cloud', 'התחבר ל-Google Drive', 'signin'));
  }
  const foot = lastSync
    ? el('div', { class: 'sync-menu__foot', text: 'סונכרן: ' + new Date(lastSync).toLocaleString('he-IL') })
    : el('div', { class: 'sync-menu__foot muted', text: 'גיבוי וסנכרון בין מכשירים' });
  return el('div', { class: 'sync-menu', role: 'menu' }, [...items, foot]);
}
function menuItem(ic, label, action, danger) {
  return el('button', {
    class: 'sync-menu__item' + (danger ? ' sync-menu__item--danger' : ''),
    type: 'button', role: 'menuitem', dataset: { syncAction: action },
  }, [icon(ic), label]);
}

/* ---------- toast ---------- */
export function toast(message, iconName = 'check') {
  const t = el('div', { class: 'toast' }, [icon(iconName), message]);
  document.body.append(t);
  setTimeout(() => { t.classList.add('gone'); setTimeout(() => t.remove(), 300); }, 2400);
}
