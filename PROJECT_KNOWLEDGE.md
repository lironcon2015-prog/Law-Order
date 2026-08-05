# PROJECT_KNOWLEDGE — LexLedger

מסמך ידע חי. עדכן בסוף שיחה משמעותית. גרסה נוכחית: **v7** (root) / **unified-v15** (v2) לפי `CACHE` ב-`sw.js`.

## 1. מצב נוכחי
CRM אישי לעו"ד M&A, vanilla JS · PWA · offline-first · RTL. חי ב-`lironcon.com/crm` (דרך Cloudflare Worker מעל GitHub Pages/main).
פיצ'רים פעילים:
- **שתי תצוגות** (`state.mainView`): **Pipeline** (קנבן לפי שלבי משפך, ברירת מחדל) ו-**List** (sidebar + detail). מתג בכותרת.
- **Pipeline**: נתיב צבעוני לשלב, כרטיסים צפים (תמונה/ראשי-תיבות, badge דחיפות, שווי עסקה מצטבר, אינטראקציה אחרונה), drag&drop בין נתיבים = שינוי שלב.
- **תצוגת פרטים בטאבים** (סקירה/קריירה/הפניות/הערות) — ב-drawer צד (Pipeline) או ב-`#main` (List).
- **תמונות פרופיל**: העלאת קובץ (מוקטן ל-256px, dataURL ב-IndexedDB, offline) או URL; נפילה לראשי-תיבות.
- **סוג איש קשר** (`contactType`): בעל תפקיד בחברה / מתווך / בנקאי השקעות / משקיע / עו"ד / אחר. חברה אופציונלית.
- **מנהל חברות**: רשימה + מחיקה (עם אזהרת אנשי קשר מושפעים) + הוספה.
- **סנכרון Google Drive** (`js/sync.js`): קובץ JSON יחיד, OAuth client-side, auto-pull בטעינה, push אוטומטי מבוזבז, דיאלוג קונפליקט. `CLIENT_ID` מוזן.
- **v2 (מאוחד, `v2/`)**: ייבוא חשבוניות מקובץ **PDF/Excel/CSV** עם זיהוי וסיווג אוטומטי (`v2/js/invoice-import.js` + vendor מקומי SheetJS/pdf.js ב-precache → offline). כפתור במסך חשבוניות → מסך סיווג לאישור.

## 2. מודל נתונים (IndexedDB `maCrmDB`)
- **contacts**: `id, fullName, status (LEAD_STATUSES), contactType, currentCompanyId, role, origin, photoUrl, contactInfo{phone,email,linkedin}, tags[], careerTimeline[{companyId,companyName,role,startYear,endYear}], referrals[{dealName,status,estimatedValue}], chronologicalNotes[{timestamp,noteText}], lastContactDate, contactFrequencyDays`.
- **companies**: `id, name, sector, investors[], website`.
- **משפך** `LEAD_STATUSES`: cold→warm→talking→meeting→proposal→client (+frozen). tier קובע צבע/דרגה.
- **שווי הפניה = שווי שנתי** (`estimatedValue`). `dealValue` = סכום ההפניות.

## 3. ארכיטקטורה / DNA
- **state יחיד** ב-`app.js`; `render()` הוא מקור האמת, מנותב לפי `mainView`. UI-state (selection/tab/search) בזיכרון, לא נשמר.
- **ניתוב פרטים**: `detailTarget()` → drawer (pipeline) / `#main` (list). מעבר חלק עם View Transitions.
- **DOM ב-`ui.js`** עם helper `el()`; כל קלט משתמש כ-`textContent` (XSS). אייקונים SVG סטטיים.
- **סנכרון**: `collectBackupData`=stores→JSON, `applyBackupData`=`db.replaceAll` (clear+put), `_suppressPush` בזמן apply, `isValidShape` guard לפני החלפה. token בזיכרון בלבד.
- **SW**: app-shell network-first (פרסום מיידי), fonts/icons cache-first, auto-reload ב-controllerchange.

## 4. החלטות עיצוב/לוגיקה
- כיוון עיצובי: **Obsidian Gold** (זהב מותג) + רוח **Stitch** ל-Pipeline (צבע לכל שלב; `client`=זהב — כלאיים, לא ניאון מלא).
- **שכבת Luxury (v3+v4 ב-styles.css)**: serif עברי **Frank Ruhl Libre** (מקומי, `fonts/frank-ruhl-*.woff2`) לכותרות/שמות/מספרי display; hairlines בגרדיאנט על משטחי זכוכית (mask-composite); sheen ללוגו ולכפתור ראשי; stagger בכניסת כרטיסים; טבעת conic מסתובבת ל-tier לקוח; View Transitions בין מסכים. **קיים גם ב-`v2/`** (סלקטורים מותאמים: `topbar`/`sb-logo`/`sb-brand-name`). כל לולאה אינסופית מכובה ב-`prefers-reduced-motion`.
- **`LexLedger-Offline.html` נבנה מ-`v2/` בלבד** (`node v2/build-offline.mjs`) — שינוי עיצוב/JS ב-v2 מחייב rebuild של הקובץ + commit שלו.
- מסלול קריירה ממוין **כרונולוגי עולה** (מוקדם→מאוחר; חסרי-שנה לסוף).
- אירוח על **נתיב** `/crm` חייב Cloudflare Worker — GitHub Pages לא מארח על path (רק host שלם).

## 5. חוב טכני / סיכונים
- מחיקת חברה משאירה `currentCompanyId` "תלוי" אצל אנשי קשר (מוצג ריק; לא נוקה ביודעין — בטוח).
- אין merge חכם בסנכרון — last-writer-wins + שאלת המשתמש בלבד (מכוון).
- בדיקת OAuth/Drive end-to-end רק אצל המשתמש (אין Google בסביבת הפיתוח).
- seed (`seedDemo`) לא כולל `contactType`/`photoUrl` — נתוני דמו ישנים יציגו ברירות מחדל.

## 5.1 פתיחת לקוח מתוך מייל (v2)
- `v2/js/email-parse.js` — `parseClientEmail(text)` מחזיר טיוטה + `missing[]` + `inferred[]`. **לא משלים שדות חסרים.**
  הרחבת זיהוי = הוספת תווית ל-`LABELS` (סדר = עדיפות) או כלל ל-`CASE_TYPE_RULES`. בדיקות: `node tools/test-email-parse.mjs`.
- מודל הלקוח (`clients`) הורחב: `clientNumber`, `contactName`, `contactEmail`, `contactPhone`, `crmContactId`.
  `clients.add` מקבל מחרוזת (תאימות לאחור) או אובייקט.
- `cases.add` שומר `caseType: ''` כשנמסר ריק (ברירת מחדל 'שוטף' רק כשהשדה כלל לא נמסר) — כדי לא להציג סוג שלא נאמר.
- **HTML אופליין**: כל מודול חדש ב-`v2/js/` חייב להיכנס למערך `ORDER` ב-`v2/build-offline.mjs` (סדר תלויות),
  אחרת הוא לא ייארז. ה-IndexedDB של `file://` מבודד מזה של האתר — ההעברה בין השניים היא ייבוא/ייצוא JSON במסך ההגדרות.

## 5.2 מסמכי מקור והשלמה מחשבונית (v2)
- **DB v3**: `invoiceFiles` (מסמכי המקור) + `localPrefs` (handle לתיקייה). שניהם **מקומיים** — לא ב-`collectBackupData`
  ולא ב-`importer.collectAll`. מכשיר אחר יראה את החשבוניות אבל לא יוכל לפתוח את הקבצים (מוצג "הקובץ אינו זמין").
- `invoices.fileId` = מזהה מסמך המקור; `null` = הוזן ידנית. `file-store.js` מטפל בשני מצבי אחסון ('folder'/'db').
- File System Access זמין גם ב-`file://` בכרום (נבדק) — לכן קובץ האופליין יכול לכתוב לתיקייה אמיתית.
  ההרשאה מתחדשת רק מתוך לחיצת משתמש (`requestPermission`).
- **השלמה = שדות ריקים בלבד**, לעולם לא דריסה (`backfillFromInvoice`). בחירת תיק במסך הסיווג לא מאפסת אחוז
  עמלה שזוהה בחשבונית (התיק גובר רק אם יש לו אחוז).
- **SheetJS ו-CSV**: `cellDates` הפך `12/03/2026` ל-3 בדצמבר ואת `4471/1` לתאריך. CSV מפוענח עכשיו ב-`parseCsv`
  שלנו (כל תא נשאר טקסט); ל-Excel בינארי מועבר `dateNF: 'dd/mm/yyyy'`.

## 5א. LexBudget — מערכת תקציב עסקה (`/budget/`, נפרדת לחלוטין)
מערכת שנייה בריפו, ללא תלות ב-CRM: DB משלה (`lexBudgetDB`), SW משלה (`lexbudget-v1`, scope `/budget/`), manifest משלה.
משותפת רק **השפה העיצובית** (טוקנים של Obsidian Gold מועתקים ל-`budget/css/styles.css`) והפונטים.
- **מודל**: `deals` → `teams` (שורה לכל דרגה) → `entries` (ביצוע: שעות/חשבונות/הוצאות) + `files` (Blob של חשבון) + `rateCards`.
- **מתודולוגיה** (מגיליון המשתמש): שעות תקציב = `ROUNDUP(מוערך × (1+מקדם))`; עלות = שעות×תעריף; בלנדד = ללא דרגות ג'וניור.
- **מנוע החישוב** ב-`model.js` (`computeDeal`) — טהור, ללא DOM/DB. `app.js` מחזיק state יחיד ו-`render()`.
- **עריכה חיה בגיליון**: `input` מעדכן את האובייקט בזיכרון + `ui.refreshComputed()` (עדכון `[data-calc]` בלבד, שמירת פוקוס); `change` מפעיל `store.saveTeam`.
- **קריאת XLSX ללא ספריות** (`xlsx.js`): פענוח ZIP ידני + `DecompressionStream('deflate-raw')`, sharedStrings, זיהוי תאי תאריך מ-`styles.xml`.
- **ייבוא תקציב** (`parseBudgetSheet`): העמודה עם הכי הרבה שמות דרגה = עמודת התקציב; דרגות בעמודות אחרות = טבלת תעריפים; מספרים נלקחים רק משמאל לעמודת התעריפים.
- **CSV בעברית**: גרשיים נחשבים פותחי-ציטוט רק בתחילת שדה — אחרת `עו"ד`/`רו"ח` שוברים את הפרסור.
- מה שאין (מכוון): סנכרון Drive, קישור ל-CRM. גיבוי = ייצוא/ייבוא JSON מקומי.
- **קובץ אופליין**: `budget/build-offline.mjs` → `LexBudget-Offline.html` בשורש (זהה במנגנון ל-v2: מודולים
  כ-base64 → blob URLs, CSS/פונטים מוטבעים). מודול חדש ב-`budget/js/` חייב להיכנס ל-`ORDER` בסקריפט.
  ה-IndexedDB של `file://` מבודד מזה של האתר — מעבר בין השניים רק דרך ייצוא/ייבוא JSON (כפתור "גיבוי").

## 6. לקחים אחרונים
- **SW cache-first שבר פרסומים** (HTML התעדכן, JS ישן הוגש) → מעבר ל-network-first + auto-reload. בכל שינוי app-shell: להעלות `CACHE`.
- מטמון SW תקוע אצל משתמש דורש איפוס חד-פעמי (Clear site data) לפני שהלוגיקה החדשה תופסת.
- `origin_mismatch` ב-OAuth = ה-origin לא רשום (lironcon.com מול github.io) — להוסיף את שניהם.
- בכרטיסים: שם/תפקיד היו inline ונדבקו → `card__id`/`pcard__id` הפכו `flex-direction:column`.
- drawer: כפתור `×` התנגש עם מחיקה → `padding-top` ל-`.drawer__body .detail`.
- **grid blowout במובייל** (רשימה 460px על viewport 390): טראק `1fr` לא מוגבל ל-min-content → `grid-template-columns: minmax(0, 1fr)` + `min-width: 0` ל-sidebar/main.
- header גלש במסכים ≤520px → breakpoint קומפקטי (root בלבד; ל-v2 יש sidebar).
- **כרטיסים נדחסו ונחתכו ברשימה מלאה**: `.list`/`.lane__cards` הם flex-column גלילים, ו-`overflow:hidden` על `.card`/`.pcard` מאפס את ה-min-height האוטומטי של flex item → הכרטיסים כווצו במקום שהרשימה תגלול. תוקן ב-`flex-shrink: 0` (v1+v2). לקח: באג שתלוי בכמות נתונים — לשחזר עם רשימה שגולשת מגובה החלון, לא עם 4 רשומות דמו.
- **v2 ≤900px: ה-nav drawer היה תקוע באמצע המסך** — RTL: ‏`inset-inline-end`=left, ולכן `translateX(100%)` דחף לאמצע. תוקן ל-`inset-inline-start` (=ימין). בנוסף: ה-backdrop ישב על `body::after` מחוץ ל-stacking context של `.app` (z-index:1) וכיסה גם את המגירה — הועבר ל-`.app::after` (‏z-39, מגירה z-40) + קליק עליו סוגר (`refs.app` ב-app.js).
