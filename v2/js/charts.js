// charts.js — גרפי SVG קלים משלנו (fintech, Obsidian Gold). ללא תלות חיצונית.

const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) { if (v != null) node.setAttribute(k, v); }
  for (const c of [].concat(children)) { if (c) node.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return node;
}
function div(cls, children = []) {
  const n = document.createElement('div');
  if (cls) n.className = cls;
  for (const c of [].concat(children)) { if (c) n.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return n;
}
const fmtK = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return Math.round(v / 1e3) + 'K';
  return String(Math.round(v));
};

/* ============================================================ BarChart (grouped) ============================================================
 * series: [{ name, color, values: number[] }]  · labels: string[] (אורך זהה) */
export function barChart({ labels, series, height = 230 }) {
  const W = 760, H = height, padX = 26, padTop = 16, padBot = 30;
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const plotW = W - padX * 2, plotH = H - padTop - padBot;
  const band = plotW / n;
  const groupW = band * 0.62;
  const barW = groupW / series.length;
  const y = (v) => padTop + plotH - (v / max) * plotH;

  const gEls = [];
  // gridlines (4)
  for (let i = 0; i <= 4; i++) {
    const gy = padTop + (plotH / 4) * i;
    gEls.push(svg('line', { x1: padX, x2: W - padX, y1: gy, y2: gy, stroke: 'rgba(255,255,255,0.06)', 'stroke-width': 1 }));
    gEls.push(svg('text', { x: W - padX + 2, y: gy + 3, 'text-anchor': 'start', class: 'chart-axis' }, [fmtK(max - (max / 4) * i)]));
  }
  // bars
  labels.forEach((lab, i) => {
    const cx = padX + band * i + (band - groupW) / 2;
    series.forEach((s, si) => {
      const v = s.values[i] || 0;
      const bx = cx + barW * si;
      const by = y(v), bh = padTop + plotH - by;
      const bar = svg('rect', { x: bx, y: by, width: Math.max(2, barW - 3), height: Math.max(0, bh), rx: 3, fill: s.color, opacity: v ? 0.92 : 0.15 });
      bar.append(svg('title', {}, [`${s.name} · ${lab}: ${Math.round(v).toLocaleString('he-IL')}`]));
      gEls.push(bar);
    });
    gEls.push(svg('text', { x: padX + band * i + band / 2, y: H - 10, 'text-anchor': 'middle', class: 'chart-axis chart-axis--lab' }, [lab]));
  });

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', preserveAspectRatio: 'none', role: 'img' }, gEls);
  const legend = div('chart-legend', series.map((s) => div('chart-legend__item', [
    svg('svg', { viewBox: '0 0 10 10', class: 'chart-dot' }, [svg('rect', { x: 0, y: 0, width: 10, height: 10, rx: 3, fill: s.color })]),
    div('', [s.name]),
  ])));
  return div('chart', [legend, chart]);
}

/* ============================================================ Donut ============================================================
 * segments: [{ label, value, color }] · centerLabel/centerValue (אופציונלי) */
export function donut({ segments, centerLabel = '', centerValue = '', size = 200 }) {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0);
  const r = 70, c = 2 * Math.PI * r, cx = 100, cy = 100, stroke = 22;
  const ring = [svg('circle', { cx, cy, r, fill: 'none', stroke: 'rgba(255,255,255,0.06)', 'stroke-width': stroke })];
  let offset = 0;
  if (total > 0) {
    segments.forEach((seg) => {
      const frac = (seg.value || 0) / total;
      if (frac <= 0) return;
      const len = frac * c;
      const arc = svg('circle', {
        cx, cy, r, fill: 'none', stroke: seg.color, 'stroke-width': stroke,
        'stroke-dasharray': `${len} ${c - len}`, 'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${cx} ${cy})`, 'stroke-linecap': 'butt',
      });
      arc.append(svg('title', {}, [`${seg.label}: ${Math.round(seg.value).toLocaleString('he-IL')}`]));
      ring.push(arc);
      offset += len;
    });
  }
  ring.push(svg('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', class: 'donut-center-val' }, [centerValue]));
  ring.push(svg('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', class: 'donut-center-lab' }, [centerLabel]));
  const chart = svg('svg', { viewBox: '0 0 200 200', class: 'donut-svg', width: size, height: size, role: 'img' }, ring);
  const legend = div('chart-legend chart-legend--col', segments.filter((s) => s.value > 0).map((s) => div('chart-legend__item', [
    svg('svg', { viewBox: '0 0 10 10', class: 'chart-dot' }, [svg('circle', { cx: 5, cy: 5, r: 5, fill: s.color })]),
    div('chart-legend__txt', [s.label]),
    div('chart-legend__val num', [total ? Math.round((s.value / total) * 100) + '%' : '0%']),
  ])));
  return div('donut', [chart, legend]);
}

/* ============================================================ תזרים חודשי (דשבורד) ============================================================
 * גרף שממלא את המכל שלו: נמדד מחדש בכל שינוי גודל (ResizeObserver), כך שהטקסט נשאר בגודל אמיתי
 * ולא נמתח. ציר הזמן משמאל לימין (כמו כל ציר זמן), סכומים ב-₪, החודש הנוכחי מודגש, ריחוף לכל חודש.
 * series: [{ name, color, values[12] }] · mode: 'monthly' (עמודות) | 'cum' (קווים מצטברים) · current: אינדקס חודש או -1 */
export function flowChart({ labels, series, mode = 'monthly', current = -1, fmt = (v) => String(v) }) {
  const host = div('flow-box');
  const tip = div('flow-tip');
  host.append(tip);
  const data = series.map((s) => ({
    ...s,
    vals: mode === 'cum' ? s.values.reduce((a, v, i) => [...a, (a[i - 1] || 0) + (v || 0)], []) : s.values.map((v) => v || 0),
  }));
  // במצטבר — עד החודש האחרון שיש בו נתון (אחרת הקו נמשך ישר לסוף השנה)
  const lastIdx = Math.max(-1, ...series.map((s) => s.values.reduce((m, v, i) => (v ? i : m), -1)));

  const draw = () => {
    host.querySelector('svg')?.remove();
    const W = host.clientWidth, H = host.clientHeight;
    if (!W || !H) return;
    const pad = { t: 10, r: 54, b: 30, l: 4 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const raw = Math.max(1, ...data.flatMap((s) => s.vals));
    const pow = 10 ** Math.floor(Math.log10(raw));
    // צעד עגול שנותן 3–5 קווי רשת
    const stepV = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].map((m) => m * pow).find((st) => raw / st <= 5) || pow * 10;
    const max = Math.ceil(raw / stepV) * stepV;
    const band = pw / labels.length;
    const xC = (i) => pad.l + band * i + band / 2;
    const y = (v) => pad.t + ph - (v / max) * ph;
    const g = [];
    for (let v = 0; v <= max + 1e-9; v += stepV) {
      g.push(svg('line', { x1: pad.l, x2: pad.l + pw, y1: y(v), y2: y(v), stroke: 'rgba(255,255,255,0.06)' }));
      g.push(svg('text', { x: pad.l + pw + 8, y: y(v) + 4, class: 'flow-axis' }, [`₪${fmtK(v)}`]));
    }
    if (current >= 0) g.push(svg('rect', { x: pad.l + band * current, y: pad.t, width: band, height: ph, rx: 6, fill: 'rgba(242,202,80,0.05)' }));
    if (mode === 'cum') {
      const upto = Math.max(0, lastIdx);
      data.forEach((s) => {
        const d = s.vals.slice(0, upto + 1).map((v, i) => `${i ? 'L' : 'M'}${xC(i)},${y(v)}`).join(' ');
        g.push(svg('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }));
        s.vals.slice(0, upto + 1).forEach((v, i) => g.push(svg('circle', { cx: xC(i), cy: y(v), r: 3.5, fill: s.color })));
      });
    } else {
      const bw = Math.max(3, Math.min(18, (band * 0.62) / data.length - 3));
      labels.forEach((_, i) => {
        const x0 = xC(i) - (bw * data.length + 3 * (data.length - 1)) / 2;
        data.forEach((s, si) => {
          const v = s.vals[i];
          if (!v) return;
          g.push(svg('rect', { x: x0 + si * (bw + 3), y: y(v), width: bw, height: pad.t + ph - y(v), rx: 4, fill: s.color }));
        });
      });
    }
    labels.forEach((lab, i) => g.push(svg('text', {
      x: xC(i), y: H - 8, 'text-anchor': 'middle', class: `flow-axis flow-axis--m${i === current ? ' is-now' : ''}`,
    }, [lab])));
    const hit = svg('rect', { x: pad.l, y: pad.t, width: pw, height: ph, fill: 'transparent' });
    g.push(hit);
    host.prepend(svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'flow-svg', role: 'img', 'aria-label': 'תזרים חודשי' }, g));
    hit.addEventListener('mousemove', (e) => {
      const r = host.getBoundingClientRect();
      const i = Math.max(0, Math.min(labels.length - 1, Math.floor((e.clientX - r.left - pad.l) / band)));
      tip.replaceChildren(div('flow-tip__h', [labels[i]]), ...data.map((s) => div('flow-tip__r', [s.name, ' ', fmt(s.vals[i])])));
      tip.style.opacity = '1';
      tip.style.left = `${Math.max(0, Math.min(W - tip.offsetWidth, xC(i) - tip.offsetWidth / 2))}px`;
      tip.style.top = `${Math.max(0, y(Math.max(...data.map((s) => s.vals[i]))) - tip.offsetHeight - 10)}px`;
    });
    hit.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
  };
  new ResizeObserver(draw).observe(host);
  return host;
}
