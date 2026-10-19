/**
 * invoices.js — LexLedger Invoices View
 * Displays invoice history with filters; manual add modal;
 * PDF dropzone is in the HTML (wired in import.js).
 */

const Invoices = (() => {

  let _filterYear   = new Date().getFullYear();
  let _filterClient = '';

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

    document.getElementById('btn-add-invoice').addEventListener('click', () => openInvoiceModal());

    await render();
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

    // Sort: year desc, month desc
    filtered.sort((a, b) => b.year - a.year || b.month - a.month);

    if (!filtered.length) {
      tbody.innerHTML = UI.emptyRow(9, 'אין חשבוניות להצגה');
      return;
    }

    let rows = '';
    let totalAmt = 0, totalComm = 0;

    filtered.forEach(inv => {
      const c       = caseMap[inv.caseId];
      const client  = c ? clientMap[c.clientId] : '—';
      totalAmt  += inv.amount;
      totalComm += inv.commission;

      rows += `<tr>
        <td style="font-weight:500;color:#e7e5e0;">${escHtml(client)}</td>
        <td style="font-family:'Inter',monospace;font-size:0.72rem;color:#9ca3af;font-weight:300;">${c ? escHtml(c.caseNumber) : '—'}</td>
        <td style="font-size:0.8rem;color:#9ca3af;">${UI.monthName(inv.month)}</td>
        <td style="font-family:'Inter',sans-serif;font-size:0.78rem;color:#9ca3af;font-weight:300;">${inv.year}</td>
        <td class="num" style="color:${inv.amount < 0 ? '#f87171' : '#e7e5e0'};font-weight:300;">${UI.formatNumber(inv.amount)}</td>
        <td class="num" style="color:#9ca3af;font-weight:300;">${UI.formatPct(inv.commissionRate)}</td>
        <td class="num" style="color:${inv.commission < 0 ? '#f87171' : '#f2ca50'};font-weight:400;">${UI.formatNumber(inv.commission)}</td>
        <td>${UI.sourceBadge(inv.source)}</td>
        <td style="text-align:left;">
          <button style="color:#4d4635;background:none;border:none;cursor:pointer;padding:4px;border-radius:4px;transition:all 0.2s;" onmouseover="this.style.color='#f2ca50'" onmouseout="this.style.color='#4d4635'" onclick="Invoices.openInvoiceModal(${inv.id})" title="ערוך"><span class="material-symbols-outlined" style="font-size:16px;">edit</span></button>
          <button style="color:#4d4635;background:none;border:none;cursor:pointer;padding:4px;border-radius:4px;transition:all 0.2s;" onmouseover="this.style.color='#f87171'" onmouseout="this.style.color='#4d4635'" onclick="Invoices.deleteInvoice(${inv.id})" title="מחק"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>
        </td>
      </tr>`;
    });

    rows += `<tr class="summary-row">
      <td colspan="4" style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;">סה"כ (${filtered.length} חשבוניות)</td>
      <td class="num" style="color:#e7e5e0;">${UI.formatNumber(totalAmt)}</td>
      <td></td>
      <td class="num" style="color:#f2ca50;">${UI.formatNumber(totalComm)}</td>
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
      { value: '__new__', label: '➕ לקוח חדש…' },
    ];

    const caseTypeOpts = ['שוטף', 'ליטיגציה', 'עסקה']
      .map(t => `<option value="${t}">${t}</option>`).join('');

    // Build client + case selects in the form
    // We'll do a custom bodyHTML here for the cascading select
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label" for="f-inv-client">לקוח *</label>
        <select id="f-inv-client" class="form-input" onchange="Invoices._onClientChange()">
          ${clientOptions.map(o => `<option value="${o.value}" ${inv && caseRec && caseRec.clientId == o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="f-inv-new-client-wrap" style="display:none">
        <label class="form-label" for="f-inv-nc-name">שם לקוח חדש *</label>
        <input type="text" id="f-inv-nc-name" class="form-input" placeholder="לדוגמה: ישראל ישראלי" />
      </div>
      <div class="form-group" id="f-inv-case-wrap">
        <label class="form-label" for="f-inv-case">תיק *</label>
        <select id="f-inv-case" class="form-input" onchange="Invoices._onCaseChange()">
          <option value="">בחר תיק…</option>
        </select>
      </div>
      <div id="f-inv-new-case-wrap" style="display:none">
        <div class="form-group">
          <label class="form-label" for="f-inv-ncse-number">מספר תיק *</label>
          <input type="text" id="f-inv-ncse-number" class="form-input" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label" for="f-inv-ncse-desc">תיאור</label>
            <input type="text" id="f-inv-ncse-desc" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label" for="f-inv-ncse-type">סוג תיק</label>
            <select id="f-inv-ncse-type" class="form-input">${caseTypeOpts}</select>
          </div>
        </div>
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
        <input type="number" id="f-inv-amount" class="form-input" value="${inv ? inv.amount : ''}" step="0.01" oninput="Invoices._onAmountChange()" />
        <small style="color:var(--text-muted);font-size:0.75rem;margin-top:4px">לחשבונית זיכוי הזן סכום שלילי (למשל -1500)</small>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-inv-rate">שיעור עמלה (%)</label>
        <input type="number" id="f-inv-rate" class="form-input" value="${inv ? inv.commissionRate : ''}" step="0.5" min="0" max="100" oninput="Invoices._onAmountChange()" />
        <small style="color:var(--text-muted);font-size:0.75rem;margin-top:4px">ממולא אוטומטית מהתיק; עבור לקוח/תיק חדש הזן את אחוז העמלה כאן</small>
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
        const clientVal = document.getElementById('f-inv-client').value;
        let   caseId = parseInt(document.getElementById('f-inv-case').value);
        const month  = parseInt(document.getElementById('f-inv-month').value);
        const year   = parseInt(document.getElementById('f-inv-year').value);
        const amount = parseFloat(document.getElementById('f-inv-amount').value);
        const rate   = parseFloat(document.getElementById('f-inv-rate').value);
        const notes  = document.getElementById('f-inv-notes').value.trim();

        if (!month||!year) throw new Error('יש לבחור חודש ושנה');
        if (!amount || isNaN(amount)) throw new Error('יש להזין סכום תקין (אפשר שלילי לזיכוי)');
        if (isNaN(rate))   throw new Error('יש להזין שיעור עמלה');

        // Create a new client + case, or a new case for an existing client
        const newCaseVal = document.getElementById('f-inv-case')?.value === '__new__';
        if (clientVal === '__new__' || newCaseVal) {
          const caseNumber = document.getElementById('f-inv-ncse-number').value.trim();
          const caseDesc   = document.getElementById('f-inv-ncse-desc').value.trim();
          const caseType   = document.getElementById('f-inv-ncse-type').value;
          if (!caseNumber) throw new Error('יש להזין מספר תיק לתיק החדש');
          if (await DB.cases.findByCaseNumber(caseNumber)) {
            throw new Error(`מספר התיק "${caseNumber}" כבר קיים. בחר אותו מהרשימה.`);
          }

          let clientId;
          if (clientVal === '__new__') {
            const newName = document.getElementById('f-inv-nc-name').value.trim();
            if (!newName) throw new Error('יש להזין שם ללקוח החדש');
            clientId = await DB.clients.add(newName);
          } else {
            clientId = parseInt(clientVal);
            if (!clientId) throw new Error('יש לבחור לקוח');
          }

          caseId = await DB.cases.add({
            clientId, caseNumber, description: caseDesc, caseType,
            commissionRate: rate, arrangementType: '', openDate: null,
          });
        }

        if (!caseId) throw new Error('יש לבחור תיק');

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
        await UI.populateClientSelect('invoice-filter-client', true);
        document.getElementById('invoice-filter-client').value = _filterClient;
        await render();
      },
    });

    // After modal renders, populate cascade
    setTimeout(async () => {
      const clientSel = document.getElementById('f-inv-client');
      if (!clientSel) return;

      // Populate cases for initial client
      const populate = async (clientId) => {
        if (clientId === '__new__') return;
        const caseList = clientId
          ? allCases.filter(c => c.clientId == clientId)
          : allCases;
        const sel = document.getElementById('f-inv-case');
        if (!sel) return;
        sel.innerHTML = '<option value="">בחר תיק…</option>' +
          caseList.map(c => `<option value="${c.id}" data-rate="${c.commissionRate}" ${inv && inv.caseId==c.id?'selected':''}>${c.caseNumber} — ${c.description}</option>`).join('') +
          (clientId ? '<option value="__new__">➕ תיק חדש…</option>' : '');
        _onAmountChange();
      };

      Invoices._populateCases = populate;
      await populate(clientSel.value);
      _onClientChange();
    }, 80);
  }

  // ── Show/hide new-client + new-case fields ─────────────
  function _onClientChange() {
    const clientVal  = document.getElementById('f-inv-client')?.value;
    const ncWrap     = document.getElementById('f-inv-new-client-wrap');
    const caseWrap   = document.getElementById('f-inv-case-wrap');
    const isNew      = clientVal === '__new__';

    if (ncWrap)   ncWrap.style.display   = isNew ? '' : 'none';
    if (caseWrap) caseWrap.style.display = isNew ? 'none' : '';

    if (isNew) {
      // New client always implies a new case
      const nccWrap = document.getElementById('f-inv-new-case-wrap');
      if (nccWrap) nccWrap.style.display = '';
    } else {
      if (Invoices._populateCases) Invoices._populateCases(clientVal);
      _onCaseChange();
    }
  }

  function _onCaseChange() {
    const caseEl = document.getElementById('f-inv-case');
    const rateEl = document.getElementById('f-inv-rate');
    if (!caseEl || !rateEl) return;

    const nccWrap = document.getElementById('f-inv-new-case-wrap');
    if (caseEl.value === '__new__') {
      if (nccWrap) nccWrap.style.display = '';
      rateEl.value = '';
      _onAmountChange();
      return;
    }
    if (nccWrap) nccWrap.style.display = 'none';

    const rate = parseFloat(caseEl.selectedOptions[0]?.dataset?.rate);
    if (!isNaN(rate)) rateEl.value = rate;
    _onAmountChange();
  }

  function _onAmountChange() {
    const amount = parseFloat(document.getElementById('f-inv-amount')?.value) || 0;
    const rate   = parseFloat(document.getElementById('f-inv-rate')?.value)   || 0;
    const prev   = document.getElementById('f-inv-commission-preview');
    if (prev) prev.textContent = amount !== 0 && !isNaN(amount) ? UI.formatCurrency(+(amount*rate/100).toFixed(2)) : '—';
  }

  // ── Delete Invoice ─────────────────────────────────────
  function deleteInvoice(invoiceId) {
    UI.confirm('האם למחוק חשבונית זו?', async () => {
      await DB.invoices.delete(invoiceId);
      UI.toast('חשבונית נמחקה', 'info');
      UI.closeModal();
      await render();
    });
  }

  function escHtml(str) { return UI.esc(str); }

  return { init, render, openInvoiceModal, deleteInvoice, _onClientChange, _onCaseChange, _onAmountChange };
})();

window.Invoices = Invoices;
