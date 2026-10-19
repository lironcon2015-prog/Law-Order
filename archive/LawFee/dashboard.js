/**
 * dashboard.js — LexLedger Dashboard View (redesigned)
 * Hero KPI, monthly bar chart, client donut, breakdown tables.
 */

const Dashboard = (() => {

  let _year = new Date().getFullYear();
  let _donutMetric = 'commission';

  // ── Init ───────────────────────────────────────────────
  async function init() {
    await UI.populateYearSelect('dashboard-year', _year);

    document.getElementById('dashboard-year').addEventListener('change', async (e) => {
      _year = parseInt(e.target.value, 10);
      await render();
    });

    document.getElementById('toggle-client-monthly-metric')?.addEventListener('click', async () => {
      _clientMonthlyMetric = _clientMonthlyMetric === 'commission' ? 'amount' : 'commission';
      await renderClientMonthlyTable();
    });

    document.getElementById('toggle-donut-metric')?.addEventListener('click', async () => {
      _donutMetric = _donutMetric === 'commission' ? 'amount' : 'commission';
      await renderClientDonut();
    });

    await render();
  }

  // ── Render ─────────────────────────────────────────────
  async function render() {
    await Promise.all([
      renderKPIs(),
      renderMonthlyChart(),
      renderClientDonut(),
      renderMonthlyTable(),
      renderClientBreakdown(),
      renderClientMonthlyTable(),
    ]);
  }

  // ── KPI Cards ──────────────────────────────────────────
  async function renderKPIs() {
    const [ledger, totalRevenue] = await Promise.all([
      DB.balances.computeLedger(_year),
      DB.invoices.totalAmountForYear(_year),
    ]);

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = UI.formatNumber(val);
    };

    set('kpi-opening',     ledger.openingBalance);
    set('kpi-revenue',     totalRevenue);
    set('kpi-commissions', ledger.totalCommissions);
    set('kpi-payments',    ledger.totalPayments);

    const balEl = document.getElementById('kpi-balance');
    if (balEl) balEl.textContent = UI.formatNumber(ledger.closingBalance);

    const meta = document.getElementById('hero-meta');
    if (meta) {
      const unpaid = ledger.totalCommissions - ledger.totalPayments;
      meta.textContent = `עמלות ${UI.formatNumber(ledger.totalCommissions)} − תשלומים ${UI.formatNumber(ledger.totalPayments)} = ${UI.formatNumber(unpaid)}`;
    }
  }

  // ── Monthly Bar Chart (HTML/Tailwind Based) ─────────────
  async function renderMonthlyChart() {
    const host = document.getElementById('monthly-chart');
    if (!host) return;

    const [invByMonth, payByMonth] = await Promise.all([
      DB.invoices.byMonthForYear(_year),
      DB.payments.byMonthForYear(_year),
    ]);

    const months = Array.from({length:12}, (_,i) => {
      const inv = invByMonth[i+1] || { amount: 0, commission: 0 };
      const pay = payByMonth[i+1] || 0;
      return { m: i+1, amount: inv.amount, commission: inv.commission, payment: pay };
    });

    const hasData = months.some(x => x.amount > 0 || x.commission > 0);
    if (!hasData) {
      host.innerHTML = `<div class="chart-empty absolute inset-0 flex items-center justify-center">אין נתונים לשנת ${_year}</div>`;
      return;
    }

    const maxVal = Math.max(...months.map(x => Math.max(x.amount, x.commission))) || 1;
    const niceMax = niceCeil(maxVal);

    const gridLines = `
      <div class="absolute inset-0 flex flex-col justify-between pb-7 pointer-events-none" style="padding-right:44px;">
        <div class="w-full h-px" style="background:#F3F4F6;position:relative;"><span style="position:absolute;right:-44px;top:-7px;font-size:10px;color:#9CA3AF;font-family:'Inter',sans-serif;white-space:nowrap;">${formatAxis(niceMax)}</span></div>
        <div class="w-full h-px" style="background:#F3F4F6;position:relative;"><span style="position:absolute;right:-44px;top:-7px;font-size:10px;color:#9CA3AF;font-family:'Inter',sans-serif;white-space:nowrap;">${formatAxis(niceMax * 0.75)}</span></div>
        <div class="w-full h-px" style="background:#F3F4F6;position:relative;"><span style="position:absolute;right:-44px;top:-7px;font-size:10px;color:#9CA3AF;font-family:'Inter',sans-serif;white-space:nowrap;">${formatAxis(niceMax * 0.5)}</span></div>
        <div class="w-full h-px" style="background:#F3F4F6;position:relative;"><span style="position:absolute;right:-44px;top:-7px;font-size:10px;color:#9CA3AF;font-family:'Inter',sans-serif;white-space:nowrap;">${formatAxis(niceMax * 0.25)}</span></div>
        <div class="w-full h-px" style="background:#E5E7EB;"></div>
      </div>
    `;

    const currentMonth = _year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;

    const barsHTML = months.map(mo => {
      const isCurrent = _year === new Date().getFullYear() && mo.m === currentMonth;
      const isPastOrPresent = _year < new Date().getFullYear() || mo.m <= currentMonth;

      const revPct  = mo.amount > 0 ? Math.max(2, (mo.amount / niceMax) * 100) : 0;
      const commPct = mo.commission > 0 ? Math.max(2, (mo.commission / niceMax) * 100) : 0;
      const title = `חודש ${UI.monthName(mo.m)}&#10;הכנסות: ${UI.formatNumber(mo.amount)} ₪&#10;עמלות: ${UI.formatNumber(mo.commission)} ₪`;

      if (!isPastOrPresent && mo.amount === 0 && mo.commission === 0) {
        return `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
            <div style="flex:1;"></div>
            <span style="font-size:10px;color:#D1D5DB;font-family:'Assistant',sans-serif;margin-top:4px;" dir="rtl">${UI.monthName(mo.m, true)}</span>
          </div>`;
      }

      return `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;cursor:pointer;" title="${title}" class="group">
          <div style="display:flex;align-items:flex-end;justify-content:center;gap:2px;width:100%;height:100%;padding-bottom:4px;">
            ${mo.amount > 0 ? `<div style="width:38%;max-width:12px;background:#1D4ED8;border-radius:3px 3px 0 0;height:${revPct}%;opacity:0.9;transition:opacity 0.15s;" class="group-hover:opacity-70"></div>` : '<div style="width:38%;max-width:12px;"></div>'}
            ${mo.commission > 0 ? `<div style="width:38%;max-width:12px;background:#D4AF37;border-radius:3px 3px 0 0;height:${commPct}%;opacity:0.9;transition:opacity 0.15s;" class="group-hover:opacity-70"></div>` : '<div style="width:38%;max-width:12px;"></div>'}
          </div>
          <span style="font-size:10px;font-family:'Assistant',sans-serif;color:${isCurrent ? '#111827' : '#9CA3AF'};font-weight:${isCurrent ? '700' : '500'};margin-top:3px;" dir="rtl">${UI.monthName(mo.m, true)}</span>
        </div>`;
    }).join('');

    host.innerHTML = `
      <div style="position:relative;flex:1;width:100%;min-height:200px;" class="flex flex-col">
        ${gridLines}
        <div dir="ltr" style="position:relative;z-index:10;width:100%;height:200px;display:grid;grid-template-columns:repeat(12,1fr);gap:3px;padding:0 2px;">
          ${barsHTML}
        </div>
      </div>
    `;
  }

  function niceCeil(v) {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    let mult;
    if (n <= 1) mult = 1;
    else if (n <= 2) mult = 2;
    else if (n <= 2.5) mult = 2.5;
    else if (n <= 5) mult = 5;
    else mult = 10;
    return mult * pow;
  }

  function formatAxis(v) {
    if (v >= 1_000_000) return (v/1_000_000).toFixed(v>=10_000_000?0:1) + 'M';
    if (v >= 1_000)     return Math.round(v/1000) + 'K';
    return Math.round(v).toString();
  }

  // ── Client Donut ────────────────────────────────────────
  async function renderClientDonut() {
    const host = document.getElementById('client-donut');
    if (!host) return;

    const [allInvoices, allCases, allClients] = await Promise.all([
      DB.invoices.getByYear(_year),
      DB.cases.getAll(),
      DB.clients.getAll(),
    ]);

    if (!allInvoices.length) {
      host.innerHTML = `<div class="chart-empty w-full text-center py-8">אין נתונים לשנת ${_year}</div>`;
      return;
    }

    const clientMap = {};
    allClients.forEach(c => { clientMap[c.id] = c.name; });
    const caseMap = {};
    allCases.forEach(c => { caseMap[c.id] = c; });

    const metric = _donutMetric;
    const toggleBtn  = document.getElementById('toggle-donut-metric');
    const titleEl    = document.getElementById('donut-title');
    if (toggleBtn) toggleBtn.textContent = metric === 'commission' ? 'הצג הכנסות' : 'הצג עמלות';
    if (titleEl)   titleEl.textContent   = metric === 'commission' ? 'פילוח עמלות לפי לקוח' : 'פילוח הכנסות לפי לקוח';

    const byClient = {};
    allInvoices.forEach(inv => {
      const c = caseMap[inv.caseId];
      if (!c) return;
      byClient[c.clientId] = (byClient[c.clientId] || 0) + (metric === 'commission' ? inv.commission : inv.amount);
    });

    let rows = Object.entries(byClient)
      .map(([cid, v]) => ({ name: clientMap[parseInt(cid)] || '—', val: v }))
      .sort((a,b) => b.val - a.val)
      .filter(r => r.val > 0);

    const total = rows.reduce((s,r) => s + r.val, 0);

    if (total === 0) {
      host.innerHTML = `<div class="chart-empty w-full text-center py-8">אין ${metric === 'commission' ? 'עמלות' : 'הכנסות'} לשנת ${_year}</div>`;
      return;
    }

    if (rows.length > 5) {
      const top = rows.slice(0, 5);
      const rest = rows.slice(5);
      const othersVal = rest.reduce((s,r) => s + r.val, 0);
      rows = [...top, { name: `${rest.length} אחרים`, val: othersVal, isOthers: true }];
    }

    const palette = [
      '#1D4ED8', // sapphire
      '#D4AF37', // champagne
      '#1A1C23', // slate
      '#9CA3AF', // gray
      '#0284C7', // sky
      '#D1D5DB', // muted
    ];
    rows.forEach((r,i) => r.color = palette[i] || '#cbd5e1');

    const size = 160, strokeW = 14;
    const cx = size/2, cy = size/2;
    const r = (size - strokeW) / 2;
    const circ = 2 * Math.PI * r;

    let offset = 0;
    const segs = rows.map(row => {
      const frac = total > 0 ? (row.val / total) : 0;
      const len = frac * circ;
      const seg = `<circle
        cx="${cx}" cy="${cy}" r="${r}"
        fill="none" stroke="${row.color}" stroke-width="${strokeW}"
        stroke-dasharray="${len} ${circ - len}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${cx} ${cy})" />`;
      offset += len;
      return seg;
    }).join('');

    const legend = rows.map(r => {
      const pct = total > 0 ? ((r.val/total) * 100).toFixed(1) : '0.0';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;cursor:default;" title="${r.name} - ${UI.formatNumber(r.val)} ₪">
          <div style="display:flex;align-items:center;gap:8px;overflow:hidden;">
            <span style="width:8px;height:8px;border-radius:2px;flex-shrink:0;background:${r.color};display:inline-block;"></span>
            <span style="font-size:0.8rem;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">${r.name}</span>
          </div>
          <span style="font-family:'Inter',sans-serif;font-size:0.75rem;color:#9CA3AF;font-weight:600;margin-right:8px;white-space:nowrap;">${pct}%</span>
        </div>`;
    }).join('');

    host.innerHTML = `
      <div style="width:150px;height:150px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;">
        <svg style="width:100%;height:100%;position:absolute;inset:0;" viewBox="0 0 ${size} ${size}">
          ${segs}
        </svg>
        <div style="text-align:center;z-index:10;position:relative;">
          <div style="font-size:9px;color:#9CA3AF;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;">סה"כ</div>
          <div style="font-family:'Inter',sans-serif;font-weight:700;font-size:1.1rem;color:#111827;letter-spacing:-0.02em;">${formatAxis(total)}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;flex:1;min-width:120px;max-width:180px;">
        ${legend}
      </div>`;
  }

  // ── Monthly Breakdown Table ────────────────────────────
  async function renderMonthlyTable() {
    const tbody = document.getElementById('monthly-tbody');
    if (!tbody) return;

    const [invByMonth, payByMonth, ledger] = await Promise.all([
      DB.invoices.byMonthForYear(_year),
      DB.payments.byMonthForYear(_year),
      DB.balances.computeLedger(_year),
    ]);

    let runningBalance = ledger.openingBalance;
    let totalAmt = 0, totalComm = 0, totalPay = 0;
    let rows = '';

    const now = new Date();
    const maxMonth = _year === now.getFullYear() ? now.getMonth() + 1 : 12;

    for (let m = 1; m <= maxMonth; m++) {
      const inv = invByMonth[m] || { amount: 0, commission: 0 };
      const pay = payByMonth[m]  || 0;
      runningBalance += inv.commission - pay;
      totalAmt  += inv.amount;
      totalComm += inv.commission;
      totalPay  += pay;

      const hasData = inv.amount > 0 || pay > 0;
      rows += `<tr style="${!hasData ? 'opacity:0.35;' : ''}">
        <td class="month-label" style="font-weight:600;color:#111827;">${UI.monthName(m)}</td>
        <td class="num" style="color:#374151;">${inv.amount  > 0 ? UI.formatNumber(inv.amount)     : '<span style="color:#D1D5DB;">—</span>'}</td>
        <td class="num" style="color:#D4AF37;font-weight:600;">${inv.commission > 0 ? UI.formatNumber(inv.commission) : '<span style="color:#D1D5DB;">—</span>'}</td>
        <td class="num" style="color:#047857;font-weight:600;">${pay > 0 ? UI.formatNumber(pay) : '<span style="color:#D1D5DB;">—</span>'}</td>
        <td class="num" style="color:${runningBalance >= 0 ? '#111827' : '#be123c'};font-weight:700;">${UI.formatNumber(runningBalance)}</td>
      </tr>`;
    }

    const unknownPay = payByMonth[0] || 0;
    if (unknownPay > 0) {
      runningBalance -= unknownPay;
      totalPay += unknownPay;
      rows += `<tr class="text-muted">
        <td class="month-label" style="font-style:italic">ללא חודש</td>
        <td class="num">—</td>
        <td class="num">—</td>
        <td class="num positive">${UI.formatNumber(unknownPay)}</td>
        <td class="num ${runningBalance >= 0 ? '' : 'negative'}">${UI.formatNumber(runningBalance)}</td>
      </tr>`;
    }

    rows += `<tr class="summary-row">
      <td>סה"כ</td>
      <td class="num">${UI.formatNumber(totalAmt)}</td>
      <td class="num">${UI.formatNumber(totalComm)}</td>
      <td class="num">${UI.formatNumber(totalPay)}</td>
      <td class="num">${UI.formatNumber(ledger.closingBalance)}</td>
    </tr>`;

    tbody.innerHTML = rows;
  }

  function _statusBadge(caseType) {
    const map = {
      'שוטף':     { style: 'background:rgba(29,78,216,0.07);color:#1D4ED8;',    label: 'פעיל' },
      'ליטיגציה': { style: 'background:rgba(190,18,60,0.07);color:#be123c;',    label: 'ליטיגציה' },
      'עסקה':     { style: 'background:rgba(124,58,237,0.07);color:#7C3AED;',   label: 'עסקה' },
    };
    const s = map[caseType] || { style: 'background:#F3F4F6;color:#9CA3AF;', label: caseType || '—' };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.7rem;font-weight:700;${s.style}">${s.label}</span>`;
  }

  // ── Per-Client Breakdown ────────────────────────────────
  async function renderClientBreakdown() {
    const tbody = document.getElementById('client-breakdown-tbody');
    if (!tbody) return;

    const [allInvoices, allCases, allClients] = await Promise.all([
      DB.invoices.getByYear(_year),
      DB.cases.getAll(),
      DB.clients.getAll(),
    ]);

    if (!allInvoices.length) {
      tbody.innerHTML = UI.emptyRow(6, 'אין נתוני חשבוניות לשנה זו');
      return;
    }

    const clientMap = {};
    allClients.forEach(c => { clientMap[c.id] = c.name; });
    const caseMap = {};
    allCases.forEach(c => { caseMap[c.id] = c; });

    const caseAgg = {};
    allInvoices.forEach(inv => {
      if (!caseAgg[inv.caseId]) caseAgg[inv.caseId] = { amount: 0, commission: 0 };
      caseAgg[inv.caseId].amount     += inv.amount;
      caseAgg[inv.caseId].commission += inv.commission;
    });

    const clientAgg = {};
    Object.entries(caseAgg).forEach(([caseId, agg]) => {
      const c = caseMap[parseInt(caseId)];
      if (!c) return;
      const cid = c.clientId;
      if (!clientAgg[cid]) clientAgg[cid] = { amount: 0, commission: 0, cases: [] };
      clientAgg[cid].amount     += agg.amount;
      clientAgg[cid].commission += agg.commission;
      clientAgg[cid].cases.push({ ...agg, caseRec: c });
    });

    const sortedClients = Object.entries(clientAgg)
      .sort((a, b) => b[1].commission - a[1].commission);

    let totalAmt = 0, totalComm = 0;
    let rows = '';
    sortedClients.forEach(([cid, data]) => {
      totalAmt  += data.amount;
      totalComm += data.commission;
      data.cases.sort((a, b) => b.commission - a.commission);

      rows += `<tr class="client-row" data-client-id="${cid}" style="cursor:pointer;">
        <td style="font-weight:700;color:#111827;">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined chevron" style="font-size:16px;color:#9CA3AF;transition:transform 0.2s;">chevron_left</span>
            ${clientMap[cid] || '—'}
          </span>
        </td>
        <td style="color:#9CA3AF;font-size:0.8rem;">${data.cases.length} תיקים</td>
        <td class="num" style="color:#D1D5DB;">—</td>
        <td class="num" style="color:#374151;">${UI.formatNumber(data.amount)}</td>
        <td class="num" style="color:#D4AF37;font-weight:700;">${UI.formatNumber(data.commission)}</td>
        <td style="text-align:center;color:#D1D5DB;">—</td>
      </tr>`;

      data.cases.forEach(r => {
        const c = r.caseRec;
        rows += `<tr class="case-row" data-parent-client="${cid}" hidden style="background:#F9FAFB;">
          <td></td>
          <td>
            <span style="font-family:'Inter',monospace;font-size:0.75rem;color:#9CA3AF;">${c.caseNumber}</span>
            ${c.description && c.description !== c.caseNumber ? ` <span style="color:#6B7280;font-size:0.8rem;">${c.description}</span>` : ''}
          </td>
          <td class="num" style="color:#9CA3AF;">${UI.formatPct(c.commissionRate)}</td>
          <td class="num" style="color:#6B7280;">${UI.formatNumber(r.amount)}</td>
          <td class="num" style="color:#D4AF37;font-weight:600;">${UI.formatNumber(r.commission)}</td>
          <td style="text-align:center;">${_statusBadge(c.caseType)}</td>
        </tr>`;
      });
    });

    rows += `<tr class="summary-row">
      <td colspan="3" style="font-size:0.8rem;">סה"כ</td>
      <td class="num">${UI.formatNumber(totalAmt)}</td>
      <td class="num" style="color:#D4AF37;">${UI.formatNumber(totalComm)}</td>
      <td></td>
    </tr>`;

    tbody.innerHTML = rows;

    if (!tbody._expandWired) {
      tbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr.client-row');
        if (!row) return;
        const cid = row.dataset.clientId;
        const chev = row.querySelector('.chevron');
        const isOpen = row.classList.toggle('expanded');
        if (chev) chev.style.transform = isOpen ? 'rotate(-90deg)' : '';
        tbody.querySelectorAll(`tr.case-row[data-parent-client="${cid}"]`).forEach(c => {
          c.hidden = !isOpen;
        });
      });
      tbody._expandWired = true;
    }
  }

  // ── Per-Client Monthly Breakdown ───────────────────────
  let _clientMonthlyMetric = 'commission';

  async function renderClientMonthlyTable() {
    const thead = document.getElementById('client-monthly-thead');
    const tbody = document.getElementById('client-monthly-tbody');
    const toggleMetricBtn = document.getElementById('toggle-client-monthly-metric');
    if (!thead || !tbody) return;

    if (toggleMetricBtn) toggleMetricBtn.textContent = _clientMonthlyMetric === 'commission' ? 'הצג הכנסות' : 'הצג עמלות';

    const [allInvoices, allCases, allClients] = await Promise.all([
      DB.invoices.getByYear(_year),
      DB.cases.getAll(),
      DB.clients.getAll(),
    ]);

    if (!allInvoices.length) {
      thead.innerHTML = '';
      tbody.innerHTML = UI.emptyRow(14, 'אין נתוני חשבוניות לשנה זו');
      return;
    }

    const clientMap = {};
    allClients.forEach(c => { clientMap[c.id] = c.name; });
    const caseMap = {};
    allCases.forEach(c => { caseMap[c.id] = c; });

    const metric = _clientMonthlyMetric;
    const clients = {};

    allInvoices.forEach(inv => {
      const c = caseMap[inv.caseId];
      if (!c) return;
      const cid = c.clientId;
      if (!clients[cid]) clients[cid] = { months: {}, cases: {} };
      if (!clients[cid].months[inv.month]) clients[cid].months[inv.month] = { amount: 0, commission: 0 };
      clients[cid].months[inv.month].amount     += inv.amount;
      clients[cid].months[inv.month].commission += inv.commission;

      if (!clients[cid].cases[inv.caseId]) clients[cid].cases[inv.caseId] = { months: {}, caseRec: c };
      if (!clients[cid].cases[inv.caseId].months[inv.month]) clients[cid].cases[inv.caseId].months[inv.month] = { amount: 0, commission: 0 };
      clients[cid].cases[inv.caseId].months[inv.month].amount     += inv.amount;
      clients[cid].cases[inv.caseId].months[inv.month].commission += inv.commission;
    });

    const sortedClientIds = Object.keys(clients).sort((a, b) =>
      (clientMap[a] || '').localeCompare(clientMap[b] || '', 'he'));

    const now = new Date();
    const maxMonth = _year === now.getFullYear() ? now.getMonth() + 1 : 12;

    const monthHeaders = Array.from({length:maxMonth}, (_,i) =>
      `<th class="num">${UI.monthName(i+1, true)}</th>`
    ).join('');
    thead.innerHTML = `<tr>
      <th style="text-align:right;">לקוח</th>
      ${monthHeaders}
      <th class="num">סה"כ</th>
    </tr>`;

    const monthTotals = {};
    let grandTotal = 0;
    let rows = '';

    const renderMonthCells = (months) => {
      let total = 0, html = '';
      for (let m = 1; m <= maxMonth; m++) {
        const val = (months[m] || {})[metric] || 0;
        total += val;
        html += `<td class="num" style="color:${val > 0 ? '#374151' : '#D1D5DB'};">${val > 0 ? UI.formatNumber(val) : '—'}</td>`;
      }
      return { html, total };
    };

    sortedClientIds.forEach(cid => {
      const data = clients[cid];
      const { html: clientCells, total: clientTotal } = renderMonthCells(data.months);
      for (let m = 1; m <= maxMonth; m++) {
        monthTotals[m] = (monthTotals[m] || 0) + ((data.months[m] || {})[metric] || 0);
      }
      grandTotal += clientTotal;

      rows += `<tr class="client-row" data-client-id="${cid}" style="cursor:pointer;">
        <td style="font-weight:700;color:#111827;white-space:nowrap;">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined chevron" style="font-size:16px;color:#9CA3AF;transition:transform 0.2s;">chevron_left</span>
            ${clientMap[cid] || '—'}
          </span>
        </td>
        ${clientCells}
        <td class="num" style="font-weight:700;color:${metric === 'commission' ? '#D4AF37' : '#111827'};">${UI.formatNumber(clientTotal)}</td>
      </tr>`;

      const sortedCaseIds = Object.keys(data.cases).sort((a, b) =>
        data.cases[a].caseRec.caseNumber.localeCompare(data.cases[b].caseRec.caseNumber));
      sortedCaseIds.forEach(caseId => {
        const cd = data.cases[caseId];
        const { html: caseCells, total: caseTotal } = renderMonthCells(cd.months);
        const c = cd.caseRec;
        rows += `<tr class="case-row" data-parent-client="${cid}" hidden style="background:#F9FAFB;">
          <td>
            <div style="font-family:'Inter',monospace;font-size:0.75rem;color:#9CA3AF;padding-right:22px;">
              ${c.caseNumber}${c.description && c.description !== c.caseNumber ? ' — ' + c.description : ''}
            </div>
          </td>
          ${caseCells}
          <td class="num" style="font-weight:600;color:#6B7280;">${UI.formatNumber(caseTotal)}</td>
        </tr>`;
      });
    });

    const totalCells = Array.from({length:maxMonth}, (_,i) => {
      const v = monthTotals[i+1] || 0;
      return `<td class="num" style="font-weight:700;color:#111827;">${v > 0 ? UI.formatNumber(v) : '<span style="color:#D1D5DB;">—</span>'}</td>`;
    }).join('');
    rows += `<tr class="summary-row">
      <td style="font-size:0.8rem;">סה"כ חודשי</td>
      ${totalCells}
      <td class="num" style="color:${_clientMonthlyMetric === 'commission' ? '#D4AF37' : '#111827'};">${UI.formatNumber(grandTotal)}</td>
    </tr>`;

    tbody.innerHTML = rows;

    if (!tbody._expandWired) {
      tbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr.client-row');
        if (!row) return;
        const cid = row.dataset.clientId;
        const chev = row.querySelector('.chevron');
        const isOpen = row.classList.toggle('expanded');
        if (chev) chev.style.transform = isOpen ? 'rotate(-90deg)' : '';
        tbody.querySelectorAll(`tr.case-row[data-parent-client="${cid}"]`).forEach(c => {
          c.hidden = !isOpen;
        });
      });
      tbody._expandWired = true;
    }
  }

  return { init, render };
})();

window.Dashboard = Dashboard;
