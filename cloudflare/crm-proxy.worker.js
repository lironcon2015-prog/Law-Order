/**
 * Cloudflare Worker — reverse-proxy ל-CRM תחת נתיב מותאם.
 *
 * מטרה: לארח את האפליקציה ב-https://lironcon.com/crm/ בלי לתפוס את כל הדומיין,
 * כדי שניתן יהיה להוסיף את lironcon.com ל-whitelist של רשת המשרד.
 *
 * אופן הפעולה: כל בקשה ל-/crm/* נשלפת מאחורי הקלעים מ-GitHub Pages
 * (https://lironcon2015-prog.github.io/Law-Order/*). הדפדפן מדבר רק עם lironcon.com.
 *
 * התקנה:
 *   1) Cloudflare Dashboard → Workers & Pages → Create → Worker → הדבק קובץ זה → Deploy.
 *   2) ב-Worker → Settings → Domains & Routes → Add route:  lironcon.com/crm*   (zone: lironcon.com)
 *   3) ודא שקיימת רשומת DNS proxied (ענן כתום) ל-lironcon.com (אפשר AAAA אל 100:: כ-placeholder).
 *
 * שינוי נתיב/דומיין? עדכן את PREFIX / ORIGIN / REPO למטה.
 */

const PREFIX = '/crm';                                    // הנתיב הציבורי
const ORIGIN = 'https://lironcon2015-prog.github.io';     // מקור GitHub Pages
const REPO = '/Law-Order';                                // שם הריפו (project site)

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // בקשות שמחוץ ל-/crm — לא אמורות להגיע (ה-route מסנן), אך ליתר ביטחון:
    if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + '/')) {
      return new Response('Not found', { status: 404 });
    }

    // /crm  ->  /crm/   (כדי שנתיבים יחסיים באפליקציה ייפתרו תחת /crm/)
    if (url.pathname === PREFIX) {
      return Response.redirect(url.origin + PREFIX + '/', 301);
    }

    // מיפוי הנתיב למקור: /crm/<rest>  ->  /Law-Order/<rest>
    const rest = url.pathname.slice(PREFIX.length); // כולל '/' מוביל
    const target = ORIGIN + REPO + rest + url.search;

    const upstream = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });

    // העברת התגובה כמות שהיא, עם תיקון Location יחסי-למקור חזרה ל-/crm
    const headers = new Headers(upstream.headers);
    const loc = headers.get('location');
    if (loc) headers.set('location', loc.replace(ORIGIN + REPO, url.origin + PREFIX));

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
