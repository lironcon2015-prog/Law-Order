# ROADMAP — LexLedger מאוחד (CRM + חיוב)

> מסמך חי. מעדכנים בסוף כל שלב: לסמן ✅ מה שבוצע, להזיז סעיפים, לעדכן "החלטות מפתח".
> עדכון אחרון: 2026-06-30 (Phase 3 הושלם)

## מטרה
לאחד את **Law-Order** (CRM פיתוח עסקי) ו-**Lawfee-2.0** (חיוב/כספים) לאפליקציה אחת אורגנית —
IA יחיד (sidebar), מושג לקוח משותף, דשבורד מאוחד. לא "שתי אפליקציות מודבקות".

## איפה נבנה / פריסה
- **כל האפליקציה המאוחדת חיה בתת-תיקייה `v2/`** בריפו (נתיבים יחסיים, SW scope נפרד).
- ענף עבודה: **`claude/unified-fintech-crm-billing-6qdhb2`**.
- push לענף → fast-forward ל-`main` → תצוגה מקדימה ב-**https://lironcon2015-prog.github.io/Law-Order/v2/**.
- `lironcon.com/crm` (השורש, דרך ה-Cloudflare Worker) נשאר על האפליקציה הנוכחית — **לא נוגעים** עד promote.
- promote עתידי: שינוי ה-Worker (`/crm` → `/Law-Order/v2`) או העברת `v2/` לשורש.

## מקורות
- קוד החיוב: ריפו **`lironcon2015-prog/lawfee-2.0`** (clone מקומי: `/workspace/lawfee-2.0`).
  קבצים: `db.js`, `clients.js`, `invoices.js`, `payments.js`, `dashboard.js`, `settings.js`, `import.js`, `drive.js`, `design/`.
- בסיס ה-CRM: שורש הריפו הנוכחי (`css/styles.css`, `js/*`).

## החלטות מפתח (Decisions Log)
1. **שפת עיצוב = Obsidian Gold המלא של ה-CRM** (רקע אובסידיאן כהה, זהב מלוטש עם gradient, זכוכית+blur,
   שכבות עומק `elev-1/2/3`, הילת זהב, שכבות רקע נושמות glow/grain/vignette, תנועת spring).
   *(בוטל: כיוון "Fintech בהיר" מהתוכנית המקורית, וגם גרסת ה-tokens השטוחה המוכהית — שניהם נמצאו פחות מודרניים.)*
2. **ניווט = Sidebar** (לא header+viewtoggle) — כדי להכיל את ה-IA המורחב (CRM + כספים).
3. דשבורד מאוחד = כרטיסי KPI hero (כספים) + גרפי תשלומים/עמלות + תצוגת "היום" של ה-CRM. **בלי טבלאות בדשבורד.**
4. דף **אנליזה** נפרד לטבלאות חשבונות/לקוחות.
5. ייבוא שני הגיבויים (billing + CRM) → המצב הקיים של שתיהן נטען לאפליקציה המאוחדת.
6. סנכרון Drive מאוחד — קובץ גיבוי אחד לכל ה-stores (ביטול `drive.js` של Lawfee).

---

## שלבים

### ✅ Phase 1 — מערכת עיצוב + shell + restyle CRM  *(הושלם)*
- [x] `v2/css/styles.css` = Obsidian Gold המלא, עם shell של **sidebar** (sb/sb-item/sb-footer + content/topbar).
- [x] `v2/index.html` — sidebar + שכבות רקע (glow/grain/vignette).
- [x] כל מסכי ה-CRM (היום/Pipeline/רשת/רשימה/detail/טפסים/modal/drawer) בעיצוב החדש.
- [x] `app.js` ניווט sidebar (`body.view-*`); שאר ה-JS זהה לשורש.
- [x] אימות Chromium + seed: 5 מסכים, 0 שגיאות. SW `unified-v3`.

### ✅ Phase 2 — פורט חיוב  *(הושלם)*
- [x] `v2/js/db.js` → schema v2 (DB אחד `maCrmDB`): stores `clients` · `cases` · `invoices` · `payments` · `balances` · `billingSettings` + `addAuto`.
- [x] `v2/js/billing.js` — דומיין החיוב (פורט מ-Lawfee): clients/cases/invoices/payments/balances/settings, `computeLedger`, עמלה אוטומטית, `collect/applyBackupData`.
- [x] `v2/js/billing-app.js` — controller + רינדור 4 מסכים בעיצוב Obsidian Gold (delegation עצמאי `data-bil*`, modal מקומי, demo seed).
- [x] מסכים: **לקוחות ותיקים · חשבוניות · תשלומים · הגדרות** (KPI strip, טבלאות, type-badges, מאזן שנתי, חישוב עמלה חי).
- [x] מקטע "כספים" ב-sidebar + routing ב-`app.js` (mainView: clients/invoices/payments/fin-settings).
- [x] אימות Chromium + seed: 4 מסכים + טופס, מאזן נכון (3,193+12,800−8,732=7,261), 0 שגיאות. SW `unified-v4`.

### ✅ Phase 3 — דשבורד מאוחד + אנליזה  *(הושלם)*
- [x] `v2/js/charts.js` — גרפי SVG משלנו: `barChart` (grouped) + `donut` (fintech, Obsidian Gold).
- [x] דשבורד מאוחד (mainView `today`): KPI **hero = הכנסה כוללת השנה** (מיושר לימין, בלי תת-שורה); KPIs בסדר לוגי (פתיחה→עמלות→תשלומים→**יתרה לתשלום** מודגש); BarChart תזרים חודשי; **Donut פילוח לפי לקוח** עם מתג הכנסות/עמלות; קטע **"היום"** של ה-CRM (`ui.buildToday`). בלי טבלאות.
- [x] דף **אנליזה** = בדיוק כמו עמוד הבית של Lawfee: פירוט חודשי (יתרה מתגלגלת) · פירוט לפי לקוח (נפתח לתיקים) · פירוט חודשי לפי לקוח (pivot, נפתח, **מתג הכנסות/עמלות**).
- [x] אימות Chromium + seed: דשבורד + אנליזה + מתגים + הרחבת שורות, נתונים עקביים (הכנסה 160,000 / עמלות 12,800 / יתרה 7,261), 0 שגיאות. SW `unified-v7`.

### ☐ Phase 4 — ייבוא + סנכרון מאוחד
- [ ] importer מזהה פורמט (billing vs CRM) וטוען לכל ה-stores.
- [ ] `v2/js/sync.js` collect/apply לכל ה-stores → קובץ גיבוי אחד. ביטול `drive.js` של Lawfee.

### ☐ Phase 5 — Bridge (סינרגיה)
- [ ] קישור CRM contact/company ↔ billing client (מושג לקוח משותף).
- [ ] הכנסה/עמלה שחויבה בפועל → ROI/שווי ב-Pipeline וברשת.
- [ ] פעולת "המר ליד → לקוח".

---

## תשתית / אימות (לכל שלב)
- `sw.js`: bump `CACHE` + precache (כולל קבצים/פונטים חדשים).
- בדיקות node: ledger math (commission, `computeLedger`), importer (זיהוי פורמט), helpers.
- Chromium + seed/ייבוא דמו: כל מסך מרונדר בעיצוב הנכון, 0 שגיאות קונסול. צילומים לכל שלב.
- זרימת OAuth/Drive — נבדקת רק אצל המשתמש (לא מהסביבה).
