// store.js — שכבת הדומיין מעל ה-DB: טעינה לזיכרון, CRUD, ומנוי לשינויים.
// כל מוטציה מעדכנת את המטמון בזיכרון ומודיעה למאזין (רינדור + סימון "לא מסונכרן").

import * as db from './db.js';
import {
  normalizeDeal, normalizeTeam, normalizeEntry, normalizeRateCard,
  DEFAULT_ROLES, DEFAULT_TEAM_NAMES, buildTeamFromTemplate, uid, computeDeal,
  roleMap, roleNameMap, normRoleName, resolveLineRole, num,
} from './model.js';

/* ---------- מטמון בזיכרון ---------- */
export const cache = {
  deals: [],
  teams: [],
  entries: [],
  rateCards: [],
  settings: {},
  healedDeals: 0,   // עסקאות ששורות התקציב שלהן חוברו מחדש לתעריפון בטעינה
  loaded: false,
};

let mutationListener = null;
let suppress = false;

export function setMutationListener(fn) { mutationListener = fn; }
export function suppressMutations(on) { suppress = !!on; }

function notify(kind) {
  if (!suppress && typeof mutationListener === 'function') mutationListener(kind);
}

/* ============================================================
   טעינה
   ============================================================ */

export async function loadAll() {
  const [deals, teams, entries, rateCards, settings] = await Promise.all([
    db.getAll('deals'), db.getAll('teams'), db.getAll('entries'),
    db.getAll('rateCards'), db.getAll('settings'),
  ]);
  cache.deals = (deals || []).map(normalizeDeal).sort((a, b) => a.order - b.order);
  cache.teams = (teams || []).map(normalizeTeam);
  cache.entries = (entries || []).map(normalizeEntry);
  cache.rateCards = (rateCards || []).map(normalizeRateCard);
  cache.settings = Object.fromEntries((settings || []).map((s) => [s.key, s.value]));

  if (!cache.rateCards.length) {
    const card = normalizeRateCard({ name: 'תעריפון המשרד', isDefault: true, roles: DEFAULT_ROLES });
    await db.put('rateCards', card);
    cache.rateCards = [card];
  }
  await backfillLineRoleNames();
  cache.healedDeals = await healOrphanLines();
  cache.loaded = true;
  return cache;
}

/**
 * ריפוי נתונים שנשברו כשתעריפון נמחק/הוחלף לפני שהייתה התאמה לפי שם:
 * שורות שאינן מזוהות כלל מחוברות מחדש לדרגות התעריפון הנוכחי (לפי סדר),
 * אחרת התקציב שלהן מוצג כאפס.
 * @returns {number} מספר העסקאות שתוקנו
 */
async function healOrphanLines() {
  let healed = 0;
  suppress = true;
  try {
    for (const deal of cache.deals) {
      const card = rateCardFor(deal);
      if (!card) continue;
      const byId = roleMap(card);
      const byName = roleNameMap(card);
      const broken = teamsOf(deal.id).some((t) => t.lines.length
        && t.lines.every((l) => !resolveLineRole(l, byId, byName)));
      if (!broken) continue;
      const res = await remapDealToRateCard(deal.id, card, card);
      if (res.matched) healed += 1;
    }
  } finally {
    suppress = false;
  }
  return healed;
}

/**
 * נתונים שנוצרו לפני שהשורה שמרה גם את שם הדרגה: משלימים את השם מהתעריפון
 * של העסקה, כדי שהחלפת תעריפון בעתיד תדע להתאים לפי שם.
 */
async function backfillLineRoleNames() {
  const dirty = [];
  for (const team of cache.teams) {
    const card = rateCardFor(cache.deals.find((d) => d.id === team.dealId));
    if (!card) continue;
    const byId = roleMap(card);
    let changed = false;
    for (const line of team.lines) {
      if (line.roleName) continue;
      const role = byId.get(line.roleId);
      if (role) { line.roleName = role.name; changed = true; }
    }
    if (changed) dirty.push(team);
  }
  if (dirty.length) await db.putMany('teams', dirty);
}

/* ============================================================
   הגדרות
   ============================================================ */

export function getSetting(key, fallback = null) {
  return key in cache.settings ? cache.settings[key] : fallback;
}

export async function setSetting(key, value) {
  cache.settings[key] = value;
  await db.put('settings', { key, value });
}

/* ============================================================
   זיכרון שיוך אנשים לצוותים (חוצה עסקאות)
   ============================================================ */

/**
 * מיפוי נשמר לפי **שם הצוות** ולא לפי id — כדי שיחול גם על עסקאות עתידיות
 * שבהן נוצרים צוותים חדשים באותם שמות.
 * מבנה: { [שם מנורמל]: { name, teamName } }
 */
export function getPeopleMemory() {
  const raw = getSetting('peopleTeams', {});
  return raw && typeof raw === 'object' ? raw : {};
}

/** מיפוי שם-אדם → teamId בעסקה נתונה, לפי הזיכרון השמור */
export function peopleTeamIdsFor(dealId) {
  const memory = getPeopleMemory();
  const byName = new Map(teamsOf(dealId).map((t) => [String(t.name || '').trim().toLowerCase(), t.id]));
  const out = {};
  for (const [key, rec] of Object.entries(memory)) {
    const teamId = byName.get(String(rec?.teamName || '').trim().toLowerCase());
    if (teamId) out[key] = teamId;
  }
  return out;
}

/** שומר/מעדכן שיוכים. entries: [{ key, name, teamName }] — teamName ריק מוחק מהזיכרון */
export async function rememberPeopleTeams(list) {
  const memory = { ...getPeopleMemory() };
  for (const rec of list || []) {
    if (!rec?.key) continue;
    if (rec.teamName) memory[rec.key] = { name: rec.name || rec.key, teamName: rec.teamName };
    else delete memory[rec.key];
  }
  await setSetting('peopleTeams', memory);
  return memory;
}

/* ============================================================
   תעריפונים
   ============================================================ */

export function defaultRateCard() {
  return cache.rateCards.find((c) => c.isDefault) || cache.rateCards[0];
}

export function rateCardFor(deal) {
  return cache.rateCards.find((c) => c.id === deal?.rateCardId) || defaultRateCard();
}

export async function saveRateCard(patch) {
  const card = normalizeRateCard({ ...(cache.rateCards.find((c) => c.id === patch.id) || {}), ...patch, updatedAt: new Date().toISOString() });
  if (card.isDefault) {
    for (const c of cache.rateCards) {
      if (c.id !== card.id && c.isDefault) { c.isDefault = false; await db.put('rateCards', c); }
    }
  }
  const i = cache.rateCards.findIndex((c) => c.id === card.id);
  if (i >= 0) cache.rateCards[i] = card; else cache.rateCards.push(card);
  await db.put('rateCards', card);
  notify('rateCard');
  return card;
}

export async function deleteRateCard(id) {
  if (cache.rateCards.length <= 1) throw new Error('חייב להישאר תעריפון אחד לפחות');
  const removed = cache.rateCards.find((c) => c.id === id);
  cache.rateCards = cache.rateCards.filter((c) => c.id !== id);
  if (!cache.rateCards.some((c) => c.isDefault)) {
    cache.rateCards[0].isDefault = true;
    await db.put('rateCards', cache.rateCards[0]);
  }
  await db.remove('rateCards', id);

  // עסקאות ששויכו לתעריפון שנמחק עוברות לברירת המחדל — עם התאמת הדרגות לפי שם,
  // אחרת שורות התקציב מאבדות את התעריף וכל הסכומים מתאפסים.
  const target = defaultRateCard();
  for (const deal of cache.deals.filter((d) => d.rateCardId === id)) {
    deal.rateCardId = target.id;
    deal.updatedAt = new Date().toISOString();
    await db.put('deals', deal);
    await remapDealToRateCard(deal.id, removed, target);
  }
  notify('rateCard');
}

/**
 * מתאים את שורות התקציב (ורישומי הביצוע) של עסקה לתעריפון חדש.
 * ההתאמה לפי **שם הדרגה** — כי id של דרגה ייחודי לכל תעריפון.
 * דרגה שאין לה מקבילה בשם: השורה נשמרת והתעריף שלה "מוקפא" כדריסה ידנית,
 * כדי שסכום התקציב לא ייעלם בלי שהמשתמש ידע.
 * @returns {{matched:number, frozen:number}}
 */
export async function remapDealToRateCard(dealId, fromCard, toCard) {
  if (!toCard) return { matched: 0, frozen: 0 };
  const fromById = roleMap(fromCard);
  const fromByName = roleNameMap(fromCard);
  const toByName = roleNameMap(toCard);
  const idMap = new Map();     // roleId ישן → דרגה חדשה
  let matched = 0, frozen = 0;

  const teams = teamsOf(dealId);
  const touchedTeams = [];
  for (const team of teams) {
    let changed = false;
    // נתונים ישנים (לפני שנשמר שם הדרגה בשורה): אם אף שורה לא ניתנת לזיהוי
    // ומספר השורות זהה למספר הדרגות — ההתאמה לפי סדר היא השחזור הנכון,
    // כי השורות נוצרו מלכתחילה בסדר הדרגות שבתעריפון.
    const identifiable = team.lines.filter((l) => l.roleName || resolveLineRole(l, fromById, fromByName));
    const positional = identifiable.length === 0 && team.lines.length === toCard.roles.length;

    team.lines.forEach((line, idx) => {
      const oldRole = resolveLineRole(line, fromById, fromByName);
      const name = line.roleName || oldRole?.name || '';
      const next = (name ? toByName.get(normRoleName(name)) : undefined) || (positional ? toCard.roles[idx] : undefined);
      if (next) {
        if (line.roleId !== next.id) { idMap.set(line.roleId, next); changed = true; }
        line.roleId = next.id;
        line.roleName = next.name;
        matched += 1;
      } else {
        // אין דרגה בשם הזה בתעריפון החדש — משמרים את התעריף שהיה
        if (line.rateOverride === null || line.rateOverride === undefined) {
          const rate = num(oldRole?.rate);
          if (rate > 0) { line.rateOverride = rate; changed = true; frozen += 1; }
        }
        if (!line.roleName && oldRole?.name) { line.roleName = oldRole.name; changed = true; }
      }
    });
    if (changed) touchedTeams.push(normalizeTeam(team));
  }
  if (touchedTeams.length) {
    for (const t of touchedTeams) {
      const i = cache.teams.findIndex((x) => x.id === t.id);
      if (i >= 0) cache.teams[i] = t;
    }
    await db.putMany('teams', touchedTeams);
  }

  // רישומי ביצוע מצביעים גם הם על roleId — מעבירים לדרגה המקבילה
  const touchedEntries = [];
  for (const e of entriesOf(dealId)) {
    const next = e.roleId ? idMap.get(e.roleId) : null;
    if (next && next.id !== e.roleId) { e.roleId = next.id; touchedEntries.push(e); }
  }
  if (touchedEntries.length) await db.putMany('entries', touchedEntries);

  if (touchedTeams.length || touchedEntries.length) notify('team');
  return { matched, frozen };
}

/* ============================================================
   עסקאות
   ============================================================ */

export function getDeal(id) { return cache.deals.find((d) => d.id === id) || null; }

export function teamsOf(dealId) {
  return cache.teams.filter((t) => t.dealId === dealId).sort((a, b) => a.order - b.order);
}

export function entriesOf(dealId) {
  return cache.entries.filter((e) => e.dealId === dealId);
}

export function snapshotOf(dealId) {
  const deal = getDeal(dealId);
  if (!deal) return null;
  return computeDeal({ deal, teams: cache.teams, entries: cache.entries, rateCard: rateCardFor(deal) });
}

export async function saveDeal(patch) {
  const existing = patch.id ? getDeal(patch.id) : null;
  const deal = normalizeDeal({
    ...(existing || {}),
    ...patch,
    order: existing ? existing.order : cache.deals.length,
    updatedAt: new Date().toISOString(),
  });
  const i = cache.deals.findIndex((d) => d.id === deal.id);
  if (i >= 0) cache.deals[i] = deal; else cache.deals.push(deal);
  await db.put('deals', deal);

  // החלפת תעריפון לעסקה קיימת — מתאימים את שורות התקציב לדרגות של התעריפון החדש
  if (existing && existing.rateCardId !== deal.rateCardId) {
    const fromCard = cache.rateCards.find((c) => c.id === existing.rateCardId) || null;
    await remapDealToRateCard(deal.id, fromCard, rateCardFor(deal));
  }
  notify('deal');
  return deal;
}

/** יוצר עסקה חדשה יחד עם צוותי ברירת המחדל (אותה מתודולוגיה לכל צוות) */
export async function createDeal(patch, teamNames = DEFAULT_TEAM_NAMES) {
  const card = patch.rateCardId ? cache.rateCards.find((c) => c.id === patch.rateCardId) : defaultRateCard();
  const deal = await saveDeal({ ...patch, rateCardId: card.id });
  const teams = (teamNames || []).map((name, i) => buildTeamFromTemplate({ dealId: deal.id, name, roles: card.roles, index: i }));
  if (teams.length) {
    cache.teams.push(...teams);
    await db.putMany('teams', teams);
  }
  notify('deal');
  return deal;
}

/** שכפול עסקה: מבנה הצוותים והשעות המתוכננות, ללא רישומי ביצוע */
export async function duplicateDeal(dealId, newName) {
  const src = getDeal(dealId);
  if (!src) throw new Error('עסקה לא נמצאה');
  const deal = await saveDeal({
    ...src, id: undefined, name: newName || `${src.name} — עותק`,
    baseline: null, progressPct: 0, createdAt: new Date().toISOString(),
  });
  const clones = teamsOf(dealId).map((t, i) => normalizeTeam({
    ...t, id: undefined, dealId: deal.id, order: i,
    lines: t.lines.map((l) => ({ ...l, id: undefined })),
  }, i));
  cache.teams.push(...clones);
  await db.putMany('teams', clones);
  notify('deal');
  return deal;
}

export async function deleteDeal(dealId) {
  const teamIds = teamsOf(dealId).map((t) => t.id);
  const entryIds = entriesOf(dealId).map((e) => e.id);
  const fileIds = entriesOf(dealId).map((e) => e.fileId).filter(Boolean);
  cache.deals = cache.deals.filter((d) => d.id !== dealId);
  cache.teams = cache.teams.filter((t) => t.dealId !== dealId);
  cache.entries = cache.entries.filter((e) => e.dealId !== dealId);
  await Promise.all([
    db.remove('deals', dealId),
    db.removeMany('teams', teamIds),
    db.removeMany('entries', entryIds),
    db.removeMany('files', fileIds),
  ]);
  notify('deal');
}

export async function reorderDeals(orderedIds) {
  const map = new Map(orderedIds.map((id, i) => [id, i]));
  for (const d of cache.deals) {
    if (map.has(d.id)) d.order = map.get(d.id);
  }
  cache.deals.sort((a, b) => a.order - b.order);
  await db.putMany('deals', cache.deals);
  notify('deal');
}

/** מקבע תמונת מצב של התקציב כ-baseline מאושר (לזיהוי זחילת היקף) */
export async function captureBaseline(dealId) {
  const snap = snapshotOf(dealId);
  if (!snap) return null;
  return saveDeal({
    id: dealId,
    baseline: {
      capturedAt: new Date().toISOString(),
      budgetCost: snap.budgetCost,
      budgetHours: snap.budgetHours,
      teams: snap.teams.map((t) => ({ id: t.id, name: t.name, budgetCost: t.budgetCost, budgetHours: t.budgetHours })),
    },
  });
}

export async function clearBaseline(dealId) {
  return saveDeal({ id: dealId, baseline: null });
}

/* ============================================================
   צוותים
   ============================================================ */

export function getTeam(id) { return cache.teams.find((t) => t.id === id) || null; }

/** הסדר הבא בתור בעסקה — max+1, כדי שצוות חדש תמיד ייכנס לסוף גם אחרי מחיקות */
export function nextTeamOrder(dealId) {
  const list = cache.teams.filter((t) => t.dealId === dealId);
  return list.reduce((max, t) => Math.max(max, Number.isFinite(t.order) ? t.order : 0), -1) + 1;
}

export async function saveTeam(patch) {
  const existing = patch.id ? getTeam(patch.id) : null;
  const fallbackOrder = existing?.order ?? nextTeamOrder(patch.dealId || existing?.dealId);
  const team = normalizeTeam({ ...(existing || {}), ...patch, updatedAt: new Date().toISOString() }, fallbackOrder);
  const i = cache.teams.findIndex((t) => t.id === team.id);
  if (i >= 0) cache.teams[i] = team; else cache.teams.push(team);
  await db.put('teams', team);
  notify('team');
  return team;
}

/** מוסיף צוות עם אותה מתודולוגיה (שורה לכל דרגה בתעריפון של העסקה) */
export async function addTeam(dealId, name) {
  const deal = getDeal(dealId);
  const card = rateCardFor(deal);
  const index = teamsOf(dealId).length;
  const team = buildTeamFromTemplate({ dealId, name: name || `צוות ${index + 1}`, roles: card.roles, index });
  team.order = nextTeamOrder(dealId);   // סוף הרשימה — גם אם נמחקו צוותים באמצע
  cache.teams.push(team);
  await db.put('teams', team);
  notify('team');
  return team;
}

export async function deleteTeam(teamId) {
  // רישומי ביצוע ששויכו לצוות עוברים ל"ללא שיוך" ולא נמחקים
  const orphans = cache.entries.filter((e) => e.teamId === teamId);
  for (const e of orphans) { e.teamId = ''; e.roleId = e.roleId || ''; }
  cache.teams = cache.teams.filter((t) => t.id !== teamId);
  await Promise.all([db.remove('teams', teamId), db.putMany('entries', orphans)]);
  notify('team');
  return orphans.length;
}

export async function reorderTeams(dealId, orderedIds) {
  const map = new Map(orderedIds.map((id, i) => [id, i]));
  const updated = [];
  for (const t of cache.teams) {
    if (t.dealId === dealId && map.has(t.id)) { t.order = map.get(t.id); updated.push(t); }
  }
  await db.putMany('teams', updated);
  notify('team');
}

/** מסנכרן שורות צוות מול דרגות התעריפון — מוסיף שורות חסרות לדרגות חדשות */
export async function syncTeamRoles(dealId) {
  const card = rateCardFor(getDeal(dealId));
  // קודם התאמה מחדש לפי שם (שורות שה-id שלהן התיישן), ורק אחר כך הוספת דרגות חסרות
  await remapDealToRateCard(dealId, card, card);
  const updated = [];
  for (const t of teamsOf(dealId)) {
    const have = new Set(t.lines.map((l) => l.roleId));
    let changed = false;
    for (const r of card.roles) {
      if (!have.has(r.id)) { t.lines.push({ id: uid('ln'), roleId: r.id, roleName: r.name, estHours: 0, hoursOverride: null, rateOverride: null, note: '' }); changed = true; }
    }
    if (changed) updated.push(normalizeTeam(t));
  }
  if (updated.length) {
    for (const t of updated) {
      const i = cache.teams.findIndex((x) => x.id === t.id);
      if (i >= 0) cache.teams[i] = t;
    }
    await db.putMany('teams', updated);
    notify('team');
  }
  return updated.length;
}

/* ============================================================
   רישומי ביצוע (חשבונות / שעות / הוצאות)
   ============================================================ */

export function getEntry(id) { return cache.entries.find((e) => e.id === id) || null; }

export async function saveEntry(patch) {
  const existing = patch.id ? getEntry(patch.id) : null;
  const entry = normalizeEntry({ ...(existing || {}), ...patch });
  const i = cache.entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) cache.entries[i] = entry; else cache.entries.push(entry);
  await db.put('entries', entry);
  notify('entry');
  return entry;
}

export async function saveEntries(list) {
  const entries = (list || []).map((e) => normalizeEntry(e));
  for (const entry of entries) {
    const i = cache.entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) cache.entries[i] = entry; else cache.entries.push(entry);
  }
  await db.putMany('entries', entries);
  notify('entry');
  return entries;
}

export async function deleteEntry(id) {
  const e = getEntry(id);
  cache.entries = cache.entries.filter((x) => x.id !== id);
  await db.remove('entries', id);
  if (e?.fileId) await db.remove('files', e.fileId);
  notify('entry');
}

export async function deleteEntries(ids) {
  const set = new Set(ids);
  const gone = cache.entries.filter((e) => set.has(e.id));
  cache.entries = cache.entries.filter((e) => !set.has(e.id));
  await db.removeMany('entries', [...set]);
  const files = gone.map((e) => e.fileId).filter(Boolean);
  if (files.length) await db.removeMany('files', files);
  notify('entry');
}

/* ---------- קבצים מצורפים ---------- */

export async function saveFile(file) {
  const rec = { id: uid('file'), name: file.name, type: file.type, size: file.size, blob: file, createdAt: new Date().toISOString() };
  await db.put('files', rec);
  return rec;
}

export async function getFile(id) { return db.get('files', id); }

/* ============================================================
   גיבוי / שחזור (JSON מקומי)
   ============================================================ */

export async function collectBackup() {
  return {
    app: 'lexbudget',
    version: 1,
    exportedAt: new Date().toISOString(),
    deals: cache.deals,
    teams: cache.teams,
    entries: cache.entries,
    rateCards: cache.rateCards,
    settings: Object.entries(cache.settings).map(([key, value]) => ({ key, value })),
  };
}

export function isValidBackup(d) {
  return !!d && typeof d === 'object' && Array.isArray(d.deals) && Array.isArray(d.teams) && Array.isArray(d.entries);
}

export async function applyBackup(d) {
  if (!isValidBackup(d)) throw new Error('קובץ גיבוי לא תקין');
  suppressMutations(true);
  try {
    await db.replaceAll('deals', (d.deals || []).map(normalizeDeal));
    await db.replaceAll('teams', (d.teams || []).map(normalizeTeam));
    await db.replaceAll('entries', (d.entries || []).map(normalizeEntry));
    if (Array.isArray(d.rateCards) && d.rateCards.length) await db.replaceAll('rateCards', d.rateCards.map(normalizeRateCard));
    if (Array.isArray(d.settings)) await db.replaceAll('settings', d.settings);
    await loadAll();
  } finally {
    suppressMutations(false);
  }
}
