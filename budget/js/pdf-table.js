// pdf-table.js — חילוץ טבלה מקובץ PDF, כדי שדוח שעות ב-PDF ייכנס לאותו מסך ייבוא
// כמו XLSX/CSV. משתמש ב-pdf.js המקומי (ללא רשת).
//
// השיטה (שלושה שלבים, כל אחד פותר כשל אמיתי שנצפה בדוחות):
// 1. **תא ולא פריט** — pdf.js מפרק טקסט לפריטים שרירותיים (מקף, שינוי גופן).
//    פריטים סמוכים באותה שורה עם רווח קטן מאוחדים לתא אחד; אחרת תיאור אחד
//    נשבר לשתי "עמודות" והכותרת לא יושבת מעל הערכים.
// 2. **מרזבים ולא אשכולות** — העמודות נגזרות מרצועות ה-X שאף תא לא חוצה
//    (whitespace gutters). זה עמיד ליישור שונה בין כותרת לערכים, בניגוד לאשכול
//    לפי מרכז התא.
// 3. **רשת אחת לכל טבלה** — עמודים בעלי מבנה עמודות תואם מאוחדים לגיליון אחד,
//    כך שהמיפוי שהמשתמש מאשר חל על כל הדוח ולא רק על העמוד הראשון. חשבון אמיתי
//    מכיל גם עמוד שער וגם נספח הוצאות במבנה אחר — הם נשארים גיליונות נפרדים
//    ואינם הורסים את רשת העמודות של טבלת השעות.
// 4. **שורות המשך** — בדוח אמיתי התיאור נשבר לשתיים-שלוש שורות פיזיות סביב שורת
//    הנתונים, והכותרת עצמה נפרסת על שלוש שורות ("שעות"/"לחיוב"). שורה חלקית
//    מתמזגת לשורה המלאה הקרובה אליה, לפי עמודה.

const vendorUrl = (file) => (window.__OFFLINE_VENDOR__ && window.__OFFLINE_VENDOR__[file]) || `./vendor/${file}`;

let scriptPromise = null;
function loadPdfLib() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = vendorUrl('pdf.min.js');
    s.onload = () => resolve(window.pdfjsLib);
    s.onerror = () => reject(new Error('טעינת מנוע ה-PDF נכשלה'));
    document.head.append(s);
  });
  return scriptPromise;
}

/* ---------- שלב 1: פריטים → שורות → תאים ---------- */

/** מקבץ פריטי טקסט לשורות לפי קו הבסיס (Y), עם סבילות יחסית לגובה הגופן */
function toLines(items) {
  const list = [];
  for (const item of items) {
    const str = String(item.str ?? '');
    if (!str.trim()) continue;
    const t = item.transform || [];
    const h = Math.abs(Number(t[3])) || Math.abs(Number(item.height)) || 10;
    const xs = Number(t[4]) || 0;
    list.push({ xs, xe: xs + (Number(item.width) || 0), y: Number(t[5]) || 0, h, str: str.trim() });
  }
  list.sort((a, b) => b.y - a.y || a.xs - b.xs);

  const lines = [];
  for (const it of list) {
    const cur = lines[lines.length - 1];
    if (cur && Math.abs(cur.y - it.y) <= Math.max(1.5, it.h * 0.5)) cur.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines;
}

/** מאחד פריטים סמוכים לתא לוגי אחד: רווח קטן מ-`gap` = אותו תא */
function toCells(line, gap) {
  const sorted = [...line.items].sort((a, b) => a.xs - b.xs);
  const cells = [];
  for (const it of sorted) {
    const cur = cells[cells.length - 1];
    if (cur && it.xs - cur.xe < gap) {
      cur.xe = Math.max(cur.xe, it.xe);
      cur.str = `${cur.str}${it.xs - cur.xe > -0.5 ? ' ' : ''}${it.str}`.replace(/\s+/g, ' ').trim();
    } else {
      cells.push({ xs: it.xs, xe: it.xe, str: it.str });
    }
  }
  return cells;
}

/* ---------- שלב 2: מרזבים → גבולות עמודות ---------- */

/**
 * מוצא את גבולות העמודות לפי רצועות X שאף תא לא חוצה.
 * נלקחים בחשבון רק תאים משורות שנראות כמו שורות טבלה (3 תאים ומעלה) ושאינם
 * רחבים חריגה — כותרת עמוד או שורת "סה"כ" משתרעת על כל הרוחב ומוחקת כל מרזב.
 */
function columnBands(allCells, width, minGutter = 3.5) {
  const w = Math.max(10, Math.ceil(width));
  const occ = new Uint8Array(w + 2);
  const maxCell = width * 0.45;
  let used = 0;
  for (const c of allCells) {
    if (c.xe - c.xs > maxCell) continue;
    const a = Math.max(0, Math.floor(c.xs)), b = Math.min(w, Math.ceil(c.xe));
    for (let x = a; x <= b; x++) occ[x] = 1;
    used++;
  }
  if (!used) return null;

  const bands = [];
  let start = -1, gapRun = 0;
  for (let x = 0; x <= w + 1; x++) {
    if (occ[x]) {
      if (start < 0) start = x;
      else if (gapRun && gapRun < minGutter) { /* מרזב צר מדי — אותה עמודה */ }
      gapRun = 0;
    } else {
      if (start < 0) continue;
      gapRun++;
      if (gapRun >= minGutter) { bands.push([start, x - gapRun]); start = -1; gapRun = 0; }
    }
  }
  if (start >= 0) bands.push([start, w]);
  return bands.length ? bands : null;
}

const bandOf = (cx, bands) => {
  for (let i = 0; i < bands.length; i++) if (cx >= bands[i][0] - 0.5 && cx <= bands[i][1] + 0.5) return i;
  let best = 0, dist = Infinity;
  bands.forEach((b, i) => {
    const d = cx < b[0] ? b[0] - cx : cx - b[1];
    if (d < dist) { dist = d; best = i; }
  });
  return best;
};

/** תא שהוא מספר טהור מומר למספר, כדי שהמיפוי יזהה שעות/סכומים */
function castCell(v) {
  const t = String(v ?? '').trim();
  if (!t) return '';
  if (!/^[\d.,\-+₪%\s]+$/.test(t)) return t;
  const n = Number(t.replace(/[,₪\s]/g, ''));
  return Number.isFinite(n) && /\d/.test(t) ? n : t;
}

/* ---------- שלב 3: קיבוץ עמודים לטבלאות ---------- */

const tableCellsOf = (lines) => lines.filter((l) => l.cells.length >= 3).flatMap((l) => l.cells);

/** שתי רשתות תואמות אם יש להן אותו מספר עמודות וכל עמודה חופפת את מקבילתה */
function compatibleBands(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(a[i][0], b[i][0]), hi = Math.min(a[i][1], b[i][1]);
    const overlap = hi - lo;
    const smaller = Math.min(a[i][1] - a[i][0], b[i][1] - b[i][0]);
    if (overlap <= 0 || overlap < smaller * 0.6) return false;
  }
  return true;
}

const mostCommon = (list) => {
  const c = new Map();
  for (const v of list) c.set(v, (c.get(v) || 0) + 1);
  let best = 0, n = 0;
  for (const [v, k] of c) if (k > n || (k === n && v > best)) { best = v; n = k; }
  return best;
};

/**
 * בונה את שורות העמוד על רשת העמודות, כולל מיזוג **שורות המשך**: שורה חלקית
 * (תיאור שנשבר, כותרת שנפרסה לשתי שורות) נספחת לשורה המלאה הקרובה אליה.
 */
function buildRows(lines, bands, avgH) {
  if (!lines.length) return [];
  const counts = lines.map((l) => l.cells.length).filter((c) => c >= 3);
  const anchorMin = Math.max(3, Math.ceil((mostCommon(counts) || 3) * 0.6));
  const isAnchor = lines.map((l) => l.cells.length >= anchorMin);
  const maxGap = Math.max(6, avgH * 1.6);

  const owner = lines.map((l, i) => {
    if (isAnchor[i]) return i;
    let best = -1, dist = Infinity;
    lines.forEach((o, j) => {
      if (!isAnchor[j]) return;
      const d = Math.abs(o.y - l.y);
      if (d < dist) { dist = d; best = j; }
    });
    return best >= 0 && dist <= maxGap ? best : i;
  });

  const buf = new Map();
  const order = [];
  lines.forEach((line, i) => {                     // כבר ממוינות מלמעלה למטה
    const o = owner[i];
    if (!buf.has(o)) { buf.set(o, new Array(bands.length).fill('')); order.push(o); }
    const cells = buf.get(o);
    for (const c of line.cells) {
      const b = bandOf((c.xs + c.xe) / 2, bands);
      cells[b] = cells[b] ? `${cells[b]} ${c.str}` : c.str;
    }
  });

  return order.map((o) => buf.get(o).map(castCell)).filter((r) => r.some((v) => v !== ''));
}

/**
 * קורא PDF ומחזיר גיליונות בפורמט של xlsx.js: `[{ name, rows, pages, pageNumbers }]`.
 * עמודים בעלי מבנה עמודות תואם מתאחדים לגיליון אחד; הגיליון הגדול ביותר ראשון.
 */
export async function pdfToSheets(file) {
  const pdfjsLib = await loadPdfLib();
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = vendorUrl('pdf.worker.min.js'); } catch { /* noop */ }

  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const raw = [];
  let width = 0, heights = 0, heightN = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    width = Math.max(width, page.getViewport({ scale: 1 }).width || 595);
    const lines = toLines((await page.getTextContent()).items);
    for (const line of lines) for (const it of line.items) { heights += it.h; heightN++; }
    raw.push({ n: p, lines });
  }
  if (!heightN) throw new Error('לא נמצא טקסט ב-PDF (ייתכן שזה קובץ סרוק — נדרש OCR)');

  const avgH = heights / heightN;
  const gap = Math.max(2.5, avgH * 0.5);
  const pages = raw.map(({ n, lines }) => {
    const withCells = lines.map((l) => ({ y: l.y, cells: toCells(l, gap) }));
    const cells = tableCellsOf(withCells);
    return { n, lines: withCells, bands: columnBands(cells.length ? cells : withCells.flatMap((l) => l.cells), width) };
  }).filter((p) => p.bands);
  if (!pages.length) throw new Error('לא זוהתה טבלה ב-PDF');

  // עמודים בעלי מבנה תואם = אותה טבלה. שער החשבון ונספח ההוצאות נשארים בנפרד.
  const groups = [];
  for (const pg of pages) {
    const g = groups.find((x) => compatibleBands(x.bands, pg.bands));
    if (g) g.pages.push(pg); else groups.push({ bands: pg.bands, pages: [pg] });
  }

  const sheets = groups.map((g) => {
    const cells = g.pages.flatMap((p) => tableCellsOf(p.lines));
    const bands = columnBands(cells.length ? cells : g.pages.flatMap((p) => p.lines.flatMap((l) => l.cells)), width) || g.bands;
    const rows = g.pages.flatMap((p) => buildRows(p.lines, bands, avgH));
    const nums = g.pages.map((p) => p.n);
    return { rows, pages: g.pages.length, pageNumbers: nums, first: nums[0] };
  }).filter((s) => s.rows.length);

  if (!sheets.length) throw new Error('לא זוהתה טבלה ב-PDF');
  sheets.sort((a, b) => b.rows.length - a.rows.length);

  const label = (s) => (s.pageNumbers.length === 1 ? `עמוד ${s.pageNumbers[0]}` : `עמודים ${s.pageNumbers[0]}–${s.pageNumbers[s.pageNumbers.length - 1]}`);
  return sheets.map((s, i) => ({ ...s, name: sheets.length === 1 ? 'PDF' : `טבלה ${i + 1} · ${label(s)}` }));
}

export const isPdf = (file) => /\.pdf$/i.test(file?.name || '') || file?.type === 'application/pdf';
