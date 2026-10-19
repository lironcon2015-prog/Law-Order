# LexLedger — CLAUDE.md
> **קרא קובץ זה לפני כל עבודה על הפרויקט. בד"כ אין צורך לפתוח קבצים נוספים.**

---

## סקירה כללית

PWA ניהול שכר טרחה לעורך דין. Vanilla JS, HTML5, IndexedDB, Service Worker.
עברית RTL. פריסה: GitHub Pages. ללא build process, ללא frameworks.

**Stack:** HTML + CSS (style.css) + Tailwind CDN + Vanilla JS modules + IndexedDB

---

## מבנה קבצים

```
index.html       — shell ראשי + כל HTML של כל views (668 שורות)
style.css        — עיצוב לתוכן שנוצר ב-JS (data-table, btn-*, cards, charts)
sw.js            — Service Worker (CACHE_VERSION — bump בכל commit שמשנה קוד)
version.json     — { "version": "X.Y.Z", "date": "YYYY-MM-DD" }

db.js            — IndexedDB wrapper (כל persistence)
ui.js            — UI helpers: toast, modal, formatters, formField, tdNum/tdText
app.js           — router, navigation, backup/restore, DOMContentLoaded
dashboard.js     — Dashboard: KPIs, bar chart, donut, breakdown tables
clients.js       — Clients & Cases: accordion cards, CRUD
invoices.js      — Invoices: list + filters + manual-add modal
payments.js      — Payments: list + filters + add modal
import.js        — Import: Excel parser + PDF extractor (Importer)
settings.js      — Settings: opening balance, commission, version check

design/          — פרוטוטייפ React בלבד — לא נטען ב-production
  LexLedger Redesign.html, components.jsx, screens.jsx, screens-2.jsx,
  design-canvas.jsx, tokens.css, data.js
```

---

## תלויות CDN (index.html)

| ספרייה | גרסה | שימוש |
|--------|------|-------|
| Google Fonts — Assistant, Rubik, IBM Plex Mono | latest | גופנים |
| Material Symbols Outlined | latest | אייקונים (`material-symbols-outlined`) |
| Tailwind CSS | CDN + plugins: forms, container-queries | layout/shell |
| style.css | local | כיתות JS-generated |
| SheetJS | xlsx-0.20.2 | ייבוא Excel |
| PDF.js | 3.11.174 | ייבוא PDF |

**Tailwind config (בתוך index.html):**
- `midnight-{50..950}` — סיידבר כהה (950=bg, 600/700=active/hover)
- `neutral-{50..950}` — תוכן, טקסט, גבולות
- `gold-{50..950}` — לוגו, highlights זהב (500=עיקרי)
- `accent-{50..950}` — כחול, כפתורים ראשיים
- `shadow-card`, `shadow-card-hover`, `shadow-btn`
- `font-sans` (Assistant), `font-heading` (Rubik), `font-mono` (IBM Plex Mono)

---

## Module Pattern (כל קובץ JS)

```js
const ModuleName = (() => {
  async function init()   { /* קריאה פעם ראשונה + event listeners */ }
  async function render() { /* עדכון DOM בלבד */ }
  return { init, render };
})();
window.ModuleName = ModuleName;
```

**סדר טעינה ב-index.html:** `db → ui → import → dashboard → clients → invoices → payments → settings → app`

**ניווט ב-App:** `App.navigate('dashboard'|'clients'|'invoices'|'payments'|'import'|'settings')`
כל view מחזיק state ב-module המתאים. `App.refreshCurrentView()` מאפס את ה-init.

---

## DB API — db.js (IndexedDB: LexLedgerDB v1)

### Schema
| Store | keyPath | אינדקסים | שדות עיקריים |
|-------|---------|---------|-------------|
| clients | id (auto) | name | name, createdAt |
| cases | id (auto) | clientId, caseNumber | clientId, caseNumber, description, caseType, commissionRate, arrangementType, openDate |
| invoices | id (auto) | caseId, year, [year,month] | caseId, month(1-12), year, amount, commissionRate, commission, notes, source |
| payments | id (auto) | year, [year,month] | year, month(1-12), amount, notes |
| balances | year (keyPath) | — | year, openingBalance |
| settings | key (keyPath) | — | key, value |

### clients
```js
DB.clients.getAll()
DB.clients.get(id)
DB.clients.add(name)                         // → newId
DB.clients.update({id, name, ...})
DB.clients.delete(id)
```

### cases
```js
DB.cases.getAll()
DB.cases.get(id)
DB.cases.getByClient(clientId)
DB.cases.findByCaseNumber(caseNumber)        // → case | null
DB.cases.add({clientId, caseNumber, description, caseType, commissionRate, arrangementType, openDate})
DB.cases.update(record)
DB.cases.delete(id)
// caseType values: 'שוטף' | 'ליטיגציה' | 'עסקה'
```

### invoices
```js
DB.invoices.getAll()
DB.invoices.get(id)
DB.invoices.getByCase(caseId)
DB.invoices.getByYear(year)
DB.invoices.add({caseId, month, year, amount, commissionRate?, commission?, notes?, source?})
// source: 'manual'|'pdf'|'import' — commission מחושב אוטומטית אם לא מסופק
DB.invoices.update(record)                   // commission מחושב מחדש
DB.invoices.delete(id)
DB.invoices.totalAmountForYear(year)         // → number
DB.invoices.totalCommissionForYear(year)     // → number
DB.invoices.byMonthForYear(year)             // → {1:{amount,commission}, ..., 12:{...}}
```

### payments
```js
DB.payments.getAll()
DB.payments.get(id)
DB.payments.getByYear(year)
DB.payments.add({year, month?, amount, notes?})
DB.payments.update(record)
DB.payments.delete(id)
DB.payments.totalForYear(year)               // → number
DB.payments.byMonthForYear(year)             // → {month: total, ...}
```

### balances
```js
DB.balances.get(year)                        // → {year, openingBalance} | undefined
DB.balances.set(year, openingBalance)
DB.balances.getAll()
DB.balances.computeLedger(year)
// → { year, openingBalance, totalCommissions, totalPayments, closingBalance }
// closingBalance = openingBalance + totalCommissions - totalPayments
```

### settings
```js
DB.settings.get(key)                         // → value | null
DB.settings.set(key, value)
DB.settings.delete(key)
DB.settings.getKnownYears()                  // → [2026, 2025, ...] מכל invoices/payments/balances
```

### backup
```js
DB.backup.export()      // → { version:1, exported, clients, cases, invoices, payments, balances, settings }
DB.backup.import(data)  // מוחק הכל ומחזיר מגיבוי
DB.backup.clearAll()
```

---

## UI API — ui.js

### Formatters
```js
UI.monthName(n)          // 1→'ינואר' ... 12→'דצמבר'
UI.formatNumber(n)       // 1234 → '1,234'
UI.formatCurrency(n)     // 1234.5 → '₪ 1,234.50'
UI.formatPct(n)          // 25 → '25%'
UI.sourceBadge(source)   // 'pdf'|'manual'|'import' → HTML badge string
```

### Table helpers
```js
UI.emptyRow(colspan, msg?)                        // <tr> ריק עם אייקון inbox
UI.tdNum(val, {positive?, gold?, negative?})      // <td> ממוספר עם צבע
UI.tdText(val, cls?)                              // <td> רגיל
UI.summaryRow([cell, ...])
// cell = string | { v: string, num: bool }  → שורת סיכום bold, bg-neutral-50, border-t-2
```

### Forms
```js
UI.formField({ id, label, type?, value?, required?, opts? })
// type: 'text'|'number'|'select'|'textarea'
// opts: { placeholder, hint, step, min, max, options:[{value,label}] }
// → HTML string של form-group מלא עם label
```

### Selects
```js
UI.populateYearSelect(selectId, selectedYear)     // ממלא <select> שנים מה-DB
UI.populateClientSelect(selectId, withAll?)       // withAll=true → "כל הלקוחות" בראש
```

### Toast
```js
UI.toast(msg, type?, duration?)
// type: 'success'|'error'|'warning'|'info'  default: 'info', duration default: 3500ms
// מוסיף ל-#toast-container (fixed bottom-left)
```

### Modal (generic)
```js
UI.openModal({ title, bodyHTML?, confirmLabel?, onConfirm?, wide? })
// wide: bool → max-w-2xl במקום max-w-md
// onConfirm: async fn — הכפתור מציג '⏳ שומר…' ומטפל בשגיאות
UI.closeModal()
UI.confirm(msg, onConfirm)   // modal עם אזהרה + כפתור אדום 'אשר'
```

### init
```js
UI.init()   // wire modal/keyboard/nav-active. נקרא מ-app.js
```

---

## App API — app.js

```js
App.navigate(viewName)        // מסתיר views, מציג view, קורא init/render
App.refreshCurrentView()      // force re-init של view הנוכחי
App.exportBackup()            // מוריד JSON גיבוי
```

---

## HTML IDs המרכזיים ב-index.html

### Sidebar
```
#sidebar, #sidebar-nav
nav a[data-view="dashboard|clients|invoices|payments|import|settings"]
#btn-export-backup, #btn-import-backup, #input-restore-file
```

### Views
```
#view-dashboard, #view-clients, #view-invoices,
#view-payments, #view-import, #view-settings
(class="view"; hidden על כולם חוץ מהפעיל)
```

### Dashboard
```
#dashboard-year                    — <select> שנה
#kpi-balance, #kpi-opening,        — ערכי KPI (textContent)
#kpi-revenue, #kpi-commissions, #kpi-payments
#hero-meta                         — meta text מתחת ל-balance
#monthly-chart-svg                 — SVG גרף עמודות (innerHTML)
#monthly-legend                    — מקרא גרף
#donut-svg, #donut-center-val, #donut-legend
#monthly-table-body                — <tbody> טבלת חודשים
#client-breakdown-body             — <tbody> פירוט לקוחות
#client-monthly-table-body         — <tbody> טבלה חודשית לפי לקוח
#toggle-client-monthly-metric      — כפתור הכנסות↔עמלות
#toggle-client-monthly-group       — כפתור לקוח↔תיק
```

### Clients
```
#btn-add-client, #btn-merge-clients
#clients-list                      — container לכרטיסי לקוחות
```

### Invoices
```
#btn-add-invoice
#invoice-filter-year, #invoice-filter-client
#invoices-table-body
```

### Payments
```
#btn-add-payment
#payments-filter-year
#payments-table-body
#payments-summary
```

### Import — Excel
```
#excel-dropzone, #input-excel-file
#import-preview                    — container תצוגה מקדימה
#btn-confirm-import, #btn-cancel-import
#balance-year, #balance-amount, #btn-save-balance
```

### Import — PDF
```
#pdf-dropzone, #input-pdf-file
#pdf-modal-overlay, #pdf-modal, #pdf-modal-body
#pdf-modal-save, #pdf-modal-cancel, #pdf-modal-close
```

### Settings
```
#settings-current-version, #settings-version-date
#btn-check-update, #settings-update-status
```

### Modals & Toasts
```
#modal-overlay, #modal, #modal-title, #modal-body
#modal-confirm, #modal-cancel, #modal-close
#toast-container                   — fixed bottom-8 left-8
```

---

## CSS Classes (style.css) — בשימוש ב-JS

### כפתורים
```
.btn-primary  — midnight bg, white text, rounded-xl
.btn-ghost    — שקוף, border, hover bg
.btn-danger   — red bg
.btn-sm       — גודל קטן
.btn-icon     — icon-only עגול
```

### טבלאות
```
.data-table           — border-collapse, striped rows
.data-table th/td.num — text-align:left, font-mono
.table-wrap           — overflow-x:auto wrapper
```

### כרטיסי לקוח (clients.js)
```
.client-card, .client-card-header, .client-name
.client-case-count, .client-cases, .client-actions
```

### גרפים (dashboard.js)
```
.bars-svg, .bar-grp, .axis-label, .x-label, .grid-line, .bar-tip
.donut-svg, .donut-center, .donut-center-label
.donut-legend, .dl-row, .dl-dot, .dl-name, .dl-val
.chart-empty
```

### Import
```
.preview-table, .preview-scroll, .preview-title
.extracted-field, .extracted-label, .extracted-value
.merge-client-option
.onboarding-hint, .oh-icon, .oh-title, .oh-action
```

### שונות
```
.form-group, .form-input, .form-label
.commission-label, .commission-preview, .commission-value
.summary-row          — bold border-top
.positive / .negative — ירוק / אדום
.text-gold            — var(--color-gold)
.empty-state          — centered empty message
```

---

## כללי עבודה

1. **עבודה ישירה על `main`** — כל משימה מבוצעת על בראנץ' `main` (checkout main לפני התחלה אם נדרש). אם הסוכן נדרש לעבוד על בראנץ' אחר (למשל ע"י הרנס), עליו לסיים במיזוג חזרה ל-`main` ודחיפה ל-`origin main` — ללא קשר להנחיות הבראנץ'.
2. **תמיד להשלים את המשימה עד הסוף** — בצע שינוי → bump גרסה → commit → push ל-`origin main`. לא עוצרים באמצע. ה-remote חייב להיות מעודכן בסוף כל פעולה.
3. **עדכן גרסה בכל פעולה** — בכל commit שמשנה קוד (HTML/CSS/JS), חובה לעדכן ביחד:
   - `sw.js` — שנה את `CACHE_VERSION` (למשל `'1.5.1'` → `'1.5.2'`)
   - `version.json` — עדכן `version` + `date` (YYYY-MM-DD, תאריך היום)
   - `index.html` — שנה את `window._BUNDLE_VERSION` (שורה ראשונה אחרי `<body>`) לאותה גרסה
   - שיטת bump: patch (1.5.1→1.5.2) לתיקוני UI/באגים קטנים; minor (1.5→1.6) לפיצ'ר חדש; major לשינוי שובר תאימות
   - שלושת הקבצים חייבים להיות תמיד באותה הגרסה
4. **RTL תמיד** — Tailwind: `ml-*` הוא visual-left (= physical-left, בעברית = כיוון ה"התחלה")
5. **HTML ב-index.html** — views קיימים מראש; JS ממלא `innerHTML` בלבד
6. **אל תוסף framework** — Vanilla JS בלבד
7. **סדר scripts חשוב** — db → ui → import → dashboard → clients → invoices → payments → settings → app
8. **design/** — לא לגעת בעבודה רגילה
9. **Tailwind + style.css** — שניהם פעילים; Tailwind לshell/layout, style.css לJS-generated HTML

### סקיל פעיל: token-efficient-workflow

> קובץ הסקיל המלא: `.claude/skills/token-efficient-workflow/SKILL.md`

**Core Directive:** Deliver accurate code using the minimum tokens possible. Silence is preferred over explanation.

**Tool & Edit Rules:**
- **Map via MD, then safe search.** Read structural docs first, then `grep -n "exactName"` / `head -20`. No speculative reads.
- **Targeted reads only.** Never read a full file if a `view_range` suffices.
- **No redundant reads.** File already in context → work from it.
- **Surgical edits.** `str_replace` on specific blocks > full file rewrite.

**Output & Communication Rules:**
- **Zero filler.** No greetings, transitions, or closing remarks.
- **Silent completion.** After an edit, no "Changes applied." summary.
- **Silent planning.** Simple fixes: execute directly. Complex refactors only: `<thinking>` max 3 bullets, never output the plan.
- **Batch questions.** All clarifications in one bulleted message.
- **Explain why, never what.** Max 2 bullets, only when counter-intuitive.

**Anti-patterns:**
1. Reading full files instead of view ranges.
2. Outputting unchanged code alongside a fix.
3. Running broad `grep` returning hundreds of lines.
4. Saying "I will now…" or "I have updated…".
5. Planning with `<thinking>` for trivial tasks.

### Flow ביצוע סטנדרטי (חובה לכל משימה)
1. ודא שאתה על `main` ומסונכרן (`git checkout main && git pull origin main`)
2. בצע את השינוי בקוד
3. Bump ל-`sw.js` (CACHE_VERSION) **ו**-`version.json` (version + date) **ו**-`index.html` (`_BUNDLE_VERSION`) — תמיד שלושתם ביחד
4. Commit יחיד שכולל: שינויי הקוד + sw.js + version.json
5. `git push origin main` — חובה, אחרת המשימה לא הושלמה
6. **אם עבדת על בראנץ' אחר** — מזג ל-`main` (`git checkout main && git merge <branch>`) ודחוף (`git push origin main`) לפני סיום. לא מחכים לבקשה.
