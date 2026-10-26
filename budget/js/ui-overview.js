// ui-overview.js — סרגל הצד, רשימת התיק (בתצוגה המפוצלת) ומסך תיק העסקאות.
// במסך רחב העסקאות מוצגות ברשימת התיק שליד העסקה ולא בסרגל — אחרת אותה רשימה הייתה מופיעה
// פעמיים זו לצד זו. במסך צר (ובמובייל, במגירה) הסרגל ממשיך להציג אותן.

import { computePortfolio, isOpenDeal, DEAL_STATUSES, progressByPeriod, round2 } from './model.js';
import { ring, sparkline } from './charts.js';
import {
  el, icon, ICONS, measure, fmtU, pctText, toneOf, meterCell, unitSwitch, seg, button, iconButton, emptyState,
  limitItems, valueNodes, card, table, dealRing, dealSubline, tile, monthLabel,
} from './ui-kit.js';

/* ============================================================
   מיון עסקאות — טבלת התיק ורשימת התיק חולקות את אותו מצב
   ============================================================ */

/** התראות שמוצגות בתיק — רק חריגה וסיכון (התראות "לתשומת לב" נשארות בעסקה עצמה) */
const urgent = (snap, unit) => (snap.alerts[unit] || []).filter((a) => a.level === 'over' || a.level === 'risk');
const eacOf = (s, unit) => (unit === 'money' ? s.eac : s.eacHours);
// ניצול "אינסופי" (ביצוע בלי תקציב) נחשב גבוה מכל אחוז — בלי NaN במיון
const finite = (v) => (Number.isFinite(v) ? v : (v > 0 ? 1e12 : -1e12));

const DEAL_SORT = {
  name: (s) => s.deal.name,
  util: (s, unit) => finite(measure(s, unit).util),
  actual: (s, unit) => measure(s, unit).actual,
  remaining: (s, unit) => measure(s, unit).remaining,
  eac: (s, unit) => finite(eacOf(s, unit) ?? -Infinity),
  alerts: (s, unit) => urgent(s, unit).length,
};
/** כיוון ברירת המחדל בלחיצה ראשונה על עמודה: שם — א-ב; יתרה — החריגה הגדולה ראשונה; השאר — מהגבוה */
export const DEAL_SORT_DIR = { name: 'asc', remaining: 'asc' };

export function sortDeals(list, sort, unit) {
  const f = sort && DEAL_SORT[sort.key];
  if (!f) return list;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = f(a, unit);
    const y = f(b, unit);
    return (typeof x === 'string' ? x.localeCompare(y, 'he') : x - y) * dir;
  });
}

/* ============================================================
   סרגל צד — פתוח, או "פס אייקונים" (rail) עם טולטיפ לכל פריט
   ============================================================ */

/** ערכות הצבע — מזהה = data-theme על <html> */
export const THEMES = [
  { id: 'sapphire', label: 'ספיר וזהב' },
  { id: 'midnight', label: 'Midnight Luxe' },
  { id: 'charcoal', label: 'פחם ושמפניה' },
];

export function renderSidebar(root, { deals, snapshots, view, activeId, unit, theme, rail = false }) {
  const tip = (label) => (rail ? { tip: label } : {});
  const link = (action, iconName, label, active = false, extra = {}) => el('button', {
    class: `side__link${active ? ' is-active' : ''}`, type: 'button', dataset: { action, ...extra, ...tip(label) },
    'aria-current': active ? 'page' : null, 'aria-label': rail ? label : null,
  }, [icon(iconName), el('span', { class: 'side__text', text: label })]);

  // עסקה שנסגרה מוצגת בסרגל רק כשהיא פתוחה עכשיו על המסך — כדי שתמיד יהיה ברור איפה אתה
  const open = deals.filter((d) => isOpenDeal(d) || d.id === activeId);
  const list = el('div', { class: 'side__deals', role: 'list', 'aria-label': 'עסקאות פתוחות' });
  for (const deal of open) {
    const snap = snapshots.get(deal.id);
    const m = snap ? measure(snap, unit) : null;
    const pct = m && m.budget > 0 ? pctText(m.util) : '';
    list.append(el('button', {
      class: `side__deal${deal.id === activeId ? ' is-active' : ''}`, type: 'button', role: 'listitem',
      dataset: { action: 'select-deal', id: deal.id, dealRow: '1', ...tip(`${deal.name}${pct ? ` · ${pct}` : ''}`) },
      draggable: 'true', 'aria-label': rail ? deal.name : null,
      title: rail ? null : `${deal.name}${deal.client ? ` · ${deal.client}` : ''} — גרירה או Alt+↑/↓ לשינוי הסדר`,
      'aria-current': deal.id === activeId ? 'page' : null,
    }, [
      m ? dealRing(m.budget > 0 ? m.util : NaN, m.status, { size: 24, withPct: false }) : el('span'),
      el('span', { class: 'side__deal-name', text: deal.name }),
      pct ? el('span', { class: `side__deal-val num ${m ? toneOf(m.status) : ''}`.trim(), text: pct }) : null,
    ]));
  }
  if (!open.length) list.append(el('p', { class: 'side__empty', text: deals.length ? 'אין עסקאות פתוחות' : 'עוד אין עסקאות' }));

  root.replaceChildren(
    el('div', { class: 'side__brand' }, [
      el('span', { class: 'side__logo', html: ICONS.wallet, 'aria-hidden': 'true' }),
      el('div', { class: 'side__brandtext' }, [el('div', { class: 'side__name', text: 'LexBudget' }), el('span', { class: 'side__tag', text: 'תקציב עסקאות' })]),
      el('button', {
        class: 'side__rail', type: 'button', html: ICONS.sidebar, 'aria-pressed': String(rail),
        'aria-label': rail ? 'הרחבת הסרגל' : 'כיווץ הסרגל לאייקונים',
        dataset: { action: 'toggle-rail', tip: rail ? 'הרחבת הסרגל' : 'כיווץ הסרגל לאייקונים' },
      }),
    ]),
    link('go-overview', 'briefcase', 'תיק העסקאות', view === 'overview'),
    // רשימת העסקאות — במסך רחב היא עוברת לרשימת התיק שליד העסקה (ראה styles.css)
    el('div', { class: 'side__dealsblock' }, [
      el('div', { class: 'side__label' }, [el('span', { class: 'side__text', text: 'עסקאות פתוחות' }), el('span', { class: 'count', text: String(open.length) })]),
      list,
    ]),
    link('new-deal', 'plus', 'עסקה חדשה', false),
    el('div', { class: 'side__foot' }, [
      link('go-people', 'users', 'אנשי צוות', view === 'people'),
      link('go-rates', 'coins', 'תעריפונים', view === 'rates'),
      link('backup', 'database', 'גיבוי ושחזור'),
      el('div', { class: 'side__meta' }, [
        el('div', { class: 'side__themes', role: 'group', 'aria-label': 'ערכת צבעים' }, THEMES.map((t) => el('button', {
          class: `side__swatch side__swatch--${t.id}`, type: 'button', 'aria-label': t.label, 'aria-pressed': String(t.id === theme),
          dataset: { action: 'set-theme', themeId: t.id, ...tip(t.label) },
        }))),
        el('span', { class: 'save-state', id: 'save-state', 'aria-live': 'polite', text: 'נשמר' }),
      ]),
    ]),
  );
}

/* ============================================================
   רשימת התיק — בתוך עסקה, במסך רחב: נשארת קבועה ליד העסקה למעבר מהיר
   ============================================================ */

export function renderDealList(root, { snapshots, scope = 'open', unit = 'hours', activeId = null, sort = null, query = '' }) {
  const all = [...snapshots.values()];
  const list = sortDeals(scope === 'all' ? all : all.filter((s) => isOpenDeal(s.deal) || s.deal.id === activeId), sort, unit);
  const q = query.trim().toLowerCase();
  let shown = 0;
  const items = list.map((s) => {
    const m = measure(s, unit);
    const al = urgent(s, unit);
    const worst = al.some((a) => a.level === 'over') ? 'over' : al.length ? 'risk' : '';
    const active = s.deal.id === activeId;
    const status = DEAL_STATUSES.find((x) => x.id === s.deal.status);
    const hay = `${s.deal.name} ${s.deal.client} ${s.deal.code}`.toLowerCase();
    const hide = !!q && !hay.includes(q);
    if (!hide) shown += 1;
    return el('button', {
      class: `ditem${active ? ' is-active' : ''}`, type: 'button', role: 'listitem', hidden: hide ? '' : null,
      // גרירה רק בסדר הידני — במיון לפי עמודה הסדר נקבע מהנתונים
      draggable: sort ? null : 'true',
      dataset: { action: 'select-deal', id: s.deal.id, dealRow: '1', search: hay },
      'aria-current': active ? 'page' : null,
      title: sort ? null : 'גרירה או Alt+↑/↓ לשינוי הסדר',
    }, [
      dealRing(m.budget > 0 ? m.util : NaN, m.status, { size: 44 }),
      el('span', { class: 'ditem__body' }, [
        el('span', { class: 'ditem__top' }, [
          el('span', { class: 'ditem__name', text: s.deal.name }),
          worst ? el('span', { class: `flag flag--${worst}`, dataset: { tip: al.map((a) => a.text).join(' · ') } }, [icon('alert'), el('span', { class: 'num', text: String(al.length) })]) : null,
        ]),
        el('span', { class: 'ditem__sub', title: s.deal.client || null, text: dealSubline(s.deal, isOpenDeal(s.deal) ? '' : status?.label) }),
        m.budget > 0 ? null : el('span', { class: 'ditem__none', text: 'אין תקציב' }),
      ]),
    ]);
  });

  root.replaceChildren(
    el('div', { class: 'dlist__head' }, [
      el('div', { class: 'dlist__top' }, [
        el('h2', { class: 'dlist__title' }, ['תיק העסקאות', el('span', { class: 'count', text: String(list.length) })]),
        el('div', { class: 'dlist__tools' }, [
          iconButton('plus', { action: 'new-deal', title: 'עסקה חדשה', cls: 'iconbtn--sm', dataset: { tip: 'עסקה חדשה' } }),
          iconButton('expand', { action: 'go-overview', title: 'פתיחת התיק המלא', cls: 'iconbtn--sm', dataset: { tip: 'פתיחת התיק המלא' } }),
        ]),
      ]),
      el('label', { class: 'search search--sm' }, [
        icon('search'),
        el('input', { class: 'input', type: 'search', value: query, placeholder: 'חיפוש עסקה או לקוח', 'aria-label': 'חיפוש בתיק', dataset: { dealQuery: '1' } }),
      ]),
      seg([['open', 'פתוחות', 'פעילות ובהמתנה'], ['all', 'הכל', 'כולל שנסגרו ובארכיון']], scope, 'set-scope', 'scope', { cls: 'seg--sm', label: 'אילו עסקאות להציג' }),
    ]),
    el('div', { class: 'dlist__items', role: 'list' }, items),
    el('p', { class: 'dlist__empty', hidden: shown ? '' : null, dataset: { dlEmpty: '1' }, text: list.length ? 'לא נמצאו עסקאות' : 'אין עסקאות' }),
  );
}

/** סינון רשימת התיק בזמן הקלדה — בלי רינדור, כדי שהפוקוס יישאר בשדה החיפוש */
export function filterDealList(query) {
  const q = String(query || '').trim().toLowerCase();
  let shown = 0;
  for (const item of document.querySelectorAll('.ditem')) {
    item.hidden = !!q && !item.dataset.search.includes(q);
    if (!item.hidden) shown += 1;
  }
  const empty = document.querySelector('[data-dl-empty]');
  if (empty) empty.hidden = shown > 0;
}

/* ============================================================
   תיק העסקאות
   ============================================================ */

/** שריפה מצטברת של כל העסקאות יחד, לפי חודש */
function portfolioSeries(list, unit) {
  const byMonth = new Map();
  for (const s of list) {
    for (const r of progressByPeriod(s, 'month')) byMonth.set(r.key, (byMonth.get(r.key) || 0) + (unit === 'money' ? r.cost : r.hours));
  }
  let acc = 0;
  return [...byMonth.keys()].sort().map((k) => ({ key: k, value: round2(acc += byMonth.get(k)) }));
}

/** טקסט הריחוף לנקודה בקו מגמה: חודש · מצטבר · אחוז מהתקציב */
const trendTip = (unit, deal, budget) => (key, value) => [
  monthLabel(key),
  `${fmtU(value, unit, deal)}${unit === 'money' ? '' : ' שעות'}`,
  budget > 0 ? `${pctText(value / budget)} מהתקציב` : '',
].filter(Boolean).join(' · ');

export function renderOverview(root, { snapshots, scope = 'open', unit = 'hours', sort = null }) {
  root.replaceChildren();
  const all = [...snapshots.values()];
  const page = el('div', { class: 'page' });
  root.append(page);

  if (!all.length) {
    page.append(el('header', { class: 'phead' }, [el('div', { class: 'phead__main' }, [el('h1', { class: 'phead__title', text: 'תיק העסקאות' })])]));
    page.append(el('section', { class: 'card' }, [emptyState('עוד אין עסקאות',
      'עסקה ראשונה: בונים תקציב לפי צוותים ודרגות, מייבאים דוחות שעות, ועוקבים אחרי העמידה בתקציב בזמן אמת.',
      [button('עסקה חדשה', { action: 'new-deal', iconName: 'plus', kind: 'primary', size: '' })])]));
    return;
  }

  // עסקה שנסגרה או בארכיון אינה "פתוחה" — היא יוצאת מהטבלה, מהמדדים ומההתראות,
  // כדי שהמספרים יתארו את מה שרואים על המסך.
  const list = scope === 'all' ? all : all.filter((s) => isOpenDeal(s.deal));
  const hidden = all.length - list.length;
  const p = computePortfolio(list);
  const counts = p.byUnit[unit];
  const pm = unit === 'money'
    ? { budget: p.budgetCost, actual: p.actualCost, remaining: p.remainingCost, util: p.costUtil }
    : { budget: p.budgetHours, actual: p.actualHours, remaining: p.remainingHours, util: p.util };
  const pStatus = pm.util > 1 ? 'over' : pm.util >= 0.9 ? 'risk' : 'ok';

  const subParts = [`${list.length} עסקאות${scope === 'all' ? '' : ' פתוחות'}`];
  if (counts.over) subParts.push(`${counts.over} בחריגה`);
  if (counts.risk) subParts.push(`${counts.risk} בסיכון`);
  if (hidden) subParts.push(`${hidden} סגורות מוסתרות`);

  page.append(el('header', { class: 'phead' }, [
    el('div', { class: 'phead__main' }, [
      el('h1', { class: 'phead__title', text: 'תיק העסקאות' }),
      el('p', { class: 'phead__sub', text: subParts.join(' · ') }),
    ]),
    el('div', { class: 'phead__actions' }, [
      unitSwitch(unit),
      seg([['open', 'פתוחות', 'פעילות ובהמתנה'], ['all', 'הכל', 'כולל שנסגרו ובארכיון']], scope, 'set-scope', 'scope', { label: 'אילו עסקאות להציג' }),
      button('ייצוא', { action: 'export-portfolio', iconName: 'download', title: 'ייצוא התיק לאקסל' }),
      button('עסקה חדשה', { action: 'new-deal', iconName: 'plus', kind: 'primary' }),
    ]),
  ]));

  if (!list.length) {
    page.append(el('section', { class: 'card' }, [emptyState('אין עסקאות פתוחות',
      `כל ${all.length} העסקאות סגורות או בארכיון. "הכל" יציג גם אותן.`)]));
    return;
  }

  // ---- אריחי התיק: ניצול (מודגש, עם הטבעת) · נותרו + קצב חודשי · דורשות תשומת לב · שכ"ט ----
  const series = portfolioSeries(list, unit);
  const tipOf = trendTip(unit, null, pm.budget);
  const tiles = [
    tile({
      cls: `tile--lead tile--${pStatus}`, label: unit === 'money' ? 'ניצול תקציבי התיק' : 'ניצול שעות התיק',
      value: el('div', { class: 'tile__lead' }, [
        el('div', { class: 'tile__ring', html: ring(pm.util, pStatus, { size: 84, stroke: 8, label: `ניצול ${pctText(pm.util)}` }) }, [
          el('span', { class: `tile__pct num ${toneOf(pStatus)}`.trim(), text: pctText(pm.util) }),
        ]),
        el('div', { class: 'tile__leadtext' }, [
          el('span', { class: 'tile__value tile__value--lg' }, valueNodes(pm.actual, unit)),
          el('span', { class: 'tile__sub' }, ['מתוך ', ...valueNodes(pm.budget, unit)]),
        ]),
      ]),
    }),
    tile({
      label: pm.remaining < 0 ? 'חריגה' : 'נותרו',
      value: el('span', { class: 'tile__value' }, valueNodes(Math.abs(pm.remaining), unit, { cls: pm.remaining < 0 ? 'is-over' : '' })),
      sub: 'בכל העסקאות שבתצוגה',
      extra: series.length > 1 ? el('span', { class: 'tile__spark', html: sparkline(series.map((x) => x.value), {
        width: 200, height: 34, budget: pm.budget, cls: `spark--${pStatus}`, tips: series.map((x) => tipOf(x.key, x.value)),
      }) }) : null,
    }),
    tile({
      label: 'דורשות תשומת לב',
      value: el('span', { class: `tile__value num ${counts.over ? 'is-over' : counts.risk ? 'is-risk' : ''}`.trim(), text: String(counts.over + counts.risk) }),
      sub: counts.over + counts.risk ? `${counts.over} בחריגה · ${counts.risk} בסיכון` : 'כל העסקאות בתוואי',
    }),
  ];
  if (unit === 'money' && p.agreedFee > 0) {
    tiles.push(tile({
      label: 'שכ"ט מוסכם',
      value: el('span', { class: 'tile__value num', text: fmtU(p.agreedFee, 'money') }),
      sub: ['מול הביצוע: ', el('span', { class: `num ${p.agreedFee - p.actualCost < 0 ? 'is-over' : ''}`.trim(), text: fmtU(p.agreedFee - p.actualCost, 'money') })],
    }));
  }
  // האריח המודגש תופס שתי עמודות
  page.append(el('section', { class: 'tiles', style: `--tiles:${tiles.length + 1};--small:${tiles.length - 1}`, 'aria-label': 'סיכום התיק' }, tiles));

  // ---- טבלת העסקאות (ממוינת לפי עמודה) לצד "דורש תשומת לב" ----
  const rows = sortDeals(list, sort, unit).map((s) => {
    const m = measure(s, unit);
    const eac = eacOf(s, unit);
    const al = urgent(s, unit);
    const worst = al.some((a) => a.level === 'over') ? 'over' : al.length ? 'risk' : '';
    const dealStatus = DEAL_STATUSES.find((x) => x.id === s.deal.status);
    const months = progressByPeriod(s, 'month');
    const trend = months.map((r) => (unit === 'money' ? r.cumulativeCost : r.cumulativeHours));
    const tipFor = trendTip(unit, s.deal, m.budget);
    return el('tr', {
      class: 'is-link', tabindex: '0', role: 'link',
      dataset: { action: 'select-deal', id: s.deal.id },
      'aria-label': `פתח את ${s.deal.name}`,
    }, [
      el('td', {}, [el('div', { class: 'dealcell' }, [
        dealRing(m.budget > 0 ? m.util : NaN, m.status, { size: 40 }),
        el('div', { class: 'cellname' }, [
          el('span', { class: 'cellname__main', text: s.deal.name }),
          el('span', { class: 'cellname__sub', title: s.deal.client || null, text: dealSubline(s.deal, isOpenDeal(s.deal) ? '' : dealStatus?.label) }),
        ]),
      ])]),
      el('td', {}, [m.budget > 0 ? meterCell(m.util, m.status) : el('span', { class: 'muted', text: 'אין תקציב' })]),
      // data-label — במסך צר הטבלה נערמת לכרטיסים, והתווית מוצגת ליד המספר
      el('td', { class: 'num', dataset: { label: 'בוצע / תקציב' }, text: `${fmtU(m.actual, unit, s.deal)} / ${fmtU(m.budget, unit, s.deal)}` }),
      el('td', { class: `num ${m.remaining < 0 ? 'neg' : ''}`.trim(), dataset: { label: 'יתרה' }, text: fmtU(m.remaining, unit, s.deal) }),
      el('td', { class: `num ${eac !== null && eac > m.budget ? 'is-risk' : ''}`.trim(), dataset: { label: 'תחזית' }, text: eac === null ? '—' : fmtU(eac, unit, s.deal) }),
      el('td', { class: 'c-trend' }, trend.length > 1
        ? [el('span', { class: 'trend', html: sparkline(trend, {
          width: 104, height: 30, budget: m.budget, cls: `spark--${m.status}`, tips: months.map((r, i) => tipFor(r.key, trend[i])),
        }) })]
        : [el('span', { class: 'muted', text: '—' })]),
      el('td', { class: 'c-alerts' }, [worst
        ? el('span', { class: `pill pill--${worst}`, dataset: { tip: al.map((a) => a.text).join(' · ') } }, [icon('alert'), String(al.length)])
        : null]),
    ]);
  });
  const H = unit === 'money' ? '₪' : 'שעות';
  const dealsCard = card({ title: 'עסקאות', count: list.length, flush: true, cls: 'ov-deals' }, [
    table([
      { text: 'עסקה', sort: 'name' },
      { text: 'ניצול', sort: 'util' },
      { text: `בוצע / תקציב (${H})`, sort: 'actual' },
      { text: 'יתרה', sort: 'remaining' },
      { text: 'תחזית לסיום', sort: 'eac' },
      { text: 'מגמה', cls: 'c-trend', title: 'שריפה מצטברת לפי חודש — ריחוף מציג את הערך בכל חודש' },
      { text: 'התראות', cls: 'c-alerts', sort: 'alerts', title: 'מיון לפי מספר ההתראות' },
    ], rows, { cls: 'tbl--deals', sort: { key: sort?.key || '', dir: sort?.dir || '', action: 'sort-deals' } }),
  ]);

  // ---- דורש תשומת לב ----
  const alerts = list.flatMap((s) => urgent(s, unit).map((a) => ({ ...a, deal: s.deal })))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'over' ? -1 : 1));
  const items = alerts.map((a) => el('li', { class: 'alist__item' }, [el('button', {
    class: 'alist__btn', type: 'button',
    dataset: { action: 'open-alert', id: a.deal.id, teamId: a.teamId || '' },
  }, [
    el('span', { class: `dot dot--${a.level}` }),
    el('span', {}, [el('span', { class: 'alist__deal', text: a.deal.name }), el('span', { class: 'alist__text', text: a.text })]),
    el('span', { class: 'alist__go', html: ICONS.chevronLeft, 'aria-hidden': 'true' }),
  ])]));
  const attention = alerts.length
    ? card({ title: 'דורש תשומת לב', count: alerts.length, flush: true, cls: 'ov-alerts', info: hidden ? 'עסקאות סגורות ובארכיון אינן נכללות.' : '' }, [
      el('ul', { class: 'alist has-more' }, limitItems(items, 6, { noun: 'התראות' })),
    ])
    : null;
  page.append(el('div', { class: `ov-grid${attention ? '' : ' ov-grid--single'}` }, [dealsCard, attention]));
}
