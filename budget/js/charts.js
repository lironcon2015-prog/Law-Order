// charts.js — גרפי SVG סטטיים (ללא ספריות). מחזירים מחרוזת SVG; טקסט מוברח (escape).

import { fmtMoney, fmtPct, round2 } from './model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TONE = { ok: '#34d399', watch: '#f2ca50', risk: '#fb923c', over: '#f87171' };

/**
 * גרף השוואה אופקי — HTML ולא SVG, כדי ששמות בעברית לא ייחתכו (טקסט SVG ב-RTL
 * גלש מחוץ ל-viewBox והוצגה ממנו אות אחת בלבד) ושיוצגו כמה סדרות זו לצד זו.
 * rows = [{ label, budget, color, series: [{ name, value, status }] }]
 */
export function barCompare(rows) {
  if (!rows.length) return '';
  const max = Math.max(1, ...rows.map((r) => Math.max(r.budget, ...r.series.map((s) => s.value))));
  const body = rows.map((r) => {
    const bars = r.series.map((s) => {
      const pct = Math.max(0, Math.min(100, (s.value / max) * 100));
      const tone = TONE[s.status] || TONE.ok;
      const util = r.budget > 0 ? s.value / r.budget : 0;
      return `<div class="cbar__row" title="${esc(s.name)} · ${esc(fmtMoney(s.value))} (${esc(fmtPct(util))} מהתקציב)">
        <span class="cbar__name">${esc(s.name)}</span>
        <span class="cbar__track"><span class="cbar__fill" style="width:${round2(pct)}%;background:${tone}"></span></span>
        <span class="cbar__val num">${esc(fmtMoney(s.value))}</span>
      </div>`;
    }).join('');
    const bpct = Math.max(0, Math.min(100, (r.budget / max) * 100));
    return `<div class="cbar">
      <div class="cbar__head">
        <span class="cbar__label" style="--bar-color:${r.color || 'var(--gold)'}">${esc(r.label)}</span>
        <span class="cbar__budget num">${r.budget > 0 && r.series[0] ? `ניצול ${esc(fmtPct(r.series[0].value / r.budget))}` : ''}</span>
      </div>
      <div class="cbar__row cbar__row--budget" title="תקציב ${esc(fmtMoney(r.budget))}">
        <span class="cbar__name">תקציב</span>
        <span class="cbar__track"><span class="cbar__fill cbar__fill--budget" style="width:${round2(bpct)}%;border-color:${r.color || 'rgba(242,202,80,.5)'}"></span></span>
        <span class="cbar__val num">${esc(fmtMoney(r.budget))}</span>
      </div>
      ${bars}
    </div>`;
  }).join('');
  return `<div class="cbars">${body}</div>`;
}

/**
 * גרף שריפה מצטברת מול קו התקציב.
 * ציר הזמן משמאל לימין (גם בממשק RTL) — כמו כל ציר זמן; קודם הוא היה הפוך,
 * וקו מצטבר שעולה נראה כאילו הוא יורד.
 * series = [{ label, cumulative }]
 */
export function burnLine(series, budget, { width = 720, height = 220 } = {}) {
  if (!series.length) return '';
  const pad = { t: 22, r: 24, b: 30, l: 70 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = Math.max(budget || 0, ...series.map((s) => s.cumulative)) * 1.1 || 1;
  const x = (i) => pad.l + (series.length === 1 ? w / 2 : (i / (series.length - 1)) * w);
  const y = (v) => pad.t + h - (v / max) * h;

  const path = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${round2(x(i))},${round2(y(s.cumulative))}`).join(' ');
  const area = `${path} L${round2(x(series.length - 1))},${pad.t + h} L${round2(x(0))},${pad.t + h} Z`;
  const budgetY = budget > 0 ? y(budget) : null;
  const step = Math.ceil(series.length / 8);

  const dots = series.map((s, i) => `<circle cx="${round2(x(i))}" cy="${round2(y(s.cumulative))}" r="3.5" fill="#f2ca50"><title>${esc(s.label)} · ${esc(fmtMoney(s.cumulative))}</title></circle>`).join('');
  const labels = series.map((s, i) => (i % step === 0 || i === series.length - 1)
    ? `<text x="${round2(x(i))}" y="${height - 8}" text-anchor="middle" class="ch-axis">${esc(s.label)}</text>` : '').join('');
  const last = series[series.length - 1];

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="שריפת תקציב לאורך זמן" style="direction:ltr">
    <defs><linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(242,202,80,.34)"/><stop offset="100%" stop-color="rgba(242,202,80,0)"/>
    </linearGradient></defs>
    <line x1="${pad.l}" y1="${pad.t + h}" x2="${pad.l + w}" y2="${pad.t + h}" stroke="rgba(255,255,255,.10)"/>
    <text x="${pad.l - 8}" y="${pad.t + h + 4}" text-anchor="end" class="ch-axis">0</text>
    ${budgetY !== null ? `
      <line x1="${pad.l}" y1="${round2(budgetY)}" x2="${pad.l + w}" y2="${round2(budgetY)}" stroke="rgba(248,113,113,.55)" stroke-dasharray="5 5"/>
      <text x="${pad.l - 8}" y="${round2(budgetY) + 4}" text-anchor="end" class="ch-axis">${esc(fmtMoney(budget))}</text>
      <text x="${pad.l + w}" y="${round2(budgetY) - 6}" text-anchor="end" class="ch-axis">תקציב</text>` : ''}
    <path d="${area}" fill="url(#burnGrad)"/>
    <path d="${path}" fill="none" stroke="#f2ca50" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${labels}
    <text x="${round2(x(series.length - 1))}" y="${round2(y(last.cumulative)) - 10}" text-anchor="end" class="ch-num">${esc(fmtMoney(last.cumulative))}</text>
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
