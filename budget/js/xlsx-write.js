// xlsx-write.js — כתיבת קובץ אקסל אמיתי (.xlsx), בלי ספריות חיצוניות.
//
// למה לא CSV: CSV מאבד כל עיצוב, שובר עברית בחלק מהגרסאות, ומכריח את המשתמש
// לסדר עמודות ופורמטים בכל פעם מחדש. כאן נוצר קובץ עם גיליון RTL, כותרות
// מודגשות, שורה קפואה, מסנן אוטומטי, רוחבי עמודות ופורמטים (₪, שעות, %).
//
// המבנה: ZIP (ללא דחיסה או deflate-raw אם הדפדפן תומך) עם ה-XML-ים המינימליים
// שאקסל דורש. מחרוזות נכתבות inline כדי לוותר על טבלת sharedStrings.

/* ---------- ZIP ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(buf);
  } catch { return null; }
}

/** בונה ZIP מרשימת קבצים `[{ name, bytes }]` */
async function zip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const packed = await deflateRaw(f.bytes);
    const useDeflate = packed && packed.length < f.bytes.length;
    const data = useDeflate ? packed : f.bytes;
    const method = useDeflate ? 8 : 0;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);              // version needed
    local.setUint16(6, 0x0800, true);          // UTF-8 filenames
    local.setUint16(8, method, true);
    local.setUint16(10, 0, true); local.setUint16(12, 0, true);   // time/date
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, f.bytes.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, method, true);
    cd.setUint16(12, 0, true); cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, f.bytes.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------- עזרי XML ---------- */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/\x00-\x08|\x0b|\x0c|\x0e-\x1f/g, '');

function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/* ---------- סגנונות ---------- */

// מדדי cellXfs — הסדר חייב להתאים ל-styles.xml שלמטה
const S = {
  base: 0, title: 1, sub: 2, head: 3, label: 4,
  money: 5, hours: 6, pct: 7, date: 8, int: 9,
  total: 10, totalMoney: 11, totalHours: 12, muted: 13,
  totalPct: 14,
  sub_: 15, subMoney: 16, subHours: 17, subPct: 18,
};
const FMT_STYLE = { text: S.base, money: S.money, hours: S.hours, pct: S.pct, date: S.date, int: S.int };
const TOTAL_STYLE = { text: S.total, money: S.totalMoney, hours: S.totalHours, pct: S.totalPct, date: S.total, int: S.total };
// שורת סיכום ביניים (סה"כ צוות וכד') — מודגשת עם רקע וקו עליון, ונבדלת מסה"כ הכללי
const SUBTOTAL_STYLE = { text: S.sub_, money: S.subMoney, hours: S.subHours, pct: S.subPct, date: S.sub_, int: S.sub_ };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4">
<numFmt numFmtId="164" formatCode="&quot;₪&quot;#,##0;[Red]\\-&quot;₪&quot;#,##0"/>
<numFmt numFmtId="165" formatCode="#,##0.0"/>
<numFmt numFmtId="166" formatCode="0.0%"/>
<numFmt numFmtId="167" formatCode="dd/mm/yyyy"/>
</numFmts>
<fonts count="7">
<font><sz val="11"/><name val="Arial"/></font>
<font><b/><sz val="15"/><color rgb="FF1A1A1A"/><name val="Arial"/></font>
<font><i/><sz val="10"/><color rgb="FF777777"/><name val="Arial"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
<font><b/><sz val="11"/><name val="Arial"/></font>
<font><sz val="10"/><color rgb="FF777777"/><name val="Arial"/></font>
<font><b/><sz val="11"/><color rgb="FF1F2430"/><name val="Arial"/></font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F2430"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEDEFF3"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDFE3EA"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF888888"/></top><bottom style="double"><color rgb="FF888888"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FFAAB0BA"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="19">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="4" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="4" fillId="5" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="4" fillId="5" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="166" fontId="4" fillId="4" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="6" fillId="4" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="6" fillId="4" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="6" fillId="4" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="166" fontId="6" fillId="4" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
</styleSheet>`;

/* ---------- בניית גיליון ---------- */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const dateSerial = (v) => {
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? Math.round(t / 86400000) + 25569 : null;
};

function cellXml(ref, value, style, fmt) {
  if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`;
  if (fmt === 'date') {
    const serial = dateSerial(value);
    if (serial !== null) return `<c r="${ref}" s="${style}"><v>${serial}</v></c>`;
  }
  if (isNum(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

/**
 * גיליון אחד מבלוקים:
 *  { t:'title'|'sub', text }
 *  { t:'kv', rows:[[label, value, fmt]] }
 *  { t:'table', head:[], rows:[[]], fmt:[], total?:[] }
 *     שורה ב-rows יכולה להיות מערך רגיל, או { cells:[], kind:'subtotal' } לשורת סיכום ביניים
 *  { t:'gap' }
 */
function sheetXml(sheet) {
  const rows = [];
  const widths = [];
  let r = 0;
  let freeze = 0;
  const filters = [];

  const track = (col, value) => {
    const len = String(value ?? '').length;
    widths[col] = Math.max(widths[col] || 8, Math.min(52, len + 4));
  };
  const push = (cells) => { rows.push(`<row r="${++r}" ${cells.h ? `ht="${cells.h}" customHeight="1"` : ''}>${cells.xml}</row>`); };
  const rowXml = (values, styleOf, fmtOf) => {
    let xml = '';
    values.forEach((v, c) => {
      track(c, isNum(v) ? Math.round(v).toLocaleString() : v);
      xml += cellXml(`${colName(c)}${r + 1}`, v, styleOf(c), fmtOf ? fmtOf(c) : 'text');
    });
    return xml;
  };

  for (const b of sheet.blocks || []) {
    if (b.t === 'gap') { push({ xml: '' }); continue; }
    if (b.t === 'title') { push({ xml: rowXml([b.text], () => S.title), h: 22 }); continue; }
    if (b.t === 'sub') { push({ xml: rowXml([b.text], () => S.sub) }); continue; }
    if (b.t === 'kv') {
      for (const [label, value, fmt = 'text'] of b.rows) {
        push({ xml: rowXml([label, value], (c) => (c === 0 ? S.label : FMT_STYLE[fmt] ?? S.base), () => fmt) });
      }
      continue;
    }
    if (b.t === 'table') {
      push({ xml: rowXml(b.head, () => S.head), h: 26 });
      const headRow = r;
      if (!freeze) freeze = headRow;
      const fmtOf = (c) => (b.fmt || [])[c] || 'text';
      for (const line of b.rows) {
        // שורת סיכום ביניים מסומנת ב-kind ומקבלת רקע, הדגשה וקו עליון
        const cells = Array.isArray(line) ? line : line.cells;
        const styleMap = Array.isArray(line) || line.kind !== 'subtotal' ? FMT_STYLE : SUBTOTAL_STYLE;
        const fallback = styleMap === FMT_STYLE ? S.base : S.sub_;
        push({ xml: rowXml(cells, (c) => styleMap[fmtOf(c)] ?? fallback, fmtOf) });
      }
      if (b.total) push({ xml: rowXml(b.total, (c) => TOTAL_STYLE[fmtOf(c)] ?? S.total, fmtOf) });
      if (b.rows.length) filters.push(`${colName(0)}${headRow}:${colName(b.head.length - 1)}${r}`);
    }
  }

  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const pane = freeze
    ? `<pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView rightToLeft="1" workbookViewId="0" ${freeze ? '' : 'tabSelected="1"'}>${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16"/>
${cols}
<sheetData>${rows.join('')}</sheetData>
${filters.length === 1 ? `<autoFilter ref="${filters[0]}"/>` : ''}
<pageSetup orientation="landscape" fitToWidth="1"/>
</worksheet>`;
}

/* ---------- חוברת ---------- */

const safeName = (s, i) => (String(s || `גיליון ${i + 1}`).replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || `גיליון ${i + 1}`);

/** בונה Blob של קובץ xlsx. `sheets`: `[{ name, blocks }]` */
export async function buildWorkbook(sheets) {
  const enc = new TextEncoder();
  const list = (sheets || []).filter(Boolean);
  const names = list.map((s, i) => safeName(s.name, i));

  const files = [
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>` },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { name: 'xl/styles.xml', text: STYLES_XML },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) })),
  ];

  return zip(files.map((f) => ({ name: f.name, bytes: enc.encode(f.text) })));
}

/** בונה ומוריד קובץ אקסל */
export async function downloadWorkbook(fileName, sheets) {
  const blob = await buildWorkbook(sheets);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = /\.xlsx$/i.test(fileName) ? fileName : `${fileName}.xlsx`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
