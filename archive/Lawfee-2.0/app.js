/**
 * app.js — LexLedger Main Controller
 * Router, navigation, backup/restore, global init.
 */

const App = (() => {

  const VIEWS = {
    dashboard: { el: 'view-dashboard', module: () => Dashboard },
    clients:   { el: 'view-clients',   module: () => Clients   },
    invoices:  { el: 'view-invoices',  module: () => Invoices  },
    payments:  { el: 'view-payments',  module: () => Payments  },
    import:    { el: 'view-import',    module: () => null       },
    settings:  { el: 'view-settings',  module: () => Settings  },
  };

  let _currentView = 'dashboard';
  let _initialised = {};

  // ── Navigate ───────────────────────────────────────────
  async function navigate(viewName) {
    if (!VIEWS[viewName]) return;

    // Close any open modal (prevents sticky blur overlay)
    UI.closeModal?.();
    const pdfOverlay = document.getElementById('pdf-modal-overlay');
    if (pdfOverlay) pdfOverlay.classList.add('hidden');

    // Hide all views
    Object.values(VIEWS).forEach(v => {
      document.getElementById(v.el)?.classList.add('hidden');
    });

    // Update nav active state — driven by CSS .nav-item.active rule in style.css
    document.querySelectorAll('.nav-item').forEach(el => {
      const isActive = el.dataset.view === viewName;
      el.classList.toggle('active', isActive);
    });

    // Show target view
    document.getElementById(VIEWS[viewName].el)?.classList.remove('hidden');
    _currentView = viewName;

    // Init/refresh module
    const mod = VIEWS[viewName].module?.();
    if (mod) {
      if (!_initialised[viewName]) {
        await mod.init();
        _initialised[viewName] = true;
      } else {
        await mod.render?.();
      }
    }

    // Update URL hash
    location.hash = viewName;
  }

  // ── Refresh current view ───────────────────────────────
  async function refreshCurrentView() {
    // Force re-render of current view
    _initialised[_currentView] = false;
    await navigate(_currentView);

    // Also refresh dashboard KPIs silently if not current
    if (_currentView !== 'dashboard' && _initialised['dashboard']) {
      Dashboard.render?.();
    }
  }

  // ── Backup ─────────────────────────────────────────────
  async function exportBackup() {
    try {
      const data   = await DB.backup.export();
      const json   = JSON.stringify(data, null, 2);
      const blob   = new Blob([json], { type: 'application/json' });
      const url    = URL.createObjectURL(blob);
      const a      = document.createElement('a');
      const ts     = new Date().toISOString().slice(0,10);
      a.href       = url;
      a.download   = `lexledger-backup-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('גיבוי יוצא בהצלחה', 'success');
    } catch(err) {
      UI.toast('שגיאה בגיבוי: ' + err.message, 'error');
    }
  }

  async function importBackup(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      UI.confirm(
        'שחזור גיבוי ידרוס את כל הנתונים הקיימים. האם להמשיך?',
        async () => {
          await DB.backup.import(data);
          UI.toast('שחזור הושלם בהצלחה!', 'success');
          UI.closeModal();
          _initialised = {};
          await navigate(_currentView);
        }
      );
    } catch(err) {
      UI.toast('שגיאה בשחזור: ' + (err.message || 'קובץ לא תקין'), 'error');
    }
  }

  // ── Wire nav clicks ────────────────────────────────────
  function _wireNav() {
    function _handler(e) {
      const item = e.target.closest('.nav-item');
      if (!item) return;
      e.preventDefault();
      navigate(item.dataset.view);
    }
    document.getElementById('sidebar-nav').addEventListener('click', _handler);
    document.getElementById('mobile-nav').addEventListener('click', _handler);
  }

  // ── Wire backup buttons ────────────────────────────────
  function _wireBackup() {
    document.getElementById('btn-export-backup').addEventListener('click', exportBackup);

    const restoreBtn   = document.getElementById('btn-import-backup');
    const restoreInput = document.getElementById('input-restore-file');

    restoreBtn.addEventListener('click', () => restoreInput.click());
    restoreInput.addEventListener('change', () => {
      const file = restoreInput.files[0];
      if (file) {
        importBackup(file);
        restoreInput.value = '';
      }
    });

    document.getElementById('btn-drive-backup').addEventListener('click', () => Drive.saveBackup());
    document.getElementById('btn-drive-restore').addEventListener('click', () => Drive.restoreBackup());

    // Mobile-only backup buttons (settings screen)
    const mobileRestoreInput = document.getElementById('input-restore-file-mobile');
    document.getElementById('btn-export-backup-mobile').addEventListener('click', exportBackup);
    document.getElementById('btn-import-backup-mobile').addEventListener('click', () => mobileRestoreInput.click());
    mobileRestoreInput.addEventListener('change', () => {
      const file = mobileRestoreInput.files[0];
      if (file) { importBackup(file); mobileRestoreInput.value = ''; }
    });
    document.getElementById('btn-drive-backup-mobile').addEventListener('click', () => Drive.saveBackup());
    document.getElementById('btn-drive-restore-mobile').addEventListener('click', () => Drive.restoreBackup());
  }

  // ── Show onboarding if DB is empty ────────────────────
  async function _checkOnboarding() {
    const clients = await DB.clients.getAll();
    if (!clients.length) {
      // Navigate to import on first run
      // But only if user hasn't explicitly navigated
      if (!location.hash || location.hash === '#dashboard') {
        navigate('import');
        UI.toast('ברוך הבא! התחל בייבוא קובץ ה-Excel שלך.', 'info', 5000);
        return true;
      }
    }
    return false;
  }

  // ── Bootstrap ──────────────────────────────────────────
  async function init() {
    // Open IndexedDB
    await DB.open();

    // Init shared UI
    UI.init();

    // Init importer (registers drop events etc.)
    Importer.init();

    // Wire nav + backup + drive status
    _wireNav();
    _wireBackup();
    Drive.init();

    // Clear URL hash without triggering hashchange — always start fresh at dashboard
    history.replaceState(null, '', location.pathname + location.search);

    // Runtime nav via mobile bottom-bar links (href="#view") still works via hashchange
    window.addEventListener('hashchange', () => {
      const hash = (location.hash || '').replace('#', '');
      if (VIEWS[hash] && hash !== _currentView) {
        history.replaceState(null, '', location.pathname + location.search);
        navigate(hash);
      }
    });

    // Always open at dashboard (or import if DB is empty)
    const redirected = await _checkOnboarding();
    if (!redirected) {
      await navigate('dashboard');
    }
  }

  // ── Boot on DOMContentLoaded ───────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => {
      console.error('App init error:', err);
      document.body.innerHTML = `
        <div style="padding:40px;color:#e05c5c;font-family:monospace;direction:ltr">
          <h2>Initialization Error</h2>
          <pre>${err.message}\n${err.stack}</pre>
        </div>`;
    });
  });

  return { navigate, refreshCurrentView, exportBackup };
})();

window.App = App;
