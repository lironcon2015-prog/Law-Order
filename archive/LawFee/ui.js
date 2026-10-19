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
    pdf:    { label: 'PDF',    style: 'color:#1D4ED8;background:rgba(29,78,216,0.07);border:1px solid rgba(29,78,216,0.15);',    icon: 'picture_as_pdf' },
    manual: { label: 'ידני',  style: 'color:#6B7280;background:#F9FAFB;border:1px dashed #E5E7EB;', icon: 'edit_note' },
    import: { label: 'ייבוא', style: 'color:#065f46;background:rgba(5,150,105,0.07);border:1px solid rgba(5,150,105,0.15);',  icon: 'upload_file' },
  };

  function sourceBadge(source) {
    const m = SOURCE_META[source] || SOURCE_META.manual;
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold" style="${m.style}font-family:'Assistant',sans-serif;">
      <span class="material-symbols-outlined" style="font-size:12px;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 16;">${m.icon}</span>
      ${m.label}
    </span>`;
  }

  // ─── Empty Row ───────────────────────────────────────────
  function emptyRow(colspan, msg = 'אין נתונים להצגה') {
    return `<tr>
      <td colspan="${colspan}" class="py-16 text-center">
        <div class="flex flex-col items-center gap-2" style="color:#9CA3AF;">
          <span class="material-symbols-outlined" style="font-size:36px;color:#D1D5DB;font-variation-settings:'FILL' 0,'wght' 200,'GRAD' 0,'opsz' 24;">inbox</span>
          <span style="font-size:0.82rem;font-family:'Assistant',sans-serif;">${msg}</span>
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
    success: { icon: 'check_circle', color: '#059669' },
    error:   { icon: 'error',        color: '#DC2626' },
    info:    { icon: 'info',         color: '#1D4ED8' },
    warning: { icon: 'warning',      color: '#D97706' },
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
      padding:11px 14px;border-radius:12px;
      background:#fff;border:1px solid #E5E7EB;
      box-shadow:0 8px 24px rgba(0,0,0,0.1),0 0 0 1px rgba(0,0,0,0.03);
      min-width:220px;max-width:340px;
      opacity:0;transform:translateX(-12px);
      transition:opacity 0.25s,transform 0.25s;
      border-right:3px solid ${meta.color};
    `.replace(/\s+/g, ' ').trim();

    el.innerHTML = `
      <span class="material-symbols-outlined flex-shrink-0" style="font-size:18px;color:${meta.color};margin-top:1px;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;">${meta.icon}</span>
      <span style="flex:1;font-size:0.83rem;font-family:'Assistant',sans-serif;color:#111827;line-height:1.45;">${msg}</span>
      <button onclick="document.getElementById('${id}')?.remove()" style="color:#9CA3AF;background:none;border:none;cursor:pointer;flex-shrink:0;margin-top:1px;">
        <span class="material-symbols-outlined" style="font-size:16px;">close</span>
      </button>
    `;

    container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.remove('translate-y-2', 'opacity-0');
        el.classList.add('translate-y-0', 'opacity-100');
      });
    });

    // Auto-dismiss
    setTimeout(() => {
      el.classList.add('opacity-0', 'translate-y-1');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, duration);
  }

  /**
   * Toast with an "undo" action button.
   * onUndo is invoked (and the toast removed) when the user clicks ביטול.
   */
  function toastUndo(msg, onUndo, duration = 6000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const id  = 'toast-' + Date.now();
    const el  = document.createElement('div');
    el.id = id;
    el.style.cssText = `
      display:flex;align-items:center;gap:10px;
      padding:11px 14px;border-radius:12px;
      background:#fff;border:1px solid #E5E7EB;
      box-shadow:0 8px 24px rgba(0,0,0,0.1),0 0 0 1px rgba(0,0,0,0.03);
      min-width:240px;max-width:360px;
      transition:opacity 0.25s,transform 0.25s;
      border-right:3px solid #6B7280;
    `.replace(/\s+/g, ' ').trim();

    el.innerHTML = `
      <span class="material-symbols-outlined flex-shrink-0" style="font-size:18px;color:#6B7280;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;">delete</span>
      <span style="flex:1;font-size:0.83rem;font-family:'Assistant',sans-serif;color:#111827;line-height:1.45;">${msg}</span>
      <button id="${id}-undo" style="flex-shrink:0;font-size:0.82rem;font-weight:700;color:#1D4ED8;background:rgba(29,78,216,0.07);border:none;border-radius:8px;padding:4px 10px;cursor:pointer;font-family:'Assistant',sans-serif;">ביטול</button>
    `;

    container.appendChild(el);

    let done = false;
    const remove = () => {
      el.style.opacity = '0';
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    };

    document.getElementById(`${id}-undo`)?.addEventListener('click', async () => {
      if (done) return;
      done = true;
      try { await onUndo(); }
      catch (e) { toast(e.message || 'שגיאה בביטול', 'error'); }
      remove();
    });

    setTimeout(() => { if (!done) remove(); }, duration);
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

    // Reset confirm button to exec-carbon (not red)
    confirmBtn.style.background = '#0A0B0F';
    confirmBtn.style.color      = '#fff';

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
          <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(220,38,38,0.08);">
            <span class="material-symbols-outlined" style="font-size:20px;color:#DC2626;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;">warning</span>
          </div>
          <p style="color:#374151;font-size:0.875rem;line-height:1.55;padding-top:6px;">${msg}</p>
        </div>`,
      confirmLabel: 'אשר',
      onConfirm,
    });

    const btn = document.getElementById('modal-confirm');
    if (btn) { btn.style.background = '#DC2626'; btn.style.color = '#fff'; }
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
      px-3 py-2.5 text-sm text-neutral-900
      placeholder-neutral-300
      focus:outline-none transition-colors
    `.replace(/\s+/g, ' ').trim();
    const baseStyle = `border:1px solid #E5E7EB;background:#fff;font-family:'Assistant',sans-serif;`;

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
      ? `<p style="margin-top:5px;font-size:0.73rem;color:#9CA3AF;line-height:1.4;">${opts.hint}</p>`
      : '';

    return `
      <div class="form-group">
        <label for="${id}" style="font-size:0.72rem;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">
          ${label}${required ? ' <span style="color:#EF4444;">*</span>' : ''}
        </label>
        ${input}
        ${hint}
      </div>`;
  }

  // ─── Table helpers ────────────────────────────────────────

  /** Standard <td> for monetary values */
  function tdNum(val, { positive = false, gold = false, negative = false } = {}) {
    let color = '#374151';
    if (positive)  color = '#059669';
    else if (gold) color = '#D4AF37';
    else if (negative) color = '#DC2626';
    return `<td class="num" style="padding:11px 16px;color:${color};font-weight:600;">${val}</td>`;
  }

  /** Standard <td> for regular text */
  function tdText(val, cls = '') {
    return `<td style="padding:11px 16px;font-size:0.875rem;color:#374151;" class="${cls}">${val}</td>`;
  }

  /** Summary/total row */
  function summaryRow(cells) {
    const tds = cells.map((c) => {
      const num = typeof c === 'object' && c.num;
      const v   = typeof c === 'object' ? c.v : c;
      return num
        ? `<td class="num" style="padding:11px 16px;font-weight:700;color:#111827;">${v}</td>`
        : `<td style="padding:11px 16px;font-size:0.875rem;font-weight:700;color:#111827;">${v}</td>`;
    }).join('');
    return `<tr style="background:#FAFAFA;border-top:1px solid #E5E7EB;">${tds}</tr>`;
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
    toastUndo,
    confirm,
    openModal,
    closeModal,
    // HTML escaping (shared — avoids duplicate escHtml in every module)
    esc: _esc,
  };

})();

window.UI = UI;
