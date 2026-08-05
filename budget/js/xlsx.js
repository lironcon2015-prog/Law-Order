// xlsx.js — קורא XLSX מינימלי בדפדפן, ללא ספריות חיצוניות.
// ZIP מפוענח ידנית + DecompressionStream('deflate-raw') (נתמך בכל דפדפן מודרני).
// מחזיר גיליונות כמערך דו-ממדי של ערכים (מחרוזות/מספרים/תאריכי ISO).

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50;

/* ---------- ZIP ---------- */

function findEOCD(view, len) {
  const max = Math.min(len, 0xffff + 22);
  for (let i = 22; i <= max; i++) {
    const p = len - i;
    if (view.getUint32(p, true) === SIG_EOCD) return p;
  }
  return -1;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('הדפדפן אינו תומך בפענוח קבצי Excel. השתמש ב-CSV.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** מפרק ZIP למפה: שם קובץ → Uint8Array */
export async function unzip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocd = findEOCD(view, bytes.length);
  if (eocd < 0) throw new Error('הקובץ אינו ZIP/XLSX תקין');

  let count = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);

  // ZIP64 — כאשר יש יותר מ-65535 רשומות או קובץ >4GB
  if (cdOffset === 0xffffffff || count === 0xffff) {
    for (let p = eocd - 20; p >= 0; p--) {
      if (view.getUint32(p, true) === SIG_EOCD64_LOC) {
        const eocd64 = Number(view.getBigUint64(p + 8, true));
        count = Number(view.getBigUint64(eocd64 + 32, true));
        cdOffset = Number(view.getBigUint64(eocd64 + 48, true));
        break;
      }
    }
  }

  const decoder = new TextDecoder('utf-8');
  const files = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== SIG_CEN) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    files.set(name, { method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const out = new Map();
  for (const [name, meta] of files) {
    const lo = meta.localOffset;
    const nameLen = view.getUint16(lo + 26, true);
    const extraLen = view.getUint16(lo + 28, true);
    const start = lo + 30 + nameLen + extraLen;
    const raw = bytes.subarray(start, start + meta.compSize);
    out.set(name, meta.method === 0 ? raw : await inflateRaw(raw));
  }
  return out;
}

/* ---------- XML ---------- */

const td = new TextDecoder('utf-8');
const parser = new DOMParser();

function parseXml(bytes) {
  return parser.parseFromString(td.decode(bytes), 'application/xml');
}

/* ---------- תאריכים ---------- */

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function serialToISO(serial) {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const ms = Math.round((serial - 25569) * 86400000); // 25569 = ימים בין 1899-12-30 ל-1970-01-01
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** בונה מפה: styleIndex → האם התא מעוצב כתאריך */
function buildDateStyleMap(stylesDoc) {
  const dateStyles = new Set();
  if (!stylesDoc) return dateStyles;
  const customDate = new Set();
  for (const nf of stylesDoc.getElementsByTagName('numFmt')) {
    const code = nf.getAttribute('formatCode') || '';
    const stripped = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
    if (/[dmy]/i.test(stripped) && !/^[^dmy]*$/i.test(stripped)) customDate.add(nf.getAttribute('numFmtId'));
  }
  const xfs = stylesDoc.getElementsByTagName('cellXfs')[0];
  if (!xfs) return dateStyles;
  const list = xfs.getElementsByTagName('xf');
  for (let i = 0; i < list.length; i++) {
    const id = list[i].getAttribute('numFmtId');
    if (id === null) continue;
    if (customDate.has(id) || BUILTIN_DATE_FMTS.has(Number(id))) dateStyles.add(i);
  }
  return dateStyles;
}

/* ---------- גיליונות ---------- */

function colToIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetToRows(doc, shared, dateStyles) {
  const rows = [];
  const rowEls = doc.getElementsByTagName('row');
  for (let i = 0; i < rowEls.length; i++) {
    const rowEl = rowEls[i];
    const rowIdx = Number(rowEl.getAttribute('r') || rows.length + 1) - 1;
    const cells = [];
    const cellEls = rowEl.getElementsByTagName('c');
    for (let j = 0; j < cellEls.length; j++) {
      const c = cellEls[j];
      const idx = colToIndex(c.getAttribute('r'));
      const t = c.getAttribute('t');
      let value = null;

      if (t === 'inlineStr') {
        const ts = c.getElementsByTagName('t');
        let s = '';
        for (let k = 0; k < ts.length; k++) s += ts[k].textContent;
        value = s;
      } else {
        const v = c.getElementsByTagName('v')[0];
        const raw = v ? v.textContent : null;
        if (raw === null || raw === '') value = null;
        else if (t === 's') value = shared[Number(raw)] ?? '';
        else if (t === 'b') value = raw === '1';
        else if (t === 'e') value = null;
        else if (t === 'str') value = raw;
        else {
          const n = Number(raw);
          const styleIdx = Number(c.getAttribute('s') || -1);
          value = dateStyles.has(styleIdx) ? (serialToISO(n) ?? n) : (Number.isFinite(n) ? n : raw);
        }
      }
      cells[idx] = value;
    }
    for (let k = 0; k < cells.length; k++) if (cells[k] === undefined) cells[k] = null;
    rows[rowIdx] = cells;
  }
  for (let k = 0; k < rows.length; k++) if (!rows[k]) rows[k] = [];
  return rows;
}

/**
 * קורא קובץ XLSX ומחזיר [{ name, rows }].
 * rows = מערך שורות, כל שורה מערך ערכים (null לתא ריק).
 */
export async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  const files = await unzip(buf);

  // מחרוזות משותפות
  const shared = [];
  const ssBytes = files.get('xl/sharedStrings.xml');
  if (ssBytes) {
    const doc = parseXml(ssBytes);
    const sis = doc.getElementsByTagName('si');
    for (let i = 0; i < sis.length; i++) {
      const ts = sis[i].getElementsByTagName('t');
      let s = '';
      for (let k = 0; k < ts.length; k++) {
        // דילוג על rPh (פונטיקה יפנית) — לא רלוונטי אך מזיק אם נכלל
        if (ts[k].parentNode && ts[k].parentNode.nodeName === 'rPh') continue;
        s += ts[k].textContent;
      }
      shared.push(s);
    }
  }

  const dateStyles = buildDateStyleMap(files.get('xl/styles.xml') ? parseXml(files.get('xl/styles.xml')) : null);

  // מיפוי rId → target
  const relMap = new Map();
  const relBytes = files.get('xl/_rels/workbook.xml.rels');
  if (relBytes) {
    const doc = parseXml(relBytes);
    for (const rel of doc.getElementsByTagName('Relationship')) {
      relMap.set(rel.getAttribute('Id'), rel.getAttribute('Target'));
    }
  }

  const wbBytes = files.get('xl/workbook.xml');
  if (!wbBytes) throw new Error('לא נמצא גיליון בקובץ');
  const wbDoc = parseXml(wbBytes);

  const sheets = [];
  const sheetEls = wbDoc.getElementsByTagName('sheet');
  for (let i = 0; i < sheetEls.length; i++) {
    const el = sheetEls[i];
    const name = el.getAttribute('name') || `גיליון ${i + 1}`;
    const rid = el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
      || el.getAttribute('r:id');
    let target = relMap.get(rid) || `worksheets/sheet${i + 1}.xml`;
    if (target.startsWith('/')) target = target.slice(1);
    const path = target.startsWith('xl/') ? target : `xl/${target}`;
    const bytes = files.get(path);
    if (!bytes) continue;
    sheets.push({ name, rows: sheetToRows(parseXml(bytes), shared, dateStyles) });
  }
  if (!sheets.length) throw new Error('לא נמצא גיליון קריא בקובץ');
  return sheets;
}

/* ---------- CSV ---------- */

/** מפרק CSV/TSV (כולל ציטוטים ושורות מרובות) */
export function parseCSV(text) {
  const clean = text.replace(/^﻿/, '');
  const delim = guessDelimiter(clean);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    }
    // גרשיים נחשבים פותחי-ציטוט רק בתחילת שדה. בעברית הם נפוצים בתוך מילים
    // (עו"ד, רו"ח, שכ"ט) בקבצים שלא עברו escape — שם יש להתייחס אליהם כתו רגיל.
    else if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* מתעלמים */ }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((c) => {
    const s = String(c).trim();
    if (s === '') return null;
    const n = Number(s.replace(/[,\s₪]/g, ''));
    return Number.isFinite(n) && /\d/.test(s) && !/[a-zא-ת]/i.test(s) ? n : s;
  }));
}

function guessDelimiter(text) {
  const head = text.slice(0, 4000);
  const counts = [[',', 0], [';', 0], ['\t', 0], ['|', 0]];
  for (const c of counts) c[1] = (head.split(c[0]).length - 1);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** נקודת כניסה אחידה: מחזיר [{name, rows}] לכל סוג קובץ נתמך */
export async function readTabularFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    return [{ name: file.name, rows: parseCSV(await file.text()) }];
  }
  if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xltx') {
    return readWorkbook(file);
  }
  throw new Error('סוג קובץ לא נתמך. תומך ב-XLSX ו-CSV.');
}
