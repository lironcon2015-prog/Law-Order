// LexLedger — dashboard screen (shared across both variations)

function MonthlyTable({ data }) {
  const totals = data.reduce((a, d) => ({ rev: a.rev + d.rev, com: a.com + d.com, pay: a.pay + d.pay }), { rev: 0, com: 0, pay: 0 });
  let running = 4119.38;
  const rows = data.map((d) => {
    running += d.com - d.pay;
    return { ...d, bal: running };
  });
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th style={{width:'22%'}}>חודש</th>
          <th className="num">הכנסות</th>
          <th className="num">עמלה</th>
          <th className="num">תשלומים</th>
          <th className="num">יתרה מצטברת</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.m}</td>
            <td className="num">{fmtNum(r.rev)}</td>
            <td className="num">{fmtNum(r.com)}</td>
            <td className="num">{r.pay ? fmtNum(r.pay) : '—'}</td>
            <td className="num" style={{color: r.bal >= 0 ? 'var(--text)' : 'var(--neg)'}}>{fmtNum2(r.bal)}</td>
          </tr>
        ))}
        <tr className="tr-total">
          <td>סה״כ {window.LEX_DATA.year}</td>
          <td className="num">{fmtNum(totals.rev)}</td>
          <td className="num">{fmtNum(totals.com)}</td>
          <td className="num">{fmtNum(totals.pay)}</td>
          <td className="num">{fmtNum2(running)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ClientBreakdownTable({ data }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>לקוח</th>
          <th>תיק</th>
          <th>סטטוס</th>
          <th className="num">% עמלה</th>
          <th className="num">הכנסות</th>
          <th className="num">עמלות</th>
          <th style={{width:40}}/>
        </tr>
      </thead>
      <tbody>
        {data.map((c, i) => (
          <tr key={i}>
            <td>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:28,height:28,borderRadius:7,background:'var(--bg-sub)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--text-sub)',border:'1px solid var(--border)'}}>
                  {c.name[0]}
                </div>
                <span style={{fontWeight:500}}>{c.name}</span>
              </div>
            </td>
            <td style={{color:'var(--text-sub)',fontSize:12.5}}>{c.case}</td>
            <td><StatusBadge status={c.status} /></td>
            <td className="num">{c.rate}%</td>
            <td className="num">{fmtNum(c.rev)}</td>
            <td className="num" style={{fontWeight:600}}>{fmtNum(c.com)}</td>
            <td><button className="btn btn-ghost btn-sm" style={{padding:'4px 6px'}}><Ico.dots style={{width:12,height:12}}/></button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DashboardView({ theme, kpiStyle = 'hero' }) {
  const { kpis, monthly, clients, year } = window.LEX_DATA;
  const sparks = useMemo(() => ({
    rev:  monthly.map((m) => m.rev),
    com:  monthly.map((m) => m.com),
    pay:  monthly.map((m) => m.pay),
    bal:  monthly.reduce((a, m, i) => [...a, (a[i-1] || 4119) + m.com - m.pay], []),
  }), [monthly]);

  return (
    <div className="main">
      {/* Header */}
      <div className="view-h">
        <div>
          <div className="crumbs">
            <span>סקירה</span><span className="sep">/</span><span style={{color:'var(--text)'}}>דאשבורד</span>
          </div>
          <h1>דאשבורד</h1>
          <p>סיכום שנתי וחודשי · {year}</p>
        </div>
        <div className="view-actions">
          <div className="seg">
            <button>חודשי</button>
            <button className="on">שנתי</button>
            <button>רבעוני</button>
          </div>
          <select className="select" defaultValue={year}>
            <option>2026</option><option>2025</option><option>2024</option>
          </select>
          <button className="btn btn-sm"><Ico.download className="ico"/>ייצוא</button>
        </div>
      </div>

      {/* KPI row */}
      {kpiStyle === 'hero' ? (
        <div className="kpi-grid hero">
          <div className="kpi hero">
            <span className="kpi-label">יתרה לתשלום · {year}</span>
            <span className="kpi-val"><span className="unit">₪</span>{fmtNum2(kpis.balance)}</span>
            <div className="kpi-meta">
              <span>המשרד חייב לך עבור חשבוניות שטרם שולמו</span>
            </div>
            <Sparkline data={sparks.bal} height={36} className="kpi-spark" stroke="currentColor" />
          </div>
          <KPI label="יתרת פתיחה" value={fmtNum2(kpis.opening)} trend={null} spark={null}/>
          <KPI label="הכנסה כוללת" value={kpis.revenue} trend={{dir:'up',pct:'12.4%',note:'vs 2025'}} spark={sparks.rev}/>
          <KPI label="עמלות שנצברו" value={kpis.commissions} trend={{dir:'up',pct:'8.1%',note:'vs 2025'}} spark={sparks.com}/>
          <KPI label="תשלומים התקבלו" value={kpis.payments} trend={{dir:'down',pct:'3.2%',note:'vs 2025'}} spark={sparks.pay}/>
        </div>
      ) : (
        <div className="kpi-grid">
          <KPI label="יתרת פתיחה" value={fmtNum2(kpis.opening)} />
          <KPI label="הכנסה כוללת" value={kpis.revenue} trend={{dir:'up',pct:'12.4%',note:'vs 2025'}} spark={sparks.rev}/>
          <KPI label="עמלות שנצברו" value={kpis.commissions} trend={{dir:'up',pct:'8.1%'}} spark={sparks.com}/>
          <KPI label="תשלומים" value={kpis.payments} trend={{dir:'down',pct:'3.2%'}} spark={sparks.pay}/>
        </div>
      )}

      {/* Chart row */}
      <div className="row" style={{marginTop:20}}>
        <div className="panel grow">
          <div className="panel-h">
            <div>
              <div className="panel-title">תזרים חודשי</div>
              <div className="panel-sub">הכנסות, עמלות ותשלומים לאורך {year}</div>
            </div>
            <div style={{display:'flex',gap:14,alignItems:'center',fontSize:12}}>
              <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:10,height:10,borderRadius:3,background:'var(--accent)'}}/>הכנסות</span>
              <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:10,height:10,borderRadius:3,background:'color-mix(in oklch, var(--accent) 45%, var(--bg-sub))'}}/>עמלות</span>
              <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:10,height:10,borderRadius:3,background:'var(--pos)',opacity:0.7}}/>תשלומים</span>
            </div>
          </div>
          <div className="chart-wrap"><BarChart data={monthly} height={220}/></div>
        </div>

        <div className="panel" style={{width:320,flexShrink:0}}>
          <div className="panel-h">
            <div>
              <div className="panel-title">פילוח לקוחות</div>
              <div className="panel-sub">לפי הכנסות {year}</div>
            </div>
          </div>
          <div style={{padding:'16px 18px',display:'flex',gap:18,alignItems:'center'}}>
            <Donut size={130} thickness={18} segments={clients.map((c, i) => ({
              value: c.rev,
              color: ['var(--accent)', 'color-mix(in oklch, var(--accent) 60%, var(--bg-sub))', 'var(--pos)', 'var(--warn)', 'color-mix(in oklch, var(--accent) 30%, var(--bg-sub))', 'var(--text-sub)'][i % 6],
            }))}/>
            <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:12,flex:1,minWidth:0}}>
              {clients.slice(0, 5).map((c, i) => (
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                  <span style={{width:8,height:8,borderRadius:2,background:['var(--accent)', 'color-mix(in oklch, var(--accent) 60%, var(--bg-sub))', 'var(--pos)', 'var(--warn)', 'color-mix(in oklch, var(--accent) 30%, var(--bg-sub))'][i],flexShrink:0}}/>
                  <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',flex:1,color:'var(--text-sub)'}}>{c.name}</span>
                  <span className="mono" style={{fontWeight:500}}>{fmtNum(c.rev)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly breakdown */}
      <div className="panel" style={{marginTop:20}}>
        <div className="panel-h">
          <div>
            <div className="panel-title">פירוט חודשי</div>
            <div className="panel-sub">הכנסות, עמלות, תשלומים ויתרה מצטברת</div>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button className="btn btn-sm btn-ghost"><Ico.filter className="ico"/>סנן</button>
            <button className="btn btn-sm"><Ico.download className="ico"/>CSV</button>
          </div>
        </div>
        <MonthlyTable data={monthly}/>
      </div>

      {/* Client breakdown */}
      <div className="panel" style={{marginTop:20}}>
        <div className="panel-h">
          <div>
            <div className="panel-title">פירוט לפי לקוח</div>
            <div className="panel-sub">{clients.length} לקוחות פעילים</div>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <div className="search" style={{minWidth:180}}>
              <Ico.search className="ico"/>
              <input placeholder="חפש לקוח…"/>
            </div>
            <button className="btn btn-sm btn-ghost"><Ico.filter className="ico"/>סטטוס</button>
          </div>
        </div>
        <ClientBreakdownTable data={clients}/>
      </div>
    </div>
  );
}

function ClientsView() {
  const { clients } = window.LEX_DATA;
  return (
    <div className="main">
      <div className="view-h">
        <div>
          <h1>לקוחות ותיקים</h1>
          <p>ניהול לקוחות ותיקים משויכים · {clients.length} לקוחות · 9 תיקים פעילים</p>
        </div>
        <div className="view-actions">
          <button className="btn btn-sm"><Ico.merge className="ico"/>מזג לקוחות</button>
          <button className="btn btn-primary btn-sm"><Ico.plus className="ico"/>לקוח חדש</button>
        </div>
      </div>

      <div style={{display:'flex',gap:12,marginBottom:16}}>
        <div className="search grow"><Ico.search className="ico"/><input placeholder="חיפוש לפי שם / מספר תיק…"/></div>
        <div className="seg">
          <button className="on">הכל</button>
          <button>פעילים</button>
          <button>ליטיגציה</button>
          <button>ארכיון</button>
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {clients.map((c, i) => (
          <div key={i} className="panel">
            <div style={{padding:'14px 18px',display:'flex',alignItems:'center',gap:16}}>
              <div style={{width:40,height:40,borderRadius:10,background:'var(--accent-soft)',color:'var(--accent-text)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:14,border:'1px solid var(--accent-border)'}}>
                {c.name[0]}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:14,marginBottom:2}}>{c.name}</div>
                <div style={{fontSize:12,color:'var(--text-muted)',display:'flex',gap:10,alignItems:'center'}}>
                  <span>{c.case}</span>
                  <span>·</span>
                  <StatusBadge status={c.status}/>
                  <span>·</span>
                  <span>עמלה {c.rate}%</span>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:0,borderRight:'1px solid var(--border)'}}>
                <div className="stat-inline"><span className="l">הכנסות</span><span className="v">₪{fmtNum(c.rev)}</span></div>
                <div className="stat-inline"><span className="l">עמלות</span><span className="v" style={{color:'var(--accent-text)'}}>₪{fmtNum(c.com)}</span></div>
                <div className="stat-inline"><span className="l">חשבוניות</span><span className="v">{Math.floor(c.rev/6000)+3}</span></div>
              </div>
              <button className="btn btn-sm btn-ghost"><Ico.chev className="ico" style={{transform:'rotate(90deg)'}}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvoicesView() {
  const { invoices, year } = window.LEX_DATA;
  return (
    <div className="main">
      <div className="view-h">
        <div>
          <h1>חשבוניות</h1>
          <p>הזנה ידנית, קריאת PDF וצפייה בהיסטוריה</p>
        </div>
        <div className="view-actions">
          <select className="select" defaultValue={year}><option>2026</option><option>2025</option></select>
          <select className="select"><option>כל הלקוחות</option></select>
          <button className="btn btn-primary btn-sm"><Ico.plus className="ico"/>חשבונית ידנית</button>
        </div>
      </div>

      <div className="dropzone" style={{marginBottom:20}}>
        <div className="dz-ico"><Ico.upload style={{width:20,height:20}}/></div>
        <div className="dropzone-title">גרור PDF לכאן לחילוץ אוטומטי</div>
        <div className="dropzone-sub">או <span style={{color:'var(--accent-text)',textDecoration:'underline',cursor:'pointer'}}>לחץ לבחירת קובץ</span> · המערכת תזהה לקוח, סכום ותאריך</div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <div>
            <div className="panel-title">היסטוריית חשבוניות</div>
            <div className="panel-sub">{invoices.length} רשומות · סה״כ {fmtNum(invoices.reduce((s,i)=>s+i.amount,0))} ₪</div>
          </div>
          <div style={{display:'flex',gap:6}}>
            <div className="search" style={{minWidth:180}}><Ico.search className="ico"/><input placeholder="חפש…"/></div>
            <button className="btn btn-sm"><Ico.download className="ico"/>CSV</button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>לקוח</th>
              <th>תיק</th>
              <th>חודש</th>
              <th className="num">סכום</th>
              <th className="num">% עמלה</th>
              <th className="num">עמלה</th>
              <th>מקור</th>
              <th style={{width:40}}/>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr key={i}>
                <td style={{fontWeight:500}}>{inv.client}</td>
                <td style={{color:'var(--text-sub)'}}>{inv.case}</td>
                <td>{inv.month} {inv.year}</td>
                <td className="num">{fmtNum(inv.amount)}</td>
                <td className="num">{inv.rate}%</td>
                <td className="num" style={{fontWeight:600}}>{fmtNum(inv.com)}</td>
                <td><StatusBadge status={inv.src}/></td>
                <td><button className="btn btn-ghost btn-sm" style={{padding:'4px 6px'}}><Ico.dots style={{width:12,height:12}}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { DashboardView, ClientsView, InvoicesView });
