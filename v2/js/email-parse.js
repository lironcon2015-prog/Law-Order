// email-parse.js — ניתוח מייל "פתיחת לקוח חדש" לטיוטת לקוח / תיקים / איש קשר.
//
// עיקרון מנחה: **לא ממציאים**. כל שדה שלא נאמר במפורש בטקסט נשאר ריק ומסומן כחסר,
// כדי שהמשתמש ישלים אותו ידנית (מספר לקוח ומספרי תיקים חסרים לרוב בשלב הפתיחה).
// מודול טהור — בלי DOM, בלי IndexedDB — כדי שיהיה ניתן לבדיקה מ-node.

/* ---------- נרמול ---------- */
const MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u200b\ufeff]/g;

/** מנקה סימני כיווניות, ציטוט מייל (>) ורווחים מיותרים; שומר על שברי שורות. */
export function normalizeText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(MARKS, '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/^[\s>|]+/, '').replace(/\s+$/, ''))
    .join('\n');
}

/** צורה קנונית להשוואת תוויות: גרשיים עבריים → אנגליים, רווחים מכווצים. */
const canon = (s) => String(s || '').replace(/[״"]/g, '"').replace(/[׳']/g, "'").replace(/\s+/g, ' ').trim();

/* ---------- מילון תוויות ---------- */
// הסדר משמעותי: הראשון שמתאים (התאמה מלאה) מנצח.
const LABELS = [
  ['skip',        /^(?:מאת|אל|עבור|נשלח|תאריך|נושא|נושא ההודעה|העתק|from|to|sent|date|subject|cc|bcc)$/i],
  ['clientNumber',/^(?:מס(?:פר)?'?\.?\s*(?:ה)?לקוח(?:\s*במשרד)?|קוד\s*(?:ה)?לקוח|client\s*(?:no\.?|number|id))$/i],
  ['cases',       /^(?:מס(?:פר|פרי)?'?\.?\s*(?:ה)?תיק(?:ים)?|(?:ה)?תיק(?:ים)?(?:\s*חדש(?:ים)?)?|שם\s*(?:ה)?תיק|פרטי\s*(?:ה)?תיק(?:ים)?|נושא\s*(?:ה)?תיק|matters?|cases?)$/i],
  ['clientName',  /^(?:שם\s*(?:ה)?(?:לקוח(?:ה)?|חברה|תאגיד)|(?:ה)?לקוח(?:\s*חדש)?|client(?:\s*name)?)$/i],
  ['contact',     /^(?:אנשי\s*קשר|איש\s*(?:ה)?קשר(?:\s*(?:אצל|של|מטעם)\s*(?:ה)?לקוח)?|פרטי\s*(?:איש\s*)?קשר|גורם\s*מטפל|נציג(?:\s*(?:ה)?לקוח)?|contact(?:\s*person)?)$/i],
  ['contactName', /^(?:שם\s*(?:איש\s*(?:ה)?קשר|(?:ה)?נציג|(?:ה)?מטפל)|שם\s*מלא|שם|name)$/i],
  ['email',       /^(?:דוא"?ל|דואר\s*אלקטרוני|אימייל|מייל|e-?mail|כתובת\s*(?:דוא"?ל|מייל))$/i],
  ['phone',       /^(?:טל(?:פון)?'?\.?|נייד|סלולרי|מס(?:פר)?'?\.?\s*(?:טלפון|נייד)|phone|mobile|cell)$/i],
  ['fee',         /^(?:הסדר\s*(?:ה)?(?:שכ"?ט|שכר\s*(?:ה)?טרחה|תשלום|התשלום)|הסכם\s*שכ"?ט|שכ"?ט(?:\s*מוסכם)?|שכר\s*(?:ה)?טרחה|תעריף|fees?)$/i],
];

function matchLabel(txt) {
  if (!txt || txt.length > 40) return null;
  for (const [key, re] of LABELS) if (re.test(txt)) return key;
  return null;
}

const BULLET = /^\s*(?:[-–—•*·◦]|\d+\s*[.)])\s+/;
const SIGNATURE = /^(?:בברכה|בכבוד רב|תודה(?: רבה)?|בהצלחה|thanks|best regards|regards|--+|_{3,}|={3,})(?=[\s,.!:]|$)/i;

/** מפרק שורה ל"תווית: ערך" אם היא אכן שורת תווית מוכרת. */
function splitLabel(line) {
  const m = line.match(/^\s*(?:[-–—•*·]|\d+\s*[.)])?\s*\**\s*([^:：]{1,40}?)\s*\**\s*[:：]\s*(.*)$/);
  if (!m) return null;
  const key = matchLabel(canon(m[1]));
  return key ? { key, value: m[2].trim() } : null;
}

/* ---------- ביטויים לאיתור ערכים ---------- */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?972[-.\s]?|0)(?:5\d|7\d|[23489])[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/;
const CASE_TYPE_RULES = [
  ['ליטיגציה', /ליטיגצי|תביע|בוררות|הליך\s*משפטי|litigation/i],
  ['עסקה',     /עסק(?:ה|ת)|מיזוג|רכיש|מכר\s*מניות|השקע|m&a|due\s*diligence/i],
  ['שוטף',     /שוטף|ריטיינר|retainer|ייעוץ\s*כללי/i],
];

/** סוג תיק — רק אם נאמר במפורש. אחרת ריק (לא ממציאים). */
export function detectCaseType(text) {
  const t = canon(text);
  for (const [type, re] of CASE_TYPE_RULES) if (re.test(t)) return type;
  return '';
}

/** מחלץ מספר תיק מפריט טקסט. מחזיר { caseNumber, description }. */
export function parseCaseItem(rawItem) {
  const item = String(rawItem || '').replace(BULLET, '').trim();
  if (!item) return null;

  const patterns = [
    /(?:תיק|file|case)\s*(?:מס(?:פר)?'?\.?)?\s*[:#]?\s*([A-Za-z]{0,3}-?\d[\d./-]*)/i,
    /(?:^|[\s(])([A-Za-z]{1,3}-\d[\d./-]*)/,
    /(?:^|[\s(])(\d{3,}[\d./-]*)/,
  ];
  let caseNumber = '';
  let rest = item;
  for (const re of patterns) {
    const m = item.match(re);
    if (m) {
      caseNumber = m[1].replace(/[.,;]$/, '');
      rest = item.slice(0, m.index) + ' ' + item.slice(m.index + m[0].length);
      break;
    }
  }
  const description = rest
    .replace(/\b(?:תיק|מס(?:פר)?'?\.?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:·,.|]+|[\s\-–—:·,.|]+$/g, '')
    .trim();

  if (!caseNumber && !description) return null;
  return { caseNumber, description, caseType: detectCaseType(item) };
}

/** מפצל את בלוק התיקים לפריטים (שורות / תבליטים / רשימה בשורה אחת).
 *  פיצול פסיקים רק כשברור שמדובר ברשימה — כדי לא לחתוך תיאור ארוך באמצע. */
function splitCaseItems(lines) {
  const items = [];
  for (const line of lines) {
    const clean = line.replace(BULLET, '').trim();
    if (!clean) continue;
    // "א' וכן ב'" / "א' ו-ב'" — מפריד ודאי
    const chunks = clean.split(/\s*,?\s+(?:וכן|ו-)\s+/).map((c) => c.trim()).filter(Boolean);
    for (const chunk of chunks) {
      const parts = chunk.split(/\s*[,;]\s*/).map((p) => p.trim()).filter(Boolean);
      const isList = parts.length > 1 && parts.every((p) => /^[A-Za-z0-9][\w./-]*$/.test(p) || p.length <= 30);
      if (isList) parts.forEach((p) => items.push(p));
      else items.push(chunk);
    }
  }
  return items;
}

/** שם איש קשר מתוך בלוק טקסט שממנו הוסרו מייל/טלפון. */
function pickName(block) {
  const stripped = block
    .replace(new RegExp(EMAIL_RE.source, 'g'), ' ')
    .replace(new RegExp(PHONE_RE.source, 'g'), ' ');
  for (const part of stripped.split(/[,;|·\n]+/)) {
    const p = part
      .replace(/^\s*(?:שם|name)\s*[:：]\s*/i, '')
      .replace(/^[\s\-–—:·.]+|[\s\-–—:·.]+$/g, '')
      .trim();
    if (p.length < 2 || p.length > 60) continue;
    if (matchLabel(canon(p))) continue;      // תווית ריקה, לא שם
    if (!/[A-Za-zא-ת]/.test(p)) continue;    // חייב להכיל אותיות
    return p;
  }
  return '';
}

/* ---------- הפרסר ---------- */
/**
 * מנתח מייל פתיחת לקוח.
 * @returns {{clientName,clientNumber,contact:{fullName,email,phone},feeArrangement,cases:Array,
 *            missing:string[], inferred:string[], raw:string}}
 */
export function parseClientEmail(rawText) {
  const text = normalizeText(rawText);
  const lines = text.split('\n');

  const buf = { clientName: [], clientNumber: [], cases: [], contactBlock: [], contactName: [], email: [], phone: [], fee: [] };
  const TOP = new Set(['clientName', 'clientNumber', 'cases', 'fee']);
  let current = null;   // המפתח שאליו נצברות שורות ההמשך
  let section = null;   // 'contact' כשנמצאים בתוך בלוק איש קשר
  let blanks = 0;

  for (const line of lines) {
    if (!line.trim()) {
      blanks += 1;
      if (blanks >= 2) { current = null; section = null; }
      continue;
    }
    if (SIGNATURE.test(line.trim())) break;
    blanks = 0;

    // בתוך בלוק תיקים — שורת תבליט היא תמיד פריט, לא תווית חדשה
    const insideCaseList = current === 'cases' && BULLET.test(line);
    const lab = insideCaseList ? null : splitLabel(line);

    if (lab) {
      if (lab.key === 'skip') { current = null; section = null; continue; }

      if (lab.key === 'contact') {
        section = 'contact';
        current = 'contactBlock';
        if (lab.value) buf.contactBlock.push(lab.value);
        continue;
      }
      if (lab.key === 'contactName') {
        // "שם:" סתמי לפני בלוק איש קשר וללא שם לקוח — זה שם הלקוח
        const key = (!buf.clientName.length && section !== 'contact' && canon(line).startsWith('שם:')) ? 'clientName' : 'contactName';
        if (lab.value) buf[key].push(lab.value);
        current = key;
        continue;
      }
      if (lab.key === 'email' || lab.key === 'phone') {
        if (lab.value) buf[lab.key].push(lab.value);
        current = lab.key;
        continue;
      }
      if (TOP.has(lab.key)) {
        section = null;
        current = lab.key;
        if (lab.value) buf[lab.key].push(lab.value);
        continue;
      }
    }

    if (current) { buf[current].push(line.trim()); continue; }

    // שורה חופשית — היוריסטיקה מפורשת בלבד: "נא לפתוח לקוח חדש — שם"
    const open = line.match(/(?:לפתוח|פתיחת|פתח)\s+(?:לקוח|תיק)\s*(?:חדש[הים]?)?\s*[-–—:]\s*(.+)$/);
    if (open && !buf.clientName.length) buf.clientName.push(open[1].trim().replace(/[.,;]$/, ''));
  }

  /* ---------- הרכבה ---------- */
  const inferred = [];
  const firstLine = (a) => (a.find((x) => x.trim()) || '').trim();

  const clientName = firstLine(buf.clientName).replace(/[.,;]$/, '');

  const numText = buf.clientNumber.join(' ');
  const numMatch = numText.match(/[A-Za-z]{0,3}-?\d[\w./-]*/);
  const clientNumber = numMatch ? numMatch[0] : '';

  const cases = splitCaseItems(buf.cases).map(parseCaseItem).filter(Boolean);

  const contactBlock = [...buf.contactBlock, ...buf.contactName, ...buf.email, ...buf.phone].join('\n');
  const emailFromLabel = buf.email.join(' ').match(EMAIL_RE);
  const phoneFromLabel = buf.phone.join(' ').match(PHONE_RE);
  const emailFromBlock = contactBlock.match(EMAIL_RE);
  const phoneFromBlock = contactBlock.match(PHONE_RE);

  let email = (emailFromLabel || emailFromBlock || [''])[0];
  let phone = (phoneFromLabel || phoneFromBlock || [''])[0];
  // נפילה אחרונה: סריקה גלובלית של גוף המייל (מסומן כ"הוסק")
  if (!email) {
    const g = text.match(EMAIL_RE);
    if (g) { email = g[0]; inferred.push('דוא"ל'); }
  }
  if (!phone) {
    const g = text.match(PHONE_RE);
    if (g) { phone = g[0]; inferred.push('טלפון'); }
  }

  const fullName = firstLine(buf.contactName) || pickName(contactBlock);
  const feeArrangement = buf.fee.join(' ').replace(/\s+/g, ' ').trim();

  const missing = [];
  if (!clientName) missing.push('שם לקוח');
  if (!clientNumber) missing.push('מספר לקוח');
  if (!cases.length) missing.push('תיקים');
  else if (cases.every((c) => !c.caseNumber)) missing.push('מספרי תיקים');
  if (!fullName) missing.push('שם איש קשר');
  if (!email) missing.push('דוא"ל');
  if (!phone) missing.push('טלפון');
  if (!feeArrangement) missing.push('הסדר שכ"ט');

  return {
    clientName,
    clientNumber,
    contact: { fullName, email, phone: phone.trim() },
    feeArrangement,
    cases,
    missing,
    inferred,
    raw: text,
  };
}
