// Shared UI building blocks for LexLedger redesign
// Reused across both variations (fintech / legal).

const { useState, useMemo } = React;

// ── Icons (inline SVG, stroke-based, 1.6) ───────────────────
const Ico = {
  dash:   (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l6-5 6 5v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z"/><path d="M6 15V9h4v6"/></svg>,
  users:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.5"/><path d="M2 14c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M11 4.5c1 .3 1.5 1.2 1.5 2s-.5 1.7-1.5 2M14 14c0-1.7-1.1-3.1-2.5-3.6"/></svg>,
  file:   (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-8L9 1.5z"/><path d="M9 1.5v4h4"/></svg>,
  coin:   (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M6 10c0 1 1 1.5 2 1.5s2-.5 2-1.5-1-1.3-2-1.5-2-.5-2-1.5S7 5.5 8 5.5s2 .5 2 1.5M8 4.5V5.5M8 10.5v1"/></svg>,
  upload: (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 11V2M4.5 5.5L8 2l3.5 3.5M2.5 11v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"/></svg>,
  cog:    (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2"/><path d="M13 8a5 5 0 0 0-.1-1.1l1.5-1.1-1.5-2.6-1.7.6a5 5 0 0 0-1.9-1.1L9 1H7l-.3 1.7a5 5 0 0 0-1.9 1.1l-1.7-.6L1.6 5.8l1.5 1.1A5 5 0 0 0 3 8c0 .4 0 .7.1 1.1l-1.5 1.1 1.5 2.6 1.7-.6a5 5 0 0 0 1.9 1.1L7 15h2l.3-1.7a5 5 0 0 0 1.9-1.1l1.7.6 1.5-2.6-1.5-1.1c.1-.4.1-.7.1-1.1z"/></svg>,
  plus:   (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>,
  search: (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></svg>,
  arrowUp:   (p) => <svg {...p} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 8V2M2.5 4.5L5 2l2.5 2.5"/></svg>,
  arrowDown: (p) => <svg {...p} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 2v6M2.5 5.5L5 8l2.5-2.5"/></svg>,
  more:   (p) => <svg {...p} viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></svg>,
  chev:   (p) => <svg {...p} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 3.5L5 6.5 8 3.5"/></svg>,
  chevL:  (p) => <svg {...p} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6.5 2L3.5 5l3 3"/></svg>,
  download: (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M2.5 14h11"/></svg>,
  filter:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 3h13L10 8.5v5l-4-2v-3L1.5 3z"/></svg>,
  bell:   (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5a4 4 0 0 0-4 4v3L2.5 11h11L12 8.5v-3a4 4 0 0 0-4-4zM6 13.5a2 2 0 0 0 4 0"/></svg>,
  dots:   (p) => <svg {...p} viewBox="0 0 4 16" fill="currentColor"><circle cx="2" cy="3" r="1.3"/><circle cx="2" cy="8" r="1.3"/><circle cx="2" cy="13" r="1.3"/></svg>,
  merge:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v4c0 3 5 3 5 6v2M13 2v4c0 3-5 3-5 6"/></svg>,
  excel:  (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M2 6.5h12M2 10h12M6 6.5v7M10 6.5v7"/></svg>,
  pdf:    (p) => <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-8L9 1.5z"/><path d="M9 1.5v4h4"/><text x="8" y="12.5" fontSize="3.5" textAnchor="middle" fontWeight="700" fill="currentColor" stroke="none">PDF</text></svg>,
};

// ── Sidebar ─────────────────────────────────────────────────
function Sidebar({ accent, brandName = 'LexLedger', active = 'dashboard', items }) {
  const defaultItems = items || [
    { key: 'dashboard', label: 'דאשבורד',        ico: 'dash'   },
    { key: 'clients',   label: 'לקוחות ותיקים',  ico: 'users',  count: 23 },
    { key: 'invoices',  label: 'חשבוניות',       ico: 'file',   count: 147 },
    { key: 'payments',  label: 'תשלומים',        ico: 'coin'    },
    { key: 'import',    label: 'ייבוא נתונים',   ico: 'upload'  },
    { key: 'settings',  label: 'הגדרות',         ico: 'cog'     },
  ];
  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-logo">LL</div>
        <div className="sb-brand-text">
          <span className="sb-brand-name">{brandName}</span>
          <span className="sb-brand-sub">ניהול שכר טרחה</span>
        </div>
      </div>
      <div className="search" style={{minWidth:0}}>
        <Ico.search className="ico" />
        <input placeholder="חיפוש מהיר…" />
        <span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-num)'}}>⌘K</span>
      </div>
      <div className="sb-section-label">ניווט</div>
      {defaultItems.map((it) => {
        const Icon = Ico[it.ico];
        return (
          <div key={it.key} className={'sb-item' + (active === it.key ? ' active' : '')}>
            <Icon className="ico" />
            <span>{it.label}</span>
            {it.count != null && <span className="count">{it.count}</span>}
          </div>
        );
      })}
      <div className="sb-footer">
        <div className="sb-user">
          <div className="sb-avatar">ע"ד</div>
          <div style={{display:'flex',flexDirection:'column',minWidth:0}}>
            <span style={{fontSize:12.5,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>עו"ד דניאל כהן</span>
            <span style={{fontSize:11,color:'var(--text-muted)'}}>המשרד · פרימיום</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── KPI variants ────────────────────────────────────────────
function KPI({ label, value, unit = '₪', trend, hero = false, spark }) {
  return (
    <div className={'kpi' + (hero ? ' hero' : '')}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-val">
        <span className="unit">{unit}</span>
        {typeof value === 'number' ? fmtNum(value) : value}
      </span>
      {trend && (
        <div className="kpi-meta">
          <span className={'trend ' + trend.dir}>
            {trend.dir === 'up' ? <Ico.arrowUp className="arrow" /> : <Ico.arrowDown className="arrow" />}
            {trend.pct}
          </span>
          <span>{trend.note}</span>
        </div>
      )}
      {spark && <Sparkline data={spark} className="kpi-spark" />}
    </div>
  );
}

// ── Sparkline ───────────────────────────────────────────────
function Sparkline({ data, className, stroke = 'currentColor', fill = true, height = 28, width = 120 }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / (max - min || 1)) * (height - 2) - 1;
    return `${x},${y}`;
  });
  const path = 'M' + pts.join(' L');
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{width:'100%',height:height}}>
      {fill && <path d={area} fill={stroke} opacity="0.18" />}
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Bar chart (monthly revenue / commissions / payments) ───
function BarChart({ data, height = 180 }) {
  const max = Math.max(...data.flatMap((d) => [d.rev, d.com, d.pay])) * 1.1;
  return (
    <div style={{display:'flex',alignItems:'flex-end',gap:10,height,paddingTop:8,paddingBottom:20,position:'relative'}}>
      {/* grid lines */}
      <div style={{position:'absolute',inset:'8px 0 20px 0',display:'flex',flexDirection:'column',justifyContent:'space-between',pointerEvents:'none'}}>
        {[0,1,2,3].map((i) => <div key={i} style={{borderTop:'1px dashed var(--border)',height:0}}/>)}
      </div>
      {data.map((d, i) => (
        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,height:'100%',justifyContent:'flex-end',position:'relative',zIndex:1}}>
          <div style={{display:'flex',alignItems:'flex-end',gap:2,width:'100%',justifyContent:'center',flex:1}}>
            <div title={`הכנסות ${fmtNum(d.rev)}`} style={{width:'30%',height:`${(d.rev/max)*100}%`,background:'var(--accent)',borderRadius:'3px 3px 0 0',opacity:0.95,minHeight:2}}/>
            <div title={`עמלות ${fmtNum(d.com)}`} style={{width:'30%',height:`${(d.com/max)*100}%`,background:'color-mix(in oklch, var(--accent) 45%, var(--bg-sub))',borderRadius:'3px 3px 0 0',minHeight:2}}/>
            <div title={`תשלומים ${fmtNum(d.pay)}`} style={{width:'30%',height:`${(d.pay/max)*100}%`,background:'var(--pos)',borderRadius:'3px 3px 0 0',opacity:0.7,minHeight:2}}/>
          </div>
          <span style={{fontSize:10.5,color:'var(--text-muted)',fontWeight:500}}>{d.m.slice(0,3)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Area/line chart (cumulative) ───────────────────────────
function AreaChart({ series, height = 180 }) {
  const width = 620;
  const max = Math.max(...series.flatMap((s) => s.data)) * 1.05;
  const min = 0;
  const toPath = (data) => {
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / (max - min || 1)) * (height - 10) - 5;
      return [x, y];
    });
    return {
      line: 'M' + pts.map((p) => p.join(',')).join(' L'),
      area: 'M' + pts.map((p) => p.join(',')).join(' L') + ` L${width},${height} L0,${height} Z`,
    };
  };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{width:'100%',height}}>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`lg${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={s.color} stopOpacity="0"/>
          </linearGradient>
        ))}
      </defs>
      {[0.25,0.5,0.75].map((p) => (
        <line key={p} x1="0" x2={width} y1={height*p} y2={height*p} stroke="var(--border)" strokeDasharray="2 4" />
      ))}
      {series.map((s, i) => {
        const { line, area } = toPath(s.data);
        return (
          <g key={i}>
            <path d={area} fill={`url(#lg${i})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}

// ── Donut ──────────────────────────────────────────────────
function Donut({ segments, size = 140, thickness = 20 }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--bg-sub)" strokeWidth={thickness} fill="none" />
      {segments.map((s, i) => {
        const len = (s.value / total) * c;
        const dash = `${len} ${c - len}`;
        const dashoffset = c - offset;
        offset += len;
        return (
          <circle key={i} cx={size/2} cy={size/2} r={r}
            stroke={s.color} strokeWidth={thickness} fill="none"
            strokeDasharray={dash} strokeDashoffset={dashoffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${size/2} ${size/2})`} />
        );
      })}
    </svg>
  );
}

// ── Status badge ────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    ongoing:    { cls: 'badge-ongoing',    label: 'פעיל' },
    litigation: { cls: 'badge-litigation', label: 'ליטיגציה' },
    deal:       { cls: 'badge-deal',       label: 'סגור' },
    pdf:        { cls: 'badge-pdf',        label: 'PDF' },
    manual:     { cls: 'badge-manual',     label: 'ידני' },
    import:     { cls: 'badge-import',     label: 'ייבוא' },
  };
  const x = map[status] || { cls: 'badge', label: status };
  return <span className={'badge ' + x.cls}><span className="dot"/>{x.label}</span>;
}

Object.assign(window, { Sidebar, KPI, Sparkline, BarChart, AreaChart, Donut, StatusBadge, Ico });
