// align-audit.mjs — אודיט יישור מספרים (ראה CLAUDE.md, "יישור מספרים ב-RTL").
// הרצה:  node budget/tools/align-audit.mjs [url]     ברירת מחדל: http://localhost:8765/budget/
// חייב להחזיר 0. בודק: (א) מחסניות תווית↑/ערך↓  (ב) עמודות טבלה — כותרת מול הערכים
// (ג) רשימת הצוותים (grid) — כותרת עמודה מול התאים. כל מסך נסרק פעמיים: בשעות וב-₪.
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
// תקרה נמוכה מהביצוע כדי שכרטיסי התקרה והתעריפים האפקטיביים יוצגו
await p.evaluate(async () => { const s = window.lexBudget.store; const d = s.cache.deals[0]; d.feeModel = 'capped'; d.agreedFee = 50000; await s.saveDeal(d); });
await p.waitForTimeout(1200);

/** פותח כל מה שמקופל (צוותים, פאנלים, חודשים) — שורה מוסתרת לא נמדדת */
const expandAll = () => p.evaluate(async () => {
  for (const d of document.querySelectorAll('details:not([open])')) d.open = true;
  for (const g of document.querySelectorAll('.mgroup.is-collapsed')) g.classList.remove('is-collapsed');
  for (const h of document.querySelectorAll('.has-more')) h.classList.add('show-all');
});

const scan = () => p.evaluate(() => {
  const box = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
  const out = [];

  // (א) מחסניות
  for (const v of document.querySelectorAll('.num')) {
    const parent = v.parentElement;
    if (!parent || !v.textContent.trim() || parent.tagName === 'TR' || v.offsetParent === null) continue;
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
    if (table.offsetParent === null) continue;
    const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!headRow) continue;
    // כל ה-tbody (טבלה מקובצת לפי חודש מחזיקה tbody לכל קבוצה); שורת כותרת קבוצה (colspan) מדולגת
    const bodyRows = [...table.tBodies].flatMap((tb) => [...tb.rows])
      .filter((row) => ![...row.cells].some((x) => x.colSpan > 1) && row.offsetParent !== null);
    if (!bodyRows.length) continue;
    for (let c = 0; c < headRow.cells.length; c++) {
      const th = headRow.cells[c];
      if (!th.textContent.trim() || th.colSpan > 1) continue;
      const hr = box(th);
      if (!hr.width) continue;
      for (const row of bodyRows.slice(0, 12)) {
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

  // (ג) רשימת הצוותים — כל שורה היא grid נפרד; הכותרת והתאים חייבים לחלוק קצה ימני
  const head = document.querySelector('.trow--head');
  if (head && head.offsetParent !== null) {
    const heads = [...head.children];
    for (const row of document.querySelectorAll('.trow:not(.trow--head)')) {
      [...row.children].forEach((cell, i) => {
        const h = heads[i];
        if (!h || !h.textContent.trim() || !cell.classList.contains('trow__num') || !cell.textContent.trim()) return;
        const hr = box(h), cr = box(cell);
        if (Math.abs(hr.right - cr.right) > 3) out.push(`רשימת צוותים "${h.textContent.trim()}" ↔ "${cell.textContent.trim().slice(0, 16)}" Δ=${Math.round(hr.right - cr.right)}`);
      });
    }
  }
  return [...new Set(out)];
});

let total = 0;
const report = (name, r) => {
  total += r.length;
  console.log(`### ${name}: ${r.length ? `${r.length} בעיות\n  ` + r.slice(0, 8).join('\n  ') : 'תקין'}`);
};

for (const unit of ['hours', 'money']) {
  // מתג היחידה נמצא בתיק העסקאות ובכותרת העסקה (לא בהגדרות) — מחליפים מהתיק ונכנסים לעסקה
  await p.locator('.side [data-action="go-overview"]').click(); await p.waitForTimeout(600);
  await p.locator(`[data-action="set-unit"][data-unit="${unit}"]`).first().click();
  await p.waitForTimeout(600);
  await p.locator('.side__deal').first().click(); await p.waitForTimeout(800);
  for (const tab of ['budget', 'reports', 'analysis', 'settings']) {
    await p.locator(`.tab[data-tab="${tab}"]`).click();
    await p.waitForTimeout(700);
    if (tab === 'budget') {
      // כל הצוותים פתוחים — גם הגיליונות נבדקים
      const closed = await p.locator('.trow[data-team-id]:not(.trow--open) .trow__chev').count();
      for (let i = 0; i < closed; i++) {
        await p.locator('.trow[data-team-id]:not(.trow--open) .trow__chev').first().click();
        await p.waitForTimeout(250);
      }
    }
    await expandAll(); await p.waitForTimeout(200);
    report(`${tab} · ${unit === 'money' ? '₪' : 'שעות'}`, await scan());
  }
  await p.locator('.side [data-action="go-overview"]').click(); await p.waitForTimeout(800);
  await expandAll();
  report(`תיק העסקאות · ${unit === 'money' ? '₪' : 'שעות'}`, await scan());
}
await p.locator('.side [data-action="go-people"]').click(); await p.waitForTimeout(600);
report('אנשי צוות', await scan());
await p.locator('.side [data-action="go-rates"]').click(); await p.waitForTimeout(600);
report('תעריפונים', await scan());

console.log(`\nסה"כ: ${total} | שגיאות קונסול: ${errs.length ? errs.join(' | ') : 'אין'}`);
await b.close();
