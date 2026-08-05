// בדיקות ל-parseClientEmail — הרצה: node tools/test-email-parse.mjs
import { parseClientEmail } from '../v2/js/email-parse.js';

let pass = 0, fail = 0;
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; return; }
  fail++;
  console.error(`✗ ${label}\n   התקבל:  ${a}\n   ציפייה: ${b}`);
};

/* ---------- 1. מייל מלא, פורמט תוויות ---------- */
{
  const r = parseClientEmail(`
היי רונית,

נא לפתוח לקוח חדש:
שם הלקוח: אלפא נכסים בע"מ
מספר לקוח: 4471
תיקים:
- תיק 4471/1 – ליווי שוטף
- תיק 4471/2 – עסקת מכר מניות
איש קשר: דנה לוי, dana@alpha.co.il, 052-1234567
הסדר שכ"ט: 1,500 ש"ח לשעה + 3% דמי הצלחה

תודה,
לירון
`);
  eq(r.clientName, 'אלפא נכסים בע"מ', '1 שם לקוח');
  eq(r.clientNumber, '4471', '1 מספר לקוח');
  eq(r.cases.length, 2, '1 מספר תיקים');
  eq(r.cases[0], { caseNumber: '4471/1', description: 'ליווי שוטף', caseType: 'שוטף' }, '1 תיק א');
  eq(r.cases[1], { caseNumber: '4471/2', description: 'עסקת מכר מניות', caseType: 'עסקה' }, '1 תיק ב');
  eq(r.contact, { fullName: 'דנה לוי', email: 'dana@alpha.co.il', phone: '052-1234567' }, '1 איש קשר');
  eq(r.feeArrangement, '1,500 ש"ח לשעה + 3% דמי הצלחה', '1 שכ"ט');
  eq(r.missing, [], '1 אין חוסרים');
}

/* ---------- 2. חלקי: בלי מספר לקוח, בלי מספרי תיקים, בלי טלפון ---------- */
{
  const r = parseClientEmail(`שלום,
לקוח חדש: גרין טק תעשיות
תיק: ייעוץ שוטף
איש קשר:
שם: אבי כהן
מייל: avi@greentech.co.il
שכ"ט: ריטיינר חודשי 8,000 ש"ח`);
  eq(r.clientName, 'גרין טק תעשיות', '2 שם לקוח');
  eq(r.clientNumber, '', '2 מספר לקוח ריק');
  eq(r.cases, [{ caseNumber: '', description: 'ייעוץ שוטף', caseType: 'שוטף' }], '2 תיק ללא מספר');
  eq(r.contact.fullName, 'אבי כהן', '2 שם איש קשר');
  eq(r.contact.email, 'avi@greentech.co.il', '2 מייל');
  eq(r.contact.phone, '', '2 טלפון ריק');
  eq(r.feeArrangement, 'ריטיינר חודשי 8,000 ש"ח', '2 שכ"ט');
  eq(r.missing.includes('מספר לקוח'), true, '2 חוסר מספר לקוח');
  eq(r.missing.includes('מספרי תיקים'), true, '2 חוסר מספרי תיקים');
  eq(r.missing.includes('טלפון'), true, '2 חוסר טלפון');
}

/* ---------- 3. מייל מועבר עם כותרות וציטוט ---------- */
{
  const r = parseClientEmail(`> מאת: לירון כהן <liron@law.co.il>
> אל: משרד
> נושא: פתיחת לקוח
>
> שם החברה: ביתא אחזקות בע״מ
> מס' לקוח: A-902
> מספרי תיקים: 902/1, 902/2, 902/3
> נציג הלקוח: מיכל ברק | michal@beta.com | 03-6543210
> הסדר שכר טרחה: לפי שעות`);
  eq(r.clientName, 'ביתא אחזקות בע״מ', '3 שם לקוח');
  eq(r.clientNumber, 'A-902', '3 מספר לקוח');
  eq(r.cases.map((c) => c.caseNumber), ['902/1', '902/2', '902/3'], '3 שלושה תיקים');
  eq(r.contact, { fullName: 'מיכל ברק', email: 'michal@beta.com', phone: '03-6543210' }, '3 איש קשר');
  eq(r.feeArrangement, 'לפי שעות', '3 שכ"ט');
}

/* ---------- 4. תיאורים בלבד, שורות רבות, סוגי תיקים ---------- */
{
  const r = parseClientEmail(`שם הלקוח: דלתא
תיקים:
1. תביעה כספית נגד ספק
2. מיזוג עם חברת אפסילון
3. ליווי שוטף
טלפון: 054-7654321
דוא"ל: office@delta.co.il`);
  eq(r.cases.map((c) => c.caseType), ['ליטיגציה', 'עסקה', 'שוטף'], '4 סוגי תיקים');
  eq(r.cases.map((c) => c.caseNumber), ['', '', ''], '4 אין מספרי תיקים');
  eq(r.cases[0].description, 'תביעה כספית נגד ספק', '4 תיאור');
  eq(r.contact.phone, '054-7654321', '4 טלפון');
  eq(r.contact.email, 'office@delta.co.il', '4 מייל');
}

/* ---------- 5. טקסט חופשי לגמרי — לא ממציאים ---------- */
{
  const r = parseClientEmail('היי, נדבר מחר על הפגישה. תודה');
  eq(r.clientName, '', '5 אין שם');
  eq(r.cases, [], '5 אין תיקים');
  eq(r.contact, { fullName: '', email: '', phone: '' }, '5 אין איש קשר');
  eq(r.missing.length, 7, '5 כל השדות חסרים');
}

/* ---------- 6. אין תווית איש קשר — נפילה גלובלית מסומנת ---------- */
{
  const r = parseClientEmail(`שם הלקוח: אומגה
תיק: 5501
נא ליצור קשר: yossi@omega.co.il`);
  eq(r.contact.email, 'yossi@omega.co.il', '6 מייל גלובלי');
  eq(r.inferred, ['דוא"ל'], '6 מסומן כהוסק');
  eq(r.cases[0].caseNumber, '5501', '6 מספר תיק');
}

/* ---------- 7. טקסט זורם: שם לקוח במשפט + רשימת תיקים בשורה ---------- */
{
  const r = parseClientEmail(`שלום,

מצרף פרטים לפתיחת לקוח חדש — גרין טק תעשיות בע"מ.
תיקים: ליווי שוטף, וכן תביעה כספית נגד ספק
איש קשר: אבי כהן, avi@greentech.co.il`);
  eq(r.clientName, 'גרין טק תעשיות בע"מ', '7 שם לקוח ממשפט');
  eq(r.cases.map((c) => c.description), ['ליווי שוטף', 'תביעה כספית נגד ספק'], '7 פיצול "וכן"');
  eq(r.cases.map((c) => c.caseType), ['שוטף', 'ליטיגציה'], '7 סוגים');
  eq(r.contact.fullName, 'אבי כהן', '7 שם איש קשר');
  eq(r.missing.includes('הסדר שכ"ט'), true, '7 חוסר שכ"ט');
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
