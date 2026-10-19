/**
 * clients.js — LexLedger Clients & Cases View
 * Accordion-style client cards, inline cases table,
 * CRUD for both clients and cases.
 */

const Clients = (() => {

  // ── buildForm helper (UI.formField wrapper for arrays) ──
  function buildForm(fields) {
    return fields.map(f => {
      const esc = s => (s || '').toString().replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (f.type === 'select') {
        const opts = (f.options || []).map(o =>
          `<option value="${esc(o.value)}" ${String(f.value) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`
        ).join('');
        return `<div class="form-group">
          <label class="form-label" for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
          <select id="${f.id}" class="form-input">${opts}</select>
        </div>`;
      }
      return `<div class="form-group">
        <label class="form-label" for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
        <input type="${f.type || 'text'}" id="${f.id}" class="form-input"
          value="${esc(f.value?.toString() ?? '')}"
          ${f.required ? 'required' : ''}
          ${f.step  !== undefined ? `step="${f.step}"` : ''}
          ${f.min   !== undefined ? `min="${f.min}"`   : ''}
          ${f.max   !== undefined ? `max="${f.max}"`   : ''}
          ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} />
      </div>`;
    }).join('');
  }

  // ── Init ───────────────────────────────────────────────
  function init() {
    document.getElementById('btn-add-client').addEventListener('click', () => openClientModal());
    document.getElementById('btn-merge-clients').addEventListener('click', () => openMergeModal());

    // Live search
    document.getElementById('clients-search')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('#clients-list [data-client-id]').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = !q || text.includes(q) ? '' : 'none';
      });
    });

    render();
  }

  // ── Render ─────────────────────────────────────────────
  async function render() {
    const container = document.getElementById('clients-list');
    if (!container) return;

    const [clients, allCases] = await Promise.all([
      DB.clients.getAll(),
      DB.cases.getAll(),
    ]);

    if (!clients.length) {
      container.innerHTML = `
        <div class="onboarding-hint">
          <span class="oh-icon">◉</span>
          <p class="oh-title">אין לקוחות עדיין</p>
          <p>התחל בייבוא קובץ Excel או הוסף לקוח ידנית.</p>
          <button class="btn-primary oh-action" onclick="App.navigate('import')">מעבר לייבוא</button>
        </div>`;
      return;
    }

    // Group cases by clientId
    const casesByClient = {};
    allCases.forEach(c => {
      if (!casesByClient[c.clientId]) casesByClient[c.clientId] = [];
      casesByClient[c.clientId].push(c);
    });

    container.innerHTML = clients.map(client => {
      const cases = casesByClient[client.id] || [];
      return buildClientCard(client, cases);
    }).join('');
    // Note: accordion toggle is handled natively by <details>/<summary> elements.
    // No JS click wiring needed.
  }

  // ── Case type badge ────────────────────────────────────
  const CASE_TYPE_BADGE = {
    'ליטיגציה': 'background:rgba(190,18,60,0.07);color:#f87171;',
    'עסקה':     'background:rgba(124,58,237,0.07);color:#c084fc;',
    'שוטף':     'background:rgba(29,78,216,0.07);color:#86dfff;',
  };

  function caseTypeBadge(type) {
    const s = CASE_TYPE_BADGE[type] || 'background:rgba(255,255,255,0.05);color:#9ca3af;';
    return `<span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:0.7rem;font-weight:700;${s}">${escHtml(type || '—')}</span>`;
  }

  // ── Avatar initials + color ────────────────────────────
  const AVATAR_STYLES = [
    'background:rgba(134,223,255,0.10);color:#86dfff;border:1px solid rgba(134,223,255,0.22);',
    'background:rgba(52,211,153,0.10);color:#34d399;border:1px solid rgba(52,211,153,0.22);',
    'background:rgba(242,202,80,0.12);color:#f2ca50;border:1px solid rgba(242,202,80,0.28);',
    'background:rgba(192,132,252,0.10);color:#c084fc;border:1px solid rgba(192,132,252,0.22);',
    'background:rgba(248,113,113,0.10);color:#f87171;border:1px solid rgba(248,113,113,0.22);',
    'background:rgba(251,191,36,0.10);color:#fbbf24;border:1px solid rgba(251,191,36,0.22);',
  ];

  function avatarStyle(name) {
    const idx = (name.charCodeAt(0) || 0) % AVATAR_STYLES.length;
    return AVATAR_STYLES[idx];
  }

  // ── Build Client Card HTML ─────────────────────────────
  function buildClientCard(client, cases) {
    const initial = (client.name || '?')[0].toUpperCase();
    const activeCases = cases.length;

    const casesHTML = cases.length
      ? `<div style="overflow-x:auto;border-radius:12px;border:1px solid rgba(255,255,255,0.10);background:rgba(31,31,33,0.4);">
          <table class="w-full text-right data-table" style="font-size:0.83rem;">
            <thead style="background:rgba(255,255,255,0.03);">
              <tr>
                <th style="padding:9px 14px;font-size:0.68rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;text-align:right;border-bottom:1px solid rgba(255,255,255,0.06);">מספר תיק</th>
                <th style="padding:9px 14px;font-size:0.68rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;text-align:right;border-bottom:1px solid rgba(255,255,255,0.06);">תיאור</th>
                <th style="padding:9px 14px;font-size:0.68rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;text-align:right;border-bottom:1px solid rgba(255,255,255,0.06);">סוג</th>
                <th style="padding:9px 14px;font-size:0.68rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;text-align:right;border-bottom:1px solid rgba(255,255,255,0.06);">% עמלה</th>
                <th style="padding:9px 14px;font-size:0.68rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;text-align:right;border-bottom:1px solid rgba(255,255,255,0.06);">הסדר</th>
                <th style="padding:9px 14px;font-size:0.68rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;text-align:right;border-bottom:1px solid rgba(255,255,255,0.06);">תאריך פתיחה</th>
                <th style="padding:9px 14px;border-bottom:1px solid rgba(255,255,255,0.06);"></th>
              </tr>
            </thead>
            <tbody>
              ${cases.map(c => buildCaseRow(c)).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;">
          <button onclick="Clients.openClientModal(${client.id})"
            style="display:inline-flex;align-items:center;gap:4px;font-size:0.8rem;font-weight:500;color:#9ca3af;cursor:pointer;border:none;background:none;transition:color 0.12s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#9ca3af'">
            <span class="material-symbols-outlined" style="font-size:15px;">edit</span> ערוך לקוח
          </button>
          <div style="display:flex;align-items:center;gap:10px;">
            <button onclick="Clients.deleteClient(${client.id}, '${escHtml(client.name)}')"
              style="display:inline-flex;align-items:center;gap:4px;font-size:0.8rem;font-weight:500;color:#fca5a5;cursor:pointer;border:none;background:none;transition:color 0.12s;" onmouseover="this.style.color='#f87171'" onmouseout="this.style.color='#fca5a5'">
              <span class="material-symbols-outlined" style="font-size:15px;">delete</span> מחק
            </button>
            <button onclick="Clients.openCaseModal(${client.id})"
              style="display:inline-flex;align-items:center;gap:4px;font-size:0.82rem;font-weight:600;color:#86dfff;cursor:pointer;border:none;background:none;transition:opacity 0.12s;" onmouseover="this.style.opacity='0.75'" onmouseout="this.style.opacity='1'">
              <span class="material-symbols-outlined" style="font-size:15px;">add</span> הוסף תיק
            </button>
          </div>
        </div>`
      : `<p style="font-size:0.82rem;color:#9ca3af;padding:12px 0;">אין תיקים ללקוח זה.</p>
         <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
          <button onclick="Clients.openClientModal(${client.id})"
            style="display:inline-flex;align-items:center;gap:4px;font-size:0.8rem;font-weight:500;color:#9ca3af;cursor:pointer;border:none;background:none;">
            <span class="material-symbols-outlined" style="font-size:15px;">edit</span> ערוך לקוח
          </button>
          <button onclick="Clients.openCaseModal(${client.id})"
            style="display:inline-flex;align-items:center;gap:4px;font-size:0.82rem;font-weight:600;color:#86dfff;cursor:pointer;border:none;background:none;">
            <span class="material-symbols-outlined" style="font-size:15px;">add</span> הוסף תיק
          </button>
        </div>`;

    return `
      <details class="group" style="background:rgba(42,42,44,0.40);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:18px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.25);transition:border-color 0.2s, transform 0.2s;" onmouseover="this.style.borderColor='rgba(242,202,80,0.3)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'" data-client-id="${client.id}">
        <summary style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:16px 20px;transition:background 0.12s;list-style:none;" class="select-none [&::-webkit-details-marker]:hidden" onmouseover="this.style.background='rgba(242,202,80,0.04)'" onmouseout="this.style.background=''">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:'Rubik',sans-serif;font-weight:700;font-size:1rem;flex-shrink:0;${avatarStyle(client.name)}">
              ${initial}
            </div>
            <div>
              <h3 style="font-family:'Rubik',sans-serif;font-weight:700;font-size:0.95rem;color:#e7e5e0;letter-spacing:-0.01em;">${escHtml(client.name)}</h3>
              <p style="font-size:0.75rem;color:#9ca3af;margin-top:1px;">${activeCases} תיקים</p>
            </div>
          </div>
          <span class="material-symbols-outlined group-open:rotate-180 transition-transform duration-200" style="font-size:18px;color:#9ca3af;">expand_more</span>
        </summary>
        <div style="border-top:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.03);padding:16px 20px;">
          ${casesHTML}
        </div>
      </details>`;
  }

  function buildCaseRow(c) {
    return `<tr data-case-id="${c.id}" style="border-bottom:1px solid rgba(255,255,255,0.05);" onmouseover="this.style.background='rgba(242,202,80,0.04)'" onmouseout="this.style.background=''">
      <td style="padding:10px 14px;font-family:'Inter',monospace;font-size:0.8rem;color:#d1d5db;font-weight:600;">${escHtml(c.caseNumber)}</td>
      <td style="padding:10px 14px;font-size:0.82rem;color:#9ca3af;">${escHtml(c.description)}</td>
      <td style="padding:10px 14px;">${caseTypeBadge(c.caseType)}</td>
      <td style="padding:10px 14px;font-family:'Inter',sans-serif;font-size:0.82rem;color:#d1d5db;">${UI.formatPct(c.commissionRate)}</td>
      <td style="padding:10px 14px;font-size:0.82rem;color:#9ca3af;">${escHtml(c.arrangementType)}</td>
      <td style="padding:10px 14px;font-family:'Inter',sans-serif;font-size:0.78rem;color:#9ca3af;">${c.openDate || '—'}</td>
      <td style="padding:10px 14px;text-align:left;">
        <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;">
          <button onclick="Clients.openCaseModal(${c.clientId}, ${c.id})" title="ערוך תיק"
            style="color:#9ca3af;background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;transition:color 0.12s,background 0.12s;" onmouseover="this.style.color='#86dfff';this.style.background='rgba(134,223,255,0.08)'" onmouseout="this.style.color='#9ca3af';this.style.background='none'">
            <span class="material-symbols-outlined" style="font-size:17px;">edit</span>
          </button>
          <button onclick="Clients.deleteCase(${c.id}, '${escHtml(c.caseNumber)}')" title="מחק תיק"
            style="color:#9ca3af;background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;transition:color 0.12s,background 0.12s;" onmouseover="this.style.color='#f87171';this.style.background='rgba(248,113,113,0.10)'" onmouseout="this.style.color='#9ca3af';this.style.background='none'">
            <span class="material-symbols-outlined" style="font-size:17px;">delete</span>
          </button>
        </div>
      </td>
    </tr>`;
  }

  // ── Client Modal ───────────────────────────────────────
  async function openClientModal(clientId = null) {
    let client = null;
    if (clientId) client = await DB.clients.get(clientId);

    const bodyHTML = buildForm([
      {
        id: 'f-client-name', label: 'שם לקוח', type: 'text',
        value: client ? client.name : '', required: true,
      },
    ]);

    UI.openModal({
      title:        clientId ? 'עריכת לקוח' : 'לקוח חדש',
      bodyHTML,
      confirmLabel: clientId ? 'שמור שינויים' : 'צור לקוח',
      onConfirm: async () => {
        const name = document.getElementById('f-client-name').value.trim();
        if (!name) throw new Error('יש להזין שם לקוח');

        if (clientId) {
          await DB.clients.update({ ...client, name });
          UI.toast('לקוח עודכן', 'success');
        } else {
          await DB.clients.add(name);
          UI.toast('לקוח נוצר', 'success');
        }
        UI.closeModal();
        await render();
      },
    });

    setTimeout(() => document.getElementById('f-client-name')?.focus(), 60);
  }

  // ── Delete Client ──────────────────────────────────────
  function deleteClient(clientId, name) {
    UI.confirm(
      `האם למחוק את הלקוח <strong>${name}</strong> וכל התיקים המשויכים?<br><small style="color:var(--color-negative)">פעולה זו אינה הפיכה.</small>`,
      async () => {
        // Delete all cases + their invoices
        const cases = await DB.cases.getByClient(clientId);
        for (const c of cases) {
          const invs = await DB.invoices.getByCase(c.id);
          for (const inv of invs) await DB.invoices.delete(inv.id);
          await DB.cases.delete(c.id);
        }
        await DB.clients.delete(clientId);
        UI.toast('לקוח נמחק', 'info');
        UI.closeModal();
        await render();
      }
    );
  }

  // ── Case Modal ─────────────────────────────────────────
  async function openCaseModal(clientId, caseId = null) {
    let caseRec = null;
    if (caseId) caseRec = await DB.cases.get(caseId);

    const bodyHTML = buildForm([
      {
        id: 'f-case-number', label: 'מספר תיק', type: 'text',
        value: caseRec ? caseRec.caseNumber : '', required: true,
      },
      {
        id: 'f-case-desc', label: 'תיאור / שם התיק', type: 'text',
        value: caseRec ? caseRec.description : '',
      },
      {
        id: 'f-case-type', label: 'סוג תיק', type: 'select',
        value: caseRec ? caseRec.caseType : 'שוטף',
        options: [
          { value: 'שוטף',     label: 'שוטף' },
          { value: 'ליטיגציה', label: 'ליטיגציה' },
          { value: 'עסקה',     label: 'עסקה' },
        ],
      },
      {
        id: 'f-case-rate', label: 'שיעור עמלה (%)', type: 'number',
        value: caseRec ? caseRec.commissionRate : '', required: true,
        step: '0.5', min: '0', max: '100',
      },
      {
        id: 'f-case-arrangement', label: 'סוג הסדר', type: 'text',
        value: caseRec ? caseRec.arrangementType : '',
      },
      {
        id: 'f-case-opendate', label: 'תאריך פתיחה', type: 'date',
        value: caseRec ? (caseRec.openDate || '') : '',
      },
    ]);

    UI.openModal({
      title:        caseId ? 'עריכת תיק' : 'תיק חדש',
      bodyHTML,
      confirmLabel: caseId ? 'שמור שינויים' : 'צור תיק',
      onConfirm: async () => {
        const caseNumber = document.getElementById('f-case-number').value.trim();
        const desc       = document.getElementById('f-case-desc').value.trim();
        const caseType   = document.getElementById('f-case-type').value;
        const rate       = parseFloat(document.getElementById('f-case-rate').value);
        const arrType    = document.getElementById('f-case-arrangement').value.trim();
        const openDate   = document.getElementById('f-case-opendate').value || null;

        if (!caseNumber)   throw new Error('יש להזין מספר תיק');
        if (isNaN(rate))   throw new Error('יש להזין שיעור עמלה תקין');

        if (caseId) {
          await DB.cases.update({
            ...caseRec,
            caseNumber, description: desc, caseType,
            commissionRate: rate, arrangementType: arrType, openDate,
          });
          UI.toast('תיק עודכן', 'success');
        } else {
          await DB.cases.add({
            clientId, caseNumber, description: desc, caseType,
            commissionRate: rate, arrangementType: arrType, openDate,
          });
          UI.toast('תיק נוצר', 'success');
        }
        UI.closeModal();
        await render();
      },
    });

    setTimeout(() => document.getElementById('f-case-number')?.focus(), 60);
  }

  // ── Delete Case ────────────────────────────────────────
  function deleteCase(caseId, caseNumber) {
    UI.confirm(
      `האם למחוק את התיק <strong>${caseNumber}</strong>?<br><small style="color:var(--color-negative)">כל החשבוניות של תיק זה יימחקו.</small>`,
      async () => {
        const invs = await DB.invoices.getByCase(caseId);
        for (const inv of invs) await DB.invoices.delete(inv.id);
        await DB.cases.delete(caseId);
        UI.toast('תיק נמחק', 'info');
        UI.closeModal();
        await render();
      }
    );
  }

  // ── Merge Clients Modal ────────────────────────────────
  async function openMergeModal() {
    const allClients = await DB.clients.getAll();

    if (allClients.length < 2) {
      UI.toast('נדרשים לפחות שני לקוחות למיזוג', 'warning');
      return;
    }

    const checkboxes = allClients.map(c => `
      <label class="merge-client-option" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;">
        <input type="checkbox" name="merge-client" value="${c.id}" style="width:16px;height:16px;accent-color:var(--color-gold);cursor:pointer;" />
        <span style="font-size:0.92rem">${escHtml(c.name)}</span>
      </label>`
    ).join('');

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">בחר לקוחות למיזוג *</label>
        <div id="merge-clients-list" style="border:1px solid var(--border-color);border-radius:8px;padding:8px;max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;background:var(--bg-secondary);">
          ${checkboxes}
        </div>
        <small style="color:var(--text-muted);font-size:0.75rem;margin-top:6px;display:block">
          כל התיקים של הלקוחות הנבחרים יועברו ללקוח המאוחד. הלקוחות הישנים יימחקו.
        </small>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-merge-name">שם הלקוח המאוחד *</label>
        <input type="text" id="f-merge-name" class="form-input" placeholder="לדוגמה: ישראל ישראלי" />
      </div>
      <div id="merge-preview" style="display:none;background:var(--bg-secondary);border-radius:8px;padding:12px;margin-top:4px;font-size:0.83rem;color:var(--text-secondary);border:1px solid var(--border-color)">
        <strong style="color:var(--text-primary);display:block;margin-bottom:6px">תצוגה מקדימה:</strong>
        <div id="merge-preview-content"></div>
      </div>`;

    UI.openModal({
      title: 'מיזוג לקוחות',
      bodyHTML,
      confirmLabel: 'בצע מיזוג',
      wide: true,
      onConfirm: async () => {
        const selected = [...document.querySelectorAll('input[name="merge-client"]:checked')]
          .map(el => parseInt(el.value));
        const newName = document.getElementById('f-merge-name').value.trim();

        if (selected.length < 2) throw new Error('יש לבחור לפחות 2 לקוחות למיזוג');
        if (!newName)             throw new Error('יש להזין שם ללקוח המאוחד');

        await performMerge(selected, newName);
      },
    });

    // Wire live preview
    setTimeout(() => {
      const updatePreview = () => {
        const selected = [...document.querySelectorAll('input[name="merge-client"]:checked')]
          .map(el => parseInt(el.value));
        const preview  = document.getElementById('merge-preview');
        const content  = document.getElementById('merge-preview-content');
        const newName  = document.getElementById('f-merge-name')?.value.trim();
        if (!preview || !content) return;

        if (selected.length >= 2) {
          const names = selected.map(id => {
            const c = allClients.find(x => x.id === id);
            return c ? escHtml(c.name) : '?';
          });
          preview.style.display = 'block';
          content.innerHTML = `
            <div style="margin-bottom:4px">${names.join(' &nbsp;+&nbsp; ')}</div>
            <div style="margin:4px 0;color:var(--text-muted)">↓</div>
            <div style="color:var(--color-gold);font-weight:600">${escHtml(newName) || '(שם לקוח חדש)'}</div>`;
        } else {
          preview.style.display = 'none';
        }
      };

      document.querySelectorAll('input[name="merge-client"]').forEach(el =>
        el.addEventListener('change', updatePreview)
      );
      document.getElementById('f-merge-name')?.addEventListener('input', updatePreview);
      document.getElementById('f-merge-name')?.focus();
    }, 80);
  }

  async function performMerge(clientIds, newClientName) {
    // 1. Create new merged client
    const newClientId = await DB.clients.add(newClientName);

    // 2. Reassign all cases from selected clients to new client
    const allCases = await DB.cases.getAll();
    for (const c of allCases) {
      if (clientIds.includes(c.clientId)) {
        await DB.cases.update({ ...c, clientId: newClientId });
      }
    }

    // 3. Delete the old clients
    for (const id of clientIds) {
      await DB.clients.delete(id);
    }

    UI.toast(`${clientIds.length} לקוחות אוחדו בהצלחה תחת "${newClientName}"`, 'success');
    UI.closeModal();
    await render();
  }

  function escHtml(str) { return UI.esc(str); }

  return { init, render, openClientModal, openCaseModal, deleteClient, deleteCase, openMergeModal };
})();

window.Clients = Clients;
