/**
 * invoices.js — LexLedger Invoices View
 * Displays invoice history with filters; manual add modal;
 * PDF dropzone is in the HTML (wired in import.js).
 */

const Invoices = (() => {

  let _filterYear   = new Date().getFullYear();
  let _filterClient = '';
  let _search       = '';
  let _sortKey      = null;   // null → default (year desc, month desc)
  let _sortDir      = 1;      // 1 asc, -1 desc

  // ── Init ───────────────────────────────────────────────
  async function init() {
    await UI.populateYearSelect('invoice-filter-year', _filterYear);
    await UI.populateClientSelect('invoice-filter-client', true);

    document.getElementById('invoice-filter-year').addEventListener('change', async (e) => {
      _filterYear = parseInt(e.target.value, 10);
      await render();
    });

    document.getElementById('invoice-filter-client').addEventListener('change', async (e) => {
      _filterClient = e.target.value;
      await render();
    });

    document.getElementById('invoice-search')?.addEventListener('input', async (e) => {
      _search = e.target.value;
      await render();
    });

    // Sortable headers
    document.querySelectorAll('#invoices-table thead th[data-sort]').forEach(th => {
      th.addEventListener('click', async () => {
        const key = th.dataset.sort;
        if (_sortKey === key) _sortDir = -_sortDir;
        else { _sortKey = key; _sortDir = 1; }
        await render();
      });
    });

    document.getElementById('btn-add-invoice').addEventListener('click', () => openInvoiceModal());

    await render();
  }

  function _updateSortArrows() {
    document.querySelectorAll('#invoices-table thead th[data-sort]').forEach(th => {
      const base = th.dataset.label || (th.dataset.label = th.textContent.replace(/[ ↑↓]+$/, ''));
      th.textContent = base + (_sortKey === th.dataset.sort ? (_sortDir > 0 ? ' ↑' : ' ↓') : '');
    });
  }

  // ── Render table ───────────────────────────────────────
  async function render() {
    const tbody = document.getElementById('invoices-tbody');
    if (!tbody) return;

    const [invoices, allCases, allClients] = await Promise.all([
      DB.invoices.getByYear(_filterYear),
      DB.cases.getAll(),
      DB.clients.getAll(),
    ]);

    const clientMap = {};
    allClients.forEach(c => { clientMap[c.id] = c.name; });
    const caseMap   = {};
    allCases.forEach(c => { caseMap[c.id] = c; });

    let filtered = invoices;
    if (_filterClient) {
      const caseIds = allCases
        .filter(c => c.clientId == _filterClient)
        .map(c => c.id);
      filtered = invoices.filter(i => caseIds.includes(i.caseId));
    }

    // Enrich with derived fields (client name, case record)
    let enriched = filtered.map(inv => {
      const c = caseMap[inv.caseId];
      return { inv, c, client: c ? (clientMap[c.clientId] || '—') : '—' };
    });

    // Free-text search
    if (_search.trim()) {
      const q = _search.trim().toLowerCase();
      enriched = enriched.filter(({ inv, c, client }) =>
        client.toLowerCase().includes(q) ||
        (c && (c.caseNumber || '').toLowerCase().includes(q)) ||
        (c && (c.description || '').toLowerCase().includes(q)) ||
        (inv.notes || '').toLowerCase().includes(q) ||
        String(inv.amount).includes(q) ||
        UI.monthName(inv.month).includes(q)
      );
    }

    // Sort
    enriched.sort((a, b) => {
      if (!_sortKey) return b.inv.year - a.inv.year || b.inv.month - a.inv.month;
      let va, vb;
      if (_sortKey === 'client')          { va = a.client; vb = b.client; }
      else if (_sortKey === 'caseNumber') { va = a.c ? a.c.caseNumber : ''; vb = b.c ? b.c.caseNumber : ''; }
      else                                { va = a.inv[_sortKey]; vb = b.inv[_sortKey]; }
      if (typeof va === 'string' || typeof vb === 'string')
        return String(va).localeCompare(String(vb), 'he') * _sortDir;
      return ((va || 0) - (vb || 0)) * _sortDir;
    });

    _updateSortArrows();

    if (!enriched.length) {
      tbody.innerHTML = UI.emptyRow(9, _search.trim() ? 'לא נמצאו תוצאות' : 'אין חשבוניות להצגה');
      return;
    }

    let rows = '';
    let totalAmt = 0, totalComm = 0;

    enriched.forEach(({ inv, c, client }) => {
      totalAmt  += inv.amount;
      totalComm += inv.commission;

      rows += `<tr onmouseover="this.querySelectorAll('td').forEach(td=>td.style.background='#F9FAFB')" onmouseout="this.querySelectorAll('td').forEach(td=>td.style.background='')">
        <td style="font-weight:600;color:#111827;">${escHtml(client)}</td>
        <td style="font-family:'Inter',monospace;font-size:0.75rem;color:#9CA3AF;">${c ? escHtml(c.caseNumber) : '—'}</td>
        <td style="font-size:0.82rem;color:#6B7280;">${UI.monthName(inv.month)}</td>
        <td style="font-family:'Inter',sans-serif;font-size:0.8rem;color:#9CA3AF;">${inv.year}</td>
        <td class="num" style="color:#374151;">${UI.formatNumber(inv.amount)}</td>
        <td class="num" style="color:#9CA3AF;">${UI.formatPct(inv.commissionRate)}</td>
        <td class="num" style="color:#D4AF37;font-weight:600;">${UI.formatNumber(inv.commission)}</td>
        <td>${UI.sourceBadge(inv.source)}</td>
        <td style="text-align:left;">
          <button style="color:#9CA3AF;background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;transition:all 0.15s;" onmouseover="this.style.color='#1D4ED8';this.style.background='rgba(29,78,216,0.06)'" onmouseout="this.style.color='#9CA3AF';this.style.background='none'" onclick="Invoices.openInvoiceModal(${inv.id})" title="ערוך"><span class="material-symbols-outlined" style="font-size:16px;">edit</span></button>
          <button style="color:#9CA3AF;background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;transition:all 0.15s;" onmouseover="this.style.color='#be123c';this.style.background='rgba(190,18,60,0.06)'" onmouseout="this.style.color='#9CA3AF';this.style.background='none'" onclick="Invoices.deleteInvoice(${inv.id})" title="מחק"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>
        </td>
      </tr>`;
    });

    rows += `<tr class="summary-row">
      <td colspan="4" style="font-size:0.8rem;">סה"כ (${enriched.length} חשבוניות)</td>
      <td class="num">${UI.formatNumber(totalAmt)}</td>
      <td></td>
      <td class="num" style="color:#D4AF37;">${UI.formatNumber(totalComm)}</td>
      <td colspan="2"></td>
    </tr>`;

    tbody.innerHTML = rows;
  }

  // ── Invoice Modal (add / edit) ─────────────────────────
  async function openInvoiceModal(invoiceId = null) {
    let inv     = null;
    let caseRec = null;
    if (invoiceId) {
      inv     = await DB.invoices.get(invoiceId);
      caseRec = inv ? await DB.cases.get(inv.caseId) : null;
    }

    const clients = await DB.clients.getAll();
    const allCases = await DB.cases.getAll();

    const clientOptions = [
      { value: '', label: 'בחר לקוח…' },
      ...clients.map(c => ({ value: c.id, label: c.name })),
    ];

    // Build client + case selects in the form
    // We'll do a custom bodyHTML here for the cascading select
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label" for="f-inv-client">לקוח *</label>
        <select id="f-inv-client" class="form-input">
          ${clientOptions.map(o => `<option value="${o.value}" ${inv && caseRec && caseRec.clientId == o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-inv-case">תיק *</label>
        <select id="f-inv-case" class="form-input" onchange="Invoices._onCaseChange()">
          <option value="">בחר תיק…</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label" for="f-inv-month">חודש *</label>
          <select id="f-inv-month" class="form-input">
            ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${inv && inv.month==i+1?'selected':''}>${UI.monthName(i+1)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="f-inv-year">שנה *</label>
          <input type="number" id="f-inv-year" class="form-input" value="${inv ? inv.year : new Date().getFullYear()}" min="2000" max="2100" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-inv-amount">סכום חשבונית (₪) *</label>
        <input type="number" id="f-inv-amount" class="form-input" value="${inv ? inv.amount : ''}" step="0.01" min="0" oninput="Invoices._onAmountChange()" />
      </div>
      <div class="form-group">
        <label class="form-label" for="f-inv-rate">שיעור עמלה (%)</label>
        <input type="number" id="f-inv-rate" class="form-input" value="${inv ? inv.commissionRate : ''}" step="0.5" min="0" max="100" oninput="Invoices._onAmountChange()" />
        <small style="color:var(--text-muted);font-size:0.75rem;margin-top:4px">ממולא אוטומטית מהתיק; ניתן לשינוי ידני</small>
      </div>
      <div class="commission-preview">
        <span class="commission-label">עמלה מחושבת</span>
        <span class="commission-value" id="f-inv-commission-preview">—</span>
      </div>
      <div class="form-group mt-sm">
        <label class="form-label" for="f-inv-notes">הערות</label>
        <input type="text" id="f-inv-notes" class="form-input" value="${inv ? escHtml(inv.notes) : ''}" />
      </div>`;

    UI.openModal({
      title:        invoiceId ? 'עריכת חשבונית' : 'חשבונית חדשה',
      bodyHTML,
      confirmLabel: invoiceId ? 'שמור שינויים' : 'שמור חשבונית',
      onConfirm: async () => {
        const caseId = parseInt(document.getElementById('f-inv-case').value);
        const month  = parseInt(document.getElementById('f-inv-month').value);
        const year   = parseInt(document.getElementById('f-inv-year').value);
        const amount = parseFloat(document.getElementById('f-inv-amount').value);
        const rate   = parseFloat(document.getElementById('f-inv-rate').value);
        const notes  = document.getElementById('f-inv-notes').value.trim();

        if (!caseId)       throw new Error('יש לבחור תיק');
        if (!month||!year) throw new Error('יש לבחור חודש ושנה');
        if (!amount||amount<=0) throw new Error('יש להזין סכום תקין');
        if (isNaN(rate))   throw new Error('יש להזין שיעור עמלה');

        if (invoiceId) {
          const commission = +(amount * rate / 100).toFixed(2);
          await DB.invoices.update({ ...inv, caseId, month, year, amount, commissionRate: rate, commission, notes });
          UI.toast('חשבונית עודכנה', 'success');
        } else {
          // Duplicate check
          const existing = await DB.invoices.getByCase(caseId);
          const dup = existing.find(i => i.month === month && i.year === year && Math.abs(i.amount - amount) < 0.01);
          if (dup) {
            throw new Error(`חשבונית זהה כבר קיימת לחודש זה (${UI.formatCurrency(dup.amount)}). לשמירה בכל זאת, שנה את הסכום או בטל.`);
          }
          await DB.invoices.add({ caseId, month, year, amount, commissionRate: rate, notes, source: 'manual' });
          UI.toast('חשבונית נשמרה', 'success');
        }
        UI.closeModal();
        await render();
      },
    });

    // After modal renders, populate cascade
    setTimeout(async () => {
      const clientSel = document.getElementById('f-inv-client');
      if (!clientSel) return;

      // Populate cases for initial client
      const populate = async (clientId) => {
        const caseList = clientId
          ? allCases.filter(c => c.clientId == clientId)
          : allCases;
        const sel = document.getElementById('f-inv-case');
        if (!sel) return;
        sel.innerHTML = '<option value="">בחר תיק…</option>' +
          caseList.map(c => `<option value="${c.id}" data-rate="${c.commissionRate}" ${inv && inv.caseId==c.id?'selected':''}>${c.caseNumber} — ${c.description}</option>`).join('');
        _onAmountChange();
      };

      await populate(clientSel.value);
      clientSel.addEventListener('change', (e) => populate(e.target.value));
    }, 80);
  }

  function _onCaseChange() {
    const caseEl = document.getElementById('f-inv-case');
    const rateEl = document.getElementById('f-inv-rate');
    if (!caseEl || !rateEl) return;
    const rate = parseFloat(caseEl.selectedOptions[0]?.dataset?.rate);
    if (!isNaN(rate)) rateEl.value = rate;
    _onAmountChange();
  }

  function _onAmountChange() {
    const amount = parseFloat(document.getElementById('f-inv-amount')?.value) || 0;
    const rate   = parseFloat(document.getElementById('f-inv-rate')?.value)   || 0;
    const prev   = document.getElementById('f-inv-commission-preview');
    if (prev) prev.textContent = amount > 0 ? UI.formatCurrency(+(amount*rate/100).toFixed(2)) : '—';
  }

  // ── Delete Invoice (with undo) ─────────────────────────
  async function deleteInvoice(invoiceId) {
    const rec = await DB.invoices.get(invoiceId);
    if (!rec) return;
    await DB.invoices.delete(invoiceId);
    await render();
    UI.toastUndo('חשבונית נמחקה', async () => {
      await DB.invoices.restore(rec);   // re-insert with original id
      await render();
      UI.toast('החשבונית שוחזרה', 'success');
    });
  }

  function escHtml(str) { return UI.esc(str); }

  return { init, render, openInvoiceModal, deleteInvoice, _onCaseChange, _onAmountChange };
})();

window.Invoices = Invoices;
