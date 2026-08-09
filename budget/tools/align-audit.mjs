// align-audit.mjs — אודיט יישור מספרים (ראה CLAUDE.md, "יישור מספרים ב-RTL").
// הרצה:  node budget/tools/align-audit.mjs [url]     ברירת מחדל: http://localhost:8765/budget/
// חייב להחזיר 0. אודיט יישור מלא: (א) מחסניות תווית↑/ערך↓  (ב) עמודות טבלה — כותרת מול הערכים.
// נמדד לפי תיבת הגליפים (Range) ולא לפי האלמנט, כי תיבת האלמנט נמתחת על כל התא.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const URL_ = process.argv[2] || 'http://localhost:8765/budget/';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await p.goto(URL_); await p.waitForTimeout(1600);
await p.evaluate(() => window.lexBudget.seedDemo()); await p.waitForTimeout(2400);
// תקרה נמוכה מהביצוע כדי שכרטיסיות התקרה יוצגו
await p.evaluate(async () => { const s = window.lexBudget.store; const d = s.cache.deals[0]; d.feeModel = 'capped'; d.agreedFee = 50000; await s.saveDeal(d); });
await p.waitForTimeout(1200);

const scan = () => p.evaluate(() => {
  const box = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
  const out = [];

  // (א) מחסניות
  for (const v of document.querySelectorAll('.num')) {
    const parent = v.parentElement;
    if (!parent || !v.textContent.trim() || parent.tagName === 'TR') continue;
    const label = [...parent.children].find((c) => c !== v && c.textContent.trim());
    if (!label) continue;
    const lr = box(label), vr = box(v);
    if (!lr.width || !vr.width) continue;
    if (vr.top - lr.top > 4 && Math.min(lr.right, vr.right) - Math.max(lr.left, vr.left) > 4
        && Math.abs(lr.right - vr.right) > 3) {
      out.push(`מחסנית ${parent.className} :: "${label.textContent.trim().slice(0, 18)}" ↔ "${v.textContent.trim().slice(0, 18)}" Δ=${Math.round(lr.right - vr.right)}`);
    }
  }

  // (ב) עמודות טבלה
  for (const table of document.querySelectorAll('table')) {
    const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!headRow) continue;
    const body = table.tBodies[0]; if (!body) continue;
    for (let c = 0; c < headRow.cells.length; c++) {
      const th = headRow.cells[c];
      if (!th.textContent.trim() || th.colSpan > 1) continue;
      const hr = box(th);
      if (!hr.width) continue;
      for (const row of [...body.rows].slice(0, 12)) {
        const td = row.cells[c];
        if (!td || td.colSpan > 1 || !td.textContent.trim()) continue;
        if (td.querySelector('input, select, button, svg')) continue;
        const tr = box(td);
        if (!tr.width) continue;
        if (Math.abs(hr.right - tr.right) > 3 && Math.abs(hr.left - tr.left) > 3) {
          out.push(`טבלה ${table.className || ''} עמודה "${th.textContent.trim().slice(0, 16)}" ↔ "${td.textContent.trim().slice(0, 16)}" Δימין=${Math.round(hr.right - tr.right)}`);
          break;
        }
      }
    }
  }
  return [...new Set(out)];
});

let total = 0;
for (const tab of ['תקציב', 'דיווח ומעקב', 'חשבונות ומסמכים', 'בקרה', 'תחקיר', 'הגדרות']) {
  await p.locator('.subtabs button', { hasText: tab }).first().click();
  await p.waitForTimeout(900);
  const r = await scan();
  total += r.length;
  console.log(`### ${tab}: ${r.length ? `${r.length} בעיות\n  ` + r.slice(0, 8).join('\n  ') : 'תקין'}`);
}
await p.locator('button', { hasText: 'סקירה' }).first().click(); await p.waitForTimeout(1000);
const r = await scan(); total += r.length;
console.log(`### סקירה: ${r.length ? `${r.length} בעיות\n  ` + r.slice(0, 8).join('\n  ') : 'תקין'}`);
console.log(`\nסה"כ: ${total} | שגיאות קונסול: ${errs.length ? errs.join(' | ') : 'אין'}`);
await b.close();
