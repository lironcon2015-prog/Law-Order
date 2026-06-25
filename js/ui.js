// ui.js — רינדור DOM. כל קלט משתמש מוזרק כ-textContent/value (מניעת XSS).
// אייקונים הם SVG סטטי (ללא קלט משתמש) ולכן מותר innerHTML עבורם בלבד.

import {
  LEAD_STATUSES, statusMeta, withCompanyNames,
  isOverdue, daysSinceContact, followUpRatio,
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

/* ---------- formatting ---------- */
const ILS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
export function formatCurrency(v) {
  if (v == null || v === '') return '—';
  return ILS.format(v).replace('ILS', '₪').trim();
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
        el('span', { class: 'avatar', 'aria-hidden': 'true', dataset: { tier: String(statusMeta(c.status).tier) }, text: initials(c.fullName) }),
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
  const tier = statusMeta(contact.status).tier;
  if (!DETAIL_TABS.some((t) => t.key === activeTab)) activeTab = 'overview';

  const detail = el('div', { class: 'detail' });

  // mobile back
  detail.append(el('button', { class: 'btn-back', type: 'button', dataset: { action: 'back' } }, [icon('back'), 'חזרה לרשימה']));

  // header
  detail.append(el('div', { class: 'detail__top' }, [
    el('span', { class: 'detail__avatar', 'aria-hidden': 'true', dataset: { tier: String(tier) }, text: initials(contact.fullName) }),
    el('div', { class: 'detail__headings' }, [
      el('h1', { class: 'detail__name', text: contact.fullName || 'ללא שם' }),
      el('div', { class: 'detail__role', text: [contact.role, companyName].filter(Boolean).join(' · ') || '—' }),
      el('div', { class: 'card__meta', style: 'margin-top:10px' }, [
        statusPill(contact.status),
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
  const items = [...contact.careerTimeline].sort((a, b) => (b.startYear || 0) - (a.startYear || 0));
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
      el('th', { text: 'שווי מוערך', style: 'text-align:start' }),
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
  form.append(el('div', { class: 'field--row' }, [
    field('תפקיד', input({ name: 'role', value: c.role, placeholder: 'למשל: סמנכ"ל כספים' })),
    field('שלב במשפך', statusSelect(c.status)),
  ]));

  // company select + new
  form.append(field('חברה נוכחית', companySelect(companies, c.currentCompanyId)));
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
      status: get('status'),
      currentCompanyId: get('currentCompanyId'),
      origin: get('origin'),
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
    input({ name: 'r_value', value: r.estimatedValue, type: 'number', placeholder: 'שווי ₪', class: 'input num' }),
    el('button', { class: 'subrow__del', type: 'button', 'aria-label': 'הסר', title: 'הסר', html: ICONS.trash }),
  ]);
}

/* ---------- toast ---------- */
export function toast(message, iconName = 'check') {
  const t = el('div', { class: 'toast' }, [icon(iconName), message]);
  document.body.append(t);
  setTimeout(() => { t.classList.add('gone'); setTimeout(() => t.remove(), 300); }, 2400);
}
