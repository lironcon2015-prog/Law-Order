// model.js — הדומיין של LexBudget. לוגיקה טהורה בלבד (ללא DOM, ללא IndexedDB).
// המתודולוגיה נגזרת מגיליון התקציב של המשתמש:
//   שעות תקציב = ROUNDUP(שעות מוערכות × (1 + מקדם חריגה))
//   עלות שורה  = שעות תקציב × תעריף לפי דרגה
//   תקציב צוות = סכום השורות | תקציב עסקה = סכום הצוותים
//   תעריף בלנדד = (תקציב − עלות דרגות ג'וניור) / (שעות תקציב שאינן ג'וניור)

/* ============================================================
   קבועים
   ============================================================ */

/** דרגות ברירת מחדל — כמו בגיליון (מתמחה/עו"ד/שותף). `junior` יוצא מחישוב הבלנדד. */
export const DEFAULT_ROLES = [
  { id: 'intern',  name: 'מתמחה', rate: 250, junior: true },
  { id: 'lawyer',  name: 'עו"ד',  rate: 650, junior: false },
  { id: 'partner', name: 'שותף',  rate: 900, junior: false },
];

/** צוותים מוצעים בעת יצירת עסקה — כל אחד מקבל את אותה מתודולוגיה (אותן דרגות). */
export const DEFAULT_TEAM_NAMES = ['צוות עסקה', 'בדיקת נאותות', 'קורפורייט', 'דיני עבודה', 'אחרים'];

/** צבע לכל צוות — נבחר מחזורית, ברוח ה-Pipeline של ה-CRM. */
export const TEAM_COLORS = ['#f2ca50', '#38bdf8', '#a78bfa', '#34d399', '#fb923c', '#f472b6', '#22d3ee', '#facc15'];

export const DEAL_STATUSES = [
  { id: 'active',   label: 'פעילה',   tone: 'gold' },
  { id: 'onhold',   label: 'בהמתנה',  tone: 'muted' },
  { id: 'closed',   label: 'נסגרה',   tone: 'positive' },
  { id: 'archived', label: 'ארכיון',  tone: 'muted' },
];

export const FEE_MODELS = [
  { id: 'hourly', label: 'שעתי',            hint: 'חיוב לפי שעות בפועל. התקציב הוא תחזית ובקרה.' },
  { id: 'capped', label: 'שעתי עם תקרה',    hint: 'חיוב לפי שעות עד תקרה מוסכמת. חריגה = הפסד.' },
  { id: 'fixed',  label: 'פיקס (Fixed Fee)', hint: 'שכ"ט קבוע. הרווחיות = שכ"ט פחות עלות בפועל.' },
  { id: 'retainer', label: 'ריטיינר',        hint: 'סכום חודשי קבוע לאורך תקופת העסקה.' },
];

/** סוגי רישום ביצוע */
export const ENTRY_KINDS = [
  { id: 'hours',       label: 'שעות',      hint: 'שעות עבודה × תעריף' },
  { id: 'invoice',     label: 'חשבון',     hint: 'חשבון/חשבונית שהתקבלה' },
  { id: 'disbursement', label: 'הוצאה',    hint: 'אגרות, מומחים, נסיעות' },
];

export const ENTRY_STATUSES = [
  { id: 'draft',    label: 'טיוטה',  tone: 'muted' },
  { id: 'approved', label: 'מאושר',  tone: 'gold' },
  { id: 'billed',   label: 'חויב',   tone: 'info' },
  { id: 'paid',     label: 'שולם',   tone: 'positive' },
];

/** ספי בקרה (אחוז ניצול) */
export const THRESHOLDS = { watch: 0.75, risk: 0.9 };

/* ============================================================
   עזרי חישוב בסיסיים
   ============================================================ */

export const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** ROUNDUP — כמו בגיליון: מעגלים כלפי מעלה לשעה שלמה */
export const roundUpHours = (n) => Math.ceil(round2(n) - 1e-9);

export function fmtMoney(n, { currency = '₪', decimals = 0 } = {}) {
  const v = num(n);
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${v < 0 ? '−' : ''}${currency}${s}`;
}

export function fmtHours(n) {
  const v = round2(num(n));
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
}

export function fmtPct(ratio, decimals = 0) {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(decimals)}%`;
}

export function statusOf(util) {
  if (!Number.isFinite(util)) return 'ok';
  if (util > 1) return 'over';
  if (util >= THRESHOLDS.risk) return 'risk';
  if (util >= THRESHOLDS.watch) return 'watch';
  return 'ok';
}

export const STATUS_LABEL = { ok: 'תקין', watch: 'לתשומת לב', risk: 'סיכון', over: 'חריגה' };

/* ============================================================
   נרמול רשומות
   ============================================================ */

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeRole(r, i = 0) {
  return {
    id: r?.id || uid('role'),
    name: String(r?.name ?? `דרגה ${i + 1}`),
    rate: num(r?.rate),
    junior: !!r?.junior,
  };
}

export function normalizeRateCard(c) {
  const roles = Array.isArray(c?.roles) && c.roles.length ? c.roles : DEFAULT_ROLES;
  return {
    id: c?.id || uid('rc'),
    name: String(c?.name ?? 'תעריפון ראשי'),
    isDefault: !!c?.isDefault,
    roles: roles.map(normalizeRole),
    updatedAt: c?.updatedAt || new Date().toISOString(),
  };
}

export function normalizeLine(l) {
  return {
    id: l?.id || uid('ln'),
    roleId: l?.roleId || '',
    // שם הדרגה כפי שהיה בעת ההזנה — מאפשר התאמה מחדש לתעריפון אחר (שבו ל-id אחר)
    roleName: String(l?.roleName ?? ''),
    estHours: num(l?.estHours),
    // דריסה ידנית של שעות התקציב (אם המשתמש רוצה מספר "עגול" משלו)
    hoursOverride: l?.hoursOverride === null || l?.hoursOverride === undefined || l?.hoursOverride === ''
      ? null : num(l.hoursOverride),
    rateOverride: l?.rateOverride === null || l?.rateOverride === undefined || l?.rateOverride === ''
      ? null : num(l.rateOverride),
    // חבר הצוות שהשורה מתייחסת אליו (אופציונלי — אפשר כמה שורות לאותה דרגה)
    person: String(l?.person ?? ''),
    // מעקב שוטף: שעות שהוזנו ידנית מדוח פנימי. נפרד לחלוטין מרישומי החשבונות.
    manualHours: l?.manualHours === null || l?.manualHours === undefined || l?.manualHours === ''
      ? null : num(l.manualHours),
    manualUpdatedAt: l?.manualUpdatedAt || '',
    note: String(l?.note ?? ''),
  };
}

export function normalizeTeam(t, i = 0) {
  return {
    id: t?.id || uid('team'),
    dealId: t?.dealId || '',
    name: String(t?.name ?? `צוות ${i + 1}`),
    lead: String(t?.lead ?? ''),
    color: t?.color || TEAM_COLORS[i % TEAM_COLORS.length],
    order: Number.isFinite(t?.order) ? t.order : i,
    // מקדם חריגה ברמת הצוות — null = יורש מהעסקה
    overrunFactor: t?.overrunFactor === null || t?.overrunFactor === undefined || t?.overrunFactor === ''
      ? null : num(t.overrunFactor),
    lines: Array.isArray(t?.lines) ? t.lines.map(normalizeLine) : [],
    createdAt: t?.createdAt || new Date().toISOString(),
    updatedAt: t?.updatedAt || new Date().toISOString(),
  };
}

export function normalizeDeal(d, i = 0) {
  return {
    id: d?.id || uid('deal'),
    name: String(d?.name ?? 'עסקה חדשה'),
    client: String(d?.client ?? ''),
    code: String(d?.code ?? ''),
    status: DEAL_STATUSES.some((s) => s.id === d?.status) ? d.status : 'active',
    currency: d?.currency || '₪',
    feeModel: FEE_MODELS.some((f) => f.id === d?.feeModel) ? d.feeModel : 'hourly',
    agreedFee: num(d?.agreedFee),        // שכ"ט מוסכם / תקרה
    overrunFactor: d?.overrunFactor === undefined || d?.overrunFactor === null ? 0.2 : num(d.overrunFactor),
    rateCardId: d?.rateCardId || '',
    vatRate: d?.vatRate === undefined || d?.vatRate === null ? 0.18 : num(d.vatRate),
    startDate: d?.startDate || '',
    targetDate: d?.targetDate || '',
    progressPct: Math.max(0, Math.min(100, num(d?.progressPct))),
    notes: String(d?.notes ?? ''),
    baseline: d?.baseline || null,       // תמונת מצב מאושרת של התקציב
    order: Number.isFinite(d?.order) ? d.order : i,
    createdAt: d?.createdAt || new Date().toISOString(),
    updatedAt: d?.updatedAt || new Date().toISOString(),
  };
}

export function normalizeEntry(e) {
  const hours = num(e?.hours);
  const rate = num(e?.rate);
  // סכום: אם הוזן במפורש — מכובד; אחרת נגזר משעות × תעריף
  const amount = e?.amount === undefined || e?.amount === null || e?.amount === ''
    ? round2(hours * rate) : num(e.amount);
  return {
    id: e?.id || uid('ent'),
    dealId: e?.dealId || '',
    teamId: e?.teamId || '',
    roleId: e?.roleId || '',
    // עורך הדין / העובד שביצע — מגיע מפירוט השעות ומשמש לשיוך אוטומטי לצוות
    person: String(e?.person ?? '').trim(),
    kind: ENTRY_KINDS.some((k) => k.id === e?.kind) ? e.kind : 'hours',
    date: e?.date || new Date().toISOString().slice(0, 10),
    description: String(e?.description ?? ''),
    supplier: String(e?.supplier ?? ''),
    docNumber: String(e?.docNumber ?? ''),
    hours,
    rate,
    amount,
    vatIncluded: !!e?.vatIncluded,
    status: ENTRY_STATUSES.some((s) => s.id === e?.status) ? e.status : 'approved',
    fileId: e?.fileId || '',
    fileName: String(e?.fileName ?? ''),
    source: e?.source === 'import' ? 'import' : 'manual',
    createdAt: e?.createdAt || new Date().toISOString(),
  };
}

/**
 * עדכון ביצוע במעקב הידני: שעות שדווחו לתאריך מסוים.
 * `hours` הוא **תוספת לתקופה** (אפשר גם שלילי לתיקון); הסך המצטבר = סכום הרשומות.
 */
export function normalizeProgress(p) {
  return {
    id: p?.id || uid('prg'),
    dealId: p?.dealId || '',
    teamId: p?.teamId || '',
    lineId: p?.lineId || '',
    roleId: p?.roleId || '',
    person: String(p?.person ?? ''),
    date: p?.date || new Date().toISOString().slice(0, 10),
    hours: num(p?.hours),
    note: String(p?.note ?? ''),
    source: p?.source === 'import' ? 'import' : 'manual',
    fileName: String(p?.fileName ?? ''),
    batchId: p?.batchId || '',
    createdAt: p?.createdAt || new Date().toISOString(),
  };
}

/** סכום נטו של רישום (ללא מע"מ) — הבסיס להשוואה מול תקציב */
export function entryNet(entry, vatRate) {
  const a = num(entry.amount);
  return entry.vatIncluded ? round2(a / (1 + num(vatRate))) : a;
}

/* ============================================================
   מנוע החישוב
   ============================================================ */

/** מפת דרגות מתוך תעריפון */
export function roleMap(rateCard) {
  const m = new Map();
  for (const r of rateCard?.roles || []) m.set(r.id, r);
  return m;
}

/** נרמול שם דרגה להשוואה בין תעריפונים (רווחים כפולים, סוגי גרשיים) */
export function normRoleName(name) {
  return String(name || '')
    .replace(/["'״׳`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** מפת דרגות לפי שם מנורמל */
export function roleNameMap(rateCard) {
  const m = new Map();
  for (const r of rateCard?.roles || []) {
    const k = normRoleName(r.name);
    if (k && !m.has(k)) m.set(k, r);
  }
  return m;
}

/**
 * מאתר את הדרגה של שורה בתעריפון הנוכחי: לפי id, ואם ה-id כבר לא קיים
 * (התעריפון הוחלף או נמחק) — לפי שם הדרגה שנשמר בשורה.
 */
export function resolveLineRole(line, byId, byName) {
  return byId.get(line.roleId) || (line.roleName ? byName.get(normRoleName(line.roleName)) : undefined);
}

/** שעות התקציב לשורה — ROUNDUP(מוערך × (1+מקדם)), אלא אם יש דריסה ידנית */
export function lineBudgetHours(line, factor) {
  if (line.hoursOverride !== null && line.hoursOverride !== undefined) return num(line.hoursOverride);
  return roundUpHours(num(line.estHours) * (1 + num(factor)));
}

export function lineRate(line, role) {
  if (line.rateOverride !== null && line.rateOverride !== undefined) return num(line.rateOverride);
  return num(role?.rate);
}

/**
 * מחשב תמונת מצב מלאה של עסקה: תקציב, ביצוע, סטיות, תחזית.
 * @returns {object} snapshot
 */
export function computeDeal({ deal, teams, entries, rateCard, progress: progressLog }) {
  const roles = roleMap(rateCard);
  const rolesByName = roleNameMap(rateCard);
  const dealEntries = (entries || []).filter((e) => e.dealId === deal.id);
  const vat = deal.vatRate;

  // מעקב ידני: צבירת שעות לפי שורה (ומה שלא שויך לשורה — לפי צוות)
  const dealProgress = (progressLog || []).filter((p) => p.dealId === deal.id);
  const progByLine = new Map();
  const progByTeamOnly = new Map();
  for (const p of dealProgress) {
    if (p.lineId) progByLine.set(p.lineId, (progByLine.get(p.lineId) || 0) + num(p.hours));
    else if (p.teamId) progByTeamOnly.set(p.teamId, (progByTeamOnly.get(p.teamId) || 0) + num(p.hours));
  }
  const progUpdatedAt = new Map();
  for (const p of dealProgress) {
    const key = p.lineId || p.teamId;
    if (!key) continue;
    const cur = progUpdatedAt.get(key) || '';
    if (p.date > cur) progUpdatedAt.set(key, p.date);
  }

  // צבירת ביצוע לפי צוות+דרגה, לפי צוות, ולפי דרגה
  const byTeamRole = new Map(); // `${teamId}|${roleId}` → {hours, cost, count}
  const byTeam = new Map();
  const byRole = new Map();
  let actualCost = 0, actualHours = 0, unassignedCost = 0, unassignedHours = 0;

  /** מאחד ביצוע של אותה שורה תחת כמה מזהי דרגה (ישן/חדש אחרי החלפת תעריפון) */
  const mergeActuals = (map, teamId, roleIds) => {
    const out = { hours: 0, cost: 0, count: 0 };
    for (const rid of [...new Set(roleIds)]) {
      const cur = map.get(`${teamId}|${rid}`);
      if (!cur) continue;
      out.hours += cur.hours; out.cost += cur.cost; out.count += cur.count;
    }
    return out;
  };

  const bump = (map, key, hours, cost) => {
    const cur = map.get(key) || { hours: 0, cost: 0, count: 0 };
    cur.hours += hours; cur.cost += cost; cur.count += 1;
    map.set(key, cur);
  };

  for (const e of dealEntries) {
    const cost = entryNet(e, vat);
    const hours = num(e.hours);
    actualCost += cost; actualHours += hours;
    if (e.teamId) {
      bump(byTeam, e.teamId, hours, cost);
      bump(byTeamRole, `${e.teamId}|${e.roleId || '-'}`, hours, cost);
    } else {
      unassignedCost += cost; unassignedHours += hours;
    }
    if (e.roleId) bump(byRole, e.roleId, hours, cost);
  }

  const teamRows = (teams || [])
    .filter((t) => t.dealId === deal.id)
    .sort((a, b) => a.order - b.order)
    .map((team) => {
      const factor = team.overrunFactor === null || team.overrunFactor === undefined
        ? deal.overrunFactor : team.overrunFactor;
      const lines = team.lines.map((line) => {
        const role = resolveLineRole(line, roles, rolesByName);
        // ה-id האפקטיבי: של הדרגה שנמצאה בתעריפון הנוכחי (גם אם ההתאמה הייתה לפי שם)
        const effRoleId = role?.id || line.roleId;
        const bh = lineBudgetHours(line, factor);
        const rate = lineRate(line, role);
        const cost = round2(bh * rate);
        // ביצוע: מאוחד מהמפתח הישן והחדש, כדי שרישומים קיימים לא "ייעלמו" אחרי החלפת תעריפון
        const act = mergeActuals(byTeamRole, team.id, [line.roleId, effRoleId]);
        const util = cost > 0 ? act.cost / cost : (act.cost > 0 ? Infinity : 0);
        // מסלול המעקב הידני — סכום עדכוני הביצוע של השורה, לפי אותו תעריף
        const mh = round2(progByLine.get(line.id) || 0);
        const mCost = round2(mh * rate);
        const mUtil = cost > 0 ? mCost / cost : (mCost > 0 ? Infinity : 0);
        return {
          ...line,
          roleId: effRoleId,
          roleName: role?.name || line.roleName || '—',
          // הדרגה כבר לא קיימת בתעריפון (גם לא לפי שם) — מוצג למשתמש כדי שלא ייעלם בשקט
          orphanRole: !role,
          junior: !!role?.junior,
          factor,
          budgetHours: bh,
          rate,
          budgetCost: cost,
          actualHours: round2(act.hours),
          actualCost: round2(act.cost),
          entryCount: act.count,
          remainingHours: round2(bh - act.hours),
          remainingCost: round2(cost - act.cost),
          util,
          status: statusOf(util),
          manualHoursValue: mh,
          manualUpdatedAt: progUpdatedAt.get(line.id) || '',
          manualCost: mCost,
          manualRemainingHours: round2(bh - mh),
          manualRemainingCost: round2(cost - mCost),
          manualUtil: mUtil,
          manualStatus: statusOf(mUtil),
        };
      });
      const budgetCost = round2(lines.reduce((s, l) => s + l.budgetCost, 0));
      const budgetHours = round2(lines.reduce((s, l) => s + l.budgetHours, 0));
      const estHours = round2(lines.reduce((s, l) => s + num(l.estHours), 0));
      const act = byTeam.get(team.id) || { hours: 0, cost: 0, count: 0 };
      const util = budgetCost > 0 ? act.cost / budgetCost : (act.cost > 0 ? Infinity : 0);
      const manualHours = round2(lines.reduce((s, l) => s + l.manualHoursValue, 0));
      const manualCost = round2(lines.reduce((s, l) => s + l.manualCost, 0));
      const manualUtil = budgetCost > 0 ? manualCost / budgetCost : (manualCost > 0 ? Infinity : 0);
      const manualUpdatedAt = lines.reduce((max, l) => (l.manualUpdatedAt > max ? l.manualUpdatedAt : max), '');
      // שעות שדווחו לצוות בלי שיוך לשורה — אין להן תעריף, לכן מוצגות בנפרד
      const manualUnassignedHours = round2(progByTeamOnly.get(team.id) || 0);
      return {
        ...team,
        factor,
        lines,
        estHours,
        budgetHours,
        budgetCost,
        actualHours: round2(act.hours),
        actualCost: round2(act.cost),
        entryCount: act.count,
        remainingCost: round2(budgetCost - act.cost),
        remainingHours: round2(budgetHours - act.hours),
        util,
        status: statusOf(util),
        manualHours,
        manualCost,
        manualRemainingCost: round2(budgetCost - manualCost),
        manualRemainingHours: round2(budgetHours - manualHours),
        manualUtil,
        manualStatus: statusOf(manualUtil),
        manualUpdatedAt,
        manualUnassignedHours,
      };
    });

  const budgetCost = round2(teamRows.reduce((s, t) => s + t.budgetCost, 0));
  const budgetHours = round2(teamRows.reduce((s, t) => s + t.budgetHours, 0));
  const estHours = round2(teamRows.reduce((s, t) => s + t.estHours, 0));

  // תעריף בלנדד (כמו בגיליון): עלות הדרגות שאינן ג'וניור חלקי שעות אותן דרגות.
  // הג'וניורים יוצאים משני צדי השבר.
  let juniorCost = 0, juniorHours = 0, seniorHours = 0, seniorCost = 0;
  for (const t of teamRows) for (const l of t.lines) {
    if (l.junior) { juniorCost += l.budgetCost; juniorHours += l.budgetHours; }
    else { seniorHours += l.budgetHours; seniorCost += l.budgetCost; }
  }
  const blendedAll = budgetHours > 0 ? round2(budgetCost / budgetHours) : 0;
  const blendedRate = seniorHours > 0 ? round2(seniorCost / seniorHours) : blendedAll;
  const effectiveRate = actualHours > 0 ? round2(actualCost / actualHours) : 0;

  const manualHours = round2(teamRows.reduce((s, t) => s + t.manualHours, 0));
  const manualCost = round2(teamRows.reduce((s, t) => s + t.manualCost, 0));
  const manualUtil = budgetCost > 0 ? manualCost / budgetCost : (manualCost > 0 ? Infinity : 0);
  const manualEffectiveRate = manualHours > 0 ? round2(manualCost / manualHours) : 0;
  const manualUpdatedAt = dealProgress.reduce((max, p) => (p.date > max ? p.date : max), '');
  const manualUnassignedHours = round2(teamRows.reduce((s, t) => s + t.manualUnassignedHours, 0));

  const util = budgetCost > 0 ? actualCost / budgetCost : (actualCost > 0 ? Infinity : 0);
  const progress = deal.progressPct / 100;

  // תחזית לסיום (EAC): לפי התקדמות אם דווחה, אחרת לפי קצב זמן
  const timePace = paceRatio(deal);
  let eac = null, eacBasis = '';
  if (progress > 0.02) { eac = round2(actualCost / progress); eacBasis = 'לפי התקדמות שדווחה'; }
  else if (timePace && timePace > 0.02 && actualCost > 0) { eac = round2(actualCost / timePace); eacBasis = 'לפי קצב לוח הזמנים'; }
  const eacVariance = eac === null ? null : round2(budgetCost - eac);

  // רווחיות מול שכ"ט מוסכם
  const agreed = num(deal.agreedFee);
  const hasFee = agreed > 0 && deal.feeModel !== 'hourly';
  const margin = hasFee ? round2(agreed - actualCost) : null;
  const marginPct = hasFee && agreed > 0 ? margin / agreed : null;
  const feeUtil = hasFee && agreed > 0 ? actualCost / agreed : null;

  /**
   * תקרת שכ"ט: מה שנגבה בפועל מוגבל לתקרה, ולכן כל שעה "מקבלת" פחות.
   * המקדם = תקרה ÷ עלות. דוגמה: תקרה 100,000 מול עלות 120,000 → מקדם 0.833,
   * כלומר הנחה אפקטיבית של 20,000/120,000 = 16.7% על כל תעריף.
   */
  const capFactorFor = (cost) => (hasFee && agreed > 0 && cost > agreed ? agreed / cost : 1);
  const capBudget = buildCap(agreed, budgetCost, capFactorFor(budgetCost), hasFee);
  const capActual = buildCap(agreed, actualCost, capFactorFor(actualCost), hasFee);
  const capManual = buildCap(agreed, manualCost, capFactorFor(manualCost), hasFee);

  // תעריפים אפקטיביים אחרי החלת מקדם התקרה (על התכנון)
  const capF = capBudget.factor;
  const effectiveRates = {
    factor: capF,
    blended: round2(blendedRate * capF),
    blendedAll: round2(blendedAll * capF),
    roles: (rateCard?.roles || []).map((r) => ({
      roleId: r.id, name: r.name, junior: r.junior,
      rate: num(r.rate), effective: round2(num(r.rate) * capF),
    })),
  };
  // התעריף שהתקבל בפועל לשעה, אחרי התקרה
  const realizedRate = actualHours > 0 ? round2(actualCost * capActual.factor / actualHours) : 0;
  const manualRealizedRate = manualHours > 0 ? round2(manualCost * capManual.factor / manualHours) : 0;

  const byRoleRows = (rateCard?.roles || []).map((r) => {
    let bHours = 0, bCost = 0, mHours = 0, mCost = 0;
    for (const t of teamRows) for (const l of t.lines) if (l.roleId === r.id) {
      bHours += l.budgetHours; bCost += l.budgetCost;
      mHours += l.manualHoursValue; mCost += l.manualCost;
    }
    const act = byRole.get(r.id) || { hours: 0, cost: 0, count: 0 };
    return {
      roleId: r.id, name: r.name, rate: r.rate, junior: r.junior,
      budgetHours: round2(bHours), budgetCost: round2(bCost),
      actualHours: round2(act.hours), actualCost: round2(act.cost),
      manualHours: round2(mHours), manualCost: round2(mCost),
      util: bCost > 0 ? act.cost / bCost : (act.cost > 0 ? Infinity : 0),
      manualUtil: bCost > 0 ? mCost / bCost : (mCost > 0 ? Infinity : 0),
    };
  }).filter((r) => r.budgetCost > 0 || r.actualCost > 0 || r.manualCost > 0);

  return {
    deal, teams: teamRows, entries: dealEntries, rateCard,
    estHours, budgetHours, budgetCost,
    actualHours: round2(actualHours), actualCost: round2(actualCost),
    unassignedCost: round2(unassignedCost), unassignedHours: round2(unassignedHours),
    remainingCost: round2(budgetCost - actualCost),
    remainingHours: round2(budgetHours - actualHours),
    util, status: statusOf(util),
    blendedRate, blendedAll, effectiveRate,
    juniorCost: round2(juniorCost), juniorHours: round2(juniorHours),
    seniorHours: round2(seniorHours), seniorCost: round2(seniorCost),
    // מסלול המעקב הידני (נפרד לחלוטין מהחשבונות)
    progressLog: dealProgress,
    manualHours, manualCost, manualUtil, manualEffectiveRate, manualUpdatedAt, manualUnassignedHours,
    manualRemainingCost: round2(budgetCost - manualCost),
    manualRemainingHours: round2(budgetHours - manualHours),
    manualStatus: statusOf(manualUtil),
    // תקרת שכ"ט ותעריפים אפקטיביים
    capBudget, capActual, capManual, effectiveRates, realizedRate, manualRealizedRate,
    eac, eacBasis, eacVariance,
    timePace, progress,
    agreedFee: agreed, hasFee, margin, marginPct, feeUtil,
    byRole: byRoleRows,
    alerts: buildAlerts({ deal, teamRows, util, actualCost, budgetCost, eac, feeUtil, unassignedCost, progress, manualUtil, manualCost, capBudget }),
    baselineDelta: baselineDelta(deal, budgetCost),
  };
}

/** תיאור החריגה מהתקרה: כמה "ירד" מהעלות והמקדם שיש להחיל על התעריפים */
function buildCap(agreedFee, cost, factor, hasFee) {
  const over = hasFee && agreedFee > 0 && cost > agreedFee;
  return {
    applies: over,
    factor,                                       // 1 = אין חריגה
    cost: round2(cost),
    collected: round2(over ? agreedFee : cost),   // מה שייגבה בפועל
    discount: round2(over ? cost - agreedFee : 0),
    discountPct: over ? 1 - factor : 0,
  };
}

/** יחס התקדמות בזמן (0..1) לפי תאריכי העסקה */
export function paceRatio(deal, today = new Date()) {
  if (!deal.startDate || !deal.targetDate) return null;
  const s = new Date(deal.startDate).getTime();
  const e = new Date(deal.targetDate).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return Math.max(0, Math.min(1.5, (today.getTime() - s) / (e - s)));
}

function baselineDelta(deal, budgetCost) {
  if (!deal.baseline || !Number.isFinite(deal.baseline.budgetCost)) return null;
  const base = deal.baseline.budgetCost;
  return { base, delta: round2(budgetCost - base), pct: base > 0 ? (budgetCost - base) / base : null, capturedAt: deal.baseline.capturedAt };
}

function buildAlerts({ deal, teamRows, util, actualCost, budgetCost, eac, feeUtil, unassignedCost, progress, manualUtil, manualCost, capBudget }) {
  const out = [];
  // מעקב ידני — הערוץ השוטף, מוצג ראשון ובנפרד מהחשבונות
  if (budgetCost > 0 && manualCost > 0) {
    if (manualUtil > 1) out.push({ level: 'over', track: 'manual', text: `מעקב ידני: חריגה של ${fmtMoney(manualCost - budgetCost)} מהתקציב (${fmtPct(manualUtil)} ניצול).` });
    else if (manualUtil >= THRESHOLDS.risk) out.push({ level: 'risk', track: 'manual', text: `מעקב ידני: ניצול ${fmtPct(manualUtil)} מהתקציב — נותרו ${fmtMoney(budgetCost - manualCost)}.` });
  }
  for (const t of teamRows) {
    if (t.manualCost > 0 && t.manualUtil > 1) {
      out.push({ level: 'over', track: 'manual', text: `מעקב ידני: הצוות "${t.name}" חרג ב-${fmtMoney(t.manualCost - t.budgetCost)}.`, teamId: t.id });
    }
  }
  if (capBudget?.applies) {
    out.push({ level: 'watch', text: `התקציב (${fmtMoney(capBudget.cost)}) גבוה מהתקרה (${fmtMoney(capBudget.collected)}) — הנחה אפקטיבית של ${fmtPct(capBudget.discountPct, 1)} על כל התעריפים.` });
  }
  if (budgetCost > 0 && util > 1) {
    out.push({ level: 'over', text: `חריגה מהתקציב: ${fmtMoney(actualCost - budgetCost)} מעל המתוכנן (${fmtPct(util)} ניצול).` });
  } else if (budgetCost > 0 && util >= THRESHOLDS.risk) {
    out.push({ level: 'risk', text: `ניצול ${fmtPct(util)} מהתקציב — נותרו ${fmtMoney(budgetCost - actualCost)} בלבד.` });
  }
  for (const t of teamRows) {
    if (t.util > 1) out.push({ level: 'over', text: `הצוות "${t.name}" חרג ב-${fmtMoney(t.actualCost - t.budgetCost)}.`, teamId: t.id });
    else if (t.util >= THRESHOLDS.risk) out.push({ level: 'risk', text: `הצוות "${t.name}" בניצול ${fmtPct(t.util)}.`, teamId: t.id });
    for (const l of t.lines) {
      if (l.budgetHours > 0 && l.actualHours > l.budgetHours) {
        out.push({ level: 'watch', text: `"${t.name}" · ${l.roleName}: ${fmtHours(l.actualHours)} שעות בפועל מול ${fmtHours(l.budgetHours)} בתקציב.`, teamId: t.id });
      }
    }
  }
  if (eac !== null && budgetCost > 0 && eac > budgetCost * 1.05) {
    out.push({ level: 'risk', text: `תחזית לסיום ${fmtMoney(eac)} — ${fmtMoney(eac - budgetCost)} מעל התקציב.` });
  }
  if (feeUtil !== null && feeUtil > 1) {
    out.push({ level: 'over', text: `העלות בפועל עברה את שכר הטרחה המוסכם (${fmtPct(feeUtil)}).` });
  }
  if (progress > 0 && budgetCost > 0 && util > progress + 0.15) {
    out.push({ level: 'watch', text: `קצב השריפה מקדים את ההתקדמות: ${fmtPct(util)} מהתקציב מול ${fmtPct(progress)} התקדמות.` });
  }
  if (unassignedCost > 0) {
    out.push({ level: 'watch', text: `${fmtMoney(unassignedCost)} רשומים ללא שיוך לצוות — לא נכללים בבקרת הצוותים.` });
  }
  if (!teamRows.length) out.push({ level: 'info', text: 'לא הוגדרו צוותים לעסקה — הוסף צוות כדי לבנות תקציב.' });
  return out;
}

/**
 * חישוב מצרפי לקבוצת צוותים מסומנים בתוך עסקה.
 * אותה מתודולוגיה כמו סיכום העסקה, רק על תת-קבוצה.
 */
export function aggregateTeams(snapshot, teamIds) {
  const ids = new Set(teamIds || []);
  const teams = snapshot.teams.filter((t) => ids.has(t.id));
  const t = {
    count: teams.length, names: teams.map((x) => x.name),
    budgetCost: 0, budgetHours: 0, estHours: 0, actualCost: 0, actualHours: 0,
    manualCost: 0, manualHours: 0,
    juniorCost: 0, juniorHours: 0, seniorHours: 0, seniorCost: 0, entryCount: 0,
  };
  for (const team of teams) {
    t.budgetCost += team.budgetCost; t.budgetHours += team.budgetHours; t.estHours += team.estHours;
    t.actualCost += team.actualCost; t.actualHours += team.actualHours; t.entryCount += team.entryCount;
    t.manualCost += team.manualCost; t.manualHours += team.manualHours;
    for (const l of team.lines) {
      if (l.junior) { t.juniorCost += l.budgetCost; t.juniorHours += l.budgetHours; }
      else { t.seniorHours += l.budgetHours; t.seniorCost += l.budgetCost; }
    }
  }
  for (const k of ['budgetCost', 'budgetHours', 'estHours', 'actualCost', 'actualHours', 'manualCost', 'manualHours', 'juniorCost', 'juniorHours', 'seniorHours', 'seniorCost']) {
    t[k] = round2(t[k]);
  }
  t.remainingCost = round2(t.budgetCost - t.actualCost);
  t.remainingHours = round2(t.budgetHours - t.actualHours);
  t.manualRemainingCost = round2(t.budgetCost - t.manualCost);
  t.manualRemainingHours = round2(t.budgetHours - t.manualHours);
  t.util = t.budgetCost > 0 ? t.actualCost / t.budgetCost : (t.actualCost > 0 ? Infinity : 0);
  t.manualUtil = t.budgetCost > 0 ? t.manualCost / t.budgetCost : (t.manualCost > 0 ? Infinity : 0);
  t.status = statusOf(t.util);
  t.manualStatus = statusOf(t.manualUtil);
  t.blendedAll = t.budgetHours > 0 ? round2(t.budgetCost / t.budgetHours) : 0;
  t.blendedRate = t.seniorHours > 0 ? round2(t.seniorCost / t.seniorHours) : t.blendedAll;
  t.effectiveRate = t.actualHours > 0 ? round2(t.actualCost / t.actualHours) : 0;
  t.shareOfDeal = snapshot.budgetCost > 0 ? t.budgetCost / snapshot.budgetCost : 0;
  return t;
}

/** סיכום תיק העסקאות (לתצוגת הסקירה) */
export function computePortfolio(snapshots) {
  const t = {
    budgetCost: 0, actualCost: 0, actualHours: 0, budgetHours: 0, agreedFee: 0,
    manualCost: 0, manualHours: 0, deals: snapshots.length, over: 0, risk: 0,
  };
  for (const s of snapshots) {
    t.budgetCost += s.budgetCost; t.actualCost += s.actualCost;
    t.actualHours += s.actualHours; t.budgetHours += s.budgetHours;
    t.manualCost += s.manualCost; t.manualHours += s.manualHours;
    t.agreedFee += s.agreedFee;
    // הסטטוס נקבע לפי המסלול השוטף אם הוזן, אחרת לפי החשבונות
    const st = s.manualCost > 0 ? s.manualStatus : s.status;
    if (st === 'over') t.over += 1;
    else if (st === 'risk') t.risk += 1;
  }
  t.util = t.budgetCost > 0 ? t.actualCost / t.budgetCost : 0;
  t.manualUtil = t.budgetCost > 0 ? t.manualCost / t.budgetCost : 0;
  t.remainingCost = round2(t.budgetCost - t.actualCost);
  t.manualRemainingCost = round2(t.budgetCost - t.manualCost);
  return t;
}

/** בונה צוות חדש עם אותה מתודולוגיה: שורה לכל דרגה בתעריפון */
export function buildTeamFromTemplate({ dealId, name, roles, index = 0, estHours = {} }) {
  return normalizeTeam({
    dealId,
    name,
    order: index,
    color: TEAM_COLORS[index % TEAM_COLORS.length],
    lines: (roles || []).map((r) => ({ roleId: r.id, roleName: r.name, estHours: num(estHours[r.id]) })),
  }, index);
}

/**
 * סיכום עדכוני הביצוע לפי תקופה (יום / שבוע / חודש) — לדוח התקופתי ולגרף.
 * מחזיר גם שעות וגם עלות (לפי התעריף של השורה שאליה שויכו).
 */
export function progressByPeriod(snapshot, period = 'week') {
  const rateByLine = new Map();
  for (const t of snapshot.teams) for (const l of t.lines) rateByLine.set(l.id, l.rate);

  const keyOf = (date) => {
    if (period === 'day') return date;
    if (period === 'month') return date.slice(0, 7);
    // שבוע: תאריך יום ראשון שבו מתחיל השבוע (ISO date arithmetic)
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return date;
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  };

  const map = new Map();
  for (const p of snapshot.progressLog || []) {
    const k = keyOf(p.date);
    const cur = map.get(k) || { key: k, hours: 0, cost: 0, count: 0 };
    cur.hours += num(p.hours);
    cur.cost += num(p.hours) * num(rateByLine.get(p.lineId) || 0);
    cur.count += 1;
    map.set(k, cur);
  }
  const rows = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  let acc = 0, accCost = 0;
  return rows.map((r) => {
    acc += r.hours; accCost += r.cost;
    return { ...r, hours: round2(r.hours), cost: round2(r.cost), cumulativeHours: round2(acc), cumulativeCost: round2(accCost) };
  });
}

/** סדרת burn מצטברת לפי חודש — לגרף */
export function burnSeries(snapshot) {
  const byMonth = new Map();
  for (const e of snapshot.entries) {
    const m = (e.date || '').slice(0, 7);
    if (!m) continue;
    byMonth.set(m, (byMonth.get(m) || 0) + entryNet(e, snapshot.deal.vatRate));
  }
  const months = [...byMonth.keys()].sort();
  let acc = 0;
  return months.map((m) => { acc += byMonth.get(m); return { month: m, value: byMonth.get(m), cumulative: round2(acc) }; });
}
