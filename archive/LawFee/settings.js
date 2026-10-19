/**
 * settings.js — LexLedger Settings View
 * בודק עדכונים דרך version.json בשרת.
 * עדכון גרסה = שינוי version.json בלבד.
 */

const Settings = (() => {

  const VERSION_URL = './version.json';

  // ── Init ───────────────────────────────────────────────
  async function init() {
    document.getElementById('btn-check-update').addEventListener('click', checkForUpdates);
    await render();
  }

  // ── Render ─────────────────────────────────────────────
  async function render() {
    const local = await _getLocalVersion();
    const verEl  = document.getElementById('settings-current-version');
    const dateEl = document.getElementById('settings-update-date');
    if (verEl)  verEl.textContent  = 'v' + (local.version || '—');
    if (dateEl) dateEl.textContent = local.date
      ? new Date(local.date).toLocaleDateString('he-IL')
      : '—';
    _hideStatus();
  }

  // ── Check for Updates ──────────────────────────────────
  async function checkForUpdates() {
    const btn = document.getElementById('btn-check-update');
    if (btn) { btn.textContent = '⏳ בודק…'; btn.disabled = true; }

    try {
      const res = await fetch(VERSION_URL + '?_=' + Date.now());
      if (!res.ok) throw new Error('שגיאת רשת');
      const remote = await res.json();
      const local  = await _getLocalVersion();

      if (_versionGt(remote.version, local.version)) {
        _showStatus(
          `✦ גרסה חדשה זמינה: <strong>v${remote.version}</strong> — <button onclick="Settings.applyUpdate()" class="btn-primary btn-sm" style="margin-right:10px">עדכן עכשיו</button>`,
          'info'
        );
      } else {
        _showStatus('✓ המערכת מעודכנת לגרסה האחרונה', 'success');
      }
    } catch (err) {
      _showStatus('לא ניתן לבדוק עדכונים — בדוק חיבור לאינטרנט.', 'warning');
    } finally {
      if (btn) { btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-left:6px;">sync</span> בדוק עדכונים'; btn.disabled = false; }
    }
  }

  // ── Apply Update ───────────────────────────────────────
  async function applyUpdate() {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.waiting) {
        reg.waiting.postMessage('skipWaiting');
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
        return;
      }
      if (reg) {
        await reg.update();
        _showStatus('⏳ מוריד עדכון… הדף יטען מחדש תוך שניות.', 'info');
        setTimeout(() => window.location.reload(), 2500);
        return;
      }
    }
    window.location.reload(true);
  }

  // ── Helpers ────────────────────────────────────────────
  async function _getLocalVersion() {
    try {
      const cached = await caches.match(VERSION_URL);
      if (cached) return await cached.json();
    } catch (_) {}
    try {
      const res = await fetch(VERSION_URL);
      return await res.json();
    } catch (_) {}
    return { version: '—', date: null };
  }

  function _showStatus(html, type) {
    const el = document.getElementById('settings-update-status');
    if (!el) return;
    const colors = {
      success: { bg: 'rgba(5,150,105,0.07)',   border: 'rgba(5,150,105,0.2)',   color: '#059669' },
      info:    { bg: 'rgba(29,78,216,0.06)',    border: 'rgba(29,78,216,0.15)',  color: '#1D4ED8' },
      warning: { bg: 'rgba(217,119,6,0.07)',    border: 'rgba(217,119,6,0.2)',   color: '#D97706' },
    };
    const s = colors[type] || colors.info;
    el.classList.remove('hidden');
    el.style.display      = 'block';
    el.style.background   = s.bg;
    el.style.border       = `1px solid ${s.border}`;
    el.style.color        = s.color;
    el.style.borderRadius = '10px';
    el.style.fontSize     = '0.83rem';
    el.style.fontWeight   = '600';
    el.innerHTML          = html;
  }

  function _hideStatus() {
    const el = document.getElementById('settings-update-status');
    if (el) {
      el.classList.add('hidden');
      el.style.display = '';
    }
  }

  function _versionGt(vA, vB) {
    const parse = v => String(v).split('.').map(Number);
    const a = parse(vA), b = parse(vB);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0) > (b[i] || 0)) return true;
      if ((a[i] || 0) < (b[i] || 0)) return false;
    }
    return false;
  }

  return { init, render, applyUpdate };
})();

window.Settings = Settings;
