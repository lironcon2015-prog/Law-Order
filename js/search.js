// search.js — סינון, חיפוש גלובלי, מיון לפי דחיפות מעקב, וסינון משפך.

import { companyNameMap, isOverdue, followUpRatio } from './store.js';

function norm(s) { return (s || '').toString().toLowerCase().trim(); }

/**
 * חיפוש חופשי על אנשי קשר.
 * מתאים על: שם מלא, תפקיד, שם החברה הנוכחית, תגיות,
 * ושמות חברות/משקיעים מתוך ה-career timeline.
 */
export function filterContacts(contacts, companies, term) {
  const q = norm(term);
  if (!q) return contacts;

  const names = companyNameMap(companies);
  const investorsByCompany = new Map(companies.map((c) => [c.id, c.investors || []]));

  return contacts.filter((c) => {
    const haystack = [];
    haystack.push(c.fullName, c.role, c.origin);
    haystack.push(names.get(c.currentCompanyId) || '');
    (c.tags || []).forEach((t) => haystack.push(t));
    (c.contactInfo && Object.values(c.contactInfo)) ? Object.values(c.contactInfo).forEach((v) => haystack.push(v)) : null;
    (c.careerTimeline || []).forEach((e) => {
      haystack.push(e.role, e.companyName);
      haystack.push(names.get(e.companyId) || '');
      (investorsByCompany.get(e.companyId) || []).forEach((inv) => haystack.push(inv));
    });
    (investorsByCompany.get(c.currentCompanyId) || []).forEach((inv) => haystack.push(inv));
    (c.referrals || []).forEach((r) => haystack.push(r.dealName));

    return haystack.some((field) => norm(field).includes(q));
  });
}

/** סינון לפי שלב במשפך (status key). 'all' מחזיר הכל. */
export function filterByStatus(contacts, statusKey) {
  if (!statusKey || statusKey === 'all') return contacts;
  if (statusKey === 'overdue') return contacts.filter(isOverdue);
  return contacts.filter((c) => c.status === statusKey);
}

/**
 * מיון לפי דחיפות מעקב: קודם מי שבפיגור, ואז לפי הקרבה/חריגה מהסף.
 * משמש לתצוגת "למעקב" — מי לדחוף עכשיו.
 */
export function sortByFollowUp(contacts) {
  return [...contacts].sort((a, b) => {
    const ao = isOverdue(a), bo = isOverdue(b);
    if (ao !== bo) return ao ? -1 : 1;
    return followUpRatio(b) - followUpRatio(a);
  });
}

/** מיון אלפביתי (ברירת מחדל לרשימה הראשית) */
export function sortByName(contacts) {
  return [...contacts].sort((a, b) => a.fullName.localeCompare(b.fullName, 'he'));
}
