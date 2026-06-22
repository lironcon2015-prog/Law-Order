# חיבור הדומיין: `lironcon.com/crm`

מטרה: לארח את ה-CRM תחת **`https://lironcon.com/crm`** (דרך Cloudflare Worker שמושך מ-GitHub Pages),
כדי שתוכל להוסיף דומיין יחיד — `lironcon.com` — ל-**whitelist של רשת המשרד** ולעבוד תמיד.

> למה Worker ולא "דומיין מותאם" רגיל? GitHub Pages מארח רק על host שלם (שורש), לא על נתיב `/crm`.
> ה-Worker עושה proxy: `lironcon.com/crm/*` → `lironcon2015-prog.github.io/Law-Order/*`.
> כך הדפדפן מדבר **רק** עם `lironcon.com`, ו-github.io לא נדרש כלל ברשת המשרד.

---

## שלב 1 — יצירת ה-Worker
1. היכנס ל-Cloudflare Dashboard → בתפריט: **Workers & Pages**.
2. **Create** → **Create Worker** → תן שם (למשל `crm-proxy`) → **Deploy**.
3. **Edit code** → מחק את התוכן → הדבק את כל הקובץ [`crm-proxy.worker.js`](./crm-proxy.worker.js) → **Deploy**.

## שלב 2 — חיבור ה-Route לדומיין
1. בתוך ה-Worker → לשונית **Settings** → **Domains & Routes** → **Add** → **Route**.
2. הזן:
   - **Route:** `lironcon.com/crm*`
   - **Zone:** `lironcon.com`
3. **Add route**.

## שלב 3 — DNS (רק אם השורש `lironcon.com` לא בשימוש)
ה-Worker יורה רק על תעבורה שמגיעה לקצה של Cloudflare, ולכן צריך רשומת DNS **proxied**:
1. Cloudflare → הדומיין `lironcon.com` → **DNS** → **Add record**.
2. אם אין כבר רשומה לשורש: הוסף
   - **Type:** `AAAA` · **Name:** `@` · **IPv6:** `100::` · **Proxy status:** **Proxied (ענן כתום)**.
   - (`100::` הוא placeholder תקני של Cloudflare; ה-Worker עונה במקום ה"מקור" הזה.)
3. אם כבר יש אתר על `lironcon.com` — אל תיגע; רק ודא שהוא **Proxied**.

> HTTPS מסופק אוטומטית ע"י Cloudflare — אין צורך בתעודה.

## שלב 4 — whitelist במשרד
מסור ל-IT להוסיף ל-whitelist:
- **`lironcon.com`** (הדומיין הראשי — זה מספיק; כל התעבורה עוברת דרכו).
- אם ה-IT מסנן לפי IP ולא לפי שם-מארח, בקש להתיר את **טווחי ה-IP של Cloudflare**:
  https://www.cloudflare.com/ips/

---

## בדיקה
פתח בדפדפן: **https://lironcon.com/crm**
- האפליקציה אמורה להיטען (אותו מסך בדיוק כמו ב-github.io).
- אחרי טעינה ראשונה — ה-Service Worker שומר אותה, אז היא עובדת גם offline.

## שינויים עתידיים
אם שם הריפו או הנתיב משתנים — ערוך את `PREFIX` / `ORIGIN` / `REPO` בראש
[`crm-proxy.worker.js`](./crm-proxy.worker.js), והדבק מחדש ל-Worker.
