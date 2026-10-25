// ui-overview.js — סרגל הצד ומסך תיק העסקאות.
// הסרגל מחליף את רצועת הטאבים העליונה: עסקאות פתוחות בלבד, עם נקודת סטטוס וניצול ביחידה שנבחרה.

import { computePortfolio, isOpenDeal, DEAL_STATUSES, progressByPeriod, round2 } from './model.js';
import { ring, sparkline } from './charts.js';
import {
  el, icon, ICONS, measure, fmtU, pctText, toneOf, meterCell, unitSwitch, seg, button, emptyState,
  limitItems, valueNodes, card, table, avatar, dealSlot,
} from './ui-kit.js';

/* ============================================================
   סרגל צד
   ============================================================ */

export function renderSidebar(root, { deals, snapshots, view, activeId, unit, theme }) {
  const link = (action, iconName, label, active = false, extra = {}) => el('button', {
    class: `side__link${active ? ' is-active' : ''}`, type: 'button', dataset: { action, ...extra },
    'aria-current': active ? 'page' : null,
  }, [icon(iconName), label]);

  // עסקה שנסגרה מוצגת בסרגל רק כשהיא פתוחה עכשיו על המסך — כדי שתמיד יהיה ברור איפה אתה
  const open = deals.filter((d) => isOpenDeal(d) || d.id === activeId);
  const list = el('div', { class: 'side__deals', role: 'list', 'aria-label': 'עסקאות פתוחות' });
  for (const deal of open) {
    const snap = snapshots.get(deal.id);
    const m = snap ? measure(snap, unit) : null;
    const tone = m ? toneOf(m.status) : '';
    list.append(el('button', {
      class: `side__deal${deal.id === activeId ? ' is-active' : ''}`, type: 'button', role: 'listitem',
      dataset: { action: 'select-deal', id: deal.id }, draggable: 'true',
      title: `${deal.name}${deal.client ? ` · ${deal.client}` : ''} — גרירה או Alt+↑/↓ לשינוי הסדר`,
      'aria-current': deal.id === activeId ? 'page' : null,
    }, [
      avatar(deal.name, dealSlot(deal), { size: 'xs', alert: m && (m.status === 'over' || m.status === 'risk') ? m.status : '' }),
      el('span', { class: 'side__deal-name', text: deal.name }),
      m && m.budget > 0 ? el('span', { class: `side__deal-val num ${tone}`.trim(), text: pctText(m.util) }) : null,
    ]));
  }
  if (!open.length) list.append(el('p', { class: 'side__empty', text: deals.length ? 'אין עסקאות פתוחות' : 'עוד אין עסקאות' }));

  root.replaceChildren(
    el('div', { class: 'side__brand' }, [
      el('span', { class: 'side__logo', html: ICONS.wallet, 'aria-hidden': 'true' }),
      el('div', {}, [el('div', { class: 'side__name', text: 'LexBudget' }), el('span', { class: 'side__tag', text: 'תקציב עסקאות' })]),
    ]),
    link('go-overview', 'briefcase', 'תיק העסקאות', view === 'overview'),
    el('div', { class: 'side__label' }, [el('span', { text: 'עסקאות פתוחות' }), el('span', { class: 'count', text: String(open.length) })]),
    list,
    link('new-deal', 'plus', 'עסקה חדשה', false),
    el('div', { class: 'side__foot' }, [
      link('go-people', 'users', 'אנשי צוות', view === 'people'),
      link('go-rates', 'coins', 'תעריפונים', view === 'rates'),
      link('backup', 'database', 'גיבוי ושחזור'),
      el('div', { class: 'side__meta' }, [
        el('button', { class: 'side__theme', type: 'button', dataset: { action: 'toggle-theme' }, title: 'מעבר בין מצב בהיר לכהה' },
          theme === 'dark' ? [icon('sun'), 'מצב בהיר'] : [icon('moon'), 'מצב כהה']),
        el('span', { class: 'save-state', id: 'save-state', 'aria-live': 'polite', text: 'נשמר' }),
      ]),
    ]),
  );
}

/* ============================================================
   תיק העסקאות
   ============================================================ */

/** שריפה מצטברת של כל העסקאות יחד, לפי חודש — הדופק בכרטיס התיק */
function portfolioSeries(list, unit) {
  const byMonth = new Map();
  for (const s of list) {
    for (const r of progressByPeriod(s, 'month')) byMonth.set(r.key, (byMonth.get(r.key) || 0) + (unit === 'money' ? r.cost : r.hours));
  }
  let acc = 0;
  return [...byMonth.keys()].sort().map((k) => round2(acc += byMonth.get(k)));
}

/** התראות שמוצגות בסקירה — רק חריגה וסיכון (התראות "לתשומת לב" נשארות בעסקה עצמה) */
const urgent = (snap, unit) => (snap.alerts[unit] || []).filter((a) => a.level === 'over' || a.level === 'risk');

export function renderOverview(root, { snapshots, scope = 'open', unit = 'hours' }) {
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

  // ---- כרטיס המצב של התיק: ניצול כטבעת, יתרה, ומה דורש תשומת לב; בתחתית — דופק השריפה המצטברת ----
  const tone = toneOf(pStatus);
  const cells = [
    el('div', { class: 'hero__cell' }, [
      el('span', { class: 'hero__label' }, [el('span', { class: 'hero__ic', html: ICONS.clock }), pm.remaining < 0 ? 'חריגה' : 'נותרו']),
      el('span', { class: 'hero__value' }, valueNodes(Math.abs(pm.remaining), unit, { cls: pm.remaining < 0 ? 'is-over' : '' })),
      el('span', { class: 'hero__sub', text: 'בכל העסקאות שבתצוגה' }),
    ]),
    el('div', { class: 'hero__cell' }, [
      el('span', { class: 'hero__label' }, [el('span', { class: 'hero__ic', html: ICONS.alert }), 'דורשות תשומת לב']),
      el('span', { class: `hero__value num ${counts.over ? 'is-over' : counts.risk ? 'is-risk' : ''}`.trim(), text: String(counts.over + counts.risk) }),
      el('span', { class: 'hero__sub', text: counts.over + counts.risk ? `${counts.over} בחריגה · ${counts.risk} בסיכון` : 'כל העסקאות בתוואי' }),
    ]),
  ];
  if (unit === 'money' && p.agreedFee > 0) {
    cells.push(el('div', { class: 'hero__cell' }, [
      el('span', { class: 'hero__label' }, [el('span', { class: 'hero__ic', html: ICONS.coins }), 'שכ"ט מוסכם']),
      el('span', { class: 'hero__value num', text: fmtU(p.agreedFee, 'money') }),
      el('span', { class: 'hero__sub' }, ['מול הביצוע: ', el('span', { class: `num ${p.agreedFee - p.actualCost < 0 ? 'is-over' : ''}`.trim(), text: fmtU(p.agreedFee - p.actualCost, 'money') })]),
    ]));
  }
  const pulse = portfolioSeries(list, unit);
  page.append(el('section', { class: `hero hero--${pStatus}${pulse.length > 1 ? ' hero--pulse' : ''}`, 'aria-label': 'סיכום התיק' }, [
    pulse.length > 1 ? el('div', { class: 'hero__pulse', html: sparkline(pulse, { width: 600, height: 54, budget: pm.budget, budgetLine: false, cls: 'spark--hero', dot: false }) }) : null,
    el('div', { class: 'hero__main' }, [
      el('div', { class: 'hero__ring', html: ring(pm.util, pStatus, { size: 124, stroke: 11, label: `ניצול ${pctText(pm.util)}` }) }, [
        el('span', { class: 'hero__pct' }, [el('span', { class: `num ${tone}`.trim(), text: pctText(pm.util) }), el('span', { class: 'hero__pct-sub', text: 'נוצל' })]),
      ]),
      el('div', { class: 'hero__lead' }, [
        el('span', { class: 'hero__label', text: unit === 'money' ? 'ניצול תקציבי התיק' : 'ניצול שעות התיק' }),
        el('span', { class: 'hero__big' }, valueNodes(pm.actual, unit)),
        el('span', { class: 'hero__sub' }, ['מתוך ', ...valueNodes(pm.budget, unit)]),
      ]),
    ]),
    el('div', { class: 'hero__cells' }, cells),
  ]));

  // ---- טבלת העסקאות ----
  const rows = list.map((s) => {
    const m = measure(s, unit);
    const eac = unit === 'money' ? s.eac : s.eacHours;
    const al = urgent(s, unit);
    const worst = al.some((a) => a.level === 'over') ? 'over' : al.length ? 'risk' : '';
    const dealStatus = DEAL_STATUSES.find((x) => x.id === s.deal.status);
    const trend = progressByPeriod(s, 'month').map((r) => (unit === 'money' ? r.cumulativeCost : r.cumulativeHours));
    return el('tr', {
      class: 'is-link', tabindex: '0', role: 'link',
      dataset: { action: 'select-deal', id: s.deal.id },
      'aria-label': `פתח את ${s.deal.name}`,
    }, [
      el('td', {}, [el('div', { class: 'dealcell' }, [
        avatar(s.deal.name, dealSlot(s.deal), { size: 'sm' }),
        el('div', { class: 'cellname' }, [
          el('span', { class: 'cellname__main', text: s.deal.name }),
          el('span', { class: 'cellname__sub', text: [s.deal.client, isOpenDeal(s.deal) ? '' : dealStatus?.label].filter(Boolean).join(' · ') || '—' }),
        ]),
      ])]),
      el('td', {}, [m.budget > 0 ? meterCell(m.util, m.status) : el('span', { class: 'muted', text: 'אין תקציב' })]),
      // data-label — במסך צר הטבלה נערמת לכרטיסים, והתווית מוצגת ליד המספר
      el('td', { class: 'num', dataset: { label: 'בוצע / תקציב' }, text: `${fmtU(m.actual, unit, s.deal)} / ${fmtU(m.budget, unit, s.deal)}` }),
      el('td', { class: `num ${m.remaining < 0 ? 'neg' : ''}`.trim(), dataset: { label: 'יתרה' }, text: fmtU(m.remaining, unit, s.deal) }),
      el('td', { class: `num ${eac !== null && eac > m.budget ? 'is-risk' : ''}`.trim(), dataset: { label: 'תחזית' }, text: eac === null ? '—' : fmtU(eac, unit, s.deal) }),
      el('td', { class: 'c-trend', title: 'שריפה מצטברת לפי חודש, מול קו התקציב' }, trend.length > 1
        ? [el('span', { class: 'trend', html: sparkline(trend, { width: 104, height: 30, budget: m.budget, cls: `spark--${m.status}` }) })]
        : [el('span', { class: 'muted', text: '—' })]),
      el('td', { class: 'c-alerts' }, [worst
        ? el('span', { class: `pill pill--${worst}`, title: al.map((a) => a.text).join('\n') }, [icon('alert'), String(al.length)])
        : null]),
    ]);
  });
  const H = unit === 'money' ? '₪' : 'שעות';
  page.append(card({ title: 'עסקאות', count: list.length, flush: true }, [
    table(['עסקה', 'ניצול', `בוצע / תקציב (${H})`, 'יתרה', 'תחזית לסיום', { text: 'מגמה', cls: 'c-trend' }, { text: '', cls: 'c-alerts' }], rows, { cls: 'tbl--deals' }),
  ]));

  // ---- דורש תשומת לב ----
  const alerts = list.flatMap((s) => urgent(s, unit).map((a) => ({ ...a, deal: s.deal })))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'over' ? -1 : 1));
  if (alerts.length) {
    const items = alerts.map((a) => el('li', { class: 'alist__item' }, [el('button', {
      class: 'alist__btn', type: 'button',
      dataset: { action: 'open-alert', id: a.deal.id, teamId: a.teamId || '' },
    }, [
      el('span', { class: `dot dot--${a.level}` }),
      el('span', {}, [el('span', { class: 'alist__deal', text: a.deal.name }), el('span', { class: 'alist__text', text: a.text })]),
      el('span', { class: 'alist__go', html: ICONS.chevronLeft, 'aria-hidden': 'true' }),
    ])]));
    page.append(card({ title: 'דורש תשומת לב', count: alerts.length, flush: true, sub: hidden ? 'עסקאות סגורות אינן נכללות' : '' }, [
      el('ul', { class: 'alist has-more' }, limitItems(items, 4, { noun: 'התראות' })),
    ]));
  }
}
