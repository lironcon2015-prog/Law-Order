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
