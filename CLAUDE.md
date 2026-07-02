# הוראות פרויקט — LexLedger (CRM פיתוח עסקי לעו"ד M&A)

## ⚡ Skill פעיל אוטומטית
**token-efficient-workflow** (`.claude/skills/token-efficient-workflow/SKILL.md`) — תמיד פעיל בפרויקט הזה.
עקוב אחר ה-SKILL: חיפושים ממוקדים, view ranges, str_replace, silent completion, אפס filler.
במקרה התנגשות עם החוקים בעברית למטה — חוקי הפרויקט קודמים.

## תפקיד
מפתח Full-Stack מומחה והארכיטקט המוביל של **LexLedger** — CRM אישי לעו"ד M&A (פיתוח עסקי):
ניהול לידים במשפך, מסלולי קריירה, הפניות/עסקאות, מעקב קשר, וסנכרון בין מכשירים.

## שפה ותקשורת
- עברית בלבד, תמציתי. הסבר *למה*, לא *מה*. אל תחזור על הידוע.

## תהליך עבודה
- **תיקוני באג / שינויים קוסמטיים / בקשות קטנות** — בצע ישירות.
- **פיצ'ר גדול / שינוי ארכיטקטוני** — תכנן קצר (plan mode), אשר מול המשתמש, ואז בצע.
- **בטיחות:** אל תמחק/תרפקטר קוד בלי ניתוח השפעה. אל תשנה מה שלא התבקשת — אם ראית בעיה אחרת, ציין בנפרד.

## ⚠️ Git — הוראת קבע (חובה, תמיד)
- **בכל שינוי קוד: commit → push לענף העבודה `claude/ma-lawyer-crm-pwa-jqqhhv` → push (fast-forward) ל-`main`.**
  המשתמש רואה את האתר החי מ-`main` בלבד. אל תחכה לבקשה "מזג/פרסם" — עשה זאת תמיד.
- אין צורך ב-Pull Request אלא אם התבקש מפורשות.
- `.claude/settings.json` כבר מתיר `git push` כדי למנוע חסימות.

## ⚠️ Service Worker — חובה בכל שינוי app-shell
האפליקציה PWA. **בכל commit שמשנה `index.html`/`css/*`/`js/*`** — העלה את `CACHE` ב-`sw.js`
(`'lexledger-vN'` → `'lexledger-v(N+1)'`). ה-shell מוגש **network-first** ויש auto-reload ב-`controllerchange`
(`registerSW` ב-`app.js`), אבל העלאת הגרסה מבטיחה הפעלה נקייה ומחיקת cache ישן. גרסה נוכחית: **v7**.

## אבטחה / חיבורים
- ה-OAuth **Client ID** לסנכרון Drive נמצא ב-`js/sync.js` (`CLIENT_ID`) — מזהה ציבורי, מותר ב-repo.
  ה-token נשמר **בזיכרון בלבד**, לא ב-storage. scope מצומצם `drive.file`.
- בהוספת אינטגרציה/סוד חדשים — שאל את המשתמש לפני שמירה/חשיפה.

---

## Stack
- Vanilla JS (ES modules), HTML5, CSS3 — ללא framework, ללא build step.
- **IndexedDB** (`maCrmDB`: stores `contacts`, `companies`) דרך `db.js`/`store.js`. Offline-first.
- PWA: `sw.js` (network-first shell, cache-first fonts/icons) + `manifest.json`.

## שפה עיצובית — "Obsidian Gold" + Pipeline בהשראת Stitch
| מאפיין | ערך |
|--------|-----|
| רקע | `#0a0a0d` שחור-אובסידיאן + שכבות grain/glow/vignette (`index.html`) |
| מבטא | זהב `#f2ca50` + `--gold-grad`; עומק רב-שכבתי (`--elev-1/2/3`) |
| זכוכית | `--glass`/`--glass-strong` + backdrop-blur |
| Pipeline | נתיב צבעוני לכל שלב משפך (כלאיים: `client`=זהב); כרטיסים צפים, badge דחיפות זוהר |
| RTL | `inset-inline-*`/logical props; מספרים `.num` (LTR + tabular) |
| יחידות | `rem` לטיפוגרפיה |

---

## מבנה הפרויקט
| קובץ | תפקיד |
|------|--------|
| `index.html` | שלד DOM: header (view-toggle Pipeline/List, sync badge), `#board`, `.workspace` (list+detail), `#drawer`, modal, שכבות רקע |
| `css/styles.css` | כל העיצוב (Obsidian Gold + Pipeline + drawer + sync) |
| `js/app.js` | bootstrap, **state יחיד**, event delegation, ניתוב תצוגות, drag&drop, תפריט sync, רישום SW |
| `js/ui.js` | רינדור DOM (כרטיסים, Pipeline, detail בטאבים, טפסים, מנהל חברות, אייקונים). קלט משתמש כ-textContent (XSS) |
| `js/store.js` | דומיין: `LEAD_STATUSES`, `CONTACT_TYPES`, normalize, helpers (`dealValue`,`urgency`,`groupByStatus`,`isOverdue`), `setMutationListener` |
| `js/db.js` | עטיפת IndexedDB (`getAll/get/put/remove/replaceAll`) |
| `js/sync.js` | סנכרון Google Drive (OAuth GIS, `drive.file`, last-writer-wins, suppress/debounce) |
| `js/search.js` | סינון/מיון | `js/seed.js` | `window.seedDemo()` |
| `sw.js` | Service Worker | `manifest.json` | PWA |
| `cloudflare/crm-proxy.worker.js` | Worker שמ-proxy את `lironcon.com/crm` ל-Pages |

### קשרים קריטיים בין קבצים
- `render()` ב-`app.js` — מקור האמת לתצוגה. מנתב לפי `state.mainView` (`pipeline`/`list`); תצוגת פרטים יורדת ל-drawer (pipeline) או ל-`#main` (list) דרך `detailTarget()`.
- `store.setMutationListener(sync.notifyMutation)` — כל שמירה/מחיקה מתזמנת push ל-Drive (debounce 5s). `applyBackupData` כותב דרך `db.replaceAll` (לא דרך store) ולכן לא מפעיל push (suppress).
- מוטציות שמפעילות התראה: `saveContact`/`saveCompany`/`deleteContact`/`deleteCompany`/`addNote` ב-`store.js`.
- כל שינוי בשדות איש קשר → לעדכן `normalizeContact` (`store.js`) + הטופס (`renderContactForm`) + הסריאליזציה (`readContactForm`) + התצוגה (`renderDetail`).

---

## פריסה (Deployment)
GitHub Pages מענף **main** → `lironcon2015-prog.github.io/Law-Order/` → **Cloudflare Worker** מ-proxy ל-`lironcon.com/crm`
(מאפשר whitelist של דומיין יחיד ברשת המשרד). OAuth origins מורשים: `https://lironcon.com` (להוסיף `https://lironcon2015-prog.github.io` לבדיקה מ-Pages).

## אימות
- שרת מקומי: `python3 -m http.server 8765`.
- Chromium מותקן: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (`playwright-core`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).
- בקונסול: `window.seedDemo()` לנתוני דמו, ואז לצלם/לבדוק (0 שגיאות קונסול). זרימת OAuth/Drive — אי אפשר לבדוק מהסביבה, רק אצל המשתמש.

## עדכון PROJECT_KNOWLEDGE.md
עדכן בסוף שיחה עם שינוי ארכיטקטוני / באג/חוב חדש / החלטת עיצוב / תיקונים מרובים — סעיפי מצב נוכחי, חוב טכני, DNA, לקחים.
