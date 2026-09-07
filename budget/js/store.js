// store.js — שכבת הדומיין מעל ה-DB: טעינה לזיכרון, CRUD, ומנוי לשינויים.
// כל מוטציה מעדכנת את המטמון בזיכרון ומודיעה למאזין (רינדור + סימון "לא מסונכרן").

import * as db from './db.js';
import { personKey, personDisplay, fuzzyPersonMatch } from './importer.js';
import {
  normalizeDeal, normalizeTeam, normalizeEntry, normalizeRateCard, normalizeProgress, normalizePerson,
  DEFAULT_ROLES, DEFAULT_TEAM_NAMES, buildTeamFromTemplate, uid, computeDeal,
  roleMap, roleNameMap, normRoleName, resolveLineRole, num, round2,
  normalizeSplits, splitsTotal, allocateHours,
} from './model.js';

/* ---------- מטמון בזיכרון ---------- */
export const cache = {
  deals: [],
  teams: [],
  entries: [],
  progress: [],
  rateCards: [],
  people: [],
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
  const [deals, teams, entries, rateCards, settings, progress, people] = await Promise.all([
    db.getAll('deals'), db.getAll('teams'), db.getAll('entries'),
    db.getAll('rateCards'), db.getAll('settings'), db.getAll('progress'), db.getAll('people'),
  ]);
  cache.deals = (deals || []).map(normalizeDeal).sort((a, b) => a.order - b.order);
  cache.teams = (teams || []).map(normalizeTeam);
  cache.entries = (entries || []).map(normalizeEntry);
  cache.rateCards = (rateCards || []).map(normalizeRateCard);
  cache.settings = Object.fromEntries((settings || []).map((s) => [s.key, s.value]));
  cache.progress = (progress || []).map(normalizeProgress);
  cache.people = (people || []).map(normalizePerson);
  await migrateManualHours();
  await migratePeopleDirectory();

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

/**
 * מיגרציה: שעות שהוזנו בשדה `manualHours` של השורה (לפני שהיה מסד עדכונים)
 * הופכות לעדכון ביצוע יחיד, כדי שההיסטוריה תתחיל מהמצב הקיים.
 */
async function migrateManualHours() {
  const dirtyTeams = [];
  const records = [];
  for (const team of cache.teams) {
    let changed = false;
    for (const line of team.lines) {
      const h = num(line.manualHours);
      if (!h) { if (line.manualHours !== null && line.manualHours !== undefined) { line.manualHours = null; changed = true; } continue; }
      records.push(normalizeProgress({
        dealId: team.dealId, teamId: team.id, lineId: line.id, roleId: line.roleId,
        person: line.person, hours: h, source: 'manual', note: 'הועבר מהמעקב הקודם',
        date: (line.manualUpdatedAt || new Date().toISOString()).slice(0, 10),
      }));
      line.manualHours = null;
      changed = true;
    }
    if (changed) dirtyTeams.push(team);
  }
  if (records.length) {
    cache.progress.push(...records);
    await db.putMany('progress', records);
  }
  if (dirtyTeams.length) await db.putMany('teams', dirtyTeams);
}

/* ============================================================
   ספריית אנשי הצוות — מקור האמת היחיד לשמות
   ============================================================ */

export function peopleList({ includeInactive = false } = {}) {
  return cache.people
    .filter((p) => includeInactive || p.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export function personById(id) {
  return id ? cache.people.find((p) => p.id === id) || null : null;
}

/** שם לתצוגה של שורת תקציב — תמיד מהספרייה, לעולם לא מטקסט ששמור על השורה */
export function personNameOf(id) {
  return personById(id)?.name || '';
}

/** התאמה לפי מפתח זהות או לפי alias — הבסיס לחיפוש בחלון הבחירה ולייבוא */
export function findPersonByName(name) {
  const key = personKey(name);
  if (!key) return null;
  return cache.people.find((p) => p.key === key)
    || cache.people.find((p) => (p.aliases || []).some((a) => personKey(a) === key))
    || null;
}

export async function savePerson(patch) {
  const existing = patch.id ? personById(patch.id) : null;
  const name = String(patch.name ?? existing?.name ?? '').trim();
  const person = normalizePerson({
    ...(existing || {}), ...patch,
    name, key: personKey(name) || existing?.key || '',
    updatedAt: new Date().toISOString(),
  });
  const i = cache.people.findIndex((p) => p.id === person.id);
  if (i >= 0) cache.people[i] = person; else cache.people.push(person);
  await db.put('people', person);
  notify('people');
  return person;
}

/** כתיב נוסף שנמצא בדוח — נשמר על הרשומה הקיימת ולא יוצר רשומה חדשה */
export async function rememberAlias(personId, spelling) {
  const person = personById(personId);
  const raw = String(spelling || '').trim();
  if (!person || !raw) return person;
  const key = personKey(raw);
  if (!key || key === person.key || (person.aliases || []).some((a) => personKey(a) === key)) return person;
  return savePerson({ ...person, aliases: [...person.aliases, raw] });
}

/** כמה שורות תקציב (בכל העסקאות) משויכות לאדם */
export function personUsage(personId) {
  const teams = cache.teams.filter((t) => t.lines.some((l) => l.personId === personId));
  const lines = teams.reduce((n, t) => n + t.lines.filter((l) => l.personId === personId).length, 0);
  return { deals: new Set(teams.map((t) => t.dealId)).size, teams: teams.length, lines };
}

/**
 * מחיקה מותרת רק כשאף שורה לא מפנה לאדם — אחרת נשארות שורות עם personId יתום.
 * במקום מחיקה: סימון `active: false`, שמעלים אותו מחלונות הבחירה ומשאיר את ההיסטוריה.
 */
export async function deletePerson(personId) {
  const usage = personUsage(personId);
  if (usage.lines) return { ok: false, usage };
  cache.people = cache.people.filter((p) => p.id !== personId);
  await db.remove('people', personId);
  notify('people');
  return { ok: true, usage };
}

/** מיזוג כפילויות: כל ההפניות עוברות לרשומה השורדת, והכתיבים נשמרים כ-aliases */
export async function mergePeople(keepId, dropId) {
  const keep = personById(keepId); const drop = personById(dropId);
  if (!keep || !drop || keepId === dropId) return null;
  const dirty = [];
  for (const team of cache.teams) {
    let changed = false;
    for (const line of team.lines) if (line.personId === dropId) { line.personId = keepId; changed = true; }
    if (changed) dirty.push(team);
  }
  if (dirty.length) await db.putMany('teams', dirty);
  const merged = await savePerson({
    ...keep,
    title: keep.title || drop.title,
    defaultTeamName: keep.defaultTeamName || drop.defaultTeamName,
    email: keep.email || drop.email,
    phone: keep.phone || drop.phone,
    aliases: [...new Set([...keep.aliases, ...drop.aliases, drop.name])],
  });
  cache.people = cache.people.filter((p) => p.id !== dropId);
  await db.remove('people', dropId);
  notify('people');
  return { merged, movedLines: dirty.reduce((n, t) => n + t.lines.filter((l) => l.personId === keepId).length, 0) };
}

/**
 * הצעות מיזוג — זוגות ששמותיהם קרובים מספיק (אותה לוגיקה של התאמת שמות בייבוא).
 * מוצג כהתראה במסך הספרייה; המיזוג עצמו תמיד בידי המשתמש.
 */
export function suggestPeopleMerges() {
  const list = cache.people;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]; const b = list[j];
      if (!a.key || !b.key) continue;
      if (a.key === b.key || fuzzyPersonMatch(a.key, [b.key])?.key === b.key) out.push([a, b]);
    }
  }
  return out.slice(0, 12);
}

/** מי משויך לעסקה, ומאיזה מקור — לייצוא אנשי הקשר של העסקה */
export function dealContacts(dealId) {
  const found = new Map();
  const add = (person, source, hours = 0, teamName = '') => {
    if (!person) return;
    const cur = found.get(person.id) || { person, sources: new Set(), hours: 0, teams: new Set() };
    cur.sources.add(source);
    cur.hours = round2(cur.hours + hours);
    if (teamName) cur.teams.add(teamName);
    found.set(person.id, cur);
  };
  for (const team of teamsOf(dealId)) {
    for (const line of team.lines) {
      if (!line.personId) continue;
      add(personById(line.personId), 'שורת תקציב', manualHoursOfLine(line.id), team.name);
    }
    if (String(team.lead || '').trim()) add(findPersonByName(team.lead), 'אחראי צוות', 0, team.name);
  }
  for (const rec of progressOf(dealId)) if (rec.person) add(findPersonByName(rec.person), 'דיווח שעות', 0);
  for (const e of entriesOf(dealId)) if (e.person) add(findPersonByName(e.person), 'חשבון', 0);
  return [...found.values()]
    .map((x) => ({ ...x, sources: [...x.sources], teams: [...x.teams] }))
    .sort((a, b) => b.hours - a.hours || a.person.name.localeCompare(b.person.name, 'he'));
}

/** החלת ייבוא אנשי קשר. מחזיר סיכום, ושומר עותק קודם לביטול. */
export async function applyContactsImport(decisions) {
  const before = cache.people.map((p) => ({ ...p, aliases: [...p.aliases] }));
  let created = 0; let updated = 0;
  for (const d of decisions || []) {
    if (d.action === 'skip') continue;
    if (d.action === 'create') {
      await savePerson({ name: d.contact.name, title: d.contact.title, defaultTeamName: d.contact.defaultTeamName,
        email: d.contact.email, phone: d.contact.phone });
      created += 1;
    } else if (d.action === 'update' && d.personId) {
      const person = personById(d.personId);
      if (!person) continue;
      const pick = (cur, next) => (d.fillEmptyOnly ? (cur || next || '') : (next || cur || ''));
      await savePerson({
        ...person,
        title: pick(person.title, d.contact.title),
        defaultTeamName: pick(person.defaultTeamName, d.contact.defaultTeamName),
        email: pick(person.email, d.contact.email),
        phone: pick(person.phone, d.contact.phone),
        aliases: d.contact.name && d.contact.name !== person.name
          ? [...new Set([...person.aliases, d.contact.name])] : person.aliases,
      });
      updated += 1;
    }
  }
  return { created, updated, before };
}

/** ביטול ייבוא — החזרת הספרייה למצב שלפני ההחלה */
export async function restorePeople(snapshot) {
  cache.people = (snapshot || []).map(normalizePerson);
  await db.replaceAll('people', cache.people);
  notify('people');
}

/**
 * מיגרציה לספרייה: כל שם שהוקלד עד היום כטקסט חופשי הופך לרשומה אחת לפי `personKey`
 * (כתיבים שונים של אותו אדם מתאחדים, והכתיב הנוסף נשמר כ-alias), השורות מקבלות
 * `personId`, והשדה הישן מתרוקן. `settings.peopleTeams` נקרא כאן לצורך התפקיד/הצוות
 * ההתחלתיים — ומכאן ואילך `defaultTeamName` שברשומה הוא המקור.
 */
async function migratePeopleDirectory() {
  const memory = getPeopleMemory();
  const byKey = new Map(cache.people.map((p) => [p.key, p]));
  const created = [];
  const ensure = (rawName, hints = {}) => {
    const name = personDisplay(rawName);
    const key = personKey(name);
    if (!key) return null;
    let person = byKey.get(key);
    if (!person) {
      person = normalizePerson({
        name, key,
        title: hints.title || '',
        defaultTeamName: hints.teamName || '',
      });
      byKey.set(key, person);
      cache.people.push(person);
      created.push(person);
    }
    // כתיב שונה מזה שנשמר — נרשם כ-alias כדי שהתאמות עתידיות יזהו אותו
    const raw = String(rawName || '').trim();
    if (raw && raw !== person.name && !person.aliases.some((a) => a === raw)) {
      person.aliases.push(raw);
      if (!created.includes(person)) created.push(person);
    }
    return person;
  };

  for (const rec of Object.values(memory)) ensure(rec?.name, { teamName: rec?.teamName, title: rec?.roleName });

  const dirtyTeams = [];
  for (const team of cache.teams) {
    let changed = false;
    for (const line of team.lines) {
      if (line.personId || !String(line.person || '').trim()) continue;
      const person = ensure(line.person, { teamName: team.name, title: line.roleName });
      if (person) { line.personId = person.id; line.person = ''; changed = true; }
    }
    if (changed) dirtyTeams.push(team);
  }

  if (created.length) await db.putMany('people', created);
  if (dirtyTeams.length) await db.putMany('teams', dirtyTeams);
}

/* ============================================================
   עדכוני ביצוע (מעקב ידני)
   ============================================================ */

export function progressOf(dealId) {
  return cache.progress.filter((p) => p.dealId === dealId);
}

export function progressOfLine(lineId) {
  return cache.progress.filter((p) => p.lineId === lineId);
}

/** תקופות החיוב שכבר יובאו לעסקה (YYYY-MM) */
export function billPeriodsOf(dealId) {
  return [...new Set(progressOf(dealId).map((p) => p.billPeriod).filter(Boolean))].sort();
}

/** סך השעות שדווחו לשורה */
export function manualHoursOfLine(lineId) {
  return round2(progressOfLine(lineId).reduce((s, p) => s + num(p.hours), 0));
}

export async function addProgress(patch) {
  const rec = normalizeProgress(patch);
  cache.progress.push(rec);
  await db.put('progress', rec);
  notify('progress');
  return rec;
}

export async function addProgressMany(list) {
  const recs = (list || []).map(normalizeProgress);
  if (!recs.length) return [];
  cache.progress.push(...recs);
  await db.putMany('progress', recs);
  notify('progress');
  return recs;
}

export async function updateProgress(patch) {
  const rec = normalizeProgress({ ...(cache.progress.find((p) => p.id === patch.id) || {}), ...patch });
  const i = cache.progress.findIndex((p) => p.id === rec.id);
  if (i >= 0) cache.progress[i] = rec; else cache.progress.push(rec);
  await db.put('progress', rec);
  notify('progress');
  return rec;
}

export async function deleteProgress(id) {
  cache.progress = cache.progress.filter((p) => p.id !== id);
  await db.remove('progress', id);
  notify('progress');
}

/**
 * מוחק דיווחים **שיובאו** בטווח תאריכים (לשורות מסוימות) — לפני ייבוא מחדש של
 * דוח מתוקן לאותה תקופה. דיווחים ידניים לא נוגעים בהם.
 * @returns {number} כמה נמחקו
 */
export async function clearImportedProgressRange({ dealId, from, to, lineIds }) {
  const set = lineIds && lineIds.length ? new Set(lineIds) : null;
  const doomed = cache.progress.filter((p) => p.dealId === dealId && p.source === 'import'
    && p.date >= from && p.date <= to && (!set || set.has(p.lineId)));
  if (!doomed.length) return 0;
  const ids = new Set(doomed.map((p) => p.id));
  cache.progress = cache.progress.filter((p) => !ids.has(p.id));
  await db.removeMany('progress', [...ids]);
  notify('progress');
  return ids.size;
}

/** מחיקת אצווה שלמה שיובאה (batchId) */
export async function deleteProgressBatch(batchId) {
  const ids = cache.progress.filter((p) => p.batchId === batchId).map((p) => p.id);
  if (!ids.length) return 0;
  cache.progress = cache.progress.filter((p) => p.batchId !== batchId);
  await db.removeMany('progress', ids);
  notify('progress');
  return ids.length;
}

/* ============================================================
   מקורות המידע של הביצוע
   ============================================================ */

/**
 * כל מקורות הדיווח של העסקה — דוח שעות שיובא, חשבון שיובא, והזנה ידנית —
 * עם ההיקף שנגזר מכל אחד. משמש למחיקת מקור על כל מה שנלקח ממנו.
 * @returns {Array<{key,kind,label,fileName,fileId,count,hours,periods,from,to,deletable}>}
 */
export function dataSourcesOf(dealId) {
  const out = new Map();
  const touch = (key, base) => {
    if (!out.has(key)) out.set(key, { key, count: 0, hours: 0, periods: new Set(), from: '', to: '', files: new Set(), ...base });
    return out.get(key);
  };
  const add = (g, { hours, date, period, fileId }) => {
    g.count += 1;
    g.hours = round2(g.hours + num(hours));
    if (period) g.periods.add(period);
    if (date) { if (!g.from || date < g.from) g.from = date; if (!g.to || date > g.to) g.to = date; }
    if (fileId) g.files.add(fileId);
  };

  for (const p of progressOf(dealId)) {
    const isImport = p.source === 'import';
    const key = isImport ? `progress:${p.batchId || p.fileName || 'ללא שם'}` : 'manual';
    const g = touch(key, isImport
      ? { kind: 'import', label: p.fileName || 'דוח שעות', fileName: p.fileName || '', batchId: p.batchId || '', deletable: true }
      : { kind: 'manual', label: 'הזנה ידנית', fileName: '', deletable: false });
    add(g, { hours: p.hours, date: p.date, period: p.billPeriod, fileId: p.fileId });
  }

  for (const e of entriesOf(dealId)) {
    if (!num(e.hours)) continue;
    const imported = e.source === 'import';
    const key = imported ? `entry:${e.fileId || e.fileName || 'ללא שם'}` : 'entry:manual';
    const g = touch(key, imported
      ? { kind: 'invoice', label: e.fileName || 'חשבון שיובא', fileName: e.fileName || '', deletable: true }
      : { kind: 'invoice', label: 'חשבונות שנרשמו ידנית', fileName: '', deletable: false });
    add(g, { hours: e.hours, date: e.date, period: '', fileId: e.fileId });
  }

  return [...out.values()]
    .map((g) => ({ ...g, periods: [...g.periods].sort(), fileIds: [...g.files], fileId: [...g.files][0] || '' }))
    .sort((a, b) => (b.to || '').localeCompare(a.to || '') || b.hours - a.hours);
}

/**
 * מוחק מקור מידע ואת כל מה שנגזר ממנו (דיווחים / רישומי חשבון).
 * @returns {{records:number, fileIds:string[]}}
 */
export async function deleteDataSource(key, dealId) {
  const fileIds = new Set();
  if (key.startsWith('progress:')) {
    const id = key.slice('progress:'.length);
    const doomed = progressOf(dealId).filter((p) => p.source === 'import' && (p.batchId || p.fileName || 'ללא שם') === id);
    if (!doomed.length) return { records: 0, fileIds: [] };
    const ids = new Set(doomed.map((p) => p.id));
    for (const p of doomed) if (p.fileId) fileIds.add(p.fileId);
    cache.progress = cache.progress.filter((p) => !ids.has(p.id));
    await db.removeMany('progress', [...ids]);
    notify('progress');
    return { records: ids.size, fileIds: [...fileIds] };
  }
  if (key.startsWith('entry:')) {
    const id = key.slice('entry:'.length);
    const doomed = entriesOf(dealId).filter((e) => num(e.hours) && e.source === 'import' && (e.fileId || e.fileName || 'ללא שם') === id);
    if (!doomed.length) return { records: 0, fileIds: [] };
    for (const e of doomed) if (e.fileId) fileIds.add(e.fileId);
    await deleteEntries(doomed.map((e) => e.id));
    return { records: doomed.length, fileIds: [...fileIds] };
  }
  return { records: 0, fileIds: [] };
}

/**
 * קובע את הסך המצטבר של שורה: רושם עדכון-התאמה בהפרש מול מה שכבר דווח.
 * כך אפשר להקליד "כמה שעות בוצעו עד היום" בלי לאבד את ההיסטוריה.
 */
export async function setLineManualTotal(lineId, total, { date, note } = {}) {
  const line = findLine(lineId);
  if (!line) return null;
  const current = manualHoursOfLine(lineId);
  const delta = round2(num(total) - current);
  if (!delta) return null;
  return addProgress({
    dealId: line.team.dealId, teamId: line.team.id, lineId,
    // השם מגיע מספריית האנשים; `line.person` נשאר רק לשורות שטרם עברו מיגרציה
    roleId: line.line.roleId, person: personNameOf(line.line.personId) || line.line.person,
    hours: delta, source: 'manual',
    date: date || new Date().toISOString().slice(0, 10),
    note: note || (current === 0 ? 'הזנה ידנית' : 'עדכון מצטבר'),
  });
}

/** מאתר שורה לפי מזהה, יחד עם הצוות שלה */
export function findLine(lineId) {
  for (const team of cache.teams) {
    const line = team.lines.find((l) => l.id === lineId);
    if (line) return { team, line };
  }
  return null;
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

/**
 * שומר/מעדכן שיוכים. entries: [{ key, name, teamName, roleName, splits }] —
 * `splits` הוא האלוקציה המלאה ([{teamName, roleName, pct}]) כשהאדם מפוצל בין צוותים;
 * teamName ריק ו-splits ריק מוחקים אותו מהזיכרון.
 */
export async function rememberPeopleTeams(list) {
  const memory = { ...getPeopleMemory() };
  for (const rec of list || []) {
    if (!rec?.key) continue;
    const splits = (rec.splits || []).filter((s) => s?.teamName && num(s.pct) > 0);
    if (rec.teamName || splits.length) {
      memory[rec.key] = {
        name: rec.name || rec.key,
        teamName: rec.teamName || splits[0]?.teamName || '',
        roleName: rec.roleName || splits[0]?.roleName || memory[rec.key]?.roleName || '',
        splits: splits.length > 1 ? splits.map((s) => ({ teamName: s.teamName, roleName: s.roleName || '', pct: round2(num(s.pct)) })) : [],
      };
    } else delete memory[rec.key];
  }
  await setSetting('peopleTeams', memory);
  return memory;
}

/**
 * האלוקציה הזכורה לכל אדם, מתורגמת לצוותים של עסקה נתונה (לפי **שם** הצוות).
 * @returns {Object<string, Array<{teamId, roleName, pct}>>}
 */
export function peopleAllocFor(dealId) {
  const memory = getPeopleMemory();
  const byName = new Map(teamsOf(dealId).map((t) => [String(t.name || '').trim().toLowerCase(), t.id]));
  const out = {};
  for (const [key, rec] of Object.entries(memory)) {
    const splits = Array.isArray(rec?.splits) && rec.splits.length
      ? rec.splits
      : (rec?.teamName ? [{ teamName: rec.teamName, roleName: rec.roleName || '', pct: 100 }] : []);
    const resolved = [];
    for (const s of splits) {
      const teamId = byName.get(String(s?.teamName || '').trim().toLowerCase());
      if (teamId) resolved.push({ teamId, roleName: s.roleName || '', pct: round2(num(s.pct) || 100) });
    }
    if (resolved.length) out[key] = resolved;
  }
  return out;
}

/** כל האנשים שהמערכת מכירה: מהזיכרון, משורות התקציב, מעדכוני הביצוע ומהחשבונות */
export function knownPeople(dealId) {
  const out = new Map();
  const add = (name, roleName = '') => {
    const key = String(name || '').trim();
    if (!key) return;
    const cur = out.get(key.toLowerCase()) || { name: key, roleName: '' };
    if (!cur.roleName && roleName) cur.roleName = roleName;
    out.set(key.toLowerCase(), cur);
  };
  for (const rec of Object.values(getPeopleMemory())) add(rec?.name, rec?.roleName);
  for (const t of teamsOf(dealId)) for (const l of t.lines) add(l.person, l.roleName);
  for (const p of progressOf(dealId)) add(p.person);
  for (const e of entriesOf(dealId)) add(e.person);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/**
 * פריסת צוות לשורות לפי אנשים: שורה לכל אדם (עם דרגה ותעריף משלו אם נדרש).
 * שורות דרגה קיימות שאין להן שעות מוערכות ולא דווח עליהן — נמחקות, כדי לא להכפיל.
 */
export async function splitTeamByPeople(teamId, people) {
  const team = getTeam(teamId);
  if (!team) return 0;
  const card = rateCardFor(getDeal(team.dealId));
  const byId = roleMap(card);
  // הפריסה עובדת על מזהים מהספרייה — אין יצירת שם חופשי בשום מסלול
  const existing = new Set(team.lines.map((l) => l.personId).filter(Boolean));

  const added = [];
  for (const p of people || []) {
    const person = personById(p.personId);
    if (!person || existing.has(person.id)) continue;
    const role = byId.get(p.roleId) || card.roles[0];
    added.push({
      id: uid('ln'), roleId: role?.id || '', roleName: role?.name || '',
      personId: person.id, person: '', estHours: 0, hoursOverride: null,
      rateOverride: p.rate === '' || p.rate === undefined || p.rate === null ? null : num(p.rate),
      manualHours: null, manualUpdatedAt: '', note: '',
    });
    existing.add(person.id);
  }
  if (!added.length) return 0;

  // שורות דרגה "ריקות" מיותרות אחרי הפריסה
  const usedLineIds = new Set(cache.progress.filter((x) => x.teamId === teamId).map((x) => x.lineId));
  const keep = team.lines.filter((l) => l.person || num(l.estHours) > 0 || usedLineIds.has(l.id));
  team.lines = [...keep, ...added];
  await saveTeam(team);
  return added.length;
}

/**
 * הוספת איש צוות חדש: שורת תקציב על שמו בצוות שנבחר.
 * משמש כשבדוח שעות מופיע אדם שאין לו שיוך — במקום לוותר על השעות שלו.
 * השם נרשם **בספריית האנשים** (מקור האמת היחיד): אדם קיים מזוהה לפי מפתח או alias
 * והכתיב שבדוח נשמר לו כ-alias; אדם חדש נוצר בספרייה. השורה מחזיקה `personId` בלבד.
 * @returns {{teamId, lineId, personId}|null}
 */
export async function addTeamMember(teamId, { person, personId, roleId, rate, estHours } = {}) {
  const team = getTeam(teamId);
  const name = String(person || '').trim();
  if (!team || (!name && !personId)) return null;

  let record = personId ? personById(personId) : findPersonByName(name);
  if (!record) record = await savePerson({ name: personDisplay(name) || name });
  else if (name) await rememberAlias(record.id, name);

  const card = rateCardFor(getDeal(team.dealId));
  const role = roleMap(card).get(roleId) || card.roles[0];
  const line = {
    id: uid('ln'),
    roleId: role?.id || '',
    roleName: role?.name || '',
    personId: record.id,
    person: '',
    estHours: num(estHours),
    hoursOverride: null,
    rateOverride: rate === '' || rate === undefined || rate === null ? null : num(rate),
    manualHours: null, manualUpdatedAt: '', note: '',
  };
  team.lines = [...team.lines, line];
  await saveTeam(team);
  return { teamId: team.id, lineId: line.id, personId: record.id };
}

/* ============================================================
   אלוקציית שעות בין צוותים (כולל תיקון בדיעבד)
   ============================================================ */

/** האלוקציה שנשמרה לעסקה: { [personKey]: [{teamId, lineId, pct}] } */
export function allocationsOf(dealId) {
  const all = getSetting('allocations', {});
  const rec = all && typeof all === 'object' ? all[dealId] : null;
  return rec && typeof rec === 'object' ? rec : {};
}

/** שמירת האלוקציה של אדם בעסקה (מערך ריק = מחיקה) */
export async function setAllocation(dealId, key, splits) {
  const all = { ...(getSetting('allocations', {}) || {}) };
  const forDeal = { ...(all[dealId] || {}) };
  const clean = normalizeSplits(splits);
  if (clean.length) forDeal[key] = clean; else delete forDeal[key];
  all[dealId] = forDeal;
  await setSetting('allocations', all);
  return clean;
}

/**
 * האלוקציה בפועל של כל אדם שדיווח שעות בעסקה — נגזרת מהדיווחים עצמם
 * (ולא מההגדרה), כי היא מה שנספר בתקציב.
 * @returns {Array<{key, name, hours, unassignedHours, groups, splits:[{teamId,lineId,hours,pct}], periods, batches}>}
 */
export function allocationBreakdown(dealId) {
  const byPerson = new Map();
  for (const p of progressOf(dealId)) {
    const key = personKey(p.person) || '';
    if (!key) continue;
    const cur = byPerson.get(key) || {
      key, name: String(p.person || '').trim(), hours: 0, unassignedHours: 0,
      byLine: new Map(), groups: new Set(), periods: new Set(), batches: new Map(),
    };
    // השם לתצוגה מגיע מספריית האנשים כשהיא מכירה את הכתיב שבדוח (מקור אמת יחיד)
    const known = findPersonByName(p.person)?.name || '';
    if (known) cur.name = known;
    else if (String(p.person || '').trim().length > cur.name.length) cur.name = String(p.person).trim();
    cur.hours = round2(cur.hours + num(p.hours));
    if (p.lineId) {
      const hit = cur.byLine.get(p.lineId) || { teamId: p.teamId || '', lineId: p.lineId, hours: 0 };
      hit.hours = round2(hit.hours + num(p.hours));
      if (!hit.teamId && p.teamId) hit.teamId = p.teamId;
      cur.byLine.set(p.lineId, hit);
    } else cur.unassignedHours = round2(cur.unassignedHours + num(p.hours));
    cur.groups.add(p.allocGroupId || p.id);
    if (p.billPeriod) cur.periods.add(p.billPeriod);
    if (p.source === 'import') cur.batches.set(p.batchId || p.fileName, p.fileName || 'דוח שעות');
    byPerson.set(key, cur);
  }
  return [...byPerson.values()].map((p) => {
    const total = [...p.byLine.values()].reduce((s, l) => s + l.hours, 0);
    return {
      key: p.key, name: p.name, hours: p.hours, unassignedHours: p.unassignedHours,
      groups: p.groups.size,
      splits: [...p.byLine.values()]
        .map((l) => ({ ...l, pct: total > 0 ? round2((l.hours / total) * 100) : 0 }))
        .sort((a, b) => b.hours - a.hours),
      periods: [...p.periods].sort(),
      batches: [...p.batches].map(([id, label]) => ({ id, label })),
    };
  }).sort((a, b) => b.hours - a.hours);
}

/** האם דיווח נכלל בהיקף שנבחר לתיקון: 'all' | 'period:YYYY-MM' | 'batch:<id>' */
function inAllocScope(p, scope) {
  if (!scope || scope === 'all') return true;
  if (scope.startsWith('period:')) return p.billPeriod === scope.slice(7);
  if (scope.startsWith('batch:')) return p.source === 'import' && (p.batchId || p.fileName) === scope.slice(6);
  return true;
}

/**
 * תיקון אלוקציה **בדיעבד**: מחלק מחדש את השעות שכבר דווחו לאדם, לפי אחוזים חדשים.
 * העבודה היא ברמת הדיווח המקורי (allocGroupId) — כל דיווח מחולק מחדש בנפרד,
 * ולכן התאריכים, תקופות החיוב, המקור והקובץ נשמרים במדויק והסך הכולל אינו משתנה.
 * @param opts { dealId, key, splits:[{teamId,lineId,pct}], scope }
 * @returns {{groups:number, removed:number, added:number, hours:number}}
 */
export async function reallocatePerson({ dealId, key, splits, scope = 'all' }) {
  const targets = normalizeSplits(splits);
  if (!targets.length) return { groups: 0, removed: 0, added: 0, hours: 0 };
  const total = splitsTotal(targets);

  const mine = progressOf(dealId).filter((p) => personKey(p.person) === key && inAllocScope(p, scope));
  if (!mine.length) return { groups: 0, removed: 0, added: 0, hours: 0 };

  // קיבוץ לפי הדיווח המקורי: רשומות שנוצרו מאותה שורה בדוח חולקו כבר ביניהן
  const groups = new Map();
  for (const p of mine) {
    const gid = p.allocGroupId || p.id;
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid).push(p);
  }

  const doomed = [];
  const fresh = [];
  let movedHours = 0;
  for (const [, recs] of groups) {
    const rep = recs[0];
    const base = recs.length === 1 && num(rep.sourceHours) ? num(rep.sourceHours)
      : round2(recs.reduce((s, r) => s + num(r.hours), 0));
    if (!base) continue;
    const gid = uid('alc');
    const parts = allocateHours(base, targets.map((t) => t.pct));
    movedHours = round2(movedHours + base);
    doomed.push(...recs.map((r) => r.id));
    targets.forEach((t, i) => {
      if (!parts[i]) return;
      const line = findLine(t.lineId);
      fresh.push(normalizeProgress({
        dealId, teamId: t.teamId || line?.team.id || '', lineId: t.lineId,
        roleId: line?.line.roleId || '', person: rep.person,
        date: rep.date, billPeriod: rep.billPeriod,
        periodFrom: rep.periodFrom, periodTo: rep.periodTo,
        hours: parts[i], source: rep.source, fileName: rep.fileName,
        fileId: rep.fileId, batchId: rep.batchId,
        allocGroupId: gid, allocPct: round2((num(t.pct) / total) * 100), sourceHours: base,
        note: targets.length > 1
          ? `אלוקציה ${round2((num(t.pct) / total) * 100)}% מתוך ${base} שעות`
          : (rep.note && !rep.note.startsWith('אלוקציה') ? rep.note : ''),
      }));
    });
  }
  if (!fresh.length) return { groups: 0, removed: 0, added: 0, hours: 0 };

  const ids = new Set(doomed);
  cache.progress = cache.progress.filter((p) => !ids.has(p.id));
  cache.progress.push(...fresh);
  await db.removeMany('progress', [...ids]);
  await db.putMany('progress', fresh);
  await setAllocation(dealId, key, targets);
  notify('progress');
  return { groups: groups.size, removed: ids.size, added: fresh.length, hours: round2(movedHours) };
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
  return computeDeal({ deal, teams: cache.teams, entries: cache.entries, rateCard: rateCardFor(deal), progress: cache.progress, people: cache.people });
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

/**
 * עסקה חדשה שבה **השעות המוערכות הן השעות שבוצעו בפועל** — סגירת המעגל של התחקיר:
 * ההערכה הבאה מתחילה מהמציאות ולא מהניחוש הקודם. דיווחי הביצוע אינם מועתקים.
 */
export async function duplicateDealFromActual(dealId, newName) {
  const src = getDeal(dealId);
  if (!src) throw new Error('עסקה לא נמצאה');
  const snap = snapshotOf(dealId);
  const actualByLine = new Map();
  for (const t of snap.teams) for (const l of t.lines) actualByLine.set(l.id, l.actualHours);

  const deal = await saveDeal({
    ...src, id: undefined, name: newName || `${src.name} — לפי ביצוע`,
    baseline: null, progressPct: 0, createdAt: new Date().toISOString(),
  });
  const clones = teamsOf(dealId).map((t, i) => normalizeTeam({
    ...t, id: undefined, dealId: deal.id, order: i,
    lines: t.lines.map((l) => ({
      ...l, id: undefined,
      estHours: round2(actualByLine.get(l.id) ?? num(l.estHours)),
      hoursOverride: null, manualHours: null, manualUpdatedAt: '',
    })),
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
  const progressIds = progressOf(dealId).map((p) => p.id);
  cache.deals = cache.deals.filter((d) => d.id !== dealId);
  cache.teams = cache.teams.filter((t) => t.dealId !== dealId);
  cache.entries = cache.entries.filter((e) => e.dealId !== dealId);
  cache.progress = cache.progress.filter((p) => p.dealId !== dealId);
  await Promise.all([
    db.remove('deals', dealId),
    db.removeMany('teams', teamIds),
    db.removeMany('entries', entryIds),
    db.removeMany('files', fileIds),
    db.removeMany('progress', progressIds),
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
  const entryIds = orphans.map((e) => e.id);
  for (const e of orphans) { e.teamId = ''; e.roleId = e.roleId || ''; }
  cache.teams = cache.teams.filter((t) => t.id !== teamId);
  await Promise.all([db.remove('teams', teamId), db.putMany('entries', orphans)]);
  notify('team');
  return { count: orphans.length, entryIds };
}

/** ביטול מחיקת צוות — מחזיר את הצוות ומחבר אליו בחזרה את רישומי הביצוע */
export async function restoreTeam(team, entryIds = []) {
  const restored = await saveTeam(team);
  const back = cache.entries.filter((e) => entryIds.includes(e.id));
  for (const e of back) e.teamId = restored.id;
  if (back.length) await db.putMany('entries', back);
  notify('team');
  return restored;
}

/** סדר השורות בתוך צוות (גרירה בגיליון) */
export async function reorderLines(teamId, orderedIds) {
  const team = getTeam(teamId);
  if (!team) return null;
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  const lines = [...team.lines].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
  return saveTeam({ ...team, lines });
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
    progress: cache.progress,
    rateCards: cache.rateCards,
    people: cache.people,
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
    await db.replaceAll('progress', (d.progress || []).map(normalizeProgress));
    if (Array.isArray(d.rateCards) && d.rateCards.length) await db.replaceAll('rateCards', d.rateCards.map(normalizeRateCard));
    // גיבוי ישן שאין בו ספרייה: loadAll יבנה אותה מהשמות שבשורות (migratePeopleDirectory)
    await db.replaceAll('people', (d.people || []).map(normalizePerson));
    if (Array.isArray(d.settings)) await db.replaceAll('settings', d.settings);
    await loadAll();
  } finally {
    suppressMutations(false);
  }
}
