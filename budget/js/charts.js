// charts.js — גרף שריפה מצטברת (SVG סטטי, ללא ספריות). מחזיר מחרוזת SVG; טקסט מוברח (escape).
// הצבעים מגיעים ממחלקות CSS (‎.ch-*) ולכן הגרף מתחלף יחד עם ערכת הנושא, ומספרים מעוצבים
// בפונקציה שמקבלים מבחוץ — כך אותו גרף משמש גם לשעות וגם ל-₪.

import { round2 } from './model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** צעד "עגול" לקווי הרשת: 1 / 2 / 2.5 / 5 × חזקת 10 */
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/**
 * שריפה מצטברת מול קו התקציב.
 * ציר הזמן משמאל לימין (גם בממשק RTL) — כמו כל ציר זמן; קו מצטבר שעולה צריך להיראות עולה.
 * series = [{ label, cumulative, title? }] · fmt = עיצוב ערך מלא · axisFmt = עיצוב קצר לציר
 */
export function burnLine(series, budget, { fmt = String, axisFmt = fmt, width = 760, height = 250 } = {}) {
  if (!series.length) return '';
  const pad = { t: 26, r: 30, b: 34, l: 64 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const top = Math.max(budget || 0, ...series.map((s) => s.cumulative)) * 1.06 || 1;
  const step = niceStep(top / 4);
  const max = Math.ceil(top / step) * step;
  const x = (i) => pad.l + (series.length === 1 ? w / 2 : (i / (series.length - 1)) * w);
  const y = (v) => pad.t + h - (v / max) * h;

  const grid = [];
  for (let v = step; v <= max + 1e-9; v += step) {
    grid.push(`<line class="ch-grid" x1="${pad.l}" y1="${round2(y(v))}" x2="${pad.l + w}" y2="${round2(y(v))}"/>`
      + `<text class="ch-axis" x="${pad.l - 10}" y="${round2(y(v)) + 4}" text-anchor="end">${esc(axisFmt(v))}</text>`);
  }

  const path = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${round2(x(i))},${round2(y(s.cumulative))}`).join(' ');
  const area = `${path} L${round2(x(series.length - 1))},${pad.t + h} L${round2(x(0))},${pad.t + h} Z`;
  const every = Math.ceil(series.length / 8);
  const xLabels = series.map((s, i) => (i % every === 0 || i === series.length - 1)
    ? `<text class="ch-axis" x="${round2(x(i))}" y="${height - 10}" text-anchor="middle">${esc(s.label)}</text>` : '').join('');
  const dots = series.length <= 40
    ? series.map((s, i) => `<circle class="ch-dot" cx="${round2(x(i))}" cy="${round2(y(s.cumulative))}" r="3.2"><title>${esc(s.title || s.label)} · ${esc(fmt(s.cumulative))}</title></circle>`).join('')
    : '';
  const last = series[series.length - 1];
  const budgetY = budget > 0 ? round2(y(budget)) : null;

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="שריפה מצטברת מול התקציב" style="direction:ltr">
    <defs><linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" class="ch-stop-a"/><stop offset="100%" class="ch-stop-b"/></linearGradient></defs>
    ${grid.join('')}
    <line class="ch-base" x1="${pad.l}" y1="${pad.t + h}" x2="${pad.l + w}" y2="${pad.t + h}"/>
    <text class="ch-axis" x="${pad.l - 10}" y="${pad.t + h + 4}" text-anchor="end">0</text>
    ${budgetY !== null ? `<line class="ch-budget" x1="${pad.l}" y1="${budgetY}" x2="${pad.l + w}" y2="${budgetY}"/>
      <text class="ch-label" x="${pad.l + w}" y="${budgetY - 7}" text-anchor="end">תקציב ${esc(fmt(budget))}</text>` : ''}
    <path class="ch-area" d="${area}"/>
    <path class="ch-line" d="${path}"/>
    ${dots}${xLabels}
    <text class="ch-num" x="${round2(x(series.length - 1))}" y="${round2(y(last.cumulative)) - 11}" text-anchor="${series.length > 1 ? 'end' : 'middle'}">${esc(fmt(last.cumulative))}</text>
  </svg>`;
}

/**
 * קו מגמה קטן (sparkline) — מצטבר לאורך זמן, משמאל לימין. בלי צירים: הוא מראה צורה וקצב,
 * והמספרים עצמם נמצאים לידו. budget (אופציונלי) מסומן כקו אופקי עדין.
 */
export function sparkline(values, { width = 120, height = 34, budget = 0, cls = '', fill = true, dot = true } = {}) {
  if (!values.length) return '';
  const pad = 3;
  const max = Math.max(budget || 0, ...values) || 1;
  const x = (i) => pad + (values.length === 1 ? (width - 2 * pad) / 2 : (i / (values.length - 1)) * (width - 2 * pad));
  const y = (v) => height - pad - (v / max) * (height - 2 * pad);
  const pts = values.map((v, i) => `${round2(x(i))},${round2(y(v))}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${round2(x(values.length - 1))},${height - pad} L${round2(x(0))},${height - pad} Z`;
  const last = values[values.length - 1];
  return `<svg class="spark ${cls}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" style="direction:ltr">
    ${budget > 0 ? `<line class="spark__budget" x1="${pad}" x2="${width - pad}" y1="${round2(y(budget))}" y2="${round2(y(budget))}"/>` : ''}
    ${fill ? `<path class="spark__area" d="${area}"/>` : ''}
    <path class="spark__line" d="${line}" vector-effect="non-scaling-stroke"/>
    ${dot ? `<circle class="spark__dot" cx="${round2(x(values.length - 1))}" cy="${round2(y(last))}" r="2.6"/>` : ''}
  </svg>`;
}
