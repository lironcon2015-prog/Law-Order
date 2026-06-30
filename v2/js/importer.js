// importer.js — ייבוא גיבויים: מזהה פורמט (billing / CRM / מאוחד) וטוען לכל ה-stores.
// תומך בשני הגיבויים הקיימים: billing DB.backup.export (Lawfee) ו-CRM collectBackupData.
// ייבוא = החלפה לפי דומיין: גיבוי חיוב מחליף רק את stores החיוב, גיבוי CRM רק את ה-CRM.

import * as db from './db.js';
import * as billing from './billing.js';

/** מזהה את פורמט הגיבוי. מחזיר 'unified' | 'billing' | 'crm' | null */
export function detectFormat(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const hasCrm = Array.isArray(d.contacts) || Array.isArray(d.companies);
  const hasBilling = Array.isArray(d.clients) || Array.isArray(d.cases) || Array.isArray(d.invoices) || Array.isArray(d.payments) || Array.isArray(d.balances);
  if (hasCrm && hasBilling) return 'unified';
  if (hasBilling) return 'billing';
  if (hasCrm) return 'crm';
  return null;
}

export function describeFormat(fmt) {
  return { unified: 'גיבוי מאוחד (CRM + חיוב)', billing: 'גיבוי חיוב', crm: 'גיבוי CRM' }[fmt] || 'לא מזוהה';
}

/** סיכום ספירות לרשומות שיובאו (לאישור משתמש) */
export function summarize(d, fmt) {
  const c = (a) => (Array.isArray(a) ? a.length : 0);
  const parts = [];
  if (fmt === 'crm' || fmt === 'unified') parts.push(`${c(d.contacts)} אנשי קשר`, `${c(d.companies)} חברות`);
  if (fmt === 'billing' || fmt === 'unified') parts.push(`${c(d.clients)} לקוחות`, `${c(d.cases)} תיקים`, `${c(d.invoices)} חשבוניות`, `${c(d.payments)} תשלומים`);
  return parts.join(' · ');
}

/** טוען את הגיבוי ל-stores המתאימים (החלפה לפי דומיין). אינו מפעיל notify/push. */
export async function applyImport(d, fmt) {
  if (fmt === 'crm' || fmt === 'unified') {
    if (Array.isArray(d.companies)) await db.replaceAll('companies', d.companies);
    if (Array.isArray(d.contacts)) await db.replaceAll('contacts', d.contacts);
  }
  if (fmt === 'billing' || fmt === 'unified') {
    await billing.applyBackupData({
      clients: d.clients, cases: d.cases, invoices: d.invoices,
      payments: d.payments, balances: d.balances,
      billingSettings: d.billingSettings || d.settings, // Lawfee משתמש ב-settings
    });
  }
}

/** אוסף את כל הנתונים (CRM + חיוב) לאובייקט גיבוי מאוחד יחיד */
export async function collectAll() {
  const [contacts, companies] = await Promise.all([db.getAll('contacts'), db.getAll('companies')]);
  const bil = await billing.collectBackupData();
  return { app: 'lexledger-unified', version: 2, exportedAt: new Date().toISOString(), contacts, companies, ...bil };
}

/** קורא קובץ JSON ומחזיר את האובייקט (זורק שגיאה אם לא תקין) */
export async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}
