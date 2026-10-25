// ui-analysis.js — טאב הניתוח (מה שהיה "בקרה" + "תחקיר"): תכנון מול ביצוע, מסקנות לתמחור הבא,
// ופילוח לפי צוות / דרגה / אדם / שורה. כל טבלה ביחידה שנבחרה; פירוק הפער והתעריפים — רק ב-₪.

import { dealReview, aggregateByKind, fmtMoney, fmtPct, statusOf } from './model.js';
import {
  el, icon, measure, fmtU, fmtDelta, pctText, toneOf, meterCell, card, table, foldPanel, fact, emptyState, button, fmtDate,
} from './ui-kit.js';

const sign = (n) => (n > 0 ? 'neg' : '');   // פער חיובי = מעל התקציב = רע

export function renderAnalysisTab(root, { snap, unit = 'hours' }) {
  const d = snap.deal;
  const money = unit === 'money';
  const r = dealReview(snap);
  const U = (n) => fmtU(n, unit, d);
  const D = (n) => fmtDelta(n, unit, d);

  if (!r.actualHours) {
    root.append(el('section', { class: 'card' }, [emptyState('עוד אין ביצוע לנתח',
      'הניתוח משווה את הביצוע לתכנון. ברגע שיידווחו שעות (ייבוא דוח, הזנה ידנית או הקלדה בגיליון) הוא ייבנה מעצמו.')]));
    return;
  }

  // עסקה פתוחה: הביצוע עד היום אינו הסוף — המסקנות לתמחור נגזרות מהתחזית לסיום
  if (r.inProgress) {
    root.append(el('div', { class: 'notice' }, [icon('info'), el('span', { text: r.basisHours === null || r.basisHours === undefined
      ? `העסקה עדיין פעילה (התקדמות מדווחת ${fmtPct(r.progressPct / 100)}), והנתונים חלקיים. אין עדיין תחזית לסיום — המסקנות לתמחור יופיעו כשיוזנו אחוז התקדמות או תאריכי העסקה.`
      : `העסקה עדיין פעילה (התקדמות מדווחת ${fmtPct(r.progressPct / 100)}), והנתונים חלקיים. המסקנות לתמחור מחושבות לפי התחזית לסיום (${r.eacBasis}).` })]));
  }

  /* ---------- 1. תכנון מול ביצוע: הערכה → תקציב → בפועל → תחזית ---------- */
  const m = measure(snap, unit);
  const est = money ? r.estCost : r.estHours;
  const eac = money ? snap.eac : snap.eacHours;
  // כל שלב עם פס באורך יחסי — ההשוואה בין ארבע הנקודות נקראת בלי לקרוא מספרים
  const top = Math.max(est || 0, m.budget || 0, m.actual || 0, eac || 0) || 1;
  const stepCell = (label, value, note = '', noteCls = '', valueCls = '', amount = null, bar = '') => el('div', { class: 'step' }, [
    el('span', { class: 'step__label', text: label }),
    el('span', { class: `step__value num ${valueCls}`.trim(), text: value }),
    amount !== null ? el('span', { class: `step__bar${bar ? ` step__bar--${bar}` : ''}` }, [el('i', { style: `width:${Math.max(2, Math.min(100, (amount / top) * 100))}%` })]) : null,
    note ? el('span', { class: `step__note ${noteCls}`.trim(), text: note }) : null,
  ]);
  const hasEac = eac !== null && eac !== undefined;
  const finalCell = r.inProgress
    ? stepCell('תחזית לסיום', hasEac ? U(eac) : '—',
      hasEac ? `${D(eac - m.budget)} מול התקציב` : 'אין עדיין בסיס לתחזית',
      hasEac && eac > m.budget ? 'is-over' : '', hasEac && eac > m.budget * 1.05 ? 'is-over' : hasEac && eac > m.budget ? 'is-risk' : '',
      hasEac ? eac : null, hasEac && eac > m.budget ? (eac > m.budget * 1.05 ? 'over' : 'risk') : 'fc')
    : stepCell('פער מהתקציב', D(m.actual - m.budget), m.actual > m.budget ? 'חריגה' : 'בתוך התקציב',
      m.actual > m.budget ? 'is-over' : '', m.actual > m.budget ? 'is-over' : '');
  const summary = [el('div', { class: 'steps' }, [
    stepCell('הערכה', U(est), 'לפני מקדם החריגה', '', '', est, 'est'),
    stepCell('תקציב', U(m.budget), `הערכה + ${fmtPct(r.usedFactor)} מקדם`, '', '', m.budget, 'budget'),
    stepCell(r.inProgress ? 'בוצע עד היום' : 'בפועל', U(m.actual), `${pctText(m.util)} מהתקציב`, toneOf(m.status), '', m.actual, m.status === 'over' ? 'over' : 'actual'),
    finalCell,
  ])];
  if (money && snap.hasFee) {
    summary.push(el('div', { class: 'card__body card__body--split' }, [el('div', { class: 'facts' }, [
      fact(d.feeModel === 'capped' ? 'תקרת שכ"ט' : 'שכ"ט מוסכם', fmtMoney(snap.agreedFee)),
      fact('רווח גולמי עד היום', fmtMoney(snap.margin), snap.margin < 0 ? 'neg' : ''),
      fact('שיעור רווח', snap.marginPct === null ? '—' : fmtPct(snap.marginPct, 1), snap.margin < 0 ? 'neg' : ''),
      snap.eac !== null ? fact('פער צפוי בסיום', fmtDelta(snap.agreedFee - snap.eac, 'money'), snap.agreedFee - snap.eac < 0 ? 'neg' : '') : null,
    ])]));
  }
  root.append(card({ title: 'תכנון מול ביצוע', flush: true, sub: money ? 'בתעריפי התכנון — שעות × תעריף' : 'בשעות' }, summary));

  /* ---------- 2. מסקנות לתמחור הבא ---------- */
  const basis = r.inProgress && snap.eac !== null ? snap.eac : r.actualCost;
  const basisH = r.inProgress ? r.basisHours : r.actualHours;
  const conclusions = [
    fact('מקדם החריגה שהיה בשימוש', fmtPct(r.usedFactor)),
    fact(r.inProgress ? 'המקדם הנדרש (לפי התחזית)' : 'המקדם שהיה נדרש', r.requiredFactor === null ? '—' : pctText(r.requiredFactor),
      r.requiredFactor !== null && r.requiredFactor > r.usedFactor ? 'neg' : ''),
    fact('מקדם מוצע לעסקה דומה', r.suggestedFactor === null ? '—' : fmtPct(r.suggestedFactor)),
    money
      ? fact(r.inProgress ? 'שכ"ט שיכסה את התחזית' : 'שכ"ט שהיה מכסה את הביצוע', fmtMoney(basis))
      : fact(r.inProgress ? 'שעות צפויות בסיום' : 'שעות בפועל', basisH === null || basisH === undefined ? '—' : `${fmtU(basisH, 'hours')}`),
    money && r.hasFee ? fact('פער מול השכ"ט המוסכם', fmtDelta(r.feeGap, 'money'), r.feeGap > 0 ? 'neg' : '') : null,
  ];
  const insight = r.requiredFactor === null
    ? (r.inProgress ? 'אין עדיין תחזית לסיום — אין המלצת מקדם.' : 'אין שעות מוערכות להשוואה — הזן הערכות בגיליון כדי לקבל המלצת מקדם.')
    : r.requiredFactor > r.usedFactor
      ? `ההערכה נמוכה ב-${fmtPct(r.requiredFactor)} ${r.inProgress ? 'מהתחזית לסיום' : 'מהביצוע'}. בעסקה דומה כדאי מקדם ${fmtPct(r.suggestedFactor)} — או הערכת שעות גבוהה יותר מלכתחילה.`
      : 'התקציב כיסה את הביצוע. אפשר לשקול מקדם נמוך יותר בהצעה הבאה כדי להיות תחרותי יותר.';
  root.append(card({
    title: 'מסקנות לתמחור הבא',
    tools: [
      button('עסקה חדשה לפי הביצוע', { action: 'clone-from-actual', iconName: 'copy', title: 'ההערכות בעסקה החדשה = השעות שבוצעו כאן' }),
      button('ייצוא', { action: 'export-review', iconName: 'download', title: 'ייצוא הניתוח לאקסל' }),
    ],
  }, [
    el('div', { class: 'facts facts--lg' }, conclusions),
    el('div', { class: `insight${r.requiredFactor !== null && r.requiredFactor > r.usedFactor ? ' insight--warn' : ''}` }, [icon('trending'), el('span', { text: insight })]),
  ]));

  /* ---------- 3. ₪ בלבד: ממה נובע הפער ---------- */
  if (money) {
    const totalEffect = Math.abs(r.volumeEffect) + Math.abs(r.mixEffect);
    const share = (v) => (totalEffect > 0 ? Math.round((Math.abs(v) / totalEffect) * 100) : 0);
    root.append(card({ title: 'ממה נובע הפער מהתקציב', flush: true, sub: 'הפער בכסף מפוצל לשניים: כמות השעות, ותמהיל הדרגות (שעות יקרות או זולות מהמתוכנן)' }, [
      el('div', { class: 'duo' }, [
        el('div', { class: 'duo__cell' }, [
          el('span', { class: 'duo__label', text: `${r.volumeEffect >= 0 ? 'עוד שעות' : 'פחות שעות'} · ${share(r.volumeEffect)}% מהפער` }),
          el('span', { class: `duo__value num ${sign(r.volumeEffect)}`.trim(), text: fmtDelta(r.volumeEffect, 'money') }),
          el('span', { class: 'duo__note', text: 'הפרש השעות מול התקציב, בתעריף הממוצע המתוכנן' }),
        ]),
        el('div', { class: 'duo__cell' }, [
          el('span', { class: 'duo__label', text: `${r.mixEffect >= 0 ? 'תמהיל יקר יותר' : 'תמהיל זול יותר'} · ${share(r.mixEffect)}% מהפער` }),
          el('span', { class: `duo__value num ${sign(r.mixEffect)}`.trim(), text: fmtDelta(r.mixEffect, 'money') }),
          el('span', { class: 'duo__note', text: `בלנדד מתוכנן ${fmtMoney(r.blendedPlanned)} · בפועל ${fmtMoney(r.blendedActual)}` }),
        ]),
      ]),
    ]));

    /* ---------- 4. ₪ בלבד: תעריפים ---------- */
    root.append(ratesCard(snap));
  }

  /* ---------- 5. לפי צוות ---------- */
  const reqByTeam = new Map(r.teams.map((t) => [t.id, t.requiredFactor]));
  root.append(foldPanel(`an-teams:${d.id}`, { title: 'לפי צוות', meta: el('span', { class: 'fold__meta', text: `${snap.teams.length} צוותים` }) }, [
    table(['צוות', 'הוערך', 'תוקצב', 'בפועל', 'פער', 'ניצול', { text: 'מקדם שנדרש', title: 'בפועל ÷ הערכה − 1: כמה היה צריך להוסיף להערכה' }],
      snap.teams.map((t) => {
        const tm = measure(t, unit);
        const delta = tm.actual - tm.budget;
        return el('tr', {}, [
          el('td', {}, [el('span', { class: 'strong', text: t.name }), t.kind === 'dd' && !String(t.name).includes('נאותות') ? el('span', { class: 'sub', text: 'בדיקת נאותות' }) : null]),
          el('td', { class: 'num', text: U(tm.est) }),
          el('td', { class: 'num', text: U(tm.budget) }),
          el('td', { class: 'num c-strong', text: U(tm.actual) }),
          el('td', { class: `num ${sign(delta)}`.trim(), text: D(delta) }),
          el('td', {}, [meterCell(tm.util, tm.status)]),
          el('td', { class: 'num', text: reqByTeam.get(t.id) === null || reqByTeam.get(t.id) === undefined ? '—' : pctText(reqByTeam.get(t.id)) }),
        ]);
      }), { cls: 'tbl--compact' }),
  ]));

  /* ---------- 6. לפי דרגה — תמהיל מתוכנן מול בפועל ---------- */
  if (r.byRole.length) {
    root.append(foldPanel(`an-roles:${d.id}`, { title: 'לפי דרגה', open: false, meta: el('span', { class: 'fold__meta', text: 'תמהיל מתוכנן מול בפועל' }) }, [
      money
        ? table(['דרגה', 'תעריף', 'תוקצב', 'בפועל', 'פער', 'ניצול'], r.byRole.map((x) => el('tr', {}, [
          el('td', { text: x.name + (x.junior ? ' (ג׳וניור)' : '') }),
          el('td', { class: 'num', text: fmtMoney(x.rate) }),
          el('td', { class: 'num', text: U(x.budgetCost) }),
          el('td', { class: 'num c-strong', text: U(x.actualCost) }),
          el('td', { class: `num ${sign(x.deltaCost)}`.trim(), text: D(x.deltaCost) }),
          el('td', {}, [meterCell(x.budgetCost > 0 ? x.actualCost / x.budgetCost : 0, statusOf(x.budgetCost > 0 ? x.actualCost / x.budgetCost : 0))]),
        ])), { cls: 'tbl--compact' })
        : table(['דרגה', 'תוקצב', '% מהתכנון', 'בפועל', '% מהביצוע', 'פער', 'ניצול'], r.byRole.map((x) => el('tr', {}, [
          el('td', { text: x.name + (x.junior ? ' (ג׳וניור)' : '') }),
          el('td', { class: 'num', text: U(x.budgetHours) }),
          el('td', { class: 'num', text: fmtPct(x.plannedShare) }),
          el('td', { class: 'num c-strong', text: U(x.actualHours) }),
          el('td', { class: `num ${x.actualShare > x.plannedShare + 0.02 && !x.junior ? 'is-risk' : ''}`.trim(), text: fmtPct(x.actualShare) }),
          el('td', { class: `num ${sign(x.deltaHours)}`.trim(), text: D(x.deltaHours) }),
          el('td', {}, [meterCell(x.util, statusOf(x.util))]),
        ])), { cls: 'tbl--compact' }),
    ]));
  }

  /* ---------- 7. לפי אדם (חוצה צוותים) ---------- */
  if (r.people.length) {
    root.append(foldPanel(`an-people:${d.id}`, { title: 'לפי אדם', open: false, meta: el('span', { class: 'fold__meta', text: `${r.people.length} אנשים` }) }, [
      table(['עורך דין', 'צוותים', 'תוקצב', 'בפועל', 'פער', { text: '% מהצוות', title: 'חלקו בשעות שבוצעו בצוות. אדם בכמה צוותים — שיעור לכל צוות' }, 'ניצול'],
        r.people.map((x) => {
          const util = money ? (x.budgetCost > 0 ? x.actualCost / x.budgetCost : 0) : x.util;
          const delta = money ? x.deltaCost : x.deltaHours;
          return el('tr', {}, [
            el('td', { class: 'strong', text: x.name }),
            el('td', { class: 'muted', text: x.teams.join(' · ') }),
            el('td', { class: 'num', text: U(money ? x.budgetCost : x.budgetHours) }),
            el('td', { class: 'num c-strong', text: U(money ? x.actualCost : x.actualHours) }),
            el('td', { class: `num ${sign(delta)}`.trim(), text: D(delta) }),
            el('td', { class: 'num', text: x.teamShares.length ? x.teamShares.map((t) => fmtPct(t.share)).join(' · ') : '—', title: x.teamShares.map((t) => `${t.team} ${fmtPct(t.share)}`).join(' · ') }),
            el('td', {}, [meterCell(util, statusOf(util))]),
          ]);
        }), { cls: 'tbl--compact', more: 10, noun: 'אנשים' }),
    ]));
  }

  /* ---------- 8. מוקדי סטייה — שורות התקציב מהסטייה הגדולה לקטנה ---------- */
  const hot = [...r.hotspots].sort((a, b) => (money ? Math.abs(b.deltaCost) - Math.abs(a.deltaCost) : Math.abs(b.deltaHours) - Math.abs(a.deltaHours)));
  if (hot.length) {
    root.append(foldPanel(`an-hot:${d.id}`, { title: 'מוקדי סטייה', open: false, meta: el('span', { class: 'fold__meta', text: 'שורות התקציב לפי גודל הפער' }) }, [
      table(['צוות', 'דרגה · אדם', 'תוקצב', 'בפועל', 'פער', 'ניצול', { text: 'מקדם שנדרש', title: 'בפועל ÷ הערכה − 1' }], hot.map((l) => {
        const delta = money ? l.deltaCost : l.deltaHours;
        return el('tr', {}, [
          el('td', { text: l.teamName }),
          el('td', { text: l.person ? `${l.roleName} · ${l.person}` : l.roleName }),
          el('td', { class: 'num', text: U(money ? l.budgetCost : l.budgetHours) }),
          el('td', { class: 'num c-strong', text: U(money ? l.actualCost : l.actualHours) }),
          el('td', { class: `num ${sign(delta)}`.trim(), text: D(delta) }),
          el('td', {}, [meterCell(l.util, statusOf(l.util))]),
          el('td', { class: 'num', text: l.vsEstimate === null ? '—' : pctText(l.vsEstimate) }),
        ]);
      }), { cls: 'tbl--compact', more: 8, noun: 'שורות' }),
    ]));
  }

  /* ---------- 9. בדיקת נאותות מול יתר הצוותים ---------- */
  const kinds = aggregateByKind(snap);
  if (kinds.hasDD) {
    const total = m.budget;
    const kindRow = (label, agg) => {
      const km = measure(agg, unit);
      return el('tr', {}, [
        el('td', {}, [el('span', { class: 'strong', text: label }), el('span', { class: 'sub', text: `${agg.count} צוותים` })]),
        el('td', { class: 'num', text: U(km.budget) }),
        el('td', { class: 'num c-strong', text: U(km.actual) }),
        el('td', { class: `num ${km.remaining < 0 ? 'neg' : ''}`.trim(), text: U(km.remaining) }),
        el('td', {}, [meterCell(km.util, km.status)]),
        el('td', { class: 'num', text: pctText(total > 0 ? km.budget / total : 0) }),
        money ? el('td', { class: 'num', text: fmtMoney(agg.blendedRate) }) : null,
      ]);
    };
    root.append(foldPanel(`an-dd:${d.id}`, { title: 'בדיקת נאותות מול יתר הצוותים', open: false }, [
      table(['', 'תקציב', 'בפועל', 'יתרה', 'ניצול', 'חלק מהעסקה', money ? 'בלנדד ללא ג׳וניור' : null].filter((h) => h !== null),
        [kindRow('בדיקת נאותות', kinds.dd), kindRow('יתר הצוותים', kinds.regular)], { cls: 'tbl--compact' }),
    ]));
  }

  /* ---------- 10. ₪ בלבד: זחילה מול תקציב הבסיס ---------- */
  if (money && snap.baselineDelta) {
    const b = snap.baselineDelta;
    root.append(card({ title: 'מול תקציב הבסיס', sub: `נקבע ב-${fmtDate(new Date(b.capturedAt).toISOString().slice(0, 10))}` }, [el('div', { class: 'facts' }, [
      fact('תקציב הבסיס', fmtMoney(b.base)),
      fact('התקציב הנוכחי', fmtMoney(snap.budgetCost)),
      fact('שינוי', `${fmtDelta(b.delta, 'money')}${b.pct === null ? '' : ` (${fmtPct(b.pct, 1)})`}`, b.delta > 0 ? 'neg' : ''),
    ])]));
  }
}

/** תעריפים: בלנדד מתוכנן, בפועל, שהתקבל, ואחרי תקרה — ותעריפים אפקטיביים לכל דרגה כשהתקציב עובר את התקרה */
function ratesCard(snap) {
  const r = snap.realized;
  const cap = snap.capBudget;
  const cols = ['תעריף', 'מתוכנן', { text: 'בפועל', title: 'לפי תמהיל השעות שבוצעו, בתעריפי התעריפון' }];
  if (r?.applies) cols.push({ text: 'התקבל בפועל', title: 'השכ"ט שייגבה חלקי השעות שדווחו — כל שעה נוספת מדללת אותו' });
  if (cap.applies) cols.push({ text: 'אחרי תקרה (מתוכנן)', title: 'כשהתקציב עובר את התקרה, כל תעריף נגבה לפי חלקו בתקרה' });
  const row = (label, hint, planned, actual, realized, afterCap) => el('tr', {}, [
    el('td', {}, [el('span', { class: 'strong', text: label }), el('span', { class: 'sub', text: hint })]),
    el('td', { class: 'num', text: fmtMoney(planned) }),
    el('td', { class: 'num', text: fmtMoney(actual) }),
    r?.applies ? el('td', { class: `num c-strong ${realized < planned ? 'neg' : ''}`.trim(), text: fmtMoney(realized) }) : null,
    cap.applies ? el('td', { class: 'num', text: fmtMoney(afterCap) }) : null,
  ]);
  const body = [
    table(cols, [
      row('בלנדד ללא ג׳וניור', 'עבודת הג׳וניורים כלולה במחיר', snap.blendedRate, snap.blendedActual, r?.blendedSenior, snap.effectiveRates.blended),
      row('ממוצע כולל', 'כל השעות', snap.blendedAll, snap.effectiveRate, r?.blendedAll, snap.effectiveRates.blendedAll),
    ], { cls: 'tbl--compact' }),
  ];
  if (cap.applies) {
    const roles = snap.effectiveRates.roles.filter((x) => x.rate > 0);
    body.push(el('div', { class: 'card__note', text: `התקציב ${fmtMoney(cap.cost)} עובר את התקרה ${fmtMoney(cap.collected)} ב-${fmtMoney(cap.discount)} — כל תעריף נגבה בפועל לפי ${fmtPct(cap.factor, 1)} מערכו:` }));
    body.push(table(['דרגה', 'תעריף', 'אפקטיבי', 'הפרש'], roles.map((x) => el('tr', {}, [
      el('td', { text: x.name + (x.junior ? ' (ג׳וניור)' : '') }),
      el('td', { class: 'num', text: fmtMoney(x.rate) }),
      el('td', { class: 'num c-strong', text: fmtMoney(x.effective) }),
      el('td', { class: 'num neg', text: fmtDelta(x.effective - x.rate, 'money') }),
    ])), { cls: 'tbl--compact' }));
  }
  return card({
    title: 'תעריפים', flush: true,
    sub: r?.applies ? `התקבל בפועל = השכ"ט שייגבה (${fmtMoney(r.collected)}) חלקי השעות שדווחו` : 'תעריפי התכנון מול התמהיל שבוצע בפועל',
  }, body);
}
