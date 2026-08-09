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
// 3. **רשת אחת לכל המסמך** — המרזבים מחושבים מכל העמודים יחד, ולכן עמוד 2
//    מקבל בדיוק את אותם אינדקסים כמו עמוד 1. כך המיפוי שהמשתמש מאשר חל על
//    כל הדוח, ולא רק על העמוד הראשון.

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

/* ---------- שלב 3: המסמך כולו כגיליון אחד ---------- */

/**
 * קורא PDF ומחזיר גיליון יחיד בפורמט של xlsx.js: `[{ name, rows, pages }]`.
 * כל עמודי המסמך נכנסים לאותה רשת עמודות, לפי סדר העמודים.
 */
export async function pdfToSheets(file) {
  const pdfjsLib = await loadPdfLib();
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = vendorUrl('pdf.worker.min.js'); } catch { /* noop */ }

  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageLines = [];      // [{ page, cells:[] }]
  let width = 0;
  let heights = 0, heightN = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    width = Math.max(width, page.getViewport({ scale: 1 }).width || 595);
    const content = await page.getTextContent();
    for (const line of toLines(content.items)) {
      for (const it of line.items) { heights += it.h; heightN++; }
      pageLines.push({ page: p, line });
    }
  }
  if (!pageLines.length) throw new Error('לא נמצא טקסט ב-PDF (ייתכן שזה קובץ סרוק — נדרש OCR)');

  const avgH = heightN ? heights / heightN : 10;
  const gap = Math.max(2.5, avgH * 0.5);
  const rowsCells = pageLines.map(({ page, line }) => ({ page, cells: toCells(line, gap) }));

  // המרזבים נלמדים משורות הטבלה בלבד (3 תאים ומעלה), על פני כל העמודים
  const tableCells = rowsCells.filter((r) => r.cells.length >= 3).flatMap((r) => r.cells);
  const bands = columnBands(tableCells.length ? tableCells : rowsCells.flatMap((r) => r.cells), width);
  if (!bands) throw new Error('לא זוהתה טבלה ב-PDF');

  const rows = [];
  for (const { cells } of rowsCells) {
    const out = new Array(bands.length).fill('');
    for (const c of cells) {
      const i = bandOf((c.xs + c.xe) / 2, bands);
      out[i] = out[i] ? `${out[i]} ${c.str}` : c.str;
    }
    const cast = out.map(castCell);
    if (cast.some((v) => v !== '')) rows.push(cast);
  }

  const name = doc.numPages > 1 ? `PDF · ${doc.numPages} עמודים` : 'PDF';
  return [{ name, rows, pages: doc.numPages }];
}

export const isPdf = (file) => /\.pdf$/i.test(file?.name || '') || file?.type === 'application/pdf';
