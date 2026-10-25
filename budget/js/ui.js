// ui.js — נקודת הכניסה של שכבת התצוגה. app.js מייבא מכאן (`import * as ui`).
// הקוד עצמו מחולק לפי מסך: יסודות (ui-kit), סרגל ותיק (ui-overview), עסקה ותקציב (ui-deal),
// דיווחים (ui-reports), ניתוח (ui-analysis) והגדרות/ספריות/טפסים (ui-admin).
// כל המודולים שטוחים (‎./x.js) — בניית האופליין יודעת לארוז רק כך.

export * from './ui-kit.js';
export * from './ui-overview.js';
export * from './ui-deal.js';
export * from './ui-reports.js';
export * from './ui-analysis.js';
export * from './ui-admin.js';
