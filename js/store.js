// store.js — שכבת דומיין מעל db.js
// ממפה ישויות, מנרמל שדות, ומספקת helpers עסקיים (משפך, מעקב).

import * as db from './db.js';

/* ----------------------------------------------------------------
   שלבי המשפך (lead funnel). הציר המרכזי של המערכת.
   tier: דרגת התקדמות לצביעת התג (מונוכרום → זהב). -1 = קפוא.
   ניתן לעריכה בקוד בקלות.
---------------------------------------------------------------- */
export const LEAD_STATUSES = [
  { key: 'cold',     label: 'ליד קר',         tier: 0 },
  { key: 'warm',     label: 'ליד חם',         tier: 1 },
  { key: 'talking',  label: 'בשיחה',          tier: 2 },
  { key: 'meeting',  label: 'פגישה',          tier: 3 },
  { key: 'proposal', label: 'הצעת מחיר',      tier: 4 },
  { key: 'client',   label: 'לקוח',           tier: 5 },
  { key: 'frozen',   label: 'קפוא / לא רלוונטי', tier: -1 },
];

/* סוגי איש קשר — לסיווג מי שאינו בהכרח עובד בחברת יעד (מתווך/בנקאי וכו') */
export const CONTACT_TYPES = [
  { key: '', label: 'בעל תפקיד בחברה' },
  { key: 'intermediary', label: 'מתווך / מקשר' },
  { key: 'banker', label: 'בנקאי השקעות' },
  { key: 'investor', label: 'משקיע' },
  { key: 'lawyer', label: 'עו"ד / יועץ' },
  { key: 'other', label: 'אחר' },
];
export function contactTypeLabel(key) {
  return (CONTACT_TYPES.find((t) => t.key === key) || CONTACT_TYPES[0]).label;
}

const STATUS_BY_KEY = new Map(LEAD_STATUSES.map((s) => [s.key, s]));

export function statusMeta(key) {
  return STATUS_BY_KEY.get(key) || LEAD_STATUSES[0];
}

/* ----------------------------------------------------------------
   התראת מוטציה — מאפשרת לשכבת הסנכרון לדעת מתי נכתבו נתונים
   (כדי לתזמן push). שחזור/משיכה כותבים ישירות דרך db.replaceAll ולכן
   לא מפעילים את ההתראה — אין לולאת סנכרון.
---------------------------------------------------------------- */
let _onMutate = null;
export function setMutationListener(fn) { _onMutate = fn; }
function notifyMutate() { try { _onMutate && _onMutate(); } catch (e) { void e; } }

const DEFAULT_FREQ_DAYS = 90;

/* ----------------------------------------------------------------
   ID
---------------------------------------------------------------- */
function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* ----------------------------------------------------------------
   נרמול — מבטיח מבנה תקין גם לנתונים חלקיים
---------------------------------------------------------------- */
function str(v) { return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCompany(raw = {}) {
  return {
    id: raw.id || newId(),
    name: str(raw.name),
    sector: str(raw.sector),
    investors: arr(raw.investors).map(str).filter(Boolean),
    website: str(raw.website),
  };
}

export function normalizeContact(raw = {}) {
  const status = STATUS_BY_KEY.has(raw.status) ? raw.status : 'cold';
  return {
    id: raw.id || newId(),
    fullName: str(raw.fullName),
    status,
    currentCompanyId: raw.currentCompanyId || '',
    role: str(raw.role),
    contactType: str(raw.contactType), // '' = בעל תפקיד בחברה · אחרת: מתווך/בנקאי/משקיע…
    origin: str(raw.origin),
    photoUrl: str(raw.photoUrl),
    contactInfo: {
      phone: str(raw.contactInfo?.phone),
      email: str(raw.contactInfo?.email),
      linkedin: str(raw.contactInfo?.linkedin),
    },
    tags: arr(raw.tags).map(str).filter(Boolean),
    careerTimeline: arr(raw.careerTimeline).map((e) => ({
      companyId: e?.companyId || '',
      companyName: str(e?.companyName),
      role: str(e?.role),
      startYear: numOrNull(e?.startYear),
      endYear: numOrNull(e?.endYear),
    })),
    referrals: arr(raw.referrals).map((r) => ({
      dealName: str(r?.dealName),
      status: str(r?.status),
      estimatedValue: numOrNull(r?.estimatedValue),
    })),
    chronologicalNotes: arr(raw.chronologicalNotes).map((n) => ({
      timestamp: n?.timestamp || new Date().toISOString(),
      noteText: str(n?.noteText),
    })),
    lastContactDate: raw.lastContactDate || '',
    contactFrequencyDays: numOrNull(raw.contactFrequencyDays) || DEFAULT_FREQ_DAYS,
  };
}

/* ----------------------------------------------------------------
   Companies CRUD
---------------------------------------------------------------- */
export async function getCompanies() {
  const list = await db.getAll('companies');
  return list.sort((a, b) => a.name.localeCompare(b.name, 'he'));
}
export async function getCompany(id) { return db.get('companies', id); }
export async function saveCompany(raw) {
  const company = normalizeCompany(raw);
  await db.put('companies', company);
  notifyMutate();
  return company;
}
export async function deleteCompany(id) { const r = await db.remove('companies', id); notifyMutate(); return r; }

/* ----------------------------------------------------------------
   Contacts CRUD
---------------------------------------------------------------- */
export async function getContacts() {
  const list = await db.getAll('contacts');
  return list.sort((a, b) => a.fullName.localeCompare(b.fullName, 'he'));
}
export async function getContact(id) { return db.get('contacts', id); }
export async function saveContact(raw) {
  const contact = normalizeContact(raw);
  await db.put('contacts', contact);
  notifyMutate();
  return contact;
}
export async function deleteContact(id) { const r = await db.remove('contacts', id); notifyMutate(); return r; }

/** מוסיף הערה כרונולוגית ושומר (מעדכן גם lastContactDate) */
export async function addNote(contactId, noteText, touchContact = true) {
  const contact = await getContact(contactId);
  if (!contact) return null;
  const norm = normalizeContact(contact);
  norm.chronologicalNotes.push({ timestamp: new Date().toISOString(), noteText: str(noteText) });
  if (touchContact) norm.lastContactDate = new Date().toISOString().slice(0, 10);
  await db.put('contacts', norm);
  notifyMutate();
  return norm;
}

/* ----------------------------------------------------------------
   Helpers — תצוגה ומשפך
---------------------------------------------------------------- */

/** מחזיר Map של id→שם חברה */
export function companyNameMap(companies) {
  return new Map(companies.map((c) => [c.id, c.name]));
}

/** מצרף שם חברה נוכחית לכל איש קשר (לתצוגה) */
export function withCompanyNames(contacts, companies) {
  const map = companyNameMap(companies);
  return contacts.map((c) => ({
    ...c,
    companyName: map.get(c.currentCompanyId) || '',
  }));
}

/** מספר הימים מאז קשר אחרון (או null אם אין תאריך) */
export function daysSinceContact(contact) {
  if (!contact.lastContactDate) return null;
  const last = new Date(contact.lastContactDate);
  if (isNaN(last)) return null;
  const ms = Date.now() - last.getTime();
  return Math.floor(ms / 86400000);
}

/** האם איש הקשר ב"פיגור קשר" (עבר את סף התדירות) — לא רלוונטי ללקוח/קפוא */
export function isOverdue(contact) {
  if (contact.status === 'frozen') return false;
  const days = daysSinceContact(contact);
  if (days == null) return true; // מעולם לא תועד קשר → דורש תשומת לב
  return days >= (contact.contactFrequencyDays || DEFAULT_FREQ_DAYS);
}

/** יחס ההתקדמות לעבר סף המעקב (0..1+), לשימוש במד החזותי */
export function followUpRatio(contact) {
  const days = daysSinceContact(contact);
  const freq = contact.contactFrequencyDays || DEFAULT_FREQ_DAYS;
  if (days == null) return 1;
  return days / freq;
}

/** שווי עסקאות מצטבר לאיש קשר (סכום ההפניות) */
export function dealValue(contact) {
  return (contact.referrals || []).reduce((sum, r) => sum + (r.estimatedValue || 0), 0);
}

/** דחיפות מעקב לתג ה-Pipeline: 'overdue' | 'soon' | 'ok' */
export function urgency(contact) {
  if (contact.status === 'frozen') return 'ok';
  const r = followUpRatio(contact);
  if (r >= 1) return 'overdue';
  if (r >= 0.7) return 'soon';
  return 'ok';
}

/** קיבוץ אנשי קשר לפי שלב משפך → Map<statusKey, contact[]> */
export function groupByStatus(contacts) {
  const map = new Map(LEAD_STATUSES.map((s) => [s.key, []]));
  for (const c of contacts) {
    if (!map.has(c.status)) map.set(c.status, []);
    map.get(c.status).push(c);
  }
  return map;
}
