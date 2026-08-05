// charts.js — גרפי SVG סטטיים (ללא ספריות). מחזירים מחרוזת SVG; טקסט מוברח (escape).

import { fmtMoney, fmtPct, round2 } from './model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TONE = { ok: '#34d399', watch: '#f2ca50', risk: '#fb923c', over: '#f87171' };

/**
 * גרף עמודות אופקי: תקציב מול ביצוע לכל שורה.
 * rows = [{ label, budget, actual, status, color }]
 */
export function barCompare(rows, { width = 720, rowH = 46, labelW = 150 } = {}) {
  if (!rows.length) return '';
  const max = Math.max(1, ...rows.map((r) => Math.max(r.budget, r.actual)));
  const h = rows.length * rowH + 16;
  const trackW = width - labelW - 92;
  const parts = [];

  rows.forEach((r, i) => {
    const y = i * rowH + 12;
    // RTL: הסרגל מתחיל מימין (x = width - labelW) וגדל שמאלה
    const x0 = width - labelW;
    const bw = (r.budget / max) * trackW;
    const aw = (r.actual / max) * trackW;
    const tone = TONE[r.status] || TONE.ok;
    parts.push(`
      <text x="${width - 6}" y="${y + 15}" text-anchor="end" class="ch-label">${esc(r.label)}</text>
      <rect x="${x0 - bw}" y="${y + 4}" width="${bw}" height="10" rx="5" fill="rgba(255,255,255,.10)"/>
      <rect x="${x0 - bw}" y="${y + 4}" width="${bw}" height="10" rx="5" fill="none" stroke="${r.color || 'rgba(242,202,80,.45)'}" stroke-width="1"/>
      <rect x="${x0 - aw}" y="${y + 18}" width="${aw}" height="10" rx="5" fill="${tone}" opacity=".9"/>
      <text x="${x0 - Math.max(bw, aw) - 8}" y="${y + 19}" text-anchor="end" class="ch-num">${esc(fmtMoney(r.actual))} / ${esc(fmtMoney(r.budget))}</text>
    `);
  });

  return `<svg class="chart" viewBox="0 0 ${width} ${h}" role="img" aria-label="תקציב מול ביצוע">
    ${parts.join('')}
  </svg>`;
}

/** דונאט של הרכב התקציב. parts = [{ label, value, color }] */
export function donut(parts, { size = 190, thickness = 26, centerTop = '', centerSub = '' } = {}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return '';
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = parts.map((p) => {
    const frac = p.value / total;
    const dash = `${circ * frac} ${circ * (1 - frac)}`;
    const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${thickness}"
      stroke-dasharray="${dash}" stroke-dashoffset="${-circ * offset}" transform="rotate(-90 ${c} ${c})" stroke-linecap="butt"><title>${esc(p.label)} · ${esc(fmtMoney(p.value))} (${esc(fmtPct(frac))})</title></circle>`;
    offset += frac;
    return el;
  });
  return `<svg class="chart chart--donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="הרכב התקציב">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="${thickness}"/>
    ${arcs.join('')}
    <text x="${c}" y="${c - 2}" text-anchor="middle" class="ch-center">${esc(centerTop)}</text>
    <text x="${c}" y="${c + 16}" text-anchor="middle" class="ch-center-sub">${esc(centerSub)}</text>
  </svg>`;
}

/**
 * גרף שריפה מצטברת מול קו התקציב.
 * series = [{ month, cumulative }]
 */
export function burnLine(series, budget, { width = 720, height = 210 } = {}) {
  if (!series.length) return '';
  const pad = { t: 16, r: 18, b: 28, l: 62 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = Math.max(budget || 0, ...series.map((s) => s.cumulative)) * 1.08 || 1;
  // RTL: הזמן מתקדם משמאל לימין הפוך — מימין (התחלה) לשמאל
  const x = (i) => pad.l + w - (series.length === 1 ? w / 2 : (i / (series.length - 1)) * w);
  const y = (v) => pad.t + h - (v / max) * h;

  const path = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${round2(x(i))},${round2(y(s.cumulative))}`).join(' ');
  const area = `${path} L${round2(x(series.length - 1))},${pad.t + h} L${round2(x(0))},${pad.t + h} Z`;
  const budgetY = budget > 0 ? y(budget) : null;

  const dots = series.map((s, i) => `<circle cx="${round2(x(i))}" cy="${round2(y(s.cumulative))}" r="3.5" fill="#f2ca50"><title>${esc(s.month)} · ${esc(fmtMoney(s.cumulative))}</title></circle>`).join('');
  const labels = series.map((s, i) => (series.length <= 8 || i % Math.ceil(series.length / 8) === 0)
    ? `<text x="${round2(x(i))}" y="${height - 8}" text-anchor="middle" class="ch-axis">${esc(s.month.slice(2))}</text>` : '').join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="שריפת תקציב לאורך זמן">
    <defs><linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(242,202,80,.34)"/><stop offset="100%" stop-color="rgba(242,202,80,0)"/>
    </linearGradient></defs>
    <line x1="${pad.l}" y1="${pad.t + h}" x2="${pad.l + w}" y2="${pad.t + h}" stroke="rgba(255,255,255,.10)"/>
    ${budgetY !== null ? `
      <line x1="${pad.l}" y1="${round2(budgetY)}" x2="${pad.l + w}" y2="${round2(budgetY)}" stroke="rgba(248,113,113,.55)" stroke-dasharray="5 5"/>
      <text x="${pad.l - 6}" y="${round2(budgetY) + 4}" text-anchor="end" class="ch-axis">${esc(fmtMoney(budget))}</text>` : ''}
    <path d="${area}" fill="url(#burnGrad)"/>
    <path d="${path}" fill="none" stroke="#f2ca50" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${labels}
  </svg>`;
}

/** מד ניצול חצי-עגול */
export function gauge(util, { size = 168 } = {}) {
  const clamped = Math.max(0, Math.min(1.25, Number.isFinite(util) ? util : 0));
  const r = size / 2 - 14;
  const c = size / 2;
  const circ = Math.PI * r; // חצי מעגל
  const tone = clamped > 1 ? TONE.over : clamped >= 0.9 ? TONE.risk : clamped >= 0.75 ? TONE.watch : TONE.ok;
  const dash = circ * Math.min(clamped, 1.25) / 1.25;
  return `<svg class="chart chart--gauge" viewBox="0 0 ${size} ${size * 0.62}" role="img" aria-label="ניצול תקציב">
    <path d="M ${c - r} ${c} A ${r} ${r} 0 0 1 ${c + r} ${c}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="13" stroke-linecap="round"/>
    <path d="M ${c - r} ${c} A ${r} ${r} 0 0 1 ${c + r} ${c}" fill="none" stroke="${tone}" stroke-width="13" stroke-linecap="round"
      stroke-dasharray="${round2(dash)} ${round2(circ)}"/>
    <text x="${c}" y="${c - 8}" text-anchor="middle" class="ch-center">${esc(fmtPct(util))}</text>
    <text x="${c}" y="${c + 8}" text-anchor="middle" class="ch-center-sub">ניצול תקציב</text>
  </svg>`;
}

/** סרגל התקדמות קומפקטי (לשימוש בכרטיסים/שורות) */
export function miniBar(util, status) {
  const pct = Math.max(0, Math.min(100, (Number.isFinite(util) ? util : 0) * 100));
  const over = util > 1;
  return `<span class="mbar" title="${esc(fmtPct(util))}">
    <span class="mbar__fill" style="width:${round2(Math.min(pct, 100))}%;background:${TONE[status] || TONE.ok}"></span>
    ${over ? `<span class="mbar__over"></span>` : ''}
  </span>`;
}
