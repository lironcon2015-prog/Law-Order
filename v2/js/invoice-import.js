// invoice-import.js — ייבוא חשבוניות מקובץ PDF / Excel / CSV: פענוח, זיהוי וסיווג.
// שחזור פיצ'ר ה-import של Lawfee במערכת המאוחדת, עם ספריות vendor מקומיות
// (v2/vendor/) שנטענות lazy ונשמרות ב-SW → עובד גם offline.
// הפענוח מפיק "מועמדים" (candidates) שהמשתמש מאשר/מתקן במסך סיווג לפני שמירה.

/* ============================================================ טעינת vendor (lazy, מקומי) ============================================================ */
// בקובץ האופליין (LexLedger-Offline.html) אין תיקיית vendor — build-offline.mjs מטמיע את
// הספריות כ-base64 וחושף blob URLs דרך window.__OFFLINE_VENDOR__. אחרת: נתיב יחסי רגיל.
const vendorUrl = (file) => (window.__OFFLINE_VENDOR__ && window.__OFFLINE_VENDOR__[file]) || `./vendor/${file}`;
const VENDOR_XLSX = () => vendorUrl('xlsx.full.min.js');
const VENDOR_PDF = () => vendorUrl('pdf.min.js');
const VENDOR_PDF_WORKER = () => vendorUrl('pdf.worker.min.js');

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', () => reject(new Error(`טעינת ${src} נכשלה`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = () => reject(new Error(`טעינת ${src} נכשלה`));
    document.head.append(s);
  });
}

/* ============================================================ עזרי פענוח (טהורים — ניתנים לבדיקה ב-node) ============================================================ */
export const HEB_MONTHS = {
  'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6,
  'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
};

/** מפרש ערך סכום: "₪12,345.60", "12,345", "(500)" (שלילי), מספר. מחזיר number או null */
export function parseAmount(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[₪$€]|ש["״׳']?ח/g, '').replace(/\s/g, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** מפרש תאריך לכל פורמט נפוץ. מחזיר {month, year} או null */
export function parseDateCell(v, defaultYear) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return { month: v.getMonth() + 1, year: v.getFullYear() };
  if (typeof v === 'number') {
    // מספר סריאלי של Excel (ימים מ-1900); טווח סביר 2000–2100
    if (v > 36526 && v < 73415) {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (!isNaN(d)) return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
    }
    return null;
  }
  const s = String(v).trim();
  // dd/mm/yyyy · dd.mm.yy · dd-mm-yyyy
  let m = s.match(/^([0-3]?\d)[./\-]([01]?\d)[./\-](\d{2,4})$/);
  if (m) {
    const month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12) return { month, year };
  }
  // yyyy-mm-dd (ISO)
  m = s.match(/^(\d{4})-([01]?\d)-([0-3]?\d)/);
  if (m) {
    const month = parseInt(m[2], 10);
    if (month >= 1 && month <= 12) return { month, year: parseInt(m[1], 10) };
  }
  // mm/yyyy
  m = s.match(/^([01]?\d)[./\-](\d{4})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    if (month >= 1 && month <= 12) return { month, year: parseInt(m[2], 10) };
  }
  // "ינואר 2026" / "ינואר"
  for (const [name, month] of Object.entries(HEB_MONTHS)) {
    if (s.includes(name)) {
      const y = s.match(/\d{4}/);
      return { month, year: y ? parseInt(y[0], 10) : (defaultYear || new Date().getFullYear()) };
    }
  }
  return null;
}

/** נרמול שם לצורך התאמה: מסיר בע"מ/גרשיים/פיסוק/רווחים כפולים */
export function normalizeName(s) {
  return String(s || '')
    .replace(/["״׳'`.,()\-–]/g, ' ')
    // \b לא עובד עם אותיות עבריות — גבולות לפי רווח/קצה
    .replace(/(^|\s)(בע\s*מ|ltd|inc|llc)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** התאמת שם לקוח מול רשימת לקוחות. מחזיר {client, score} או null */
export function matchClient(text, clients) {
  const t = normalizeName(text);
  if (!t || t.length < 2) return null;
  let best = null;
  for (const c of clients) {
    const n = normalizeName(c.name);
    if (!n) continue;
    let score = 0;
    if (n === t) score = 3;
    else if (t.includes(n) || n.includes(t)) score = 2;
    if (score && (!best || score > best.score)) best = { client: c, score };
  }
  return best;
}

/* ---------- זיהוי תפקידי עמודות לפי כותרות ---------- */
const HEADER_ROLES = [
  ['caseNum', /מס(פר)?\.?['׳]?\s*תיק|תיק|case/i],
  ['invoiceNo', /מס(פר)?\.?['׳]?\s*חשבונית|חשבונית|invoice|אסמכתא/i],
  ['commission', /עמלה(?!\s*%)/i],
  ['rate', /%|אחוז|rate/i],
  ['amount', /סכום|סה["״׳']?כ|amount|total|לחיוב|מחיר/i],
  ['date', /תאריך|date/i],
  ['month', /חודש|month/i],
  ['year', /שנה|year/i],
  ['client', /לקוח|client|customer|חברה|שם/i],
  ['notes', /הער|תיאור|פירוט|desc|note/i],
];

function detectHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const roles = {};
    let hits = 0;
    (rows[i] || []).forEach((cell, col) => {
      if (typeof cell !== 'string' || !cell.trim()) return;
      for (const [role, re] of HEADER_ROLES) {
        if (roles[role] == null && re.test(cell)) { roles[role] = col; hits++; return; }
      }
    });
    if (hits >= 2 && (roles.amount != null || roles.commission != null)) return { index: i, roles };
  }
  return null;
}

/** ניחוש עמודות כשאין שורת כותרת: תאריך ראשון, סכום = העמודה המספרית עם הסכום הגדול, טקסט → לקוח */
function guessColumns(rows) {
  const stats = {};
  for (const row of rows) {
    (row || []).forEach((cell, col) => {
      if (cell == null || cell === '') return;
      const st = (stats[col] = stats[col] || { nums: 0, dates: 0, texts: 0, sum: 0 });
      if (parseDateCell(cell)) st.dates++;
      else if (parseAmount(cell) != null) { st.nums++; st.sum += Math.abs(parseAmount(cell)); }
      else if (typeof cell === 'string') st.texts++;
    });
  }
  const roles = {};
  let bestAmount = null;
  for (const [col, st] of Object.entries(stats)) {
    const c = parseInt(col, 10);
    if (st.dates > st.nums && st.dates > st.texts && roles.date == null) roles.date = c;
    else if (st.nums > 0 && (!bestAmount || st.sum > bestAmount.sum)) bestAmount = { col: c, sum: st.sum };
  }
  if (bestAmount) roles.amount = bestAmount.col;
  for (const [col, st] of Object.entries(stats)) {
    const c = parseInt(col, 10);
    if (st.texts > 0 && c !== roles.date && c !== roles.amount && roles.client == null) roles.client = c;
  }
  return roles;
}

/**
 * מסווג טבלת שורות (array-of-arrays מגיליון/CSV) למועמדי חשבונית.
 * ctx = { clients, cases, defaultYear }
 */
export function classifyTable(rows, ctx) {
  const { clients = [], cases = [], defaultYear = new Date().getFullYear() } = ctx || {};
  const header = detectHeaderRow(rows);
  const roles = header ? header.roles : guessColumns(rows.slice(0, 40));
  const dataRows = rows.slice(header ? header.index + 1 : 0);
  const caseByNum = new Map(cases.map((c) => [String(c.caseNumber || '').trim().toLowerCase(), c]).filter(([k]) => k));
  const casesByClient = new Map();
  cases.forEach((c) => {
    if (!casesByClient.has(c.clientId)) casesByClient.set(c.clientId, []);
    casesByClient.get(c.clientId).push(c);
  });

  const out = [];
  for (const row of dataRows) {
    if (!row || !row.length) continue;
    const cell = (role) => (roles[role] != null ? row[roles[role]] : null);
    const clientText = cell('client');
    // דילוג על שורות סיכום
    if (typeof clientText === 'string' && /סה["״׳']?כ|total/i.test(clientText)) continue;

    const amount = parseAmount(cell('amount'));
    if (amount == null || amount <= 0) continue;

    // תאריך: עמודת תאריך / חודש+שנה נפרדים
    let date = parseDateCell(cell('date'), defaultYear);
    if (!date) {
      const mRaw = cell('month');
      const monthNum = HEB_MONTHS[String(mRaw || '').trim()] || parseInt(mRaw, 10);
      const yearNum = parseInt(cell('year'), 10);
      if (monthNum >= 1 && monthNum <= 12) date = { month: monthNum, year: yearNum || defaultYear };
    }

    // שיוך תיק: מספר תיק → ישיר; אחרת לקוח עם תיק יחיד
    let matchedCase = null;
    let clientMatch = null;
    const caseNumText = String(cell('caseNum') || '').trim().toLowerCase();
    if (caseNumText && caseByNum.has(caseNumText)) matchedCase = caseByNum.get(caseNumText);
    if (!matchedCase && clientText) {
      clientMatch = matchClient(clientText, clients);
      if (clientMatch) {
        const cc = casesByClient.get(clientMatch.client.id) || [];
        if (cc.length === 1) matchedCase = cc[0];
      }
    }

    const rate = parseFloat(cell('rate'));
    const invoiceNo = String(cell('invoiceNo') || '').trim();
    const notesParts = [String(cell('notes') || '').trim(), invoiceNo && `חשבונית ${invoiceNo}`].filter(Boolean);

    out.push({
      include: true,
      caseId: matchedCase ? matchedCase.id : null,
      clientGuess: clientMatch ? clientMatch.client.name : (typeof clientText === 'string' ? clientText.trim() : ''),
      month: date ? date.month : null,
      year: date ? date.year : defaultYear,
      amount,
      rate: Number.isFinite(rate) ? rate : (matchedCase ? matchedCase.commissionRate : 0),
      notes: notesParts.join(' · '),
      confidence: matchedCase && date ? 'high' : (matchedCase || date ? 'medium' : 'low'),
    });
  }
  return out;
}

/* ============================================================ פענוח PDF — חילוץ שדות לפי תוויות ============================================================ */
const AMOUNT_RE = /(?:₪\s*)?-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|(?:₪\s*)-?\d+(?:\.\d{1,2})?|-?\d+\.\d{2}\b/g;
const DATE_RE = /\b([0-3]?\d)[./\-]([01]?\d)[./\-](\d{2,4})\b/;
// עוגן חשבונית: "חשבון עסקה 10041947" · "חשבונית מס' 30112" · "invoice #123" · "נספח לחשבון עסקה מספר N"
const INVOICE_ANCHOR_RE = /(?:חשבון\s*עסקה|חשבונית(?:\s*מס['׳.]?)?|invoice)\s*(?:מספר\s*)?[:#]?\s*(\d{3,})/i;

// pdf.js מפיק לעיתים גרשיים "מסולסלים" (”“) — מנרמלים לגרש ישר כדי שתוויות עבריות יזוהו
function normQuotes(s) { return String(s).replace(/[”“״]/g, '"').replace(/[’‘׳]/g, "'"); }

function amountsInLine(line) {
  const out = [];
  for (const m of normQuotes(line).matchAll(AMOUNT_RE)) {
    const n = parseAmount(m[0].replace('₪', '').trim());
    if (n != null && n > 0 && n < 100000000) out.push(n);
  }
  return out;
}

/** הסכום (הגדול) בשורה הראשונה שמכילה את התווית */
function labeledAmount(lines, labelRe) {
  for (const line of lines) {
    if (labelRe.test(normQuotes(line))) {
      const nums = amountsInLine(line);
      if (nums.length) return Math.max(...nums);
    }
  }
  return null;
}

/** הערך בשורת תווית, עם התווית מוסרת (לשדות טקסט: "שם לקוח:", "תאריך:") */
function labeledText(lines, labelRe) {
  for (const line of lines) {
    const n = normQuotes(line);
    if (labelRe.test(n)) return n.replace(labelRe, ' ').replace(/\s+/g, ' ').trim();
  }
  return null;
}

/**
 * חילוץ כל שדות החשבונית מקבוצת שורות (חשבונית אחת, יכולה להשתרע על כמה עמודים).
 * ctx = { clients, cases, defaultYear }. מחזיר אובייקט שדות מובנה.
 */
export function extractInvoiceFields(lines, ctx) {
  const { clients = [], cases = [], defaultYear = new Date().getFullYear() } = ctx || {};

  // מספר חשבונית
  let invoiceNo = null;
  for (const line of lines) {
    const m = normQuotes(line).match(INVOICE_ANCHOR_RE);
    if (m) { invoiceNo = m[1]; break; }
  }

  // תאריך — עדיפות לשורת "תאריך:", נפילה לתאריך הראשון במסמך
  const dateLine = labeledText(lines, /תאריך\s*:?/);
  const dm = (dateLine || normQuotes(lines.join('\n'))).match(DATE_RE);
  let date = null;
  if (dm) {
    const month = parseInt(dm[2], 10);
    let year = parseInt(dm[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12) date = { month, year, raw: dm[0] };
  }

  // לקוח: "שם לקוח:" → נפילה ל"לכבוד:". ניקוי שדות שנגררו לאותה שורה (RTL)
  let clientName = labeledText(lines, /שם\s*לקוח\s*:?/) || labeledText(lines, /לכבוד\s*:?/) || '';
  clientName = clientName.replace(DATE_RE, '').replace(/ח\.?פ\/?ע?\.?מ?\s*לקוח\s*:?/, '').replace(/\d{5,}/g, '').replace(/\s+/g, ' ').trim();
  const externalClientId = labeledText(lines, /מזהה\s*לקוח\s*:?/)?.match(/\d+/)?.[0] || null;

  // סוג תיק — כתא עצמאי או ערך אחרי "סוג תיק". מדלגים על שורות עוגן ("חשבון עסקה" אינו סוג תיק)
  let caseType = null;
  for (const raw of lines) {
    const line = normQuotes(raw).trim();
    if (INVOICE_ANCHOR_RE.test(line)) continue;
    for (const t of ['ליטיגציה', 'עסקה', 'שוטף']) {
      if (line === t || new RegExp(`סוג\\s*תיק\\s*:?\\s*${t}`).test(line)) { caseType = t; break; }
    }
    if (caseType) break;
  }

  // סכומים — תווית-מונחה. ברירת המחדל לחיוב = לפני מע"מ (שכר הטרחה, בסיס העמלה)
  const amountBeforeVat = labeledAmount(lines, /סה"כ\s*חייב\s*במע"מ|סכום\s*לפני\s*מע"מ|לפני\s*מע"מ/);
  const vat = labeledAmount(lines, /סה"כ\s*מע"מ|מע"מ\s*\)?\s*1[78]\s*%/);
  const amountTotal = labeledAmount(lines, /סה"כ\s*לתשלום|סה"כ\s*החשבון/);
  let amount = amountBeforeVat != null ? amountBeforeVat : amountTotal;
  if (amount == null) {
    let max = 0;
    for (const line of lines) for (const n of amountsInLine(line)) if (n > max) max = n;
    amount = max > 0 ? max : null;
  }

  // התאמת לקוח/תיק קיימים
  let clientMatch = clientName ? matchClient(clientName, clients) : null;
  if (!clientMatch) {
    for (const line of lines) {
      const m = matchClient(line, clients);
      if (m && normalizeName(line).includes(normalizeName(m.client.name))) { clientMatch = m; break; }
    }
  }
  let matchedCase = null;
  if (invoiceNo) matchedCase = cases.find((c) => String(c.caseNumber || '').trim() === invoiceNo) || null;
  if (!matchedCase && clientMatch) {
    const cc = cases.filter((c) => c.clientId === clientMatch.client.id);
    if (cc.length === 1) matchedCase = cc[0];
  }

  return {
    invoiceNo, date, clientName, externalClientId, caseType,
    amountBeforeVat, vat, amountTotal, amount, clientMatch, matchedCase,
    _defaultYear: defaultYear,
  };
}

/** שדות מחולצים → מועמד לסיווג (schema אחיד עם classifyTable) */
function fieldsToCandidate(f) {
  const notes = [];
  if (f.invoiceNo) notes.push(`חשבון ${f.invoiceNo}`);
  if (f.amountTotal != null && f.amountTotal !== f.amount) notes.push(`כולל מע"מ ₪${Math.round(f.amountTotal).toLocaleString('he-IL')}`);
  const hasClient = !!(f.clientMatch || (f.clientName && f.clientName.length > 1));
  return {
    include: f.amount != null,
    caseId: f.matchedCase ? f.matchedCase.id : null,
    clientGuess: f.clientMatch ? f.clientMatch.client.name : (f.clientName || ''),
    clientExists: !!f.clientMatch,
    month: f.date ? f.date.month : null,
    year: f.date ? f.date.year : f._defaultYear,
    amount: f.amount,
    rate: f.matchedCase ? f.matchedCase.commissionRate : 0,
    caseType: f.caseType || 'שוטף',
    notes: notes.join(' · '),
    invoiceNo: f.invoiceNo, externalClientId: f.externalClientId,
    amountBeforeVat: f.amountBeforeVat, vat: f.vat, amountTotal: f.amountTotal,
    confidence: f.matchedCase && f.date ? 'high' : (hasClient && f.date && f.amount != null ? 'medium' : 'low'),
  };
}

/**
 * מסמך PDF (מערך עמודים, כל עמוד = שורות) → מועמדי חשבונית.
 * מקבץ לפי מספר חשבונית → חשבונית שמשתרעת על כמה עמודים (חשבון+נספח) = מועמד אחד.
 */
export function classifyPdfDocument(pages, ctx) {
  const allLines = pages.flat();
  const groups = new Map();  // invoiceNo → lines[]
  const order = [];
  let current = null, sawAnchor = false;
  for (const line of allLines) {
    const m = normQuotes(line).match(INVOICE_ANCHOR_RE);
    if (m) { sawAnchor = true; current = m[1]; if (!groups.has(current)) { groups.set(current, []); order.push(current); } }
    if (current == null) { current = '__pre__'; if (!groups.has(current)) { groups.set(current, []); order.push(current); } }
    groups.get(current).push(line);
  }
  let segments;
  if (!sawAnchor) {
    segments = [allLines];  // מסמך יחיד בלי מספר מזוהה
  } else {
    const realKeys = order.filter((k) => k !== '__pre__');
    if (groups.has('__pre__') && realKeys.length) groups.get(realKeys[0]).unshift(...groups.get('__pre__'));  // כותרות → לחשבונית הראשונה
    segments = realKeys.map((k) => groups.get(k));
  }
  const candidates = [];
  for (const seg of segments) {
    const f = extractInvoiceFields(seg, ctx);
    if (f.amount != null) candidates.push(fieldsToCandidate(f));
  }
  return candidates;
}

/* ============================================================ קריאת קבצים (דפדפן) ============================================================ */
export function detectKind(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (/\.(xlsx|xls|csv|ods)$/.test(name) || /spreadsheet|ms-excel|csv/.test(file.type)) return 'excel';
  return null;
}

async function parseExcel(file, ctx) {
  await loadScript(VENDOR_XLSX());
  const XLSX = window.XLSX;
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const candidates = [];
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
    candidates.push(...classifyTable(rows, ctx));
  }
  return candidates;
}

async function parsePdf(file, ctx) {
  await loadScript(VENDOR_PDF());
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR_PDF_WORKER();
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // קיבוץ פריטי טקסט לשורות לפי קואורדינטת Y, מיון פנימי לפי X
    const byY = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ x: item.transform[4], str: item.str });
    }
    const lines = [...byY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').trim());
    pages.push(lines);
  }
  return classifyPdfDocument(pages, ctx);
}

/**
 * נקודת הכניסה: קובץ → מועמדי חשבונית לסיווג.
 * ctx = { clients, cases, defaultYear }. זורק Error עם הודעה בעברית אם הפענוח נכשל.
 */
export async function parseFile(file, ctx) {
  const kind = detectKind(file);
  if (!kind) throw new Error('סוג הקובץ לא נתמך — יש להעלות PDF, Excel או CSV');
  const candidates = kind === 'pdf' ? await parsePdf(file, ctx) : await parseExcel(file, ctx);
  return { kind, candidates };
}
