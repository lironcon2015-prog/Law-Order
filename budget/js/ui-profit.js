// ui-profit.js — טאב הרווחיות: הכנסה מול עלות פנימית, יעד שיעור רווחיות, מנופים, תרחישים וסימולטור.
// הכל ב-₪ (העלות היא כסף מעצם הגדרתה). החישוב עצמו ב-model.computeProfit — כאן רק תצוגה.

import { fmtMoney, fmtHours, marginTone } from './model.js';
import { el, icon, card, tile, tileBar, table, emptyState, button, iconButton, infoTip, seg, fact } from './ui-kit.js';
import { ring } from './charts.js';

const M = (n) => fmtMoney(n);
const Ms = (n) => (Math.abs(n) < 0.5 ? fmtMoney(0) : `${n > 0 ? '+' : '−'}${fmtMoney(Math.abs(n))}`);
const H = (n) => fmtHours(n);
const pc = (r) => (r === null || r === undefined || !Number.isFinite(r) ? '—' : `${(r * 100).toFixed(1)}%`.replace('-', '−'));
const num = (text, cls = '') => el('span', { class: `num ${cls}`.trim(), text });
/** הפרש בנקודות אחוז — המספר מבודד LTR והמילה מחוצה לו, כדי שהסימן לא יקפוץ לצד הלא נכון */
const pts = (d, cls = '') => el('span', { class: `pf-pts ${cls}`.trim() }, [num(d === null ? '—' : `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)}`), ' נק׳']);
const td = (content, cls = '') => el('td', { class: cls || null }, typeof content === 'string' ? num(content) : content);

export const PROFIT_BASES = [['plan', 'תקציב'], ['actual', 'עד היום'], ['eac', 'תחזית לסיום']];
const BASIS_LABEL = Object.fromEntries(PROFIT_BASES);

/** הסימולטור → תרחיש למנוע */
export function simToScenario(sim, P) {
  const top = P.ladder[0], mid = P.ladder.length > 2 ? P.ladder[1] : P.ladder[P.ladder.length - 1], low = P.ladder[P.ladder.length - 1];
  const shifts = [];
  if (top && mid && top.id !== mid.id && sim.shift1) shifts.push({ from: top.id, to: mid.id, pct: sim.shift1 / 100 });
  if (P.ladder.length > 2 && mid.id !== low.id && sim.shift2) shifts.push({ from: mid.id, to: low.id, pct: sim.shift2 / 100 });
  return { remainingFactor: 1 + (sim.remaining || 0) / 100, shifts, fee: sim.fee ? Number(sim.fee) : null, writeOff: (sim.writeOff || 0) / 100 };
}

export function renderProfitTab(root, { snap, P, basis, by = 'team', sim }) {
  const d = snap.deal;
  const T = P.target;
  const tone = (m) => marginTone(m, T, P.warnPts);
  // הבסיס שנבחר — ואם אין בו שעות (תחזית שאין, ביצוע שעוד לא דווח) — הבסיס הראשי
  const key = !P.bases[basis] || !P.bases[basis].hours ? P.mainKey : basis;
  const B = P.bases[key];

  /* ---------- שורת היעד ---------- */
  const overridden = d.targetMargin !== null && d.targetMargin !== undefined;
  root.append(el('section', { class: 'pf-target' }, [
    el('div', { class: 'pf-target__side' }, [
      icon('target'),
      el('label', { class: 'pf-target__label', for: 'pf-target-input' }, 'יעד רווחיות'),
      el('span', { class: 'pf-pct' }, [
        el('input', { id: 'pf-target-input', class: 'pf-pct__input num', type: 'number', min: '0', max: '95', step: '1', value: String(Math.round(T * 100)), dataset: { profit: 'target' }, 'aria-label': 'יעד שיעור רווחיות באחוזים' }),
        el('span', { class: 'pf-pct__sym', text: '%' }),
      ]),
      el('span', { class: 'muted pf-small', text: overridden ? `נקבע לעסקה · ברירת המחדל ${Math.round(P.costs.defaultTarget * 100)}%` : 'ברירת המחדל של המשרד' }),
      overridden ? button('חזרה לברירת המחדל', { action: 'reset-profit-target', kind: 'ghost' }) : null,
    ]),
    el('div', { class: 'pf-target__side' }, [
      el('span', { class: 'muted pf-small', text: 'בסיס' }),
      seg(PROFIT_BASES.filter(([k]) => k !== 'eac' || P.bases.eac), key, 'set-profit-basis', 'basis', { cls: 'seg--sm', label: 'בסיס החישוב' }),
      el('span', { class: 'pf-lock' }, [icon('info'), 'נתוני עלות — פנימי בלבד']),
      button('ייצוא', { action: 'export-profit', iconName: 'download', title: 'ייצוא הרווחיות לאקסל' }),
    ]),
  ]));

  if (!P.configured) {
    root.append(el('section', { class: 'card' }, [emptyState('עוד לא הוגדרו עלויות',
      'הרווחיות מחושבת מעלות פנימית לשעה (עלות מלאה, כולל תקורה) לכל דרגה — ועלות אישית לאיש צוות שהיא שונה אצלו. מגדירים פעם אחת במסך התעריפונים, והיא חלה על כל העסקאות.',
      [button('הגדרת עלויות', { action: 'go-rates', iconName: 'coins', kind: 'primary', size: '' })])]));
    return;
  }

  // הערות נתונים: שורות בלי עלות, שעות בלי שיוך
  const notes = [];
  if (P.missing.length) {
    const names = [...new Set(P.missing.map((l) => l.roleName))].join(', ');
    notes.push(el('div', { class: 'datanote datanote--warn' }, [icon('alert'), el('span', { text: `אין עלות לדרגה: ${names} — ${P.missing.length} שורות נספרות בעלות 0.` }),
      button('הגדרת עלויות', { action: 'go-rates', kind: 'ghost' })]));
  }
  if (P.unassignedHours > 0) {
    notes.push(el('div', { class: 'datanote' }, [icon('info'), el('span', { text: `${H(P.unassignedHours)} שעות ללא שיוך לשורת תקציב — בלי דרגה אין להן תעריף ועלות, ולכן אינן בחישוב.` })]));
  }
  if (key !== basis) {
    notes.push(el('div', { class: 'datanote' }, [icon('info'), el('span', { text: basis === 'eac' ? 'אין עדיין תחזית לסיום (חסרים ביצוע, אחוז התקדמות או תאריכים) — מוצג התקציב.' : 'עוד לא דווחו שעות — מוצג התקציב.' })]));
  }
  root.append(...notes);

  /* ---------- אריחים ---------- */
  const t = tone(B.margin);
  const top = Math.max(B.value, B.revenue, B.cost, B.required || 0, 1);
  const leadLabel = { plan: 'שיעור רווחיות מתוכנן', actual: 'שיעור רווחיות עד היום', eac: 'שיעור רווחיות צפוי בסיום' }[key];
  const gap = B.margin === null ? null : B.margin - T;
  const other = key === 'actual' ? P.bases[P.mainKey] : P.bases.actual;
  root.append(el('section', { class: 'tiles', style: '--tiles:5;--small:3', dataset: { region: 'hero' }, 'aria-label': 'מדדי רווחיות' }, [
    tile({
      cls: `tile--lead tile--${t === 'ok' ? 'ok' : t}`, label: leadLabel,
      tip: 'רווח ÷ הכנסה. הכנסה = שווי השעות לפי תעריף, עד התקרה / השכ"ט המוסכם. עלות = שעות × עלות פנימית לשעה.',
      value: el('div', { class: 'tile__lead' }, [
        el('div', { class: 'tile__ring', html: ring(T > 0 && B.margin !== null ? Math.max(0, B.margin) / T : 0, t, { size: 84, stroke: 8, label: `רווחיות ${pc(B.margin)}` }) }, [
          el('span', { class: 'tile__pct num', text: pc(B.margin) }),
        ]),
        el('div', { class: 'tile__leadtext' }, [
          el('span', { class: 'tile__value tile__value--lg' }, num(M(B.profit), B.profit < 0 ? 'is-over' : '')),
          el('span', { class: 'tile__sub' }, ['רווח · ', gap === null ? '—' : el('span', { class: gap < 0 ? 'pf-neg' : 'pf-pos' }, [pts(gap), gap < 0 ? ' מתחת ליעד' : ' מעל היעד'])]),
          el('span', { class: 'tile__note' }, [`${key === 'actual' ? BASIS_LABEL[P.mainKey] : 'עד היום'}: `, num(pc(other?.margin)), ' · ', num(M(other?.profit || 0))]),
        ]),
      ]),
    }),
    tile({
      label: 'הכנסה', tip: P.hasCap ? 'הנמוך מבין שווי השעות לפי תעריף לבין התקרה / השכ"ט המוסכם. מעל התקרה — ההכנסה נעצרת והעלות ממשיכה.' : 'עסקה שעתית: ההכנסה היא שווי השעות לפי תעריף.',
      value: el('span', { class: 'tile__value' }, num(M(B.revenue))),
      sub: B.capped ? ['שווי השעות ', num(M(B.value)), ' · ', el('span', { class: 'pf-neg' }, [num(M(B.value - B.revenue)), ' מעל התקרה'])]
        : P.hasCap ? ['עד התקרה נותרו ', num(M(P.cap - B.value))] : ['לפי תעריף · ', num(M(B.avgRate)), ' לשעה'],
      extra: tileBar(B.revenue, top, 'budget'),
    }),
    tile({
      label: 'עלות פנימית', tip: 'שעות × עלות לשעה. עלות אישית (ספריית האנשים) גוברת על עלות הדרגה.',
      value: el('span', { class: 'tile__value' }, num(M(B.cost))),
      sub: [num(H(B.hours)), ' שעות · ', num(M(B.avgCost)), ' לשעה בממוצע'],
      extra: tileBar(B.cost, top, 'est'),
    }),
    tile({
      label: `שכ"ט נדרש ליעד ${Math.round(T * 100)}%`, tip: 'עלות ÷ (1 − יעד): ההכנסה שבה הרווחיות עומדת בדיוק ביעד.',
      value: el('span', { class: 'tile__value' }, num(M(B.required || 0), B.required > B.revenue ? 'is-over' : '')),
      sub: B.required > B.revenue
        ? [num(Ms(B.required - B.revenue)), P.hasCap ? ' מעל השכ"ט המוסכם' : ' מעל ההכנסה']
        : ['ההכנסה מכסה את היעד · מרווח ', num(M(B.revenue - B.required))],
      extra: tileBar(B.required || 0, top, B.required > B.revenue ? 'over' : 'fc'),
    }),
  ]));

  /* ---------- שלושת הבסיסים ---------- */
  const baseRow = (k) => {
    const x = P.bases[k];
    if (!x) return null;
    const tt = tone(x.margin);
    return el('tr', { class: k === key ? 'is-current' : null }, [
      el('td', { text: BASIS_LABEL[k] }), td(H(x.hours)), td(M(x.revenue)), td(M(x.cost)), td(M(x.profit), x.profit < 0 ? 'is-over' : ''),
      td(pc(x.margin), `pf-t pf-t--${tt}`), td(pts(x.margin === null ? null : x.margin - T), `pf-t pf-t--${tt}`), td(M(x.required || 0)),
    ]);
  };
  root.append(card({ title: 'תכנון · עד היום · סיום', info: 'אותה מתודולוגיה בשלוש נקודות זמן. התחזית לסיום מקרינה את הביצוע לפי ההתקדמות שדווחה (או לפי לוח הזמנים).', flush: true }, [
    table(['', 'שעות', 'הכנסה', 'עלות', 'רווח', 'רווחיות', 'מול היעד', 'שכ"ט ליעד'].map((x) => ({ text: x })),
      ['plan', 'actual', 'eac'].map(baseRow).filter(Boolean), { cls: 'tbl--pf' }),
  ]));

  /* ---------- מנופים ---------- */
  const L = P.levers;
  const lever = (ic, title, line, result, tip) => el('div', { class: 'pf-lever' }, [
    el('span', { class: 'pf-lever__ic' }, icon(ic)),
    el('div', { class: 'pf-lever__text' }, [el('b', {}, [title, tip ? infoTip(tip) : null]), el('span', { class: 'muted' }, line)]),
    el('div', { class: 'pf-lever__res' }, result),
  ]);
  const levers = [];
  if (P.hasCap) {
    const valueShort = L.fee.delta > 0 && L.fee.required > P.main.value;
    levers.push(lever('coins', 'להעלות את השכ"ט', ['עד ', num(M(L.fee.required || 0)), ' · ', num(Ms(L.fee.delta)), ' · ', num(pc(L.fee.delta / P.cap))],
      L.fee.delta <= 0 ? 'השכ"ט הנוכחי מספיק'
        : valueShort ? el('span', { class: 'pf-neg' }, ['הגדלת התקרה לבדה לא תספיק — שווי השעות ', num(M(P.main.value))])
          : ['תקרה חדשה ', num(M(L.fee.required))],
      valueShort ? 'ההכנסה היא שווי השעות עד התקרה. כשהיעד דורש יותר משווי השעות, צריך גם תעריף גבוה יותר (או פחות שעות / תמהיל זול יותר).' : ''));
  } else if (L.rate) {
    levers.push(lever('coins', 'להעלות את התעריף הממוצע', ['ממוצע נוכחי ', num(M(L.rate.current)), ' לשעה'],
      L.rate.required > L.rate.current ? ['נדרש ', num(M(L.rate.required)), ' לשעה'] : 'התעריף הנוכחי מספיק'));
  }
  if (L.hoursCap) {
    levers.push(lever('clock', 'להגביל את השעות', ['תקרת שעות כוללת ', num(H(L.hoursCap.maxHours))],
      L.hoursCap.remainingAllowed < 0 ? el('span', { class: 'pf-neg' }, 'היעד כבר נשבר בשעות שבוצעו')
        : ['נותרו ', num(H(L.hoursCap.remainingAllowed)), ' שעות במקום ', num(H(Math.max(0, L.hoursCap.remainingPlanned)))],
      'בהנחה שהשכ"ט מגיע לתקרה, ובתמהיל הדרגות הנוכחי.'));
  }
  if (L.leverage) {
    levers.push(lever('layers', 'להוריד דרג (מינוף)', L.leverage.name.replace('מינוף — ', ''),
      L.leverage.delta === null ? '—' : [pts(L.leverage.delta), ' רווחיות']));
  }
  if (L.breakEven) {
    levers.push(lever('flag', 'נקודת איזון', ['רווח 0 ב-', num(H(L.breakEven.hours)), ' שעות'],
      L.breakEven.cushion >= 0 ? ['מרווח ביטחון ', num(H(L.breakEven.cushion)), ' שעות'] : el('span', { class: 'pf-neg' }, 'התחזית מעבר לנקודת האיזון')));
  }
  if (levers.length) {
    root.append(card({ title: 'מה מחזיר את התיק ליעד', sub: `לפי ${BASIS_LABEL[P.mainKey]} · כל מנוף לבד, בלי לשנות את השאר` }, [
      el('div', { class: 'pf-levers', style: `--n:${levers.length}` }, levers),
    ]));
  }

  /* ---------- פילוח ---------- */
  const rows = P.breakdown(key, by);
  const byLabel = { team: 'צוות', role: 'דרגה', person: 'איש צוות' }[by];
  root.append(card({
    title: `רווחיות לפי ${byLabel}`, sub: `${BASIS_LABEL[key]} · ${P.hasCap ? 'ההכנסה מתחלקת לפי שווי השעות לפי תעריף' : 'הכנסה = שווי השעות'}`, flush: true,
    tools: [seg([['team', 'צוות'], ['role', 'דרגה'], ['person', 'אדם']], by, 'set-profit-by', 'by', { cls: 'seg--sm', label: 'פילוח' })],
  }, [
    table([byLabel, by === 'person' ? 'עלות לשעה' : null, 'שעות', 'הכנסה', 'עלות', 'רווח', 'רווחיות מול היעד', 'חלק מהרווח'].filter(Boolean).map((x) => ({ text: x })),
      rows.map((g) => el('tr', {}, [
        el('td', {}, el('span', { class: 'pf-name' }, [
          by === 'team' ? el('i', { class: 'pf-dot', style: `background:${g.color}` }) : null,
          el('span', {}, [g.name, g.sub ? el('span', { class: 'sub', text: g.sub }) : null]),
          g.missing ? el('span', { class: 'pill pill--risk', text: 'חסרה עלות' }) : null,
        ])),
        by === 'person' ? td(g.costRates.length === 1 ? M(g.costRates[0]) : '—') : null,
        td(H(g.hours)), td(M(g.revenue)), td(M(g.cost)), td(M(g.profit), g.profit < 0 ? 'is-over' : ''),
        el('td', {}, marginBar(g.margin, T, tone)), td(pc(g.profitShare)),
      ].filter(Boolean))),
      { cls: 'tbl--pf', more: by === 'person' ? 12 : 0, noun: 'אנשים',
        foot: el('tr', {}, [el('td', { text: 'סה"כ' }), by === 'person' ? td(M(B.avgCost)) : null, td(H(B.hours)), td(M(B.revenue)), td(M(B.cost)), td(M(B.profit)),
          el('td', {}, marginBar(B.margin, T, tone)), td('100%')].filter(Boolean)) }),
  ]));

  /* ---------- תרחישים ---------- */
  root.append(card({
    title: 'תרחישים', sub: `יעד ${Math.round(T * 100)}% · כל תרחיש משנה רק את השעות שנותרו (${BASIS_LABEL[P.mainKey]})`, flush: true,
    count: P.scenarios.length,
  }, [
    table(['תרחיש', 'שעות', 'הכנסה', 'עלות', 'רווח', 'רווחיות', 'מול היעד', 'שכ"ט ליעד', 'חסר ליעד', ''].map((x) => ({ text: x })),
      P.scenarios.map((s, i) => {
        const x = s.totals;
        const tt = tone(x.margin);
        const feeGap = x.required === null ? null : x.required - x.revenue;
        return el('tr', { class: i === 0 ? 'is-current' : null }, [
          el('td', {}, [el('b', { text: s.name }), el('span', { class: 'sub', text: s.desc })]),
          td(H(x.hours)), td(M(x.revenue)), td(M(x.cost)), td(M(x.profit), x.profit < 0 ? 'is-over' : ''),
          td(pc(x.margin), `pf-t pf-t--${tt}`), td(pts(x.margin === null ? null : x.margin - T), `pf-t pf-t--${tt}`), td(M(x.required || 0)),
          td(feeGap === null ? '—' : feeGap > 0 ? Ms(feeGap) : el('span', { text: 'בתוך היעד' }), feeGap > 0 ? 'pf-t pf-t--over' : 'pf-t pf-t--ok'),
          el('td', { class: 'c-tools' }, s.preset ? null : iconButton('trash', { action: 'delete-scenario', title: 'מחיקת התרחיש', danger: true, cls: 'iconbtn--sm', dataset: { id: s.id } })),
        ]);
      }), { cls: 'tbl--pf' }),
  ]));

  /* ---------- סימולטור ---------- */
  const out = el('div', { id: 'pf-sim-out' });
  root.append(el('div', { class: 'pair pf-simpair' }, [
    card({ title: 'סימולטור', sub: 'מזיזים — והתוצאה מתעדכנת. "שמור כתרחיש" מוסיף שורה לטבלה',
      tools: [button('איפוס', { action: 'reset-sim', kind: 'ghost' }), button('שמור כתרחיש', { action: 'save-scenario', iconName: 'check', kind: 'primary' })] }, [
      simControls(sim, P),
    ]),
    card({ title: 'תוצאת הסימולציה' }, [out]),
  ]));
  fillSimOut(out, P, sim);
}

/** פס רווחיות מול קו היעד (סקאלה 0–70%) */
function marginBar(m, T, tone) {
  const scale = Math.max(0.7, T + 0.15);
  const w = m === null ? 0 : Math.max(0, Math.min(100, (m / scale) * 100));
  const t = tone(m);
  return el('div', { class: `pf-bar pf-bar--${t}` }, [
    el('span', { class: 'pf-bar__track', 'aria-hidden': 'true' }, [el('i', { style: `width:${w.toFixed(1)}%` }), el('b', { style: `right:${((T / scale) * 100).toFixed(1)}%`, title: 'היעד' })]),
    num(pc(m)),
  ]);
}

function simControls(sim, P) {
  const top = P.ladder[0], mid = P.ladder.length > 2 ? P.ladder[1] : P.ladder[P.ladder.length - 1], low = P.ladder[P.ladder.length - 1];
  const slider = (key, label, min, max, step, val, fmt, hint) => el('label', { class: 'pf-sl' }, [
    el('span', { class: 'pf-sl__h' }, [el('span', { text: label }), el('output', { class: 'num pf-sl__v', dataset: { simOut: key }, text: fmt(val) })]),
    el('input', { class: 'pf-range', type: 'range', min: String(min), max: String(max), step: String(step), value: String(val), style: `--p:${(((val - min) / (max - min)) * 100).toFixed(1)}%`, dataset: { sim: key }, 'aria-label': label }),
    el('span', { class: 'muted pf-small', text: hint }),
  ]);
  const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`;
  const items = [
    slider('remaining', 'שעות שנותרו מול התחזית', -50, 50, 5, sim.remaining || 0, signed, 'מ−50% עד +50%'),
  ];
  if (top && mid && top.id !== mid.id) items.push(slider('shift1', `העברת שעות ${top.name} → ${mid.name}`, 0, 100, 5, sim.shift1 || 0, (v) => `${v}%`, 'מהשעות שנותרו'));
  if (P.ladder.length > 2 && mid.id !== low.id) items.push(slider('shift2', `העברת שעות ${mid.name} → ${low.name}`, 0, 100, 5, sim.shift2 || 0, (v) => `${v}%`, 'מהשעות שנותרו'));
  items.push(slider('writeOff', 'הנחה / מחיקה בחיוב', 0, 30, 1, sim.writeOff || 0, (v) => `${v}%`, 'אחוז מההכנסה שלא ייגבה'));
  items.push(el('label', { class: 'pf-sl' }, [
    el('span', { class: 'pf-sl__h' }, [el('span', { text: P.hasCap ? 'תקרה / שכ"ט לבדיקה' : 'שכ"ט קבוע לבדיקה' })]),
    el('input', { class: 'input num', type: 'number', min: '0', step: '1000', value: sim.fee || '', placeholder: P.hasCap ? M(P.cap) : 'לפי שעות', dataset: { sim: 'fee' }, 'aria-label': 'שכ"ט לבדיקה' }),
    el('span', { class: 'muted pf-small', text: P.hasCap ? 'ריק = השכ"ט המוסכם' : 'ריק = שעתי (שווי השעות)' }),
  ]));
  return el('div', { class: 'pf-sims' }, items);
}

/** תוצאת הסימולציה — מתעדכנת בלי רינדור מלא */
export function fillSimOut(out, P, sim) {
  const sc = simToScenario(sim, P);
  const { lines, totals: x } = P.runScenario(sc);
  const T = P.target;
  const tone = marginTone(x.margin, T, P.warnPts);
  const fee = sc.fee || P.cap;
  const maxH = Number.isFinite(fee) && x.avgCost > 0 ? (fee * (1 - sc.writeOff) * (1 - T)) / x.avgCost : null;
  const insight = x.margin === null ? 'אין הכנסה בתרחיש הזה.'
    : x.margin >= T ? `התרחיש עומד ביעד, עם מרווח של ${((x.margin - T) * 100).toFixed(1)} נקודות.`
      : `חסרות ${((T - x.margin) * 100).toFixed(1)} נקודות ליעד. ${!Number.isFinite(fee) ? `צריך תעריף ממוצע של ${M(x.required / Math.max(1, x.hours))} לשעה.`
        : x.required > x.value * (1 - sc.writeOff) ? `הגדלת התקרה לבדה לא תספיק — שווי השעות ${M(x.value)}. צריך גם תעריף גבוה יותר${maxH ? `, או לעצור על ${H(maxH)} שעות בסך הכל` : ''}.`
          : `צריך שכ"ט של ${M(x.required)}${maxH ? `, או לעצור על ${H(maxH)} שעות בסך הכל` : ''}.`}`;
  out.replaceChildren(
    el('div', { class: 'facts facts--lg facts--2' }, [
      fact('רווחיות', pc(x.margin), tone === 'ok' ? '' : 'neg'), fact('רווח', M(x.profit), x.profit < 0 ? 'neg' : ''),
      fact('שכ"ט נדרש ליעד', M(x.required || 0)),
      (x.required || 0) > x.revenue ? fact('חסר בהכנסה ליעד', Ms((x.required || 0) - x.revenue), 'neg') : fact('מרווח מעל היעד', M(x.revenue - (x.required || 0))),
      fact('הכנסה לשעה', M(x.avgRate)), fact('עלות לשעה', M(x.avgCost)),
    ]),
    el('div', { class: `insight${tone === 'ok' ? '' : ' insight--warn'}` }, [icon('trending'), el('span', { text: insight })]),
    waterfall(lines, x, T, P),
  );
}

/** גרף מפל: הכנסה ← עלות לפי דרגה ← רווח, מול קו היעד */
function waterfall(lines, x, T, Pr) {
  const byRole = new Map();
  for (const l of lines) {
    const k = l.roleName;
    byRole.set(k, (byRole.get(k) || 0) + num0(l.sim) * (l.costRate || 0));
  }
  const order = Pr.ladder.map((r) => r.name);
  const costs = [...byRole.entries()].filter(([, v]) => v > 0).sort((a, b) => (order.indexOf(a[0]) + 99 * (order.indexOf(a[0]) < 0)) - (order.indexOf(b[0]) + 99 * (order.indexOf(b[0]) < 0)));
  const steps = [['הכנסה', x.revenue, 'base'], ...costs.map(([n, v]) => [`עלות ${n}`, -v, 'neg']), ['רווח', x.profit, x.profit >= x.revenue * T ? 'ok' : 'end']];
  const W = 560, Hh = 150, n = steps.length, bw = Math.min(74, (W / n) * 0.62), gap = n > 1 ? (W - bw * n) / (n - 1) : 0;
  const topV = Math.max(x.revenue, 1);
  const y = (v) => Hh - (Math.max(0, v) / topV) * Hh;
  let run = 0;
  const k = (v) => `${v < 0 ? '−' : ''}₪${Math.round(Math.abs(v) / 1000).toLocaleString('en-US')}K`;
  const bars = steps.map(([label, v, kind], i) => {
    let a, b;
    if (kind === 'base') { a = 0; b = v; run = v; } else if (i === n - 1) { a = Math.min(0, v); b = Math.max(0, v); } else { a = run + v; b = run; run += v; }
    const xPos = W - i * (bw + gap) - bw;   // מימין לשמאל, כמו הקריאה
    const yt = y(b), yb = y(a);
    return `<rect class="wf wf--${kind}" x="${xPos.toFixed(1)}" y="${yt.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, yb - yt).toFixed(1)}" rx="4"/>
      <text class="wf__v" x="${(xPos + bw / 2).toFixed(1)}" y="${(yt - 6).toFixed(1)}">${k(v)}</text>
      <text class="wf__l" x="${(xPos + bw / 2).toFixed(1)}" y="${Hh + 18}">${escTxt(label)}</text>`;
  }).join('');
  const ty = y(x.revenue * T);
  return el('figure', { class: 'pf-wf', 'aria-label': 'גרף מפל: מהכנסה לרווח' }, [
    el('div', { html: `<svg viewBox="0 -22 ${W} ${Hh + 50}" width="100%" style="direction:ltr" role="img">${bars}
      <line class="wf__tgt" x1="0" x2="${W}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}"/>
      <text class="wf__tl" x="${(bw + 8).toFixed(1)}" y="${(ty - 5).toFixed(1)}" text-anchor="start">רווח ביעד ${escTxt(M(x.revenue * T))}</text></svg>` }),
  ]);
}
const num0 = (v) => Number(v) || 0;
const escTxt = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** עדכון חי של התוויות שליד המחוונים */
export function refreshSimLabels(sim) {
  const fmt = { remaining: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`, shift1: (v) => `${v}%`, shift2: (v) => `${v}%`, writeOff: (v) => `${v}%` };
  for (const r of document.querySelectorAll('input.pf-range')) {
    r.style.setProperty('--p', `${(((Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100).toFixed(1)}%`);
  }
  for (const o of document.querySelectorAll('[data-sim-out]')) {
    const k = o.dataset.simOut;
    if (fmt[k]) o.textContent = fmt[k](sim[k] || 0);
  }
}
