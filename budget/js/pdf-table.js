// pdf-table.js — קריאת טבלה מקובץ PDF, כדי שדוח שעות בפורמט PDF ייכנס
// לאותו מסך ייבוא כמו XLSX/CSV. משתמש ב-pdf.js המקומי (ללא רשת).
//
// השיטה: pdf.js מחזיר פריטי טקסט עם קואורדינטות. אנחנו מקבצים אותם לשורות
// לפי Y, ואז מזהים **עמודות** לפי אשכולות של קואורדינטת X לאורך כל העמוד —
// כך מתקבלת מטריצה שורות×עמודות שנראית כמו גיליון.

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

/** אשכול קואורדינטות X לעמודות: ערכים קרובים (עד `tol`) מתמזגים לעמודה אחת */
function clusterColumns(xs, tol = 20) {
  const sorted = [...xs].sort((a, b) => a - b);
  const cols = [];
  for (const x of sorted) {
    const last = cols[cols.length - 1];
    if (last !== undefined && x - last <= tol) continue;
    cols.push(x);
  }
  return cols;
}

/**
 * מיזוג עמודות שמעולם לא מופיעות יחד באותה שורה — סימן מובהק שזו עמודה לוגית
 * אחת שנשברה בגלל יישור שונה (כותרת ממורכזת מול ערכים מיושרים).
 */
function mergeExclusiveColumns(rows, colCount) {
  let cols = Array.from({ length: colCount }, (_, i) => i);
  let merged = true;
  while (merged && cols.length > 1) {
    merged = false;
    for (let i = 0; i < cols.length - 1; i++) {
      const a = cols[i], bIdx = cols[i + 1];
      const together = rows.some((r) => r[a] !== '' && r[a] != null && r[bIdx] !== '' && r[bIdx] != null);
      if (!together) {
        for (const r of rows) {
          const va = r[a], vb = r[bIdx];
          r[a] = (va !== '' && va != null) ? va : vb;
          r[bIdx] = '';
        }
        cols.splice(i + 1, 1);
        merged = true;
        break;
      }
    }
  }
  return rows.map((r) => cols.map((i) => r[i]));
}

const nearestCol = (x, cols) => {
  let best = 0, dist = Infinity;
  cols.forEach((c, i) => { const d = Math.abs(c - x); if (d < dist) { dist = d; best = i; } });
  return best;
};

/**
 * קורא PDF ומחזיר גיליונות בפורמט של xlsx.js: `[{ name, rows }]` — עמוד = גיליון.
 * שורה = מערך תאים לפי העמודות שזוהו.
 */
export async function pdfToSheets(file) {
  const pdfjsLib = await loadPdfLib();
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = vendorUrl('pdf.worker.min.js'); } catch { /* noop */ }

  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const sheets = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // קיבוץ פריטים לשורות לפי Y (עיגול לסבילות של 2 נקודות)
    const byY = new Map();
    const xs = [];
    for (const item of content.items) {
      const str = String(item.str || '').trim();
      if (!str) continue;
      const x = item.transform[4] + (Number(item.width) || 0) / 2;
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ x, str });
      xs.push(x);
    }
    if (!byY.size) continue;

    // מרכז התא ולא הקצה — יישור שונה בין כותרת לערכים לא ישבור את העמודה
    const cols = clusterColumns(xs);
    let rows = [...byY.entries()]
      .sort((a, b) => b[0] - a[0])                       // מלמעלה למטה
      .map(([, items]) => {
        const cells = new Array(cols.length).fill('');
        for (const it of items.sort((a, b) => a.x - b.x)) {
          const i = nearestCol(it.x, cols);
          cells[i] = cells[i] ? `${cells[i]} ${it.str}` : it.str;
        }
        // תא שהוא מספר טהור מומר למספר, כדי שהמיפוי יזהה שעות/סכומים
        return cells.map((c) => {
          const t = c.trim();
          if (!t) return '';
          const n = Number(t.replace(/,/g, ''));
          return t !== '' && Number.isFinite(n) && /^[\d.,\-]+$/.test(t) ? n : t;
        });
      })
      .filter((r) => r.some((c) => c !== '' && c !== null));

    rows = mergeExclusiveColumns(rows, cols.length);
    sheets.push({ name: `עמוד ${p}`, rows });
  }

  if (!sheets.length) throw new Error('לא נמצא טקסט ב-PDF (ייתכן שזה קובץ סרוק — נדרש OCR)');
  return sheets;
}

export const isPdf = (file) => /\.pdf$/i.test(file?.name || '') || file?.type === 'application/pdf';
