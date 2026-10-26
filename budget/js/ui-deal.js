// ui-deal.js — כותרת העסקה וטאב התקציב: אריחי המדדים, התראות, טבלת הצוותים והגיליון של כל צוות.
// כל מספר מוצג ביחידה שנבחרה (שעות או ₪). ערכים מחושבים נושאים data-calc כדי ש-refreshComputed
// יעדכן אותם בזמן הקלדה בלי רינדור מלא (רינדור מלא היה מאבד את הפוקוס בשדה).

import {
  DEAL_STATUSES, FEE_MODELS, defaultTeamTag as teamTagDefault, aggregateTeams, aggregateByKind, round2, fmtMoney, fmtPct, progressByPeriod, dealReview,
} from './model.js';
import { ring, sparkline } from './charts.js';
import {
  el, icon, ICONS, measure, fmtU, fmtDelta, valueNodes, pctText, toneOf, meterCell, paintMeter,
  unitSwitch, seg, menu, button, iconButton, emptyState, fmtDate, isFoldOpen, setFold, teamSlot, teamTagEl, dealRing, dealSubline,
  tile, tileBar, infoTip, chips, sortButton,
} from './ui-kit.js';

/* ============================================================
   כותרת העסקה + טאבים
   ============================================================ */

const TABS = [['budget', 'תקציב', 'target'], ['reports', 'דיווחים', 'list'], ['analysis', 'ניתוח', 'chart'], ['settings', 'הגדרות', 'settings']];

export function renderDealHeader(root, { snap, tab, unit }) {
  const d = snap.deal;
  const status = DEAL_STATUSES.find((s) => s.id === d.status);
  const fee = FEE_MODELS.find((f) => f.id === d.feeModel);
  const meta = [
    d.client,
    d.code,
    fee?.label,
    d.targetDate ? `יעד ${fmtDate(d.targetDate)}` : '',
    `מקדם חריגה ${fmtPct(d.overrunFactor)}`,
  ].filter(Boolean);

  const exportMenu = menu({
    label: 'ייצוא', iconName: 'download', title: 'ייצוא לאקסל',
    items: [
      { label: 'תקציב העסקה', action: 'export-deal', icon: 'file' },
      { label: 'יומן הדיווחים', action: 'export-progress', icon: 'list' },
      { label: 'ניתוח ותחקיר', action: 'export-review', icon: 'chart' },
      '-',
      { label: 'אנשי הקשר בעסקה', action: 'export-deal-contacts', icon: 'users' },
    ],
  });
  const moreMenu = menu({
    iconOnly: true, iconName: 'more', title: 'פעולות נוספות', cls: 'btn btn--sm btn-icon',
    items: [
      { label: 'הזנת שעות ידנית', action: 'add-progress', icon: 'edit' },
      { label: 'ייבוא תקציב מאקסל', action: 'import-budget', icon: 'upload' },
      '-',
      { label: 'שכפול העסקה כתבנית', action: 'duplicate-deal', icon: 'copy' },
      { label: 'עסקה חדשה לפי הביצוע', action: 'clone-from-actual', icon: 'trending' },
      { label: 'סנכרון דרגות מהתעריפון', action: 'sync-team-roles', icon: 'refresh' },
      '-',
      { label: 'מחיקת העסקה', action: 'delete-deal', icon: 'trash', danger: true },
    ],
  });

  root.append(el('header', { class: 'dhead' }, [
    el('div', { class: 'dhead__row' }, [
      el('div', { class: 'dhead__id' }, [
        dealRing(measure(snap, unit).budget > 0 ? measure(snap, unit).util : NaN, measure(snap, unit).status, { size: 56 }),
        el('div', { class: 'dhead__text' }, [
          el('h1', { class: 'dhead__title' }, [
            el('span', { text: d.name }),
            status ? el('span', { class: `tag${d.status === 'active' ? ' tag--active' : ' tag--muted'}`, text: status.label }) : null,
          ]),
          el('p', { class: 'dhead__meta' }, meta.map((t) => el('span', { text: t }))),
        ]),
      ]),
      el('div', { class: 'dhead__actions' }, [
        tab === 'settings' ? null : unitSwitch(unit),
        exportMenu,
        moreMenu,
        button('ייבוא דוח שעות', { action: 'import-progress', iconName: 'upload', kind: 'primary', title: 'דוח שעות או חשבון — XLSX, CSV או PDF. אפשר גם לגרור קובץ לכל מקום במסך' }),
      ]),
    ]),
    el('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'אזורי העסקה' }, TABS.map(([id, label, ic]) => el('button', {
      class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(id === tab),
      dataset: { action: 'set-tab', tab: id },
    }, [icon(ic), label, id === 'reports' && snap.execution.length ? el('span', { class: 'count', text: String(snap.execution.filter((r) => !r.superseded).length) }) : null]))),
  ]));
}

/* ============================================================
   אריחי המדדים — ארבע הנקודות של התקציב זו לצד זו: הערכה → תקציב → בוצע → תחזית לסיום
   (ב-₪ גם שכ"ט). האריח המודגש — הביצוע, עם טבעת הניצול ו"דופק" השריפה השבועית.
   כל אריח עם פס באורך יחסי, כך שההשוואה נקראת בלי לקרוא מספרים.
   ============================================================ */

/** טקסט הריחוף לנקודה בקו השבועי: שבוע · מצטבר · אחוז מהתקציב */
const weekTip = (unit, deal, budget) => (key, value) => [
  `שבוע ${fmtDate(key)}`,
  `${fmtU(value, unit, deal)}${unit === 'money' ? '' : ' שעות'}`,
  budget > 0 ? `${pctText(value / budget)} מהתקציב` : '',
].filter(Boolean).join(' · ');

export function kpiTiles(snap, unit) {
  const d = snap.deal;
  const money = unit === 'money';
  const r = dealReview(snap);
  const m = measure(snap, unit);
  const est = money ? r.estCost : r.estHours;
  const eac = money ? snap.eac : snap.eacHours;
  const hasEac = eac !== null && eac !== undefined;
  const live = r.inProgress;   // עסקה פעילה: תחזית לסיום · עסקה שנסגרה: הפער מהתקציב
  const fee = money && snap.hasFee ? snap.agreedFee : 0;
  const top = Math.max(est || 0, m.budget || 0, m.actual || 0, live && hasEac ? eac : 0, fee) || 1;
  const over = m.remaining < 0;
  const value = (n, opts = {}) => el('span', { class: `tile__value${opts.lg ? ' tile__value--lg' : ''}` }, valueNodes(n, unit, { deal: d, cls: opts.cls || '' }));

  // הדופק: שריפה מצטברת לפי שבוע — הערך המדויק של כל שבוע בריחוף
  const weeks = progressByPeriod(snap, 'week');
  const weekVals = weeks.map((w) => (money ? w.cumulativeCost : w.cumulativeHours));
  const tipOf = weekTip(unit, d, m.budget);

  const tiles = [
    tile({ label: 'הערכה', tip: 'סך השעות שהוערכו בשורות התקציב, לפני מקדם החריגה.', value: value(est), sub: 'לפני מקדם החריגה', extra: tileBar(est, top, 'est') }),
    tile({ label: 'תקציב', tip: 'הערכה × (1 + מקדם החריגה), מעוגל כלפי מעלה בכל שורה — או דריסה ידנית.', value: value(m.budget), sub: `הערכה + ${fmtPct(r.usedFactor)} מקדם`, extra: tileBar(m.budget, top, 'budget') }),
    tile({
      cls: `tile--lead tile--${m.status}`, label: live ? 'בוצע עד היום' : 'בפועל',
      value: el('div', { class: 'tile__lead' }, [
        el('div', { class: 'tile__ring', html: ring(m.util, m.status, { size: 84, stroke: 8, label: `ניצול ${pctText(m.util)}` }) }, [
          el('span', { class: `tile__pct num ${toneOf(m.status)}`.trim(), text: pctText(m.util) }),
        ]),
        el('div', { class: 'tile__leadtext' }, [
          value(m.actual, { lg: true }),
          el('span', { class: 'tile__sub' }, [over ? 'חריגה של ' : 'נותרו ', ...valueNodes(Math.abs(m.remaining), unit, { deal: d, cls: over ? 'is-over' : '' })]),
          el('span', { class: 'tile__note', text: snap.lastReportAt ? `דיווח אחרון ${fmtDate(snap.lastReportAt)}` : 'טרם דווחו שעות' }),
        ]),
      ]),
      extra: weekVals.length > 1 ? el('span', { class: 'tile__pulse', html: sparkline(weekVals, {
        width: 300, height: 40, budget: m.budget, budgetLine: false, cls: 'spark--hero', dot: false,
        tips: weeks.map((w, i) => tipOf(w.key, weekVals[i])),
      }) }) : null,
    }),
  ];

  if (live) {
    const gap = hasEac ? round2(eac - m.budget) : null;
    const tone = gap !== null && gap > 0 ? (eac > m.budget * 1.05 ? 'over' : 'risk') : '';
    tiles.push(tile({
      label: 'תחזית לסיום',
      tip: hasEac
        ? `${snap.eacBasis}: הביצוע עד היום מוקרן לסיום העסקה. ${snap.eacBasis === 'לפי התקדמות שדווחה' ? `התקדמות מדווחת ${fmtPct(r.progressPct / 100)}.` : ''}`.trim()
        : 'אין עדיין בסיס לתחזית — הזן אחוז התקדמות או תאריכי עסקה בהגדרות.',
      value: hasEac ? value(eac, { cls: tone ? `is-${tone}` : '' }) : el('span', { class: 'tile__value tile__value--none', text: '—' }),
      sub: gap === null ? 'הזן התקדמות בהגדרות'
        : [el('span', { class: `num ${tone ? `is-${tone}` : ''}`.trim(), text: fmtDelta(gap, unit, d) }), gap > 0 ? ' מעל התקציב' : ' מתחת לתקציב'],
      extra: hasEac ? tileBar(eac, top, tone || 'fc') : null,
    }));
  } else {
    const gap = round2(m.actual - m.budget);
    tiles.push(tile({
      label: 'פער מהתקציב',
      value: el('span', { class: `tile__value num ${gap > 0 ? 'is-over' : ''}`.trim(), text: fmtDelta(gap, unit, d) }),
      sub: gap > 0 ? 'חריגה' : 'בתוך התקציב',
    }));
  }

  if (money && snap.hasFee) {
    const ref = hasEac ? eac : m.actual;
    const gap = round2(snap.agreedFee - ref);
    tiles.push(tile({
      label: d.feeModel === 'capped' ? 'תקרת שכ"ט' : 'שכ"ט מוסכם',
      tip: `רווח גולמי עד היום: ${fmtMoney(snap.margin)}${snap.marginPct === null ? '' : ` (${fmtPct(snap.marginPct, 1)})`}.`,
      value: el('span', { class: 'tile__value num', text: fmtU(snap.agreedFee, 'money', d) }),
      sub: [hasEac ? 'מול התחזית: ' : 'מול הביצוע: ', el('span', { class: `num ${gap < 0 ? 'is-over' : ''}`.trim(), text: fmtDelta(gap, 'money', d) })],
      extra: tileBar(snap.agreedFee, top, 'fee'),
    }));
  }

  // האריח המודגש תופס שתי עמודות — מכאן ‎+1
  return el('section', { class: 'tiles', style: `--tiles:${tiles.length + 1};--small:${tiles.length - 1}`, dataset: { region: 'hero' }, 'aria-label': 'מדדי העסקה' }, tiles);
}

/* ============================================================
   התראות העסקה — שורה מתקפלת אחת, כל התראה מובילה לצוות שלה
   ============================================================ */

const LEVEL_ORDER = { over: 0, risk: 1, watch: 2, info: 3 };

export function alertsCallout(snap, unit) {
  const list = (snap.alerts[unit] || []).filter((a) => a.level !== 'info')
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  if (!list.length) return null;
  const worst = list[0].level;
  const key = `alerts:${snap.deal.id}`;
  const box = el('details', {
    class: `callout${worst === 'over' ? ' callout--over' : worst === 'risk' ? ' callout--risk' : ''}`,
    dataset: { region: 'alerts' }, open: isFoldOpen(key, false) ? '' : null,
  });
  box.addEventListener('toggle', () => setFold(key, box.open));
  box.append(
    el('summary', { class: 'callout__head' }, [
      icon(worst === 'watch' ? 'info' : 'alert'),
      el('span', { class: 'callout__title', text: list.length === 1 ? 'התראה אחת' : `${list.length} התראות` }),
      el('span', { class: 'callout__first', text: list[0].text }),
      el('span', { class: 'callout__toggle', text: 'הצג הכל' }),
    ]),
    el('ul', { class: 'callout__list' }, list.map((a) => el('li', {}, [a.teamId
      ? el('button', { class: 'callout__item', type: 'button', dataset: { action: 'focus-team', teamId: a.teamId } }, [
        el('span', { class: `dot${a.level === 'over' || a.level === 'risk' ? ` dot--${a.level}` : ''}` }), el('span', { text: a.text }),
      ])
      : el('div', { class: 'callout__item' }, [
        el('span', { class: `dot${a.level === 'over' || a.level === 'risk' ? ` dot--${a.level}` : ''}` }), el('span', { text: a.text }),
      ])]))),
  );
  return box;
}

/* ============================================================
   טאב התקציב
   ============================================================ */

const statusRank = (s) => ({ over: 0, risk: 1, watch: 2, ok: 3 }[s] ?? 3);
const finite = (v) => (Number.isFinite(v) ? v : (v > 0 ? 1e12 : -1e12));

/*
 * מיון הצוותים: 'priority' (בחריגה ובסיכון ראשונים) · 'manual' (הסדר שנקבע בגרירה) ·
 * 'מפתח:כיוון' — לחיצה על כותרת עמודה (למשל 'remaining:asc' = החריגה הגדולה ראשונה).
 */
const TEAM_SORT = {
  name: (t) => t.name,
  est: (t, unit) => measure(t, unit).est,
  budget: (t, unit) => measure(t, unit).budget,
  actual: (t, unit) => measure(t, unit).actual,
  remaining: (t, unit) => measure(t, unit).remaining,
  util: (t, unit) => finite(measure(t, unit).util),
};
/** כיוון ברירת המחדל בלחיצה ראשונה: שם — א-ב; יתרה — החריגה הגדולה ראשונה; השאר — מהגבוה */
export const TEAM_SORT_DIR = { name: 'asc', remaining: 'asc' };

export function sortTeams(teams, sort, unit) {
  if (sort === 'manual') return teams;
  const [key, dir] = String(sort || '').split(':');
  const f = TEAM_SORT[key];
  if (!f) return [...teams].sort((a, b) => statusRank(measure(a, unit).status) - statusRank(measure(b, unit).status) || a.order - b.order);
  const k = dir === 'asc' ? 1 : -1;
  return [...teams].sort((a, b) => {
    const x = f(a, unit);
    const y = f(b, unit);
    return (typeof x === 'string' ? x.localeCompare(y, 'he') : x - y) * k || a.order - b.order;
  });
}

export function renderBudgetTab(root, { snap, rateCard, unit = 'hours', selected = new Set(), expanded = new Set(), sort = 'priority', filter = 'all' }) {
  if (!snap.teams.length) {
    root.append(el('section', { class: 'card' }, [emptyState('עוד אין צוותים בעסקה',
      'כל צוות בנוי באותה מתודולוגיה: שורה לכל דרגה, שעות מוערכות, מקדם חריגה ותעריף מהתעריפון.',
      [button('הוסף צוות', { action: 'add-team', iconName: 'plus', kind: 'primary', size: '' }),
        button('ייבוא תקציב מאקסל', { action: 'import-budget', iconName: 'upload', size: '' })])]));
    return;
  }

  root.append(kpiTiles(snap, unit));
  const alerts = alertsCallout(snap, unit);
  if (alerts) root.append(alerts);

  // סינון לפי מצב (ביחידה שעל המסך) ומיון — לפי דחיפות, הסדר שלי, או עמודה
  const statusOf = (t) => measure(t, unit).status;
  const nOver = snap.teams.filter((t) => statusOf(t) === 'over').length;
  const nRisk = snap.teams.filter((t) => statusOf(t) === 'risk').length;
  const shown = filter === 'over' || filter === 'risk' ? snap.teams.filter((t) => statusOf(t) === filter) : snap.teams;
  const teams = sortTeams(shown, sort, unit);
  const [sortKey, sortDir] = String(sort).split(':');

  const list = el('div', { class: `tlist${selected.size ? ' tlist--picking' : ''}`, dataset: { droplist: 'teams' } });
  const H = unit === 'money' ? '₪' : 'שעות';
  // כותרת לחיצה = מיון; מצב המיון נקרא מתווית הכפתור (aria-sort שייך רק לטבלה אמיתית)
  const hcell = (text, key, cls) => el('span', { class: `trow__h ${cls}` }, [sortButton(text, key, sortKey === key ? sortDir : '', 'sort-teams')]);
  list.append(el('div', { class: 'trow trow--head' }, [
    el('span'), el('span'),
    hcell('צוות', 'name', 'c-team'),
    hcell('הערכה', 'est', 'c-est'),
    hcell('תקציב', 'budget', 'c-budget'),
    hcell('בוצע', 'actual', 'c-actual'),
    hcell(`בוצע / תקציב (${H})`, 'actual', 'c-used'),
    hcell('יתרה', 'remaining', 'c-rem'),
    hcell('ניצול', 'util', 'c-util'),
    el('span'),
  ]));
  for (const team of teams) {
    list.append(teamRow(team, { snap, unit, selected, expanded }));
    if (expanded.has(team.id)) list.append(teamSheet(team, { snap, rateCard, unit }));
  }
  if (!teams.length) list.append(el('p', { class: 'tlist__empty', text: filter === 'over' ? 'אין צוותים בחריגה' : 'אין צוותים בסיכון' }));

  // שורות סיכום — הפרדת בדיקת הנאותות (כשיש) ואז סה"כ העסקה
  const kinds = aggregateByKind(snap);
  if (kinds.hasDD && kinds.regular.count) {
    list.append(sumRow('בדיקת נאותות', kinds.dd, unit, snap, 'sum-dd', 'trow--sub'));
    list.append(sumRow('יתר הצוותים', kinds.regular, unit, snap, 'sum-reg', 'trow--sub'));
  }
  list.append(sumRow('סה"כ העסקה', snap, unit, snap, 'sum-all', 'trow--total'));

  root.append(el('section', { class: 'card teams' }, [
    el('header', { class: 'card__head' }, [
      el('h2', { class: 'card__title' }, [el('span', { class: 'card__ic', html: ICONS.users }), 'צוותים', el('span', { class: 'count', text: String(snap.teams.length) })]),
      el('div', { class: 'card__tools' }, [
        chips([['all', 'הכל', snap.teams.length], ['over', 'בחריגה', nOver], ['risk', 'בסיכון', nRisk]], filter, 'filter-teams', 'filter', { label: 'סינון הצוותים לפי מצב' }),
        seg([['priority', 'לפי דחיפות', 'צוותים בחריגה או בסיכון ראשונים'], ['manual', 'הסדר שלי', 'הסדר שנקבע בגרירה']], sort, 'set-team-sort', 'sort', { cls: 'seg--sm', label: 'מיון הצוותים' }),
        button('צוות', { action: 'add-team', iconName: 'plus', title: 'הוספת צוות (שורה לכל דרגה בתעריפון)' }),
      ]),
    ]),
    distribution(snap, unit),
    list,
  ]));

  if (selected.size) root.append(selectionBar(snap, selected, unit));
}

/**
 * שורת צוות ברשימה. לחיצה בכל מקום בשורה פותחת את הגיליון; רק לחיצה על השם עצמו משנה אותו
 * (rename-team ב-app.js מחליף את הכפתור בשדה עריכה). הצבע — סמל הזהות של הצוות.
 */
function teamRow(team, { snap, unit, selected, expanded }) {
  const d = snap.deal;
  const m = measure(team, unit);
  const open = expanded.has(team.id);
  return el('div', {
    class: `trow${open ? ' trow--open' : ''}`,
    dataset: { teamId: team.id, action: 'toggle-team' },
  }, [
    el('label', { class: 'trow__pick', title: 'סימון לחישוב מצרפי' }, [el('input', {
      type: 'checkbox', dataset: { pick: 'team', teamId: team.id },
      checked: selected.has(team.id) ? 'checked' : null, 'aria-label': `סימון ${team.name} לחישוב מצרפי`,
    })]),
    el('button', {
      class: 'grip', type: 'button', html: ICONS.grip, title: 'גרירה לשינוי הסדר · Alt+↑ / Alt+↓',
      'aria-label': `שינוי מיקום הצוות ${team.name}`, dataset: { grip: 'team', teamId: team.id },
    }),
    el('div', { class: 'trow__id' }, [
      teamTagEl(team),
      el('div', { class: 'trow__idtext' }, [
        el('button', {
          class: 'trow__name', type: 'button', title: 'לחיצה לשינוי שם הצוות',
          dataset: { action: 'rename-team', teamId: team.id },
        }, [el('span', { class: 'trow__name-text', text: team.name }), icon('edit', 'ic trow__pen')]),
        el('span', { class: 'trow__sub' }, [
          team.lead ? el('span', { text: team.lead }) : el('span', { text: `${team.lines.length} שורות` }),
          // סיווג בדיקת נאותות — רק כשהשם עצמו לא אומר את זה כבר
          team.kind === 'dd' && !String(team.name).includes('נאותות')
            ? el('span', { class: 'pill pill--dd', title: 'צוות בדיקת נאותות — מופרד בסיכומים ובייצואים', text: 'בדיקת נאותות' }) : null,
        ]),
      ]),
    ]),
    el('span', { class: 'trow__num num c-est', dataset: { calc: `tr-est-${team.id}` }, text: fmtU(m.est, unit, d) }),
    el('span', { class: 'trow__num num c-budget', dataset: { calc: `tr-budget-${team.id}` }, text: fmtU(m.budget, unit, d) }),
    el('span', { class: 'trow__num trow__num--main num c-actual', dataset: { calc: `tr-actual-${team.id}` }, text: fmtU(m.actual, unit, d) }),
    el('span', { class: 'trow__num trow__num--main num c-used', dataset: { calc: `team-used-${team.id}` }, text: `${fmtU(m.actual, unit, d)} / ${fmtU(m.budget, unit, d)}` }),
    el('span', { class: `trow__num num c-rem ${m.remaining < 0 ? 'neg' : ''}`.trim(), dataset: { calc: `team-rem-${team.id}` }, text: fmtU(m.remaining, unit, d) }),
    el('div', { class: 'trow__meter c-util' }, [meterCell(m.util, m.status, { calc: `team-${team.id}` })]),
    el('div', { class: 'trow__tools' }, [
      iconButton('copy', { action: 'duplicate-team', title: 'שכפול הצוות', dataset: { teamId: team.id } }),
      iconButton('trash', { action: 'delete-team', title: 'מחיקת הצוות', danger: true, dataset: { teamId: team.id } }),
      el('button', {
        class: 'trow__chev', type: 'button', html: ICONS.chevronDown, 'aria-expanded': String(open),
        'aria-label': open ? `סגירת הגיליון של ${team.name}` : `פתיחת הגיליון של ${team.name}`,
        dataset: { action: 'toggle-team', teamId: team.id },
      }),
    ]),
  ]);
}

/**
 * חלוקת התקציב בין הצוותים — פס אחד שכל מקטע בו הוא צוות, ברוחב חלקו בתקציב (ביחידה שעל המסך).
 * הצבעים זהים לסמלי הצוותים בשורות שמתחת — הן המקרא. לחיצה על מקטע פותחת את הצוות.
 */
function distribution(snap, unit) {
  const parts = snap.teams.map((t) => ({ t, v: measure(t, unit).budget })).filter((x) => x.v > 0);
  if (parts.length < 2) return null;
  const total = parts.reduce((a, x) => a + x.v, 0);
  return el('div', { class: 'dist', dataset: { region: 'dist' } }, [
    el('div', { class: 'dist__bar', role: 'img', 'aria-label': 'חלוקת התקציב בין הצוותים' }, parts.map(({ t, v }) => el('button', {
      class: 'dist__seg', type: 'button', style: `flex:${v}`, dataset: { slot: String(teamSlot(t)), action: 'focus-team', teamId: t.id },
      title: `${t.name} · ${pctText(v / total)} מהתקציב · ${fmtU(v, unit, snap.deal)}`, 'aria-label': `${t.name} ${pctText(v / total)}`,
    }))),
    el('div', { class: 'dist__legend' }, parts.map(({ t, v }) => el('span', { class: 'dist__key' }, [
      el('i', { dataset: { slot: String(teamSlot(t)) } }), t.name, el('span', { class: 'num', text: pctText(v / total) }),
    ]))),
  ]);
}

/** שורת סיכום (בדיקת נאותות / יתר / סה"כ) — בלי שדות, ולכן נבנית מחדש בכל רענון */
function sumRow(label, agg, unit, snap, key, cls) {
  const m = measure(agg, unit);
  const d = snap.deal;
  return el('div', { class: `trow ${cls}`, dataset: { region: key } }, [
    el('span'), el('span'),
    el('span', { class: 'trow__label', text: label }),
    el('span', { class: 'trow__num num c-est', text: fmtU(m.est, unit, d) }),
    el('span', { class: 'trow__num num c-budget', text: fmtU(m.budget, unit, d) }),
    el('span', { class: 'trow__num trow__num--main num c-actual', text: fmtU(m.actual, unit, d) }),
    el('span', { class: 'trow__num trow__num--main num c-used', text: `${fmtU(m.actual, unit, d)} / ${fmtU(m.budget, unit, d)}` }),
    el('span', { class: `trow__num num c-rem ${m.remaining < 0 ? 'neg' : ''}`.trim(), text: fmtU(m.remaining, unit, d) }),
    el('div', { class: 'trow__meter c-util' }, [meterCell(m.util, m.status)]),
    el('span'),
  ]);
}

/* ---------- גיליון הצוות ---------- */

/*
 * שדה מחושב מול שדה הזנה — כלל בכל הגיליון:
 * ערך מחושב מוצג כטקסט ולא כשדה, כדי שאי אפשר יהיה להקליד לתוכו בטעות.
 * דריסה ידנית היא פעולה מפורשת (✎), והתא הדרוס מסומן בכתום עם דרך אחת לחזור לחישוב.
 */
function overrideBtn(action, teamId, lineId, title) {
  return el('button', { class: 'ovr', type: 'button', tabindex: '-1', title, 'aria-label': title, dataset: { action, teamId, lineId }, html: ICONS.edit });
}
function resetBtn(action, teamId, lineId, title) {
  return el('button', { class: 'ovr-reset', type: 'button', tabindex: '-1', title, 'aria-label': title, dataset: { action, teamId, lineId }, html: ICONS.refresh });
}

/** שעות התקציב: מוערכות × (1 + מקדם חריגה), מעוגל כלפי מעלה — או דריסה ידנית */
function planHoursCell(line, team) {
  if (line.hoursOverride === null) {
    return el('span', { class: 'calc' }, [
      el('span', { class: 'calc__val num', dataset: { calc: `line-plan-${line.id}` }, title: 'מחושב: שעות מוערכות × (1 + מקדם חריגה), מעוגל כלפי מעלה', text: fmtU(line.budgetHours, 'hours') }),
      overrideBtn('override-hours', team.id, line.id, 'דריסה ידנית של שעות התקציב'),
    ]);
  }
  return el('span', { class: 'calc' }, [
    el('input', {
      class: 'cell-input is-override', type: 'number', step: '1', min: '0', value: String(line.budgetHours),
      title: 'נדרס ידנית — לא מתעדכן מהמוערכות או ממקדם החריגה', 'aria-label': 'שעות תקציב (נדרס)',
      dataset: { field: 'hoursOverride', teamId: team.id, lineId: line.id, auto: '0' },
    }),
    resetBtn('reset-hours', team.id, line.id, 'חזרה לחישוב אוטומטי'),
  ]);
}

/** התעריף מגיע מהתעריפון; דריסה חלה על השורה הזו בלבד */
function rateCell(line, team, deal) {
  if (line.rateOverride === null) {
    return el('span', { class: 'calc' }, [
      el('span', { class: 'calc__val num', dataset: { calc: `line-rate-${line.id}` }, title: 'מהתעריפון של העסקה', text: fmtMoney(line.rate, { currency: deal?.currency || '₪' }) }),
      overrideBtn('override-rate', team.id, line.id, 'דריסת התעריף לשורה זו'),
    ]);
  }
  return el('span', { class: 'calc' }, [
    el('input', {
      class: 'cell-input is-override', type: 'number', step: '10', min: '0', value: String(line.rate),
      title: 'נדרס ידנית — לא מתעדכן מהתעריפון', 'aria-label': 'תעריף (נדרס)',
      dataset: { field: 'rateOverride', teamId: team.id, lineId: line.id, auto: '0' },
    }),
    resetBtn('reset-rate', team.id, line.id, 'חזרה לתעריף מהתעריפון'),
  ]);
}

function roleCell(line, team, rateCard) {
  return el('td', { class: 'c-role' }, [el('div', { class: 'role-cell' }, [
    el('button', {
      class: 'grip', type: 'button', html: ICONS.grip, tabindex: '-1', title: 'גרירה לשינוי סדר השורות · Alt+↑ / Alt+↓',
      'aria-label': `שינוי מיקום השורה ${line.roleName || ''}`, dataset: { grip: 'line', lineId: line.id, teamId: team.id },
    }),
    el('select', {
      class: `cell-select${line.orphanRole ? ' is-orphan' : ''}`, 'aria-label': 'דרגה',
      title: line.orphanRole ? 'הדרגה אינה בתעריפון הנוכחי — התעריף מוקפא בשורה. בחר דרגה כדי לחבר מחדש.' : null,
      dataset: { field: 'roleId', teamId: team.id, lineId: line.id },
    }, [
      line.orphanRole ? el('option', { value: line.roleId, selected: 'selected', text: `${line.roleName && line.roleName !== '—' ? line.roleName : 'דרגה שהוסרה'} · לא בתעריפון` }) : null,
      ...rateCard.roles.map((r) => el('option', { value: r.id, selected: r.id === line.roleId ? 'selected' : null, text: r.name })),
    ]),
    // השם נבחר מהספרייה בלבד — חלון בחירה עם חיפוש
    el('button', {
      class: `cell-person${line.personName ? '' : ' is-empty'}`, type: 'button', title: 'בחירת חבר צוות מהספרייה',
      dataset: { action: 'open-person-picker', teamId: team.id, lineId: line.id },
    }, [line.personName || 'בחר חבר צוות']),
  ])]);
}

function teamSheet(team, { snap, rateCard, unit }) {
  const d = snap.deal;
  const money = unit === 'money';
  const head = money
    ? ['דרגה · חבר צוות', 'תעריף', 'תקציב ₪', 'בוצע ₪', 'יתרה ₪', 'ניצול', '']
    : ['דרגה · חבר צוות', 'מוערכות', 'שעות תקציב', 'בוצע', 'יתרה', 'ניצול', ''];
  const thead = el('thead', {}, el('tr', {}, head.map((h, i) => el('th', {
    class: i === head.length - 1 ? 'c-tools' : null,
    title: i === 1 && !money ? 'ההערכה הראשונית — שדה הזנה' : i === 2 && !money ? 'מחושב: מוערכות × (1 + מקדם חריגה), מעוגל כלפי מעלה' : i === 3 && !money ? 'סך השעות שדווחו מכל המקורות. הקלדה כאן נרשמת כעדכון ידני מתוארך' : i === 1 && money ? 'מהתעריפון של העסקה' : null,
  }, h))));

  const tbody = el('tbody');
  for (const line of team.lines) {
    const lm = measure(line, unit);
    const cells = money
      ? [
        el('td', {}, [rateCell(line, team, d)]),
        el('td', { class: 'num', dataset: { calc: `line-cost-${line.id}` }, text: fmtU(line.budgetCost, 'money', d) }),
        el('td', { class: 'num', dataset: { calc: `line-actual-cost-${line.id}` }, text: fmtU(line.actualCost, 'money', d) }),
      ]
      : [
        el('td', {}, [el('input', {
          class: 'cell-input', type: 'number', step: '0.5', min: '0', value: String(line.estHours), 'aria-label': 'שעות מוערכות',
          dataset: { field: 'estHours', teamId: team.id, lineId: line.id },
        })]),
        el('td', {}, [planHoursCell(line, team)]),
        el('td', {}, [el('input', {
          class: 'cell-input', type: 'number', step: '0.25', min: '0', 'aria-label': 'שעות שבוצעו',
          value: line.actualHours ? String(line.actualHours) : '', placeholder: '0',
          title: line.lastReportAt ? `דיווח אחרון ${fmtDate(line.lastReportAt)}. שינוי כאן נרשם כעדכון ידני מתוארך.` : 'סך השעות שבוצעו עד היום. שינוי כאן נרשם כעדכון ידני מתוארך.',
          dataset: { field: 'manualHours', teamId: team.id, lineId: line.id },
        })]),
      ];
    tbody.append(el('tr', { class: 'bline', dataset: { lineId: line.id, teamId: team.id } }, [
      roleCell(line, team, rateCard),
      ...cells,
      el('td', { class: `num ${lm.remaining < 0 ? 'neg' : ''}`.trim(), dataset: { calc: `line-rem-${line.id}` }, text: fmtU(lm.remaining, unit, d) }),
      el('td', {}, [meterCell(lm.util, lm.status, { calc: `line-${line.id}` })]),
      el('td', { class: 'c-tools' }, [
        // מחוץ לסדר ה-Tab: Tab זורם בין תאי הנתונים, לא דרך כפתורי המחיקה
        iconButton('trash', { action: 'delete-line', title: 'מחיקת השורה', danger: true, tabindex: '-1', cls: 'iconbtn--sm', dataset: { teamId: team.id, lineId: line.id } }),
      ]),
    ]));
  }

  const tm = measure(team, unit);
  const foot = money
    ? [
      el('td', { title: 'תעריף ממוצע בצוות (תקציב ÷ שעות)', class: 'num muted', text: team.budgetHours > 0 ? `ממוצע ${fmtMoney(team.budgetCost / team.budgetHours)}` : '' }),
      el('td', { class: 'num', dataset: { calc: `team-cost-${team.id}` }, text: fmtU(team.budgetCost, 'money', d) }),
      el('td', { class: 'num', dataset: { calc: `team-actual-cost-${team.id}` }, text: fmtU(team.actualCost, 'money', d) }),
    ]
    : [
      el('td', { class: 'num', dataset: { calc: `team-est-${team.id}` }, text: fmtU(team.estHours, 'hours') }),
      el('td', { class: 'num', dataset: { calc: `team-hours-${team.id}` }, text: fmtU(team.budgetHours, 'hours') }),
      el('td', { class: 'num', dataset: { calc: `team-actual-hours-${team.id}` }, text: fmtU(team.actualHours, 'hours') }),
    ];
  const table = el('table', { class: 'tbl tbl--sheet' }, [
    thead, tbody,
    el('tfoot', {}, el('tr', {}, [
      el('td', { text: 'סה"כ הצוות' }),
      ...foot,
      el('td', { class: `num ${tm.remaining < 0 ? 'neg' : ''}`.trim(), dataset: { calc: `team-rem2-${team.id}` }, text: fmtU(tm.remaining, unit, d) }),
      el('td', {}, [meterCell(tm.util, tm.status, { calc: `team-foot-${team.id}` })]),
      el('td', {}),
    ])),
  ]);

  return el('div', { class: 'tsheet', dataset: { teamBody: team.id } }, [
    el('div', { class: 'tsheet__card' }, [el('div', { class: 'tbl-wrap' }, table)]),
    el('div', { class: 'tsheet__foot' }, [
      button('שורה', { action: 'add-line', iconName: 'plus', kind: 'ghost', dataset: { teamId: team.id }, title: 'הוספת שורת דרגה' }),
      button('פריסה לפי אנשי צוות', { action: 'split-by-person', iconName: 'users', kind: 'ghost', dataset: { teamId: team.id }, title: 'שורה לכל עורך דין — לתמחור לפי אדם' }),
      el('span', { class: 'spacer' }),
      el('label', { class: 'inline-field' }, [
        'מקדם חריגה', infoTip('ריק = המקדם של העסקה. 0.2 = תוספת של 20% לשעות המוערכות.'),
        el('input', {
          class: 'cell-input', type: 'number', step: '0.05', min: '0', max: '2',
          value: team.overrunFactor === null ? '' : String(team.overrunFactor), placeholder: String(d.overrunFactor),
          dataset: { field: 'overrunFactor', teamId: team.id },
        }),
      ]),
      el('label', { class: 'inline-field' }, ['תגית',
        el('input', {
          class: 'input ttag-input', value: team.tag, placeholder: teamTagDefault(team.name), maxlength: '5', dir: 'ltr',
          'aria-label': 'תגית הצוות באנגלית', title: 'אותיות באנגלית, עד 5. ריק = ברירת מחדל לפי שם הצוות',
          dataset: { field: 'tag', teamId: team.id },
        })]),
      el('label', { class: 'inline-field' }, ['אחראי',
        el('input', { class: 'input', value: team.lead, placeholder: 'שם', dataset: { field: 'lead', teamId: team.id } })]),
      el('label', { class: 'inline-check', title: 'הצוות יופרד בסיכומים, בניתוח ובייצואים לאקסל' }, [
        el('input', { type: 'checkbox', checked: team.kind === 'dd' ? 'checked' : null, dataset: { field: 'kind', teamId: team.id } }),
        el('span', { text: 'צוות בדיקת נאותות' }),
      ]),
    ]),
    el('span', { class: 'legend' }, ['מקרא', infoTip('מסגרת לבנה = שדה הזנה. ערך בלי מסגרת = מחושב — ✎ בריחוף לדריסה ידנית. רקע כתום = נדרס ידנית; ↺ מחזיר לחישוב.', { label: 'מקרא הגיליון' })]),
  ]);
}

/* ---------- פס בחירה צף: חישוב מצרפי לצוותים המסומנים ---------- */

export function selectionBar(snap, selected, unit) {
  const agg = aggregateTeams(snap, selected);
  const m = measure(agg, unit);
  const total = measure(snap, unit).budget;
  const stat = (label, text, cls = '') => el('div', { class: 'selbar__stat' }, [
    el('span', { class: 'lbl', text: label }), el('span', { class: `num ${cls}`.trim(), text }),
  ]);
  return el('div', { class: 'selbar', dataset: { region: 'selbar' }, role: 'region', 'aria-label': 'חישוב מצרפי לצוותים המסומנים' }, [
    el('span', { class: 'selbar__count', text: agg.count === 1 ? 'צוות אחד נבחר' : `${agg.count} צוותים נבחרו` }),
    stat('בוצע / תקציב', `${fmtU(m.actual, unit, snap.deal)} / ${fmtU(m.budget, unit, snap.deal)}`),
    stat('ניצול', pctText(m.util)),
    stat('יתרה', fmtU(m.remaining, unit, snap.deal)),
    stat('חלק מהעסקה', pctText(total > 0 ? m.budget / total : 0)),
    unit === 'money' ? stat('בלנדד ללא ג׳וניור', fmtMoney(agg.blendedRate)) : null,
    button('נקה בחירה', { action: 'clear-picks', iconName: 'close' }),
  ]);
}

/* ============================================================
   רענון חי בזמן הקלדה — בלי לגעת בשדה שבו המשתמש עומד
   ============================================================ */

export function refreshComputed(snap, { unit = 'hours', selected = new Set() } = {}) {
  const d = snap.deal;
  const q = (key) => document.querySelector(`[data-calc="${CSS.escape(key)}"]`);
  const setText = (key, text, neg) => {
    const node = q(key);
    if (!node) return;
    node.textContent = text;
    if (neg !== undefined) node.classList.toggle('neg', !!neg);
  };
  const setMeter = (key, util, status) => {
    paintMeter(q(`${key}-meter`), util, status);
    const pct = q(`${key}-pct`);
    if (pct) { pct.textContent = pctText(util); pct.className = `mcell__pct num ${toneOf(status)}`.trim(); }
  };
  const swap = (region, fresh) => {
    const node = document.querySelector(`[data-region="${region}"]`);
    if (node && fresh) node.replaceWith(fresh);
    else if (node && !fresh) node.remove();
    return node;
  };

  const total = measure(snap, unit).budget;
  for (const team of snap.teams) {
    const m = measure(team, unit);
    setMeter(`team-${team.id}`, m.util, m.status);
    setMeter(`team-foot-${team.id}`, m.util, m.status);
    setText(`team-used-${team.id}`, `${fmtU(m.actual, unit, d)} / ${fmtU(m.budget, unit, d)}`);
    setText(`tr-est-${team.id}`, fmtU(m.est, unit, d));
    setText(`tr-budget-${team.id}`, fmtU(m.budget, unit, d));
    setText(`tr-actual-${team.id}`, fmtU(m.actual, unit, d));
    setText(`team-rem-${team.id}`, fmtU(m.remaining, unit, d), m.remaining < 0);
    setText(`team-rem2-${team.id}`, fmtU(m.remaining, unit, d), m.remaining < 0);
    setText(`team-est-${team.id}`, fmtU(team.estHours, 'hours'));
    setText(`team-hours-${team.id}`, fmtU(team.budgetHours, 'hours'));
    setText(`team-actual-hours-${team.id}`, fmtU(team.actualHours, 'hours'));
    setText(`team-cost-${team.id}`, fmtU(team.budgetCost, 'money', d));
    setText(`team-actual-cost-${team.id}`, fmtU(team.actualCost, 'money', d));
    for (const line of team.lines) {
      const lm = measure(line, unit);
      setMeter(`line-${line.id}`, lm.util, lm.status);
      setText(`line-rem-${line.id}`, fmtU(lm.remaining, unit, d), lm.remaining < 0);
      setText(`line-plan-${line.id}`, fmtU(line.budgetHours, 'hours'));
      setText(`line-rate-${line.id}`, fmtMoney(line.rate, { currency: d?.currency || '₪' }));
      setText(`line-cost-${line.id}`, fmtU(line.budgetCost, 'money', d));
      setText(`line-actual-cost-${line.id}`, fmtU(line.actualCost, 'money', d));
      /*
       * תיבת השעות שבוצעו מציגה את הסך המאוחד מכל המקורות — ולכן היא חייבת
       * להתיישר בחזרה מול המודל אחרי כל חישוב. בלי זה נשאר בה מה שהוקלד
       * (או ריק, אחרי מחיקה) בזמן שהשורה כבר מציגה מספר אחר.
       */
      const done = document.querySelector(`input[data-field="manualHours"][data-line-id="${CSS.escape(line.id)}"]`);
      if (done && document.activeElement !== done) done.value = line.actualHours ? String(line.actualHours) : '';
    }
  }

  // אזורים בלי שדות הזנה — נבנים מחדש
  swap('hero', kpiTiles(snap, unit));
  const alertsNode = document.querySelector('[data-region="alerts"]');
  const freshAlerts = alertsCallout(snap, unit);
  if (alertsNode && freshAlerts) alertsNode.replaceWith(freshAlerts);
  else if (alertsNode) alertsNode.remove();
  else if (freshAlerts) document.querySelector('[data-region="hero"]')?.after(freshAlerts);

  const kinds = aggregateByKind(snap);
  if (kinds.hasDD && kinds.regular.count) {
    swap('sum-dd', sumRow('בדיקת נאותות', kinds.dd, unit, snap, 'sum-dd', 'trow--sub'));
    swap('sum-reg', sumRow('יתר הצוותים', kinds.regular, unit, snap, 'sum-reg', 'trow--sub'));
  }
  swap('sum-all', sumRow('סה"כ העסקה', snap, unit, snap, 'sum-all', 'trow--total'));
  swap('dist', distribution(snap, unit));
  if (selected.size) swap('selbar', selectionBar(snap, selected, unit));

  // הניצול בסרגל הצד וברשימת התיק
  const m = measure(snap, unit);
  setMeter(`dl-${d.id}`, m.util, m.status);
  const side = document.querySelector(`.side__deal[data-id="${CSS.escape(d.id)}"]`);
  if (side) {
    const val = side.querySelector('.side__deal-val');
    if (val) { val.textContent = pctText(m.util); val.className = `side__deal-val num ${toneOf(m.status)}`.trim(); }
    const dot = side.querySelector('.dot');
    if (dot) dot.className = `dot${m.status === 'over' || m.status === 'risk' ? ` dot--${m.status}` : ''}`;
  }
}
