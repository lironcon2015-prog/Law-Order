// ui-reports.js — טאב הדיווחים (קליטת שעות, גרף שריפה, יומן לפי חודש, מקורות, חלוקה בין צוותים)
// ומודאלי הקליטה: הזנה ידנית, ייבוא דוח, אלוקציה, איש צוות חדש ופריסה לפי אנשים.

import { num, round2, progressByPeriod, sourceLabel, splitsTotal, todayISO, fmtMoney } from './model.js';
import { burnLine } from './charts.js';
import { TARGET_FIELDS } from './importer.js';
import {
  el, icon, ICONS, fmtU, pctText, monthLabel, fmtDate, seg, button, iconButton, field, card, table,
  emptyState, foldPanel, isFoldOpen, setFold,
} from './ui-kit.js';

const PERIODS = [['day', 'יומי'], ['week', 'שבועי'], ['month', 'חודשי']];
const SOURCE_PILL = { import: 'info', invoice: 'dd', manual: 'muted' };

/** עיצוב קצר לציר הגרף: ₪640K / ₪1.2M, ושעות כמספר */
function axisFmt(unit) {
  if (unit !== 'money') return (n) => fmtU(n, 'hours');
  return (n) => (n >= 1e6 ? `₪${round2(n / 1e6)}M` : n >= 1e3 ? `₪${Math.round(n / 1e3)}K` : `₪${Math.round(n)}`);
}

export function renderReportsTab(root, { snap, unit = 'hours', period = 'week', sources = [], allocation = [] }) {
  const d = snap.deal;
  const money = unit === 'money';
  const rateByLine = new Map();
  const lineLabel = new Map();
  const teamName = new Map(snap.teams.map((t) => [t.id, t.name]));
  for (const t of snap.teams) for (const l of t.lines) {
    rateByLine.set(l.id, l.rate);
    lineLabel.set(l.id, l.personName ? `${l.personName} · ${l.roleName}` : l.roleName);
  }
  const valueOf = (hours, lineId) => (money ? num(hours) * num(rateByLine.get(lineId) || 0) : num(hours));
  const U = (n) => fmtU(n, unit, d);

  // ---- קליטה: אזור גרירה + הזנה ידנית ----
  root.append(el('div', { class: 'dropzone', dataset: { action: 'import-progress' }, role: 'button', tabindex: '0' }, [
    el('span', { class: 'dropzone__ic', html: ICONS.upload }),
    el('div', { class: 'dropzone__text' }, [
      el('div', { class: 'dropzone__title', text: 'גרור לכאן דוח שעות או חשבון' }),
      el('div', { class: 'dropzone__hint', text: 'XLSX, CSV או PDF — השורות מוצגות לאישור לפני שהן נקלטות. דוח של אותה תקופה לא נספר פעמיים.' }),
    ]),
    el('div', { class: 'dropzone__actions' }, [
      button('בחר קובץ', { action: 'import-progress', iconName: 'upload', kind: 'primary' }),
      button('הזנה ידנית', { action: 'add-progress', iconName: 'edit' }),
    ]),
  ]));

  const rows = progressByPeriod(snap, period);
  if (!rows.length) {
    root.append(el('section', { class: 'card' }, [emptyState('עוד לא דווחו שעות',
      'אפשר לייבא דוח שעות או חשבון, להוסיף הזנה ידנית, או להקליד את השעות שבוצעו ישירות בגיליון התקציב.')]));
    return;
  }

  // ---- התקדמות מצטברת: הגרף קודם (הוא התמונה), טבלת התקופות מקופלת מתחתיו ----
  const budget = money ? snap.budgetCost : snap.budgetHours;
  const cum = (r) => (money ? r.cumulativeCost : r.cumulativeHours);
  const per = (r) => (money ? r.cost : r.hours);
  const periodTable = table(['תקופה', 'בתקופה', 'מצטבר', '% מהתקציב'], [...rows].reverse().map((r) => el('tr', {}, [
    el('td', { class: 'num', text: periodLabel(r.key, period) }),
    el('td', { class: 'num', text: U(per(r)) }),
    el('td', { class: 'num c-strong', text: U(cum(r)) }),
    el('td', { class: 'num', text: budget > 0 ? pctText(cum(r) / budget) : '—' }),
  ])), { cls: 'tbl--compact', more: 8, noun: 'תקופות' });
  const tableKey = `prog-table:${d.id}`;
  const tableFold = el('details', { class: 'subfold', open: isFoldOpen(tableKey, false) ? '' : null }, [
    el('summary', { class: 'subfold__head' }, [el('span', { class: 'fold__chev', html: ICONS.chevronDown }), `טבלת התקופות (${rows.length})`]),
    periodTable,
  ]);
  tableFold.addEventListener('toggle', () => setFold(tableKey, tableFold.open));
  root.append(card({
    title: 'התקדמות מצטברת',
    sub: money ? 'עלות השעות שדווחו (שעות × תעריף התכנון) מול התקציב' : 'שעות שדווחו מול שעות התקציב',
    tools: seg(PERIODS.map(([id, label]) => [id, label]), period, 'set-period', 'period', { cls: 'seg--sm', label: 'תקופה' }),
  }, [
    el('div', { class: 'chartbox', html: burnLine(rows.map((r) => ({ label: shortPeriod(r.key, period), title: periodLabel(r.key, period), cumulative: cum(r) })), budget, { fmt: U, axisFmt: axisFmt(unit), width: 1040, height: 290 }) }),
    tableFold,
  ]));

  // ---- יומן הדיווחים — לפי חודש (תקופת החיוב, ואם אין — חודש הביצוע); רק האחרון פתוח ----
  const list = [...(snap.execution || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const byMonth = new Map();
  for (const p of list) {
    const ym = p.billPeriod || String(p.date || '').slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(p);
  }
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
  const log = el('table', { class: 'tbl tbl--log' }, [
    el('thead', {}, el('tr', {}, [
      el('th', { text: 'תאריך' }), el('th', { text: 'צוות' }), el('th', { text: 'שורה בתקציב' }),
      el('th', { text: money ? 'עלות' : 'שעות' }), el('th', { text: 'מקור' }), el('th', { text: 'הערה' }), el('th', { class: 'c-tools' }),
    ])),
  ]);
  months.forEach((ym, mi) => {
    const recs = byMonth.get(ym);
    const live = recs.filter((p) => !p.superseded);
    const total = round2(live.reduce((a, p) => a + valueOf(p.hours, p.lineId), 0));
    const key = `prog-month:${d.id}:${ym}`;
    const open = isFoldOpen(key, mi === 0);
    const body = el('tbody', { class: `mgroup${open ? '' : ' is-collapsed'}` });
    const head = el('tr', { class: 'mgroup__head', tabindex: '0', role: 'button', 'aria-expanded': String(open) }, [
      el('td', { colspan: '3' }, [el('span', { class: 'mgroup__name' }, [
        el('span', { class: 'mgroup__chev', html: ICONS.chevronDown }),
        monthLabel(ym),
        el('span', { class: 'mgroup__count', text: `${recs.length} דיווחים${recs.length !== live.length ? ` · ${recs.length - live.length} הוחלפו` : ''}` }),
      ])]),
      el('td', { class: 'num c-strong', text: U(total) }),
      el('td', { colspan: '3' }),
    ]);
    const toggle = () => {
      const isOpen = body.classList.toggle('is-collapsed') === false;
      head.setAttribute('aria-expanded', String(isOpen));
      setFold(key, isOpen);
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    body.append(head, ...recs.map((p) => logRow(p, { teamName, lineLabel, valueOf, U, money })));
    log.append(body);
  });
  const liveCount = list.filter((p) => !p.superseded).length;
  root.append(card({
    title: 'יומן דיווחים', count: liveCount, flush: true,
    sub: !snap.unassignedHours ? '' : money
      ? 'יש דיווחים בלי שיוך לשורת תקציב — אין להם תעריף ולכן אינם נספרים בעלות.'
      : `${fmtU(snap.unassignedHours, 'hours')} שעות דווחו בלי שיוך לשורת תקציב — אין להן תעריף ולכן אינן נספרות בעלות.`,
  }, [el('div', { class: 'tbl-wrap' }, log)]));

  // ---- מקורות המידע — מאיפה הגיעו השעות; מחיקת מקור מוחקת כל מה שנגזר ממנו ----
  if (sources.length) {
    const kindLabel = { import: 'דוח שעות', invoice: 'חשבון', manual: 'ידני' };
    root.append(foldPanel(`prog-sources:${d.id}`, {
      title: 'מקורות', open: false,
      meta: el('span', { class: 'fold__meta', text: `${sources.length} · ${U(sources.reduce((a, x) => a + (money ? x.cost : x.hours), 0))}` }),
    }, [
      el('p', { class: 'fold__hint', text: 'כל קובץ או הזנה, והשעות שנקלטו ממנו. מקור ודאי יותר מחליף את הפחות ודאי לאותו אדם ואותה תקופה (ידני ← דוח ← חשבון), ולכן אין ספירה כפולה.' }),
      table(['מקור', 'סוג', 'תקופת חיוב', 'טווח תאריכים', 'רשומות', money ? 'עלות' : 'שעות', { text: '', cls: 'c-tools' }], sources.map((s) => el('tr', {}, [
        el('td', {}, [s.fileId
          ? el('button', { class: 'linkbtn', type: 'button', dataset: { action: 'open-file', fileId: s.fileId } }, [icon('file'), s.label])
          : el('span', { text: s.label })]),
        el('td', {}, [el('span', { class: `pill pill--${SOURCE_PILL[s.kind] || 'muted'}`, text: kindLabel[s.kind] || s.kind })]),
        el('td', { class: 'num muted', text: s.periods.length ? s.periods.join(', ') : '—' }),
        el('td', { class: 'num muted', text: s.from ? (s.from === s.to ? fmtDate(s.from) : `${fmtDate(s.from)} – ${fmtDate(s.to)}`) : '—' }),
        el('td', { class: 'num', text: String(s.count) }),
        el('td', { class: 'num c-strong', text: U(money ? s.cost : s.hours) }),
        el('td', { class: 'c-tools' }, [s.deletable
          ? iconButton('trash', { action: 'delete-source', title: 'מחיקת המקור וכל מה שנקלט ממנו', danger: true, dataset: { sourceKey: s.key } })
          : null]),
      ])), { cls: 'tbl--compact', more: 8, noun: 'מקורות' }),
    ]));
  }

  // ---- חלוקה בין צוותים — איך מתחלקות השעות של כל אדם, ותיקון בדיעבד ----
  if (allocation.length) {
    const split = allocation.filter((p) => p.splits.length > 1).length;
    root.append(foldPanel(`prog-alloc:${d.id}`, {
      title: 'חלוקה בין צוותים', open: false,
      meta: el('span', { class: 'fold__meta', text: `${allocation.length} אנשים${split ? ` · ${split} מפוצלים בין צוותים` : ''}` }),
    }, [
      el('p', { class: 'fold__hint', text: '"תקן חלוקה" מחלק מחדש דיווחים שכבר נקלטו — הסך לא משתנה, רק החלוקה בין הצוותים.' }),
      table(['עורך דין / עובד', money ? 'עלות' : 'שעות', 'חלוקה בפועל', 'תקופות', { text: '', cls: 'c-tools' }], allocation.map((p) => el('tr', {}, [
        el('td', {}, [
          el('span', { class: 'strong', text: p.name }),
          p.unassignedHours ? el('span', { class: 'sub', text: money ? 'חלק מהדיווחים בלי שיוך לשורה' : `${fmtU(p.unassignedHours, 'hours')} שעות בלי שיוך לשורה` }) : null,
        ]),
        el('td', { class: 'num c-strong', text: U(p.splits.reduce((a, sp) => a + valueOf(sp.hours, sp.lineId), 0) + (money ? 0 : p.unassignedHours)) }),
        el('td', {}, [el('div', { class: 'alloc-view' }, p.splits.length
          ? p.splits.map((sp) => el('span', { class: 'alloc-view__part' }, [
            el('span', { class: 'alloc-view__pct num', text: `${round2(sp.pct)}%` }),
            el('span', { class: 'alloc-view__team', text: teamName.get(sp.teamId) || '— ללא צוות —' }),
            el('span', { class: 'muted', text: lineLabel.get(sp.lineId) || '' }),
          ]))
          : [el('span', { class: 'muted', text: 'אין שיוך לשורת תקציב' })])]),
        el('td', { class: 'num muted', text: p.periods.length ? p.periods.join(', ') : '—' }),
        el('td', { class: 'c-tools' }, [button('תקן חלוקה', { action: 'edit-allocation', iconName: 'edit', kind: 'ghost', dataset: { personKey: p.key } })]),
      ])), { cls: 'tbl--compact', more: 10, noun: 'אנשים' }),
    ]));
  }
}

/** שורת דיווח ביומן */
function logRow(p, { teamName, lineLabel, valueOf, U, money }) {
  const assigned = lineLabel.get(p.lineId);
  return el('tr', { class: p.superseded ? 'row--superseded' : '' }, [
    el('td', { class: 'num', text: fmtDate(p.date) }),
    el('td', { text: teamName.get(p.teamId) || '—' }),
    el('td', {}, [
      el('span', { text: assigned || (p.person ? p.person : '— ללא שיוך —') }),
      p.person && assigned && !assigned.includes(p.person) ? el('span', { class: 'sub', text: `בדוח: ${p.person}` }) : null,
    ]),
    el('td', { class: `num ${p.hours < 0 ? 'neg' : ''}`.trim() }, [
      money && !p.lineId ? el('span', { class: 'muted', title: 'בלי שיוך לשורה אין תעריף', text: '—' }) : el('span', { text: U(valueOf(p.hours, p.lineId)) }),
      num(p.allocPct) && round2(num(p.allocPct)) !== 100
        ? el('span', { class: 'sub', text: money ? `${round2(num(p.allocPct))}% מהדיווח` : `${round2(num(p.allocPct))}% מתוך ${fmtU(p.sourceHours, 'hours')}` }) : null,
    ]),
    el('td', {}, [el('span', { class: `pill pill--${SOURCE_PILL[p.source] || 'muted'}`, text: sourceLabel(p.source) })]),
    el('td', { class: 'muted', text: p.superseded ? `הוחלף ע"י ${p.supersededBy}` : (p.note || p.fileName || '') }),
    el('td', { class: 'c-tools' }, p.entryId
      // רישום מטאב החשבונות שבוטל — נשאר בחישוב, ואפשר רק למחוק אותו
      ? [iconButton('trash', { action: 'delete-entry', title: 'מחיקה', danger: true, cls: 'iconbtn--sm', dataset: { entryId: p.entryId } })]
      : [
        iconButton('edit', { action: 'edit-progress', title: 'עריכה', cls: 'iconbtn--sm', dataset: { progressId: p.id } }),
        iconButton('trash', { action: 'delete-progress', title: 'מחיקה', danger: true, cls: 'iconbtn--sm', dataset: { progressId: p.id } }),
      ]),
  ]);
}

/** תווית קצרה לציר הגרף: יום/שבוע → 03.05, חודש → 05/26 */
function shortPeriod(key, period) {
  const [y, m, d] = String(key).split('-');
  if (period === 'month') return `${m}/${(y || '').slice(2)}`;
  return d ? `${d}.${m}` : key;
}

/** תווית תקופה לטבלה: חודש → "מאי 2026", שבוע → "10.05–16.05.2026", יום → "14.05.2026" */
function periodLabel(key, period) {
  if (period === 'month') return monthLabel(key);
  const [y, m, d] = String(key).split('-');
  if (!d) return key;
  if (period === 'week') {
    const end = new Date(Number(y), Number(m) - 1, Number(d) + 6);
    const e = `${String(end.getDate()).padStart(2, '0')}.${String(end.getMonth() + 1).padStart(2, '0')}.${end.getFullYear()}`;
    return `${d}.${m}–${e}`;
  }
  return `${d}.${m}.${y}`;
}

/** גישה לסיכום התקופתי מחוץ למודול (לייצוא) */
export const progressPeriods = (snap, period) => progressByPeriod(snap, period);

/* ============================================================
   טפסי קליטה
   ============================================================ */

/** טופס עדכון ביצוע ידני */
export function renderProgressForm(record, { snap }) {
  const p = record || {};
  return el('form', { class: 'modal-form', id: 'progress-form' }, [
    el('div', { class: 'grid-2' }, [
      field('תאריך', el('input', { class: 'input num', type: 'date', name: 'date', value: p.date || todayISO(), required: 'required' })),
      field('שעות שבוצעו', el('input', { class: 'input num', type: 'number', step: '0.25', name: 'hours', value: String(p.hours ?? ''), required: 'required' }),
        'אפשר גם מספר שלילי לתיקון דיווח קודם.'),
    ]),
    field('שורת תקציב', el('select', { class: 'select', name: 'target' },
      lineOptionsFor(snap.teams, p.lineId ? `${p.teamId}|${p.lineId}` : '', { emptyLabel: '— ללא שיוך לשורה —' })),
    'העלות נגזרת מהתעריף של השורה שנבחרה.'),
    field('הערה', el('input', { class: 'input', name: 'note', value: p.note || '', placeholder: 'לדוגמה: הערכה עד קבלת דוח החודש' })),
  ]);
}

/** אפשרויות בחירת שורת תקציב (מקובצות לפי צוות) */
export function lineOptionsFor(teams, selected, { emptyLabel = '— ללא שיוך —' } = {}) {
  return [
    el('option', { value: '', text: emptyLabel }),
    // שם הצוות חוזר גם בטקסט האופציה — ב-select סגור התווית של ה-optgroup אינה נראית
    ...teams.map((t) => el('optgroup', { label: t.name },
      t.lines.map((l) => el('option', {
        value: `${t.id}|${l.id}`,
        text: `${t.name} · ${l.personName ? `${l.personName} (${l.roleName})` : l.roleName}`,
        selected: `${t.id}|${l.id}` === selected ? 'selected' : null,
      })))),
  ];
}

/**
 * עורך אלוקציה: שורה לכל צוות שהאדם עובד בו, עם אחוז השעות שלו.
 * `dataset.imp` מטופל ב-app.js (שינוי) ו-`data-action` (הוספה/הסרה/איש צוות חדש).
 */
export function allocEditor({ personKey: key, splits, teams, hours = 0 }) {
  const total = splitsTotal(splits);
  const box = el('div', { class: 'alloc' });
  splits.forEach((sp, idx) => {
    box.append(el('div', { class: 'alloc__row' }, [
      el('select', { class: 'select select--sm', dataset: { imp: 'allocLine', personKey: key, idx: String(idx) } },
        lineOptionsFor(teams, `${sp.teamId}|${sp.lineId}`)),
      splits.length > 1 || total !== 100
        ? el('span', { class: 'alloc__pct' }, [
          el('input', {
            class: 'input input--sm num', type: 'number', min: '0', max: '100', step: '1',
            value: String(round2(sp.pct)), dataset: { imp: 'allocPct', personKey: key, idx: String(idx) },
          }),
          '%',
          hours ? el('span', { text: `≈ ${fmtU((num(hours) * num(sp.pct)) / 100, 'hours')} ש׳` }) : null,
        ])
        : null,
      splits.length > 1
        ? iconButton('close', { action: 'alloc-remove', title: 'הסרת השיוך', danger: true, cls: 'iconbtn--sm', dataset: { personKey: key, idx: String(idx) } })
        : null,
    ]));
  });
  if (!splits.length) {
    box.append(el('div', { class: 'alloc__row' }, [
      el('select', { class: 'select select--sm', dataset: { imp: 'allocLine', personKey: key, idx: '0' } }, lineOptionsFor(teams, '')),
    ]));
  }
  box.append(el('div', { class: 'alloc__tools' }, [
    el('button', { class: 'linkbtn', type: 'button', dataset: { action: 'alloc-add', personKey: key } }, [icon('plus'), 'צוות נוסף']),
    el('button', { class: 'linkbtn', type: 'button', dataset: { action: 'alloc-new-member', personKey: key } }, [icon('users'), 'איש צוות חדש']),
    splits.length > 1
      ? el('span', { class: `pill pill--${Math.abs(total - 100) < 0.01 ? 'ok' : 'over'}`, text: `סה"כ ${round2(total)}%` })
      : null,
  ]));
  return box;
}

/** טופס הקמת איש צוות חדש מתוך דוח שעות */
export function renderNewMemberForm({ name, teams, roles, rateHint = 0, teamId = '' }) {
  return el('form', { class: 'modal-form', id: 'member-form' }, [
    el('p', { class: 'modal-text', text: 'תיווצר שורת תקציב על שמו בצוות שנבחר, והשעות שלו בדוח ישויכו אליה. אפשר לפצל אותו אחר כך בין כמה צוותים.' }),
    field('שם', el('input', { class: 'input', name: 'person', value: name || '', required: 'required' })),
    el('div', { class: 'grid-2' }, [
      field('צוות', el('select', { class: 'select', name: 'teamId' },
        teams.map((t) => el('option', { value: t.id, text: t.name, selected: t.id === teamId ? 'selected' : null })))),
      field('דרגה', el('select', { class: 'select', name: 'roleId' },
        roles.map((r) => el('option', { value: r.id, text: `${r.name} · ${fmtMoney(r.rate)}` })))),
    ]),
    el('div', { class: 'grid-2' }, [
      field('תעריף אישי', el('input', { class: 'input num', type: 'number', step: '10', name: 'rate', value: rateHint ? String(rateHint) : '' }),
        'ריק = התעריף של הדרגה בתעריפון.'),
      field('שעות מוערכות', el('input', { class: 'input num', type: 'number', step: '1', name: 'estHours', value: '0' }),
        'אפשר להשאיר 0 — השורה נועדה לקלוט את השעות שדווחו.'),
    ]),
  ]);
}

/** טופס תיקון אלוקציה בדיעבד */
export function renderAllocationForm({ person, splits, teams, scopes }) {
  const form = el('form', { class: 'modal-form', id: 'alloc-form' }, [
    el('p', { class: 'modal-text', text: `חלוקת השעות של ${person.name} בין הצוותים. השינוי חל על דיווחים שכבר נקלטו — כל דיווח מחולק מחדש לפי האחוזים החדשים, והסך הכולל (${fmtU(person.hours, 'hours')} שעות) נשמר.` }),
    field('היקף התיקון', el('select', { class: 'select', name: 'scope' },
      scopes.map((sc) => el('option', { value: sc.id, text: sc.label }))),
    'אפשר לתקן רק תקופת חיוב או דוח מסוים, אם החלוקה השתנתה באמצע.'),
  ]);
  const list = el('div', { class: 'alloc-list' });
  const row = (teamId = '', lineId = '', pct = '') => el('div', { class: 'alloc-list__row', dataset: { allocRow: '1' } }, [
    el('select', { class: 'select', dataset: { allocTarget: '1' } }, lineOptionsFor(teams, lineId ? `${teamId}|${lineId}` : '', { emptyLabel: '— בחר שורת תקציב —' })),
    el('input', { class: 'input num', type: 'number', min: '0', max: '100', step: '1', value: pct === '' ? '' : String(round2(pct)), dataset: { allocPct: '1' }, placeholder: '%' }),
    iconButton('close', { action: 'alloc-row-remove', title: 'הסרה', danger: true }),
  ]);
  const rows = (splits.length ? splits : [{ teamId: '', lineId: '', pct: 100 }]).map((sp) => row(sp.teamId, sp.lineId, sp.pct));
  list.append(...rows);
  form.append(field('חלוקה', list, 'הסכום צריך להיות 100%. שורה בלי אחוז לא תיכלל.'));
  form.append(el('div', {}, [button('צוות נוסף', { action: 'alloc-form-add', iconName: 'plus', kind: 'ghost' })]));
  form._allocRow = row;
  return form;
}

/** טופס פריסת צוות לשורות לפי אנשים */
export function renderSplitForm({ team, roles, people }) {
  const form = el('form', { class: 'modal-form', id: 'split-form' }, [
    el('p', { class: 'modal-text', text: `כל איש צוות יקבל שורה נפרדת בצוות "${team.name}", עם דרגה משלו ואפשרות לתעריף אישי. שורות דרגה ריקות שלא דווח עליהן יוסרו. מי שאינו ברשימה — להוסיף קודם במסך "אנשי צוות".` }),
  ]);
  const list = el('div', { class: 'split-list' });

  // הבחירה היא מהספרייה בלבד (select של אנשים), לא הקלדה חופשית
  const row = (personId = '', roleId = '') => el('div', { class: 'split-row', dataset: { personRow: '1' } }, [
    el('select', { class: 'select', dataset: { personPick: '1' }, 'aria-label': 'איש צוות' }, [
      el('option', { value: '', text: '— בחר איש צוות —' }),
      ...people.map((p) => el('option', {
        value: p.id, selected: p.id === personId ? 'selected' : null,
        text: [p.name, p.title].filter(Boolean).join(' · '),
      })),
    ]),
    el('select', { class: 'select', dataset: { personRole: '1' }, 'aria-label': 'דרגה' },
      roles.map((r) => el('option', { value: r.id, text: `${r.name} · ${fmtMoney(r.rate)}`, selected: r.id === roleId ? 'selected' : null }))),
    el('input', { class: 'input num', type: 'number', step: '10', min: '0', placeholder: 'תעריף אישי (רשות)', dataset: { personRate: '1' } }),
  ]);

  const roleByName = new Map(roles.map((r) => [String(r.name).trim().toLowerCase(), r.id]));
  // אנשים שכבר משויכים לצוות הזה בספרייה — מוצעים ראשונים
  const suggested = people.filter((p) => String(p.defaultTeamName || '').trim() === String(team.name || '').trim());
  for (const p of suggested) list.append(row(p.id, roleByName.get(String(p.title || '').trim().toLowerCase()) || ''));
  for (let i = suggested.length; i < Math.max(3, suggested.length + 2); i++) list.append(row());

  form.append(list);
  const add = button('שורה', { iconName: 'plus', kind: 'ghost' });
  add.addEventListener('click', () => list.append(row()));
  form.append(el('div', {}, [add]));
  return form;
}

/* ============================================================
   מסך ייבוא דוח שעות — ארבעה שלבים: המסמך · עמודות · שיוך אנשים · תצוגה מקדימה
   ============================================================ */

const TARGET_FIELD_OPTIONS = TARGET_FIELDS.map((f) => ({ id: f.id, label: f.label }));

function step(n, title, { meta = null, aside = null, collapsible = false, open = true } = {}, body = []) {
  const head = el(collapsible ? 'summary' : 'div', { class: 'istep__head' }, [
    el('span', { class: 'istep__num', text: String(n) }),
    el('span', { class: 'istep__title', text: title }),
    meta ? el('span', { class: 'istep__meta', text: meta }) : null,
    aside ? el('span', { class: 'istep__aside' }, [].concat(aside)) : null,
    collapsible ? el('span', { class: 'fold__chev', html: ICONS.chevronDown }) : null,
  ]);
  return el(collapsible ? 'details' : 'section', { class: 'istep', open: collapsible && open ? '' : null }, [head, el('div', { class: 'istep__body' }, body)]);
}

export function renderProgressImportPreview({
  sheets, sheetIndex, headerRow, mapping, people, peopleAlloc, cumulative, sourceKind = 'import', teams, records,
  unmatched, skipped, duplicates = 0, dateRange = null, overlap = 'skip',
  billPeriods = [], knownPeriods = [], peopleMatch = {},
}) {
  const wrap = el('div', { class: 'import' });
  const sheet = sheets[sheetIndex] || {};
  const nums = sheet.pageNumbers || [];

  /* ---- 1. המסמך ---- */
  const docBody = [];
  if (sheet.pages > 1 || sheets.length > 1) {
    const spread = nums.length > 1 ? ` (עמודים ${nums[0]}–${nums[nums.length - 1]})` : nums.length ? ` (עמוד ${nums[0]})` : '';
    docBody.push(el('div', { class: 'notice' }, [icon('info'), el('span', { text: sheet.pages > 1
      ? `הטבלה משתרעת על ${sheet.pages} עמודים${spread} — כולם נקראו כטבלה אחת וההגדרות כאן חלות על כולם.${sheets.length > 1 ? ' בקובץ יש טבלאות נוספות במבנה אחר — אפשר לעבור אליהן בבורר הטבלה.' : ''}`
      : `בקובץ זוהו ${sheets.length} טבלאות במבנה שונה. נבחרה זו שנראית כמו דוח שעות${spread}; אפשר להחליף בבורר הטבלה.` })]));
  }
  if (sheets.length > 1) {
    docBody.push(field('טבלה / גיליון', el('select', { class: 'select', dataset: { imp: 'sheet' } },
      sheets.map((s, i) => el('option', { value: String(i), text: s.rows ? `${s.name} · ${s.rows.length} שורות` : s.name, selected: i === sheetIndex ? 'selected' : null })))));
  }
  docBody.push(el('div', { class: 'grid-3' }, [
    field('סוג המסמך', el('select', { class: 'select', dataset: { imp: 'sourceKind' } }, [
      el('option', { value: 'import', text: 'דוח שעות', selected: sourceKind === 'invoice' ? null : 'selected' }),
      el('option', { value: 'invoice', text: 'חשבון', selected: sourceKind === 'invoice' ? 'selected' : null }),
    ]), sourceKind === 'invoice'
      ? 'חשבון הוא המקור הסופי: מחליף את דוח השעות וההזנה הידנית של אותה תקופת חיוב.'
      : 'דוח שעות מחליף הזנה ידנית של אותה תקופה; חשבון שיגיע אחריו יחליף אותו.'),
    field('סוג הדוח', el('select', { class: 'select', dataset: { imp: 'cumulative' } }, [
      el('option', { value: '0', text: 'שעות לתקופה', selected: cumulative ? null : 'selected' }),
      el('option', { value: '1', text: 'סך מצטבר מתחילת העסקה', selected: cumulative ? 'selected' : null }),
    ]), cumulative ? 'ייקלט רק ההפרש מול מה שכבר דווח — כדי לא לספור פעמיים.' : 'כל שורה בדוח נוספת לשעות שכבר דווחו.'),
    field('שורת הכותרות', el('input', { class: 'input num', type: 'number', min: '1', value: String(headerRow + 1), dataset: { imp: 'headerRow' } })),
  ]));

  // תקופת החיוב שזוהתה בדוח — זו הזהות שמונעת כפילות בין דוחות
  if (billPeriods.length) {
    const already = billPeriods.filter((b) => knownPeriods.includes(b));
    docBody.push(el('div', { class: `notice${already.length ? ' notice--over' : ''}` }, [
      icon(already.length ? 'alert' : 'info'),
      el('span', { text: already.length
        ? `תקופת חיוב ${already.join(', ')} כבר יובאה לעסקה — השורות שלה יזוהו ככפילות.`
        : `זוהתה תקופת חיוב: ${billPeriods.join(', ')}. הזיהוי מול דוחות אחרים ייעשה לפיה.` }),
    ]));
  }
  // חפיפה בין דוחות — רלוונטי רק בדוח לתקופה
  if (!cumulative) {
    docBody.push(field('שורות שכבר דווחו בעבר', el('select', { class: 'select', dataset: { imp: 'overlap' } }, [
      el('option', { value: 'skip', text: 'דלג עליהן (מומלץ)', selected: overlap === 'skip' ? 'selected' : null }),
      el('option', { value: 'replace', text: 'החלף את מה שיובא בטווח התאריכים של הדוח', selected: overlap === 'replace' ? 'selected' : null }),
      el('option', { value: 'add', text: 'הוסף בכל זאת (ייספר פעמיים)', selected: overlap === 'add' ? 'selected' : null }),
    ]),
    `זיהוי לפי שורת תקציב + ${billPeriods.length ? 'תקופת חיוב' : 'תאריך'} + שם. ${duplicates ? `זוהו ${duplicates} שורות שכבר דווחו.` : 'לא זוהתה חפיפה עם דיווחים קיימים.'}${
      dateRange ? ` הדוח מכסה ${fmtDate(dateRange.from)} עד ${fmtDate(dateRange.to)}.` : ''}`));
    if (overlap === 'replace' && dateRange) {
      docBody.push(el('div', { class: 'notice notice--warn' }, [icon('alert'), el('span', { text: `כל מה שיובא בעבר לטווח ${fmtDate(dateRange.from)}–${fmtDate(dateRange.to)} (לשורות שבדוח) יימחק ויוחלף בתוכן הקובץ. הזנה ידנית לא תיפגע.` })]));
    }
  }
  wrap.append(step(1, 'המסמך', {}, docBody));

  /* ---- 2. עמודות — מקופל כשהזיהוי האוטומטי מצא את המינימום (תאריך + שעות + שם) ---- */
  const rows = sheets[sheetIndex].rows;
  const header = rows[headerRow] || [];
  const found = Object.entries(mapping).filter(([, idx]) => idx !== undefined && idx !== null && idx >= 0);
  const label = (id) => TARGET_FIELD_OPTIONS.find((f) => f.id === id)?.label || id;
  const complete = ['date', 'hours', 'personName'].every((k) => mapping[k] !== undefined && mapping[k] !== null && mapping[k] >= 0);
  const mapTable = el('div', { class: 'tbl-scroll' }, el('table', { class: 'tbl tbl--compact' }, [
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
  ]));
  wrap.append(step(2, 'עמודות', {
    meta: complete ? `זוהו ${found.length} עמודות` : 'חסרה עמודה חיונית — בדוק את המיפוי',
    aside: complete ? null : el('span', { class: 'pill pill--risk', text: 'נדרשת בדיקה' }),
    collapsible: true, open: !complete,
  }, [
    el('p', { class: 'muted', text: found.length ? found.map(([id, idx]) => `${label(id)} ← "${String(header[idx] ?? '').trim()}"`).join(' · ') : 'לא זוהו עמודות — ודא ששורת הכותרות נכונה.' }),
    mapTable,
  ]));

  /* ---- 3. שיוך אנשים לשורות התקציב — כולל אלוקציה של אותו אדם בין כמה צוותים ---- */
  if (people.length) {
    const missing = people.filter((p) => !(peopleAlloc[p.key] || []).length).length;
    const offBalance = people.filter((p) => {
      const t = splitsTotal(peopleAlloc[p.key] || []);
      return t > 0 && Math.abs(t - 100) > 0.01;
    }).length;
    wrap.append(step(3, 'שיוך לשורות התקציב', {
      meta: `${people.length} שמות`,
      aside: [
        missing ? el('span', { class: 'pill pill--risk', text: `${missing} ללא שיוך` }) : el('span', { class: 'pill pill--ok', text: 'כולם משויכים' }),
        offBalance ? el('span', { class: 'pill pill--over', text: `${offBalance} חלוקה שאינה 100%` }) : null,
      ],
    }, [
      el('p', { class: 'muted', text: 'העלות נגזרת מהתעריף של השורה שנבחרה. מי שעובד בכמה צוותים — "צוות נוסף" ופיצול באחוזים (למשל 80/20). השיוך נזכר לייבוא הבא.' }),
      // שיוך מהיר: בוחרים צוות וכל אדם מוצמד לשורה שלו בו (לפי שם, ואם אין — לפי הדרגה שבדוח)
      el('div', { class: 'people-bulk' }, [
        el('span', { text: 'שיוך מהיר של כולם לצוות:' }),
        el('select', { class: 'select select--sm', dataset: { imp: 'personTeamBulk' } }, [
          el('option', { value: '', text: '— בחר צוות —' }),
          ...teams.map((t) => el('option', { value: t.id, text: t.name })),
        ]),
      ]),
      el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl tbl--compact' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: 'עורך דין / עובד' }), el('th', { text: 'שורות' }), el('th', { text: 'שעות' }),
          el('th', { text: 'תעריף בדוח' }), el('th', { text: 'שורת תקציב' }),
        ])),
        el('tbody', {}, people.map((p) => {
          const splits = peopleAlloc[p.key] || [];
          return el('tr', { class: splits.length ? '' : 'row--attention' }, [
            el('td', {}, [
              el('span', { class: 'strong', text: p.name }),
              peopleMatch[p.key] ? el('span', { class: 'sub', text: peopleMatch[p.key] }) : null,
              (p.variants || []).length > 1 ? el('span', { class: 'sub', text: `בדוח: ${p.variants.join(' · ')}` }) : null,
            ]),
            el('td', { class: 'num', text: String(p.rows) }),
            el('td', { class: 'num', text: fmtU(p.hours, 'hours') }),
            el('td', { class: 'num muted', text: p.rateHint ? fmtMoney(p.rateHint) : '—' }),
            el('td', {}, [allocEditor({ personKey: p.key, splits, teams, hours: p.hours })]),
          ]);
        })),
      ])),
      el('label', { class: 'inline-check' }, [
        el('input', { type: 'checkbox', checked: 'checked', dataset: { imp: 'rememberPeople' } }),
        el('span', { text: 'לזכור את השיוך והחלוקה לייבוא הבא' }),
      ]),
    ]));
  }

  /* ---- 4. תצוגה מקדימה ---- */
  const counted = cumulative || overlap !== 'skip' ? records : records.filter((r) => !r.duplicate);
  const totalHours = counted.reduce((s, r) => s + num(r.hours), 0);
  wrap.append(step(people.length ? 4 : 3, 'תצוגה מקדימה', {
    meta: `${counted.length} דיווחים · ${fmtU(totalHours, 'hours')} שעות ייקלטו`,
    aside: [
      duplicates ? el('span', { class: 'pill pill--muted', text: `${duplicates} כבר דווחו` }) : null,
      skipped ? el('span', { class: 'pill pill--muted', text: `${skipped} שורות דולגו` }) : null,
      unmatched.length ? el('span', { class: 'pill pill--over', text: `ללא שיוך: ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '…' : ''}` }) : null,
    ],
  }, records.length ? [el('div', { class: 'tbl-scroll' }, el('table', { class: 'tbl tbl--compact' }, [
    el('thead', {}, el('tr', {}, [el('th', { text: 'תאריך' }), el('th', { text: 'עורך דין' }), el('th', { text: 'שעות' }), el('th', { text: 'הערה' })])),
    el('tbody', {}, records.slice(0, 60).map((r) => el('tr', { class: (!r.lineId || (r.duplicate && overlap === 'skip')) ? 'row--dupe' : '' }, [
      el('td', { class: 'num', text: fmtDate(r.date) }),
      el('td', { text: r.person || '—' }),
      el('td', { class: 'num', text: fmtU(r.hours, 'hours') }),
      el('td', { class: 'muted', text: r.note
        || (!r.lineId ? 'לא שויך לשורה — לא ייקלט'
          : r.duplicate ? `כבר דווחו ${fmtU(r.existingHours, 'hours')} שעות לתאריך הזה${overlap === 'skip' ? ' — ידולג' : ''}` : '') }),
    ]))),
  ]))] : [el('p', { class: 'muted', text: 'לא נמצאו שורות לקליטה — בדוק את מיפוי העמודות ואת שורת הכותרות.' })]));
  return wrap;
}
