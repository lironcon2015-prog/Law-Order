// LexLedger — additional screens: Payments, Import, Settings, PDF modal

function PaymentsView() {
  const { payments, year } = window.LEX_DATA;
  const total = payments.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="main">
      <div className="view-h">
        <div>
          <div className="crumbs"><span>סקירה</span><span className="sep">/</span><span style={{color:'var(--text)'}}>תשלומים</span></div>
          <h1>תשלומים שהתקבלו</h1>
          <p>רישום תשלומים בפועל מהמשרד</p>
        </div>
        <div className="view-actions">
          <select className="select" defaultValue={year}><option>2026</option><option>2025</option></select>
          <button className="btn btn-sm"><Ico.download className="ico"/>ייצוא</button>
          <button className="btn btn-primary btn-sm"><Ico.plus className="ico"/>תשלום חדש</button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="panel" style={{marginBottom:20}}>
        <div style={{display:'flex'}}>
          <div className="stat-inline" style={{padding:'16px 22px',flex:1}}>
            <span className="l">סה״כ התקבל · {year}</span>
            <span className="v" style={{fontSize:22,color:'var(--pos)'}}>₪{fmtNum(total)}</span>
          </div>
          <div className="stat-inline" style={{padding:'16px 22px',flex:1}}>
            <span className="l">עמלות שנצברו</span>
            <span className="v" style={{fontSize:22}}>₪{fmtNum(71862)}</span>
          </div>
          <div className="stat-inline" style={{padding:'16px 22px',flex:1}}>
            <span className="l">יתרה פתוחה</span>
            <span className="v" style={{fontSize:22,color:'var(--accent-text)'}}>₪{fmtNum2(17581.88)}</span>
          </div>
          <div className="stat-inline" style={{padding:'16px 22px',flex:1,borderRight:'none'}}>
            <span className="l">ממוצע חודשי</span>
            <span className="v" style={{fontSize:22}}>₪{fmtNum(total/payments.length)}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="panel" style={{marginBottom:20}}>
        <div className="panel-h">
          <div>
            <div className="panel-title">תשלומים לעומת עמלות</div>
            <div className="panel-sub">פער שוטף בין מה שנצבר למה ששולם</div>
          </div>
        </div>
        <div className="chart-wrap">
          <AreaChart height={200} series={[
            { color: 'var(--accent)', data: window.LEX_DATA.monthly.map((m) => m.com) },
            { color: 'var(--pos)',    data: window.LEX_DATA.monthly.map((m) => m.pay) },
          ]}/>
          <div style={{display:'flex',gap:16,fontSize:12,marginTop:8,color:'var(--text-sub)'}}>
            <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:10,height:10,borderRadius:3,background:'var(--accent)'}}/>עמלות שנצברו</span>
            <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:10,height:10,borderRadius:3,background:'var(--pos)'}}/>תשלומים שהתקבלו</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="panel">
        <div className="panel-h">
          <div>
            <div className="panel-title">רשומות תשלום</div>
            <div className="panel-sub">{payments.length} רשומות · {year}</div>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>חודש</th>
              <th>שנה</th>
              <th className="num">סכום</th>
              <th>הערות</th>
              <th style={{width:60}}/>
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={i}>
                <td style={{fontWeight:500}}>{p.month}</td>
                <td className="num">{p.year}</td>
                <td className="num" style={{fontWeight:600,color:'var(--pos)'}}>₪{fmtNum(p.amount)}</td>
                <td style={{color:'var(--text-sub)'}}>{p.note || '—'}</td>
                <td><button className="btn btn-ghost btn-sm" style={{padding:'4px 6px'}}><Ico.dots style={{width:12,height:12}}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportView() {
  return (
    <div className="main">
      <div className="view-h">
        <div>
          <div className="crumbs"><span>כלים</span><span className="sep">/</span><span style={{color:'var(--text)'}}>ייבוא</span></div>
          <h1>ייבוא נתונים</h1>
          <p>טעינת קובץ Excel היסטורי והגדרת יתרות פתיחה</p>
        </div>
      </div>

      {/* Stepper */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24,fontSize:12.5}}>
        <div style={{display:'flex',alignItems:'center',gap:8,color:'var(--accent-text)',fontWeight:600}}>
          <span style={{width:22,height:22,borderRadius:'50%',background:'var(--accent)',color:'var(--accent-fg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700}}>1</span>
          בחירת קובץ
        </div>
        <div style={{flex:'0 0 40px',height:1,background:'var(--border)'}}/>
        <div style={{display:'flex',alignItems:'center',gap:8,color:'var(--text-sub)'}}>
          <span style={{width:22,height:22,borderRadius:'50%',background:'var(--bg-sub)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,border:'1px solid var(--border)'}}>2</span>
          תצוגה מקדימה
        </div>
        <div style={{flex:'0 0 40px',height:1,background:'var(--border)'}}/>
        <div style={{display:'flex',alignItems:'center',gap:8,color:'var(--text-sub)'}}>
          <span style={{width:22,height:22,borderRadius:'50%',background:'var(--bg-sub)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,border:'1px solid var(--border)'}}>3</span>
          יתרות פתיחה
        </div>
      </div>

      <div style={{maxWidth:780}}>
        <div className="panel" style={{marginBottom:16}}>
          <div className="panel-h">
            <div>
              <div className="panel-title">שלב 1 · קובץ Excel</div>
              <div className="panel-sub">גרור או בחר קובץ עם עמודות לקוח, תיק, חודש, סכום ואחוז עמלה</div>
            </div>
          </div>
          <div style={{padding:20}}>
            <div className="dropzone" style={{padding:36}}>
              <div className="dz-ico" style={{width:52,height:52,borderRadius:14}}><Ico.excel style={{width:24,height:24}}/></div>
              <div className="dropzone-title">גרור קובץ Excel לכאן</div>
              <div className="dropzone-sub">או <span style={{color:'var(--accent-text)',textDecoration:'underline',cursor:'pointer'}}>לחץ לבחירת קובץ</span> · .xlsx / .xls / .csv · עד 10MB</div>
            </div>

            {/* Fake preview hint */}
            <div className="hint" style={{marginTop:16}}>
              <Ico.file style={{width:16,height:16,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:600}}>היסטוריה 2025.xlsx · 142 שורות זוהו</div>
                <div style={{fontSize:11.5,opacity:0.8,marginTop:2}}>6 לקוחות ייחודיים · 11 תיקים · תקופה: ינואר–נובמבר 2025</div>
              </div>
              <button className="btn btn-sm btn-primary">המשך לתצוגה</button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <div>
              <div className="panel-title">שלב 3 · יתרת פתיחה</div>
              <div className="panel-sub">מה היתה היתרה של המשרד כלפיך בתחילת כל שנה</div>
            </div>
          </div>
          <div style={{padding:20,display:'flex',gap:12,alignItems:'flex-end'}}>
            <div style={{display:'flex',flexDirection:'column',gap:6,flex:'0 0 120px'}}>
              <label style={{fontSize:11.5,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>שנה</label>
              <input className="input" type="number" defaultValue="2025"/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,flex:1}}>
              <label style={{fontSize:11.5,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>יתרת פתיחה ₪</label>
              <input className="input mono" type="number" defaultValue="4119.38" step="0.01"/>
            </div>
            <button className="btn btn-primary">שמור יתרה</button>
          </div>
          <div style={{padding:'0 20px 20px'}}>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {[{y:2024,v:0},{y:2025,v:4119.38},{y:2026,v:17581.88}].map((x) => (
                <div key={x.y} style={{display:'flex',alignItems:'center',padding:'10px 14px',background:'var(--bg-sub)',borderRadius:8,fontSize:13}}>
                  <span style={{fontWeight:600,minWidth:70}}>{x.y}</span>
                  <span className="mono grow">₪{fmtNum2(x.v)}</span>
                  <button className="btn btn-ghost btn-sm">ערוך</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsView() {
  return (
    <div className="main">
      <div className="view-h">
        <div>
          <h1>הגדרות</h1>
          <p>תצורת מערכת, גיבוי ועדכונים</p>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:28,maxWidth:900}}>
        {/* Side nav */}
        <nav style={{display:'flex',flexDirection:'column',gap:2}}>
          {[
            { label: 'פרופיל',       active: true },
            { label: 'אחוזי עמלה ברירת מחדל' },
            { label: 'גרסת מערכת' },
            { label: 'גיבוי ושחזור' },
            { label: 'מראה ונושא' },
            { label: 'קיצורי מקלדת' },
          ].map((it, i) => (
            <div key={i} style={{padding:'8px 12px',fontSize:13.5,borderRadius:7,cursor:'pointer',color: it.active ? 'var(--text)' : 'var(--text-sub)', background: it.active ? 'var(--bg-sub)' : 'transparent', fontWeight: it.active ? 600 : 500}}>
              {it.label}
            </div>
          ))}
        </nav>

        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          {/* Version card */}
          <div className="panel">
            <div className="panel-h">
              <div>
                <div className="panel-title">גרסת מערכת</div>
                <div className="panel-sub">בדיקת עדכונים אוטומטית</div>
              </div>
              <button className="btn btn-sm btn-primary">בדוק עדכונים</button>
            </div>
            <div style={{padding:20,display:'flex',gap:24}}>
              <div style={{display:'flex',flexDirection:'column',gap:4,flex:1}}>
                <span style={{fontSize:11.5,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>גרסה נוכחית</span>
                <span className="mono" style={{fontSize:22,fontWeight:500,color:'var(--accent-text)'}}>v2.4.1</span>
              </div>
              <div className="divider-y"/>
              <div style={{display:'flex',flexDirection:'column',gap:4,flex:1}}>
                <span style={{fontSize:11.5,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>עדכון אחרון</span>
                <span className="mono" style={{fontSize:14,fontWeight:500}}>2026-04-18</span>
                <span style={{fontSize:11.5,color:'var(--text-muted)'}}>לפני 3 ימים</span>
              </div>
              <div className="divider-y"/>
              <div style={{display:'flex',flexDirection:'column',gap:4,flex:1}}>
                <span style={{fontSize:11.5,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>סטטוס</span>
                <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,fontWeight:600,color:'var(--pos)'}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:'var(--pos)'}}/>עדכני
                </span>
              </div>
            </div>
          </div>

          {/* Backup card */}
          <div className="panel">
            <div className="panel-h">
              <div>
                <div className="panel-title">גיבוי ושחזור</div>
                <div className="panel-sub">הנתונים נשמרים מקומית בדפדפן (IndexedDB). מומלץ לגבות לפני עדכונים.</div>
              </div>
            </div>
            <div style={{padding:20,display:'flex',gap:10}}>
              <button className="btn"><Ico.download className="ico"/>הורד גיבוי JSON</button>
              <button className="btn"><Ico.upload className="ico"/>שחזר מגיבוי</button>
              <span className="spacer"/>
              <span style={{fontSize:12,color:'var(--text-muted)'}}>גיבוי אחרון: אין</span>
            </div>
          </div>

          {/* About */}
          <div className="panel">
            <div className="panel-h">
              <div className="panel-title">אודות</div>
            </div>
            <div style={{padding:'16px 20px',fontSize:13,color:'var(--text-sub)',lineHeight:1.7}}>
              <div><strong style={{color:'var(--text)'}}>LexLedger</strong> — מערכת ניהול שכר טרחה ועמלות לעורכי דין עצמאיים.</div>
              <div>כל הנתונים שמורים מקומית בדפדפן בלבד. אין שרת חיצוני, אין מעקב, אין מנויים.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PDFModal() {
  return (
    <div style={{position:'relative',width:'100%',height:'100%',background:'rgba(17,17,16,0.55)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{width:620,background:'var(--bg-panel)',borderRadius:16,boxShadow:'0 20px 60px rgba(0,0,0,0.25)',border:'1px solid var(--border)',overflow:'hidden'}}>
        <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:36,height:36,borderRadius:9,background:'var(--accent-soft)',color:'var(--accent-text)',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--accent-border)'}}>
            <Ico.pdf style={{width:18,height:18}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:600}}>אישור נתוני PDF</div>
            <div style={{fontSize:12,color:'var(--text-muted)'}}>חברת אלון נכסים · חשבונית 4412 · נטען ב־2.1s</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{padding:'4px 8px',fontSize:18}}>×</button>
        </div>

        <div style={{padding:22,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          {[
            { l: 'לקוח', v: 'חברת אלון נכסים בע"מ', ok: true },
            { l: 'תיק', v: '#2341', ok: true },
            { l: 'חודש', v: 'אוקטובר 2026', ok: true },
            { l: 'סכום', v: '8,500.00 ₪', mono: true, ok: true },
            { l: 'מס׳ חשבונית', v: '4412', mono: true, ok: true },
            { l: 'אחוז עמלה', v: '25%', mono: true, editable: true },
          ].map((f, i) => (
            <div key={i} style={{background:'var(--bg-sub)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 12px',position:'relative'}}>
              <div style={{fontSize:10.5,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2,display:'flex',alignItems:'center',gap:6}}>
                {f.l}
                {f.ok && <span style={{color:'var(--pos)',fontSize:10}}>✓ זוהה</span>}
              </div>
              <div className={f.mono ? 'mono' : ''} style={{fontSize:14,fontWeight:500,color:'var(--text)'}}>{f.v}</div>
              {f.editable && <button style={{position:'absolute',top:8,left:10,fontSize:11,color:'var(--accent-text)',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>ערוך</button>}
            </div>
          ))}

          <div style={{gridColumn:'1/-1',background:'var(--accent-soft)',border:'1px solid var(--accent-border)',borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:11.5,color:'var(--accent-text)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>עמלה מחושבת</div>
              <div style={{fontSize:11.5,color:'var(--text-sub)',marginTop:2}}>8,500 × 25%</div>
            </div>
            <div className="mono" style={{fontSize:26,fontWeight:600,color:'var(--accent-text)'}}>₪ 2,125.00</div>
          </div>
        </div>

        <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',background:'var(--bg-sub)',display:'flex',justifyContent:'flex-start',gap:10}}>
          <button className="btn">ביטול</button>
          <span className="spacer"/>
          <button className="btn btn-ghost">ערוך ידנית</button>
          <button className="btn btn-primary">שמור חשבונית</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PaymentsView, ImportView, SettingsView, PDFModal });
