/**
 * drive.js — Google Drive backup/restore for LexLedger
 * Uses Google Identity Services (browser-only, no client secret).
 * Token lives in memory only; expires after ~1 hour.
 */
const Drive = (() => {
  const CLIENT_ID  = '495539747084-kpqb6to48406qtc5ltjb33k6116jn353.apps.googleusercontent.com';
  const SCOPE      = 'https://www.googleapis.com/auth/drive.file';
  const FILE_NAME  = 'lexledger-backup.json';

  let _tokenClient = null;
  let _token       = null;
  let _tokenExpiry = null;

  function _gisReady() {
    return typeof google !== 'undefined' && google.accounts && google.accounts.oauth2;
  }

  function _initClient() {
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope:     SCOPE,
      callback:  '',
    });
  }

  function _setToken(token) {
    _token       = token;
    _tokenExpiry = Date.now() + 3500 * 1000;
    setTimeout(() => { _token = null; _tokenExpiry = null; _renderStatus(); }, 3500 * 1000);
    _renderStatus();
  }

  function _clearToken() {
    _token       = null;
    _tokenExpiry = null;
    _renderStatus();
  }

  // ── Status UI ──────────────────────────────────────────

  function _renderStatus() {
    const connected = !!_token;
    const ids = ['drive-status-sidebar', 'drive-status-mobile'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = connected
        ? 'text-xs text-center font-medium text-emerald-400 py-1'
        : 'text-xs text-center font-medium text-midnight-500 py-1';
      el.textContent = connected ? '● מחובר ל-Google Drive' : '○ לא מחובר';
    });
    ['drive-disconnect-sidebar', 'drive-disconnect-mobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !connected);
    });
  }

  async function _ensureToken() {
    if (_token) return _token;
    if (!_gisReady()) throw new Error('Google Identity Services לא נטען');
    if (!_tokenClient) _initClient();

    return new Promise((resolve, reject) => {
      _tokenClient.callback = (resp) => {
        if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
        _setToken(resp.access_token);
        resolve(_token);
      };
      _tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  // ── Drive API helpers ──────────────────────────────────

  async function _findFileId(token) {
    const q   = `name='${FILE_NAME}' and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id)`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const { files } = await res.json();
    return files && files.length ? files[0].id : null;
  }

  async function _uploadNew(token, json) {
    const meta = JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' });
    const body = `--bound\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--bound\r\nContent-Type: application/json\r\n\r\n${json}\r\n--bound--`;
    const res  = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method:  'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=bound' },
        body,
      }
    );
    if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
  }

  async function _updateFile(token, fileId, json) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method:  'PATCH',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body:    json,
      }
    );
    if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
  }

  // ── Public API ─────────────────────────────────────────

  async function saveBackup() {
    try {
      const token  = await _ensureToken();
      const data   = await DB.backup.export();
      const json   = JSON.stringify(data, null, 2);
      const fileId = await _findFileId(token);
      if (fileId) {
        await _updateFile(token, fileId, json);
      } else {
        await _uploadNew(token, json);
      }
      UI.toast('גיבוי נשמר ב-Google Drive ✓', 'success');
    } catch (err) {
      if (err.message === 'popup_closed_by_user') return;
      _clearToken();
      UI.toast('שגיאה בגיבוי לדרייב: ' + err.message, 'error');
    }
  }

  async function restoreBackup() {
    try {
      const token  = await _ensureToken();
      const fileId = await _findFileId(token);
      if (!fileId) { UI.toast('לא נמצא גיבוי ב-Google Drive', 'warning'); return; }

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
      const data = await res.json();

      UI.confirm(
        'שחזור גיבוי מ-Google Drive ידרוס את כל הנתונים הקיימים. האם להמשיך?',
        async () => {
          await DB.backup.import(data);
          UI.toast('שחזור מ-Google Drive הושלם!', 'success');
          UI.closeModal();
          App.refreshCurrentView();
        }
      );
    } catch (err) {
      if (err.message === 'popup_closed_by_user') return;
      _clearToken();
      UI.toast('שגיאה בשחזור מדרייב: ' + err.message, 'error');
    }
  }

  function disconnect() {
    if (_token && _gisReady()) {
      google.accounts.oauth2.revoke(_token, () => {});
    }
    _clearToken();
    if (_tokenClient) { _tokenClient = null; }
    UI.toast('התנתקת מ-Google Drive', 'info');
  }

  function init() {
    _renderStatus();
    ['drive-disconnect-sidebar', 'drive-disconnect-mobile'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', disconnect);
    });
  }

  return { saveBackup, restoreBackup, disconnect, init };
})();
window.Drive = Drive;
