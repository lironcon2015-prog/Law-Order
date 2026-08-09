// importer.js — ייבוא מקבצים: (א) חשבונות/שעות לטבלת הביצוע, (ב) גיליון תקציב קיים.
// המיפוי מנוחש אוטומטית ומוצג למשתמש לאישור לפני הכתיבה.

import { num, uid, round2 } from './model.js';

/* ============================================================
   ייבוא רישומי ביצוע (חשבונות / שעות / הוצאות)
   ============================================================ */

/** שדות היעד + מילות מפתח לזיהוי עמודות (עברית + אנגלית) */
export const TARGET_FIELDS = [
  { id: 'date',        label: 'תאריך ביצוע',  keys: ['תאריך ביצוע', 'תאריך עבודה', 'תאריך', 'date', 'יום'] },
  { id: 'billDate',    label: 'תאריך חיוב',   keys: ['תאריך חיוב', 'חודש חיוב', 'תקופת חיוב', 'תאריך חשבונית', 'billing date', 'bill date', 'invoice date', 'period'] },
  { id: 'description', label: 'תיאור',        keys: ['תיאור', 'פירוט', 'נושא', 'description', 'details', 'עבודה', 'משימה', 'narrative'] },
  { id: 'teamName',    label: 'צוות',         keys: ['צוות', 'team', 'מחלקה', 'תחום', 'practice', 'department'] },
  { id: 'personName',  label: 'עורך דין / עובד', keys: ['שם עורך דין', 'עורך דין', 'עו"ד מטפל', 'עובד', 'שם עובד', 'מבצע', 'ביצע', 'איש צוות', 'timekeeper', 'lawyer', 'attorney', 'employee', 'user', 'שם'] },
  { id: 'roleName',    label: 'דרגה',         keys: ['דרגה', 'תפקיד', 'role', 'level', 'seniority', 'רמה'] },
  { id: 'hours',       label: 'שעות',         keys: ['שעות', 'hours', 'זמן', 'units', 'כמות שעות'] },
  { id: 'rate',        label: 'תעריף',        keys: ['תעריף', 'rate', 'מחיר לשעה', 'שכר שעתי'] },
  { id: 'amount',      label: 'סכום',         keys: ['סכום', 'סה"כ', 'סך הכל', 'עלות', 'amount', 'total', 'value', 'לתשלום', 'חיוב'] },
  { id: 'supplier',    label: 'ספק / גורם',   keys: ['ספק', 'גורם', 'משרד', 'supplier', 'vendor', 'שם ספק'] },
  { id: 'docNumber',   label: 'מס\' מסמך',    keys: ['מספר חשבונית', 'מס\' חשבונית', 'אסמכתא', 'invoice', 'invoice no', 'doc', 'מספר'] },
];

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/["'׳״]/g, '').replace(/\s+/g, ' ');

/** מאתר את שורת הכותרות: השורה עם הכי הרבה התאמות למילות מפתח */
export function detectHeaderRow(rows, limit = 12) {
  let best = { index: -1, score: 0 };
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const cells = rows[i] || [];
    let score = 0;
    for (const cell of cells) {
      const v = norm(cell);
      if (!v) continue;
      for (const f of TARGET_FIELDS) if (f.keys.some((k) => v === norm(k) || v.includes(norm(k)))) { score += 1; break; }
    }
    if (score > best.score) best = { index: i, score };
  }
  return best.score >= 2 ? best.index : (rows.length ? 0 : -1);
}

/** מנחש מיפוי עמודה→שדה. מחזיר { fieldId: columnIndex } */
export function guessMapping(headerCells) {
  const mapping = {};
  const used = new Set();
  for (const f of TARGET_FIELDS) {
    let bestIdx = -1, bestLen = 0;
    (headerCells || []).forEach((cell, idx) => {
      if (used.has(idx)) return;
      const v = norm(cell);
      if (!v) return;
      for (const k of f.keys) {
        const nk = norm(k);
        if (v === nk || v.includes(nk)) {
          if (nk.length > bestLen) { bestLen = nk.length; bestIdx = idx; }
        }
      }
    });
    if (bestIdx >= 0) { mapping[f.id] = bestIdx; used.add(bestIdx); }
  }
  return mapping;
}

/* ---------- זהות של אדם ---------- */

/** תארים שמופיעים לפני השם ואינם חלק ממנו (אחרי norm הגרשיים כבר הוסרו) */
const TITLE_RE = /^(עוד|עוהד|עורך דין|עורכת דין|דר|פרופ|מר|גב|adv|advocate|mr|mrs|ms|dr|prof)\.?\s+/;

/**
 * מפתח זהות של אדם — כדי ש"עו"ד דנה כהן", "דנה כהן" ו-"כהן, דנה" יהיו אותו אדם.
 * מסיר תארים, הופך "משפחה, פרטי" ל-"פרטי משפחה", ומנקה פיסוק.
 */
export function personKey(name) {
  let s = norm(name);
  if (!s) return '';
  for (let i = 0; i < 2 && TITLE_RE.test(s); i++) s = s.replace(TITLE_RE, '');
  if (s.includes(',')) s = s.split(',').map((t) => t.trim()).filter(Boolean).reverse().join(' ');
  return s.replace(/[.,;:|]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** נרמול שם אדם להשוואה בין קבצים */
export const normPerson = (s) => personKey(s);

/** שם לתצוגה — בלי תואר ובלי היפוך "משפחה, פרטי" */
export function personDisplay(name) {
  let s = String(name ?? '').trim().replace(/\s+/g, ' ');
  const t = new RegExp(TITLE_RE.source.replace('עוד', 'עו["\'׳״]?ד').replace('עוהד', 'עוה["\'׳״]?ד'), 'i');
  for (let i = 0; i < 2 && t.test(s); i++) s = s.replace(t, '');
  if (s.includes(',')) s = s.split(',').map((x) => x.trim()).filter(Boolean).reverse().join(' ');
  return s.trim();
}

const HEADER_WORDS = new Set(TARGET_FIELDS.flatMap((f) => [norm(f.label), ...f.keys.map(norm)]));

/**
 * מסנן ערכים שאינם שם של אדם: כותרת שחזרה בעמוד הבא, שורת "סה"כ", מספר או תאריך.
 * בלי זה כל עמוד נוסף בדוח מייצר "אדם" מדומה בשם "שם עורך דין".
 */
export function looksLikePerson(name) {
  const s = norm(name);
  if (!s || s.length < 2) return false;
  if (HEADER_WORDS.has(s)) return false;
  if (/^(סהכ|סה כ|סיכום|total|subtotal|עמוד|page|המשך)\b/.test(s)) return false;
  if (/^[\d\s./,+-]+$/.test(s)) return false;
  return true;
}

const tokens = (key) => key.split(' ').filter(Boolean);

/**
 * התאמה מקורבת בין שם בדוח לשם מוכר: זהות מלאה, אותן מילים בסדר אחר,
 * או ראשי תיבות ("מ. אברהמי" ↔ "משה אברהמי").
 * @returns {{key:string, exact:boolean}|null}
 */
export function fuzzyPersonMatch(key, candidateKeys) {
  if (!key) return null;
  const list = [...new Set(candidateKeys || [])].filter(Boolean);
  if (list.includes(key)) return { key, exact: true };
  const a = tokens(key);
  if (!a.length) return null;
  const setEq = (x, y) => x.length === y.length && [...x].sort().join(' ') === [...y].sort().join(' ');
  const initialsEq = (x, y) => x.length === y.length
    && x.every((t, i) => t === y[i] || ((t.length === 1 || y[i].length === 1) && t[0] === y[i][0]));

  for (const cand of list) {
    const b = tokens(cand);
    if (setEq(a, b)) return { key: cand, exact: false };
  }
  for (const cand of list) {
    const b = tokens(cand);
    if (initialsEq(a, b)) return { key: cand, exact: false };
    if (initialsEq([...a].reverse(), b)) return { key: cand, exact: false };
  }
  return null;
}

/**
 * מוציא את רשימת האנשים (עורכי דין / עובדים) שמופיעים בקובץ, עם היקף העבודה שלהם.
 * שמות שנכתבו בווריאציות שונות מתאחדים לרשומה אחת.
 * @returns {Array<{name, key, legacyKey, variants, rows, hours, amount, teamHint, roleHint}>}
 */
export function collectPeople(rows, mapping) {
  if (mapping.personName === undefined) return [];
  const map = new Map();
  for (const row of rows || []) {
    const raw = row?.[mapping.personName];
    const name = String(raw ?? '').trim();
    if (!name || !looksLikePerson(name)) continue;
    const key = personKey(name);
    if (!key) continue;
    const display = personDisplay(name);
    const cur = map.get(key) || { name: display, key, legacyKey: norm(name), variants: [], rows: 0, hours: 0, amount: 0, teamHint: '', roleHint: '' };
    if (display.length > cur.name.length) cur.name = display;
    if (!cur.variants.includes(name)) cur.variants.push(name);
    cur.rows += 1;
    cur.hours += num(mapping.hours === undefined ? 0 : row[mapping.hours]);
    cur.amount += num(mapping.amount === undefined ? 0 : row[mapping.amount]);
    if (!cur.teamHint && mapping.teamName !== undefined) cur.teamHint = String(row[mapping.teamName] ?? '').trim();
    if (!cur.roleHint && mapping.roleName !== undefined) cur.roleHint = String(row[mapping.roleName] ?? '').trim();
    map.set(key, cur);
  }
  return [...map.values()]
    .map((p) => ({ ...p, hours: round2(p.hours), amount: round2(p.amount) }))
    .sort((a, b) => b.hours - a.hours || b.rows - a.rows);
}

/**
 * גוף הגיליון: כל מה שאחרי שורת הכותרות, בלי שורות ריקות ובלי **כותרות שחוזרות**
 * בראש כל עמוד (בדוח PDF רב-עמודי הן חוזרות כשורת נתונים).
 */
export function sheetBody(rows, headerRow) {
  const header = rows[headerRow] || [];
  const sig = (r) => (r || []).map((c) => norm(c)).join('|');
  const headerSig = sig(header);
  return (rows || []).slice(headerRow + 1).filter((r) => {
    if (!r || !r.some((c) => c !== null && c !== undefined && c !== '')) return false;
    return sig(r) !== headerSig;
  });
}

/** ממיר ערך תא לתאריך ISO (yyyy-mm-dd) — תומך בפורמט ישראלי dd/mm/yyyy */
export function toISODate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = String(2000 + Number(y));
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

/**
 * ממיר שורות גולמיות לרישומי ביצוע לפי מיפוי.
 * @param opts { dealId, teams, roles, defaults:{kind,status,vatIncluded,supplier} }
 * @returns { entries, skipped, warnings }
 */
export function rowsToEntries(rows, mapping, opts) {
  const { dealId, teams = [], roles = [], defaults = {}, personTeams = {} } = opts;
  const teamByName = new Map(teams.map((t) => [norm(t.name), t.id]));
  const roleByName = new Map(roles.map((r) => [norm(r.name), r.id]));
  const entries = [];
  const warnings = new Set();
  let skipped = 0;

  const pick = (row, field) => (mapping[field] === undefined ? null : row[mapping[field]]);

  for (const row of rows) {
    if (!row || !row.length) { continue; }
    const amountRaw = pick(row, 'amount');
    const hours = num(pick(row, 'hours'));
    const rate = num(pick(row, 'rate'));
    const amount = amountRaw === null || amountRaw === '' ? round2(hours * rate) : num(amountRaw);
    const description = String(pick(row, 'description') ?? '').trim();

    if (!amount && !hours) { skipped++; continue; }

    const teamRaw = pick(row, 'teamName');
    const roleRaw = pick(row, 'roleName');
    const person = String(pick(row, 'personName') ?? '').trim();
    // עדיפות: הצוות שהמשתמש שייך לאיש הזה → הצוות שכתוב בשורה → ברירת המחדל
    const mappedTeam = person ? (personTeams[normPerson(person)] || '') : '';
    const teamFromRow = teamRaw ? (teamByName.get(norm(teamRaw)) || '') : '';
    const teamId = mappedTeam || teamFromRow || defaults.teamId || '';
    const roleId = roleRaw ? (roleByName.get(norm(roleRaw)) || '') : (defaults.roleId || '');
    if (teamRaw && !teamFromRow && !mappedTeam) warnings.add(`הצוות "${teamRaw}" לא קיים בעסקה — הרישום ייכנס ללא שיוך.`);
    if (roleRaw && !roleId) warnings.add(`הדרגה "${roleRaw}" לא קיימת בתעריפון — הרישום ייכנס ללא דרגה.`);

    entries.push({
      id: uid('ent'),
      dealId,
      teamId,
      roleId,
      person,
      kind: defaults.kind || (hours > 0 ? 'hours' : 'invoice'),
      date: toISODate(pick(row, 'date')) || new Date().toISOString().slice(0, 10),
      description,
      supplier: String(pick(row, 'supplier') ?? defaults.supplier ?? '').trim(),
      docNumber: String(pick(row, 'docNumber') ?? '').trim(),
      hours,
      rate: rate || (hours > 0 ? round2(amount / hours) : 0),
      amount,
      vatIncluded: !!defaults.vatIncluded,
      status: defaults.status || 'approved',
      source: 'import',
      fileId: defaults.fileId || '',
      fileName: defaults.fileName || '',
    });
  }
  return { entries, skipped, warnings: [...warnings] };
}

/**
 * ממיר שורות דוח שעות לעדכוני ביצוע (מעקב ידני).
 * @param opts { dealId, resolve(person, roleName) → { teamId, lineId, roleId } | null,
 *               cumulative: boolean, currentByLine: Map<lineId, hours>, fileName, batchId, defaultDate }
 */
export function rowsToProgress(rows, mapping, opts) {
  const {
    dealId, resolve, cumulative = false, currentByLine = new Map(),
    fileName = '', batchId = '', defaultDate = '', existing = [],
  } = opts;
  const pick = (row, field) => (mapping[field] === undefined ? null : row[mapping[field]]);
  const out = [];
  const unmatched = new Set();
  const totals = new Map();   // lineId → שעות בקובץ (למצב מצטבר)
  let skipped = 0;

  // מה שכבר דווח, לפי שורה+תאריך+אדם — לזיהוי חפיפה בין דוחות
  const reported = new Map();
  for (const p of existing) {
    const k = progressKey(p);
    const cur = reported.get(k) || { hours: 0, count: 0 };
    cur.hours = round2(cur.hours + num(p.hours));
    cur.count += 1;
    reported.set(k, cur);
  }

  for (const row of rows || []) {
    if (!row || !row.length) continue;
    const hours = num(pick(row, 'hours'));
    if (!hours) { skipped++; continue; }
    const person = String(pick(row, 'personName') ?? '').trim();
    const roleName = String(pick(row, 'roleName') ?? '').trim();
    const target = resolve ? resolve(person, roleName) : null;
    if (!target) unmatched.add(person || roleName || '(ללא שם)');
    const billPeriod = billPeriodOf(pick(row, 'billDate'));
    const date = toISODate(pick(row, 'date')) || (billPeriod ? `${billPeriod}-01` : '') || defaultDate || new Date().toISOString().slice(0, 10);

    if (cumulative) {
      const key = target?.lineId || `~${person}`;
      const cur = totals.get(key) || { hours: 0, date, target, person };
      cur.hours += hours;
      if (date > cur.date) cur.date = date;
      totals.set(key, cur);
      continue;
    }
    const rec = {
      dealId, teamId: target?.teamId || '', lineId: target?.lineId || '', roleId: target?.roleId || '',
      person, date, hours, source: 'import', fileName, batchId, billPeriod,
      // תקופת החיוב היא גם התקופה שהרשומה "מכסה" — כך דיווח ידני באותו חודש מוחלף
      periodFrom: billPeriod ? `${billPeriod}-01` : date,
      periodTo: billPeriod ? monthEnd(billPeriod) : date,
      note: roleName && !target?.lineId ? `דרגה בדוח: ${roleName}` : '',
    };
    // חפיפה: אותה שורת תקציב, אותו תאריך ואותו אדם כבר דווחו בעבר
    const prev = reported.get(progressKey(rec));
    rec.duplicate = !!prev;
    rec.existingHours = prev ? prev.hours : 0;
    out.push(rec);
  }

  // דוח מצטבר: רושמים רק את ההפרש מול מה שכבר דווח
  if (cumulative) {
    for (const [key, rec] of totals) {
      const already = num(currentByLine.get(rec.target?.lineId) || 0);
      const delta = round2(rec.hours - already);
      if (!delta) { skipped++; continue; }
      out.push({
        dealId, teamId: rec.target?.teamId || '', lineId: rec.target?.lineId || '', roleId: rec.target?.roleId || '',
        person: rec.person, date: rec.date, hours: delta, source: 'import', fileName, batchId,
        note: `דוח מצטבר: ${round2(rec.hours)} שעות · דווח קודם ${already}`,
      });
      void key;
    }
  }
  const periods = [...new Set(out.map((r) => r.billPeriod).filter(Boolean))].sort();
  return {
    records: out, skipped, unmatched: [...unmatched], billPeriods: periods,
    duplicates: out.filter((r) => r.duplicate).length,
    dateRange: out.length
      ? { from: out.reduce((m, r) => (r.date < m ? r.date : m), out[0].date), to: out.reduce((m, r) => (r.date > m ? r.date : m), out[0].date) }
      : null,
  };
}

/**
 * מפתח זהות של דיווח. כשיש **תקופת חיוב** היא הזהות (כך שדוחות שונים לאותה תקופת
 * חיוב לא ייספרו פעמיים גם אם תאריכי הביצוע שונים); אחרת — תאריך הביצוע.
 */
export const progressKey = (p) => `${p.lineId || ''}|${p.billPeriod || p.date || ''}|${normPerson(p.person)}`;

/** תקופת חיוב מנורמלת: תאריך מלא → חודש (YYYY-MM), כי חיוב הוא חודשי בדרך כלל */
export const billPeriodOf = (v) => {
  const iso = toISODate(v);
  return iso ? iso.slice(0, 7) : '';
};

/** היום האחרון בחודש YYYY-MM */
function monthEnd(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** מסמן רישומים שכנראה כבר קיימים (אותו תאריך+סכום+מסמך) */
export function markDuplicates(candidates, existing) {
  const key = (e) => `${e.date}|${round2(num(e.amount))}|${norm(e.docNumber)}|${norm(e.description).slice(0, 40)}`;
  const seen = new Set((existing || []).map(key));
  return candidates.map((e) => ({ entry: e, duplicate: seen.has(key(e)) }));
}

/* ============================================================
   ייבוא גיליון תקציב (במבנה של הגיליון המקורי)
   ============================================================ */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * מזהה מבנה תקציב בגיליון: טבלת תעריפים, מקדם חריגה, וצוותים עם שורות לפי דרגה.
 * המזהה מסתמך על שמות הדרגות — שורה עם שם דרגה ומספר יחיד = תעריף,
 * שורה עם שם דרגה ושני מספרים ומעלה = שורת תקציב.
 * @returns { roles, overrunFactor, teams:[{name, lines:[{roleName, estHours, budgetHours, cost}]}], notes }
 */
export function parseBudgetSheet(rows, knownRoleNames = []) {
  const notes = [];
  const roleNames = new Set(knownRoleNames.map(norm));
  const rates = new Map();       // roleName(norm) → rate
  const rowRoles = [];           // {rowIdx, roleName, numbers:[{col,value}]}
  const textCells = [];          // {rowIdx, col, text}

  // מעבר ראשון — איסוף
  rows.forEach((row, r) => {
    (row || []).forEach((cell, c) => {
      if (typeof cell === 'string' && cell.trim()) textCells.push({ r, c, text: cell.trim() });
    });
  });

  // מקדם חריגה: תא טקסט שמכיל "מקדם" → המספר הקרוב ביותר באותה שורה/מתחת
  let overrunFactor = null;
  for (const t of textCells) {
    if (/מקדם|חריג|buffer|contingency/i.test(t.text)) {
      const cand = findNearbyNumber(rows, t.r, t.c);
      if (cand !== null && cand > 0 && cand < 2) { overrunFactor = cand; break; }
    }
  }

  // זיהוי שמות דרגות: אם לא סופקו, נגזרים משמות שחוזרים בעמודה אחת לפחות 2 פעמים
  if (!roleNames.size) {
    const freq = new Map();
    for (const t of textCells) {
      const k = norm(t.text);
      if (k.length > 12) continue;
      freq.set(k, (freq.get(k) || 0) + 1);
    }
    for (const [k, n] of freq) if (n >= 2) roleNames.add(k);
  }

  // איתור כל תאי הדרגות, מקובצים לפי עמודה.
  // העמודה עם הכי הרבה מופעים = עמודת שורות התקציב; שאר העמודות = טבלת תעריפים.
  const roleCells = [];
  rows.forEach((row, r) => {
    (row || []).forEach((cell, c) => {
      if (typeof cell === 'string' && roleNames.has(norm(cell))) roleCells.push({ r, c, name: cell.trim() });
    });
  });
  if (!roleCells.length) {
    return { roles: [], overrunFactor, teams: [], notes: ['לא זוהו שמות דרגה בגיליון (מתמחה / עו"ד / שותף).'] };
  }
  const perCol = new Map();
  for (const rc of roleCells) perCol.set(rc.c, (perCol.get(rc.c) || 0) + 1);
  const budgetCol = [...perCol.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];

  // תעריפים — מהעמודות שאינן עמודת התקציב (המספר הצמוד לשם הדרגה)
  const rateCols = new Set();
  for (const rc of roleCells) {
    if (rc.c === budgetCol) continue;
    rateCols.add(rc.c);
    const v = findNearbyNumber(rows, rc.r, rc.c);
    if (v !== null && !rates.has(norm(rc.name))) rates.set(norm(rc.name), v);
  }
  // גבול ימני לעמודות המספרים של התקציב — כדי לא לשאוב מספרים מטבלת התעריפים
  const numberLimit = rateCols.size ? Math.min(...rateCols) : Infinity;

  const candByRow = new Map();
  for (const rc of roleCells) {
    if (rc.c !== budgetCol) continue;
    const numbers = [];
    (rows[rc.r] || []).forEach((cell, c) => {
      if (isNum(cell) && c !== rc.c && c < numberLimit) numbers.push({ col: c, value: cell });
    });
    if (numbers.length) candByRow.set(rc.r, { r: rc.r, labelCol: rc.c, roleName: rc.name, numbers });
  }

  // צוותים: כותרת = תא טקסט בעמודת התקציב (או משמאלה) שאינו כותרת עמודה ואינו שם דרגה
  const headerNoise = /מספר שעות|סך הכל|סה"כ|תקציב|שעות|תעריפ|מקדם|בלנדד|hours|total|rate/i;
  const ratesHeader = /תעריפ|מחירון|rate card|rates/i;
  const teams = [];
  let current = null;
  let inRatesBlock = false;

  rows.forEach((row, r) => {
    const cand = candByRow.get(r);
    if (cand) {
      // טבלת תעריפים שיושבת באותה עמודה כמו שורות התקציב: מזוהה לפי כותרת "תעריפים",
      // או לפי שורת דרגה עם מספר יחיד שמופיעה לפני שהוגדר צוות כלשהו.
      const isRateRow = cand.numbers.length === 1 && (inRatesBlock || !current);
      if (isRateRow) {
        if (!rates.has(norm(cand.roleName))) rates.set(norm(cand.roleName), cand.numbers[0].value);
        return;
      }
      if (!current) { current = { name: 'צוות 1', lines: [] }; teams.push(current); }
      current.lines.push(buildLine(cand, rates));
      return;
    }
    const label = (row || []).find((c, ci) => typeof c === 'string' && c.trim()
      && ci <= budgetCol && !roleNames.has(norm(c)));
    if (!label) return;
    if (ratesHeader.test(label)) { inRatesBlock = true; return; }
    if (headerNoise.test(label)) return;
    const name = String(label).trim();
    if (name.length <= 40) { current = { name, lines: [] }; teams.push(current); inRatesBlock = false; }
  });

  // צוות שהוגדר בגיליון אך לא מולא נשמר רק אם הוא בתוך גוש התקציב (לפני הצוות המלא האחרון)
  let lastFilled = -1;
  teams.forEach((t, i) => { if (t.lines.length) lastFilled = i; });
  const clean = teams.filter((t, i) => t.lines.length || i < lastFilled);
  if (!clean.length) notes.push('לא זוהו שורות תקציב לפי דרגות. ודא שהגיליון מכיל שמות דרגה (מתמחה / עו"ד / שותף) ומספרים.');
  if (overrunFactor === null) notes.push('לא זוהה מקדם חריגה — ייעשה שימוש בערך של העסקה.');

  return {
    roles: [...rates.entries()].map(([k, rate]) => ({ name: originalName(textCells, k), rate })),
    overrunFactor,
    teams: clean,
    notes,
  };
}

function originalName(textCells, normalized) {
  const hit = textCells.find((t) => norm(t.text) === normalized);
  return hit ? hit.text : normalized;
}

/** מזהה מבין המספרים בשורה: עלות (=שעות×תעריף), שעות תקציב, ושעות מוערכות */
function buildLine(rr, rates) {
  const rate = rates.get(norm(rr.roleName)) || 0;
  const nums = rr.numbers.slice().sort((a, b) => a.col - b.col);
  let cost = null, budgetHours = null, estHours = null;

  if (rate > 0) {
    for (const a of nums) {
      for (const b of nums) {
        if (a === b) continue;
        if (Math.abs(a.value - b.value * rate) < 1) { cost = a.value; budgetHours = b.value; break; }
      }
      if (cost !== null) break;
    }
  }
  if (cost === null) {
    // ללא תעריף מזוהה: הגדול ביותר = עלות, הקטן ביותר = שעות
    const sorted = nums.slice().sort((a, b) => b.value - a.value);
    if (sorted.length >= 2 && sorted[0].value > sorted[1].value * 5) { cost = sorted[0].value; budgetHours = sorted[1].value; }
    else budgetHours = nums[0].value;
  }
  const rest = nums.filter((n) => n.value !== cost && n.value !== budgetHours);
  if (rest.length) estHours = rest[rest.length - 1].value;

  return {
    roleName: rr.roleName,
    estHours: estHours ?? budgetHours ?? 0,
    budgetHours: budgetHours ?? 0,
    cost: cost ?? 0,
    rate,
  };
}

function findNearbyNumber(rows, r, c) {
  const probes = [[r, c + 1], [r, c - 1], [r + 1, c], [r, c + 2], [r + 1, c + 1]];
  for (const [pr, pc] of probes) {
    const v = rows[pr]?.[pc];
    if (isNum(v)) return v;
  }
  return null;
}
