// ui-deal.js — כותרת העסקה וטאב התקציב: פס מצב, התראות, רשימת הצוותים והגיליון של כל צוות.
// כל מספר מוצג ביחידה שנבחרה (שעות או ₪). ערכים מחושבים נושאים data-calc כדי ש-refreshComputed
// יעדכן אותם בזמן הקלדה בלי רינדור מלא (רינדור מלא היה מאבד את הפוקוס בשדה).

import {
  DEAL_STATUSES, FEE_MODELS, aggregateTeams, aggregateByKind, round2, fmtMoney, fmtPct, progressByPeriod,
} from './model.js';
import { ring, sparkline } from './charts.js';
import {
  el, icon, ICONS, measure, fmtU, fmtDelta, valueNodes, pctText, toneOf, meterCell, paintMeter,
  unitSwitch, seg, menu, button, iconButton, emptyState, fmtDate, isFoldOpen, setFold, avatar, teamSlot, dealSlot,
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
        avatar(d.name, dealSlot(d), { size: 'lg' }),
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
   כרטיס המצב (hero) — שלוש שאלות: כמה נוצל · כמה נשאר · לאן זה הולך
   הניצול כטבעת, ובתחתית הכרטיס "דופק" — קו השריפה המצטברת לאורך זמן.
   ============================================================ */

/** תא מדד בכרטיס: סמל, תווית, ערך, ושורת הקשר */
function heroCell(iconName, label, value, sub) {
  return el('div', { class: 'hero__cell' }, [
    el('span', { class: 'hero__label' }, [el('span', { class: 'hero__ic', html: ICONS[iconName] || '' }), label]),
    value,
    sub ? el('span', { class: 'hero__sub' }, [].concat(sub)) : null,
  ]);
}

export function dealHero(snap, unit) {
  const d = snap.deal;
  const m = measure(snap, unit);
  const eac = unit === 'money' ? snap.eac : snap.eacHours;
  const eacGap = eac === null || eac === undefined ? null : round2(eac - m.budget);
  const eacTone = eacGap !== null && eacGap > 0 ? (eac > m.budget * 1.05 ? 'is-over' : 'is-risk') : '';
  const over = m.remaining < 0;

  const ringBox = el('div', { class: 'hero__ring', html: ring(m.util, m.status, { size: 124, stroke: 11, label: `ניצול ${pctText(m.util)}` }) }, [
    el('span', { class: 'hero__pct' }, [
      el('span', { class: `num ${toneOf(m.status)}`.trim(), text: pctText(m.util) }),
      el('span', { class: 'hero__pct-sub', text: 'נוצל' }),
    ]),
  ]);
  const main = el('div', { class: 'hero__main' }, [
    ringBox,
    el('div', { class: 'hero__lead' }, [
      el('span', { class: 'hero__label', text: unit === 'money' ? 'ניצול התקציב' : 'ניצול שעות התקציב' }),
      el('span', { class: 'hero__big' }, valueNodes(m.actual, unit, { deal: d })),
      el('span', { class: 'hero__sub' }, ['מתוך ', ...valueNodes(m.budget, unit, { deal: d })]),
    ]),
  ]);

  const cells = [
    heroCell(over ? 'alert' : 'clock', over ? 'חריגה מהתקציב' : 'נותרו',
      el('span', { class: 'hero__value' }, valueNodes(Math.abs(m.remaining), unit, { deal: d, cls: over ? 'is-over' : '' })),
      snap.lastReportAt ? `דיווח אחרון ${fmtDate(snap.lastReportAt)}` : 'טרם דווחו שעות'),
    heroCell('trending', 'תחזית לסיום',
      eac === null || eac === undefined
        ? el('span', { class: 'hero__value hero__value--none', text: '—' })
        : el('span', { class: 'hero__value' }, valueNodes(eac, unit, { deal: d, cls: eacTone })),
      eacGap === null
        ? 'הזן אחוז התקדמות או תאריכים בהגדרות'
        : [...valueNodes(Math.abs(eacGap), unit, { deal: d }), eacGap > 0 ? ' מעל התקציב' : ' מתחת לתקציב',
          el('span', { class: 'hero__note', text: snap.eacBasis })]),
  ];
  if (unit === 'money' && snap.hasFee) {
    const ref = eac ?? m.actual;
    const gap = round2(snap.agreedFee - ref);
    cells.push(heroCell('coins', d.feeModel === 'capped' ? 'תקרת שכ"ט' : 'שכ"ט מוסכם',
      el('span', { class: 'hero__value num', text: fmtU(snap.agreedFee, 'money', d) }),
      [eac !== null && eac !== undefined ? 'מול התחזית: ' : 'מול הביצוע: ', el('span', { class: `num ${gap < 0 ? 'is-over' : ''}`.trim(), text: fmtDelta(gap, 'money', d) })]));
  }

  // הדופק: שריפה מצטברת לפי שבוע — צורה וקצב, בלי צירים (הגרף המלא בטאב הדיווחים). רצועה בתחתית,
  // מתחת למספרים; התקציב קובע את תקרת הסקאלה, כך שהגובה של הקו בסוף = כמה מהתקציב נשרף
  const series = progressByPeriod(snap, 'week').map((r) => (unit === 'money' ? r.cumulativeCost : r.cumulativeHours));
  const pulse = series.length > 1;
  return el('section', { class: `hero hero--${m.status}${pulse ? ' hero--pulse' : ''}`, dataset: { region: 'hero' }, 'aria-label': 'מצב העסקה' }, [
    pulse ? el('div', { class: 'hero__pulse', html: sparkline(series, { width: 600, height: 54, budget: m.budget, budgetLine: false, cls: 'spark--hero', dot: false }) }) : null,
    main,
    el('div', { class: 'hero__cells' }, cells),
  ]);
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

export function renderBudgetTab(root, { snap, rateCard, unit = 'hours', selected = new Set(), expanded = new Set(), sort = 'priority' }) {
  if (!snap.teams.length) {
    root.append(el('section', { class: 'card' }, [emptyState('עוד אין צוותים בעסקה',
      'כל צוות בנוי באותה מתודולוגיה: שורה לכל דרגה, שעות מוערכות, מקדם חריגה ותעריף מהתעריפון.',
      [button('הוסף צוות', { action: 'add-team', iconName: 'plus', kind: 'primary', size: '' }),
        button('ייבוא תקציב מאקסל', { action: 'import-budget', iconName: 'upload', size: '' })])]));
    return;
  }

  root.append(dealHero(snap, unit));
  const alerts = alertsCallout(snap, unit);
  if (alerts) root.append(alerts);

  // סדר הצוותים: לפי דחיפות (ביחידה שעל המסך) או הסדר שנקבע בגרירה
  const teams = sort === 'manual'
    ? snap.teams
    : [...snap.teams].sort((a, b) => statusRank(measure(a, unit).status) - statusRank(measure(b, unit).status) || a.order - b.order);

  const list = el('div', { class: `tlist${selected.size ? ' tlist--picking' : ''}`, dataset: { droplist: 'teams' } });
  const H = unit === 'money' ? '₪' : 'שעות';
  list.append(el('div', { class: 'trow trow--head', 'aria-hidden': 'true' }, [
    el('span'), el('span'),
    el('span', { class: 'trow__h', text: 'צוות' }),
    el('span', { class: 'trow__h', text: 'ניצול' }),
    el('span', { class: 'trow__h', text: `בוצע / תקציב (${H})` }),
    el('span', { class: 'trow__h', text: 'יתרה' }),
    el('span'),
  ]));
  for (const team of teams) {
    list.append(teamRow(team, { snap, unit, selected, expanded }));
    if (expanded.has(team.id)) list.append(teamSheet(team, { snap, rateCard, unit }));
  }

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
      avatar(team.name, teamSlot(team), { size: 'sm' }),
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
    el('div', { class: 'trow__meter' }, [meterCell(m.util, m.status, { calc: `team-${team.id}` })]),
    el('span', { class: 'trow__num trow__num--main num', dataset: { calc: `team-used-${team.id}` }, text: `${fmtU(m.actual, unit, d)} / ${fmtU(m.budget, unit, d)}` }),
    el('span', { class: `trow__num num ${m.remaining < 0 ? 'neg' : ''}`.trim(), dataset: { calc: `team-rem-${team.id}` }, text: fmtU(m.remaining, unit, d) }),
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
  return el('div', { class: `trow ${cls}`, dataset: { region: key } }, [
    el('span'), el('span'),
    el('span', { class: 'trow__label', text: label }),
    el('div', { class: 'trow__meter' }, [meterCell(m.util, m.status)]),
    el('span', { class: 'trow__num trow__num--main num', text: `${fmtU(m.actual, unit, snap.deal)} / ${fmtU(m.budget, unit, snap.deal)}` }),
    el('span', { class: `trow__num num ${m.remaining < 0 ? 'neg' : ''}`.trim(), text: fmtU(m.remaining, unit, snap.deal) }),
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
      el('label', { class: 'inline-field', title: 'ריק = המקדם של העסקה. 0.2 = תוספת של 20% לשעות המוערכות' }, [
        'מקדם חריגה',
        el('input', {
          class: 'cell-input', type: 'number', step: '0.05', min: '0', max: '2',
          value: team.overrunFactor === null ? '' : String(team.overrunFactor), placeholder: String(d.overrunFactor),
          dataset: { field: 'overrunFactor', teamId: team.id },
        }),
      ]),
      el('label', { class: 'inline-field' }, ['אחראי',
        el('input', { class: 'input', value: team.lead, placeholder: 'שם', dataset: { field: 'lead', teamId: team.id } })]),
      el('label', { class: 'inline-check', title: 'הצוות יופרד בסיכומים, בניתוח ובייצואים לאקסל' }, [
        el('input', { type: 'checkbox', checked: team.kind === 'dd' ? 'checked' : null, dataset: { field: 'kind', teamId: team.id } }),
        el('span', { text: 'צוות בדיקת נאותות' }),
      ]),
    ]),
    el('div', { class: 'legend' }, [
      el('span', { class: 'legend__item' }, [el('span', { class: 'legend__box' }), 'שדה הזנה']),
      el('span', { class: 'legend__item' }, ['ערך מחושב — ✎ בריחוף לדריסה ידנית']),
      el('span', { class: 'legend__item' }, [el('span', { class: 'legend__box legend__box--ovr' }), 'נדרס ידנית (↺ חוזר לחישוב)']),
    ]),
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
  swap('hero', dealHero(snap, unit));
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

  // הניצול בסרגל הצד
  const m = measure(snap, unit);
  const side = document.querySelector(`.side__deal[data-id="${CSS.escape(d.id)}"]`);
  if (side) {
    const val = side.querySelector('.side__deal-val');
    if (val) { val.textContent = pctText(m.util); val.className = `side__deal-val num ${toneOf(m.status)}`.trim(); }
    const dot = side.querySelector('.dot');
    if (dot) dot.className = `dot${m.status === 'over' || m.status === 'risk' ? ` dot--${m.status}` : ''}`;
  }
}
