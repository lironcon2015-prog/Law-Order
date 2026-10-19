/**
 * ui.js — LexLedger UI Helpers
 * Design system: Tailwind + midnight/neutral/gold palette.
 * RTL Hebrew. No frameworks.
 *
 * Public API:
 *   UI.init()
 *   UI.toast(msg, type, duration)
 *   UI.confirm(msg, onConfirm)
 *   UI.openModal({ title, bodyHTML, confirmLabel, onConfirm, wide })
 *   UI.closeModal()
 *   UI.populateYearSelect(selectId, selectedYear)
 *   UI.populateClientSelect(selectId, withAll)
 *   UI.emptyRow(colspan, msg)
 *   UI.monthName(n)            // 1–12 → Hebrew
 *   UI.formatNumber(n)         // 1,234
 *   UI.formatCurrency(n)       // ₪1,234.56
 *   UI.formatPct(n)            // 25%
 *   UI.sourceBadge(source)     // HTML badge
 */

const UI = (() => {

  // ─── Month names ────────────────────────────────────────
  const MONTHS = [
    '', 'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
    'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
  ];
  const MONTHS_SHORT = [
    '', 'ינו','פבר','מרץ','אפר','מאי','יוני',
    'יול','אוג','ספט','אוק','נוב','דצמ',
  ];

  // short=true → ינו, פבר … (3-4 chars); short=false (default) → ינואר, פברואר …
  function monthName(n, short = false) {
    return (short ? MONTHS_SHORT[n] : MONTHS[n]) || String(n);
  }

  // ─── Formatters ──────────────────────────────────────────
  function formatNumber(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('he-IL');
  }

  function formatCurrency(n) {
    if (n == null || isNaN(n)) return '—';
    return '₪\u202F' + n.toLocaleString('he-IL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPct(n) {
    if (n == null || isNaN(n)) return '—';
    return n + '%';
  }

  // ─── Source Badge ────────────────────────────────────────
  const SOURCE_META = {
    pdf:    { label: 'PDF',    style: 'color:#86dfff;background:rgba(134,223,255,0.08);border:1px solid rgba(134,223,255,0.20);', icon: 'picture_as_pdf' },
    manual: { label: 'ידני',  style: 'color:#9ca3af;background:rgba(255,255,255,0.04);border:1px dashed rgba(255,255,255,0.15);', icon: 'edit_note' },
    import: { label: 'ייבוא', style: 'color:#f2ca50;background:rgba(242,202,80,0.10);border:1px solid rgba(242,202,80,0.25);',     icon: 'upload_file' },
  };

  function sourceBadge(source) {
    const m = SOURCE_META[source] || SOURCE_META.manual;
    return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style="${m.style}font-family:'Assistant',sans-serif;">
      <span class="material-symbols-outlined" style="font-size:12px;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 16;">${m.icon}</span>
      ${m.label}
    </span>`;
  }

  // ─── Empty Row ───────────────────────────────────────────
  function emptyRow(colspan, msg = 'אין נתונים להצגה') {
    return `<tr>
      <td colspan="${colspan}" class="py-16 text-center" style="background:transparent;">
        <div class="flex flex-col items-center gap-2" style="color:#9ca3af;">
          <span class="material-symbols-outlined" style="font-size:40px;color:#4d4635;font-variation-settings:'FILL' 0,'wght' 200,'GRAD' 0,'opsz' 24;">inbox</span>
          <span style="font-size:0.82rem;font-family:'Assistant',sans-serif;color:#6b7280;">${msg}</span>
        </div>
      </td>
    </tr>`;
  }

  // ─── Populate Year Select ────────────────────────────────
  async function populateYearSelect(selectId, selectedYear) {
    const el = document.getElementById(selectId);
    if (!el) return;

    let years = [];
    try { years = await DB.settings.getKnownYears(); } catch (_) {}

    const current = new Date().getFullYear();
    if (!years.includes(current))     years.unshift(current);
    if (!years.includes(current - 1)) years.push(current - 1);
    years = [...new Set(years)].sort((a, b) => b - a);

    el.innerHTML = years
      .map(y => `<option value="${y}" ${y == selectedYear ? 'selected' : ''}>${y}</option>`)
      .join('');
  }

  // ─── Populate Client Select ──────────────────────────────
  async function populateClientSelect(selectId, withAll = false) {
    const el = document.getElementById(selectId);
    if (!el) return;

    let clients = [];
    try { clients = await DB.clients.getAll(); } catch (_) {}

    const placeholder = withAll ? '<option value="">כל הלקוחות</option>' : '<option value="">בחר לקוח…</option>';
    el.innerHTML = placeholder + clients
      .map(c => `<option value="${c.id}">${_esc(c.name)}</option>`)
      .join('');
  }

  // ─── Toast ───────────────────────────────────────────────
  const TOAST_ICONS = {
    success: { icon: 'check_circle', color: '#34d399' },
    error:   { icon: 'error',        color: '#f87171' },
    info:    { icon: 'info',         color: '#f2ca50' },
    warning: { icon: 'warning',      color: '#fbbf24' },
  };

  function toast(msg, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const meta = TOAST_ICONS[type] || TOAST_ICONS.info;
    const id   = 'toast-' + Date.now();

    const el = document.createElement('div');
    el.id = id;
    el.style.cssText = `
      display:flex;align-items:flex-start;gap:10px;
      padding:12px 16px;border-radius:14px;
      background:rgba(31,31,33,0.92);
      border:1px solid rgba(255,255,255,0.08);
      backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
      box-shadow:0 16px 40px rgba(0,0,0,0.5);
      min-width:240px;max-width:360px;
      opacity:0;transform:translateX(-12px);
      transition:opacity 0.28s,transform 0.28s;
      border-right:3px solid ${meta.color};
    `.replace(/\s+/g, ' ').trim();

    el.innerHTML = `
      <span class="material-symbols-outlined flex-shrink-0" style="font-size:18px;color:${meta.color};margin-top:1px;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;">${meta.icon}</span>
      <span style="flex:1;font-size:0.83rem;font-family:'Assistant',sans-serif;color:#e7e5e0;line-height:1.45;">${msg}</span>
      <button onclick="document.getElementById('${id}')?.remove()" style="color:#6b7280;background:none;border:none;cursor:pointer;flex-shrink:0;margin-top:1px;">
        <span class="material-symbols-outlined" style="font-size:16px;">close</span>
      </button>
    `;

    container.appendChild(el);

    // Animate in (must use inline style — cssText above sets opacity:0 inline,
    // class-based opacity-100 can't override inline specificity)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(0)';
      });
    });

    // Auto-dismiss
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-12px)';
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, duration);
  }

  // ─── Modal ───────────────────────────────────────────────
  let _onConfirmFn = null;

  /**
   * openModal({ title, bodyHTML, confirmLabel, onConfirm, wide })
   *   wide: bool — use max-w-2xl instead of max-w-md
   */
  function openModal({ title, bodyHTML = '', confirmLabel = 'שמור', onConfirm = null, wide = false } = {}) {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');
    const titleEl = document.getElementById('modal-title');
    const bodyEl  = document.getElementById('modal-body');
    const confirmBtn = document.getElementById('modal-confirm');

    if (!overlay || !modal) return;

    titleEl.textContent = title || '';
    bodyEl.innerHTML    = bodyHTML;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.disabled    = false;

    // Reset confirm button to primary gold (not red)
    confirmBtn.style.background = '#f2ca50';
    confirmBtn.style.color      = '#131315';
    confirmBtn.style.boxShadow  = '0 0 20px rgba(242,202,80,0.3)';

    // Wide variant
    modal.classList.toggle('max-w-2xl', !!wide);
    modal.classList.toggle('max-w-md',  !wide);

    // Store callback
    _onConfirmFn = onConfirm;

    // Show
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.classList.remove('scale-95', 'opacity-0');
        modal.classList.add('scale-100', 'opacity-100');
      });
    });

    // Focus first input after a beat
    setTimeout(() => {
      const first = modal.querySelector('input:not([type=hidden]),select,textarea');
      first?.focus();
    }, 120);
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');
    if (!overlay) return;

    modal?.classList.add('scale-95', 'opacity-0');
    modal?.classList.remove('scale-100', 'opacity-100');

    setTimeout(() => {
      overlay.classList.add('hidden');
      _onConfirmFn = null;
    }, 200);
  }

  // ─── Confirm dialog (reuses generic modal) ───────────────
  function confirm(msg, onConfirm) {
    openModal({
      title: 'אישור פעולה',
      bodyHTML: `
        <div class="flex items-start gap-3 py-1">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(248,113,113,0.10);border:1px solid rgba(248,113,113,0.25);">
            <span class="material-symbols-outlined" style="font-size:20px;color:#f87171;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;">warning</span>
          </div>
          <p style="color:#d1d5db;font-size:0.875rem;line-height:1.55;padding-top:6px;">${msg}</p>
        </div>`,
      confirmLabel: 'אשר',
      onConfirm,
    });

    const btn = document.getElementById('modal-confirm');
    if (btn) {
      btn.style.background = '#f87171';
      btn.style.color = '#131315';
      btn.style.boxShadow = '0 0 20px rgba(248,113,113,0.4)';
    }
  }

  // ─── Wire modal buttons ───────────────────────────────────
  function _wireModal() {
    // Close
    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal-cancel')?.addEventListener('click', closeModal);

    // Click outside
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // Confirm
    document.getElementById('modal-confirm')?.addEventListener('click', async () => {
      if (!_onConfirmFn) { closeModal(); return; }
      const btn = document.getElementById('modal-confirm');
      try {
        btn.disabled    = true;
        btn.textContent = '⏳ שומר…';
        await _onConfirmFn();
      } catch (err) {
        toast(err.message || 'שגיאה בשמירה', 'error');
      } finally {
        if (btn) {
          btn.disabled    = false;
          btn.textContent = btn.dataset.label || 'שמור';
        }
      }
    });

    // Keep original confirm label for error recovery
    const confirmBtn = document.getElementById('modal-confirm');
    if (confirmBtn) {
      const obs = new MutationObserver(() => {
        if (confirmBtn.textContent && confirmBtn.textContent !== '⏳ שומר…') {
          confirmBtn.dataset.label = confirmBtn.textContent;
        }
      });
      obs.observe(confirmBtn, { childList: true, characterData: true, subtree: true });
    }

    // PDF modal close
    document.getElementById('pdf-modal-close')?.addEventListener('click', _closePdfModal);
    document.getElementById('pdf-modal-cancel')?.addEventListener('click', _closePdfModal);
    document.getElementById('pdf-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) _closePdfModal();
    });

    // Keyboard: Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const pdfVisible = !document.getElementById('pdf-modal-overlay')?.classList.contains('hidden');
        if (pdfVisible) { _closePdfModal(); return; }
        const modalVisible = !document.getElementById('modal-overlay')?.classList.contains('hidden');
        if (modalVisible) closeModal();
      }
    });
  }

  function _closePdfModal() {
    const overlay = document.getElementById('pdf-modal-overlay');
    const modal   = document.getElementById('pdf-modal');
    if (!overlay) return;
    modal?.classList.add('scale-95', 'opacity-0');
    modal?.classList.remove('scale-100', 'opacity-100');
    setTimeout(() => overlay.classList.add('hidden'), 200);
  }

  // ─── Shared HTML snippet: form row ───────────────────────
  /**
   * Build a labelled form field HTML string.
   * type: 'text' | 'number' | 'select' | 'textarea'
   * opts.options: [{ value, label }] for select
   * opts.hint: small helper text
   */
  function formField({ id, label, type = 'text', value = '', required = false, opts = {} }) {
    const baseInput = `
      block w-full rounded-xl
      px-4 py-3 text-sm font-medium
      focus:outline-none transition-colors
    `.replace(/\s+/g, ' ').trim();
    const baseStyle = `border:1px solid rgba(255,255,255,0.10);background:#1b1b1d;color:#e4e2e4;font-family:'Assistant',sans-serif;`;

    let input;
    if (type === 'select') {
      const options = (opts.options || [])
        .map(o => `<option value="${_esc(o.value)}" ${o.value == value ? 'selected' : ''}>${_esc(o.label)}</option>`)
        .join('');
      input = `<select id="${id}" class="${baseInput}" style="${baseStyle}cursor:pointer;">${options}</select>`;
    } else if (type === 'textarea') {
      input = `<textarea id="${id}" class="${baseInput}" style="${baseStyle}" rows="3">${_esc(value)}</textarea>`;
    } else {
      const extra = type === 'number'
        ? `step="${opts.step || 'any'}" min="${opts.min ?? ''}" max="${opts.max ?? ''}"`
        : '';
      input = `<input type="${type}" id="${id}" class="${baseInput}" style="${baseStyle}" value="${_esc(value)}"
        placeholder="${_esc(opts.placeholder || '')}" ${extra} />`;
    }

    const hint = opts.hint
      ? `<p style="margin-top:6px;font-size:0.75rem;color:#9ca3af;line-height:1.4;">${opts.hint}</p>`
      : '';

    return `
      <div class="form-group">
        <label for="${id}" style="font-size:0.74rem;font-weight:700;color:#c9c5be;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">
          ${label}${required ? ' <span style="color:#f87171;">*</span>' : ''}
        </label>
        ${input}
        ${hint}
      </div>`;
  }

  // ─── Table helpers ────────────────────────────────────────

  /** Standard <td> for monetary values */
  function tdNum(val, { positive = false, gold = false, negative = false } = {}) {
    let color = '#e7e5e0';
    if (positive)  color = '#34d399';
    else if (gold) color = '#f2ca50';
    else if (negative) color = '#f87171';
    return `<td class="num" style="padding:14px 20px;color:${color};font-weight:500;">${val}</td>`;
  }

  /** Standard <td> for regular text */
  function tdText(val, cls = '') {
    return `<td style="padding:14px 20px;font-size:0.875rem;color:#e7e5e0;" class="${cls}">${val}</td>`;
  }

  /** Summary/total row */
  function summaryRow(cells) {
    const tds = cells.map((c) => {
      const num = typeof c === 'object' && c.num;
      const v   = typeof c === 'object' ? c.v : c;
      return num
        ? `<td class="num" style="padding:14px 20px;font-weight:700;color:#fff;">${v}</td>`
        : `<td style="padding:14px 20px;font-size:0.875rem;font-weight:700;color:#fff;">${v}</td>`;
    }).join('');
    return `<tr class="summary-row" style="background:rgba(242,202,80,0.04);border-top:1px solid rgba(242,202,80,0.2);">${tds}</tr>`;
  }

  // ─── Escape HTML ──────────────────────────────────────────
  function _esc(str) {
    return (str ?? '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    _wireModal();
  }

  // ─── Public ───────────────────────────────────────────────
  return {
    init,
    // Formatters
    monthName,
    formatNumber,
    formatCurrency,
    formatPct,
    // Badges & rows
    sourceBadge,
    emptyRow,
    tdNum,
    tdText,
    summaryRow,
    formField,
    // Selects
    populateYearSelect,
    populateClientSelect,
    // Toast & modals
    toast,
    confirm,
    openModal,
    closeModal,
    // HTML escaping (shared — avoids duplicate escHtml in every module)
    esc: _esc,
  };

})();

window.UI = UI;
