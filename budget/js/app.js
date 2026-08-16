// app.js — bootstrap, state יחיד, ניתוב תצוגות ו-event delegation.
// כל המוטציות עוברות דרך store.js; render() הוא מקור האמת לתצוגה.

import * as store from './store.js';
import * as db from './db.js';
import {
  computeDeal, dealReview, uid, num, round2, fmtPct, roundUpHours, sourceLabel,
  DEFAULT_TEAM_NAMES, DEAL_STATUSES, ENTRY_KINDS, ENTRY_STATUSES,
} from './model.js';
import * as ui from './ui.js';
import * as fileStore from './file-store.js';
import { readTabularFile } from './xlsx.js';
import { downloadWorkbook } from './xlsx-write.js';
import { pdfToSheets, isPdf } from './pdf-table.js';
import {
  detectHeaderRow, guessMapping, rowsToEntries, markDuplicates, parseBudgetSheet, collectPeople,
  rowsToProgress, sheetBody, personKey, fuzzyPersonMatch, pickBestSheet,
} from './importer.js';

/* ============================================================
   State
   ============================================================ */

const LS = { deal: 'lb_dealId', tab: 'lb_tab', view: 'lb_view', teamSort: 'lb_teamSort', expanded: 'lb_open_' };

const state = {
  view: 'overview',        // 'overview' | 'deal' | 'rates'
  dealId: null,
  tab: 'budget',           // 'budget' | 'actuals' | 'control' | 'settings'
  filters: { q: '', teamId: '', kind: '', status: '' },
  snapshots: new Map(),
  selectedTeams: new Set(),   // צוותים מסומנים לחישוב מצרפי (בעסקה הפעילה)
  expandedTeams: new Set(),   // צוותים שהגיליון שלהם פתוח
  expandedFor: null,          // העסקה שעבורה נקבע הפתיחה האוטומטית
  progressPeriod: 'week',     // תקופת הסיכום במסך המעקב: day | week | month
  teamSort: localStorage.getItem('lb_teamSort') === 'manual' ? 'manual' : 'priority',
};

let els = {};
let importCtx = null;

/* ============================================================
   Bootstrap
   ============================================================ */

async function init() {
  els = {
    tabs: document.getElementById('deal-tabs'),
    main: document.getElementById('main'),
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    modalFoot: document.getElementById('modal-foot'),
    fileInput: document.getElementById('hidden-file'),
  };

  try {
    await store.loadAll();
  } catch (err) {
    els.main.replaceChildren(ui.el('div', { class: 'empty' }, [
      ui.el('h2', { text: 'שגיאה בפתיחת מסד הנתונים' }),
      ui.el('p', { text: String(err.message || err) }),
    ]));
    return;
  }

  // שחזור מצב אחרון
  const lastDeal = localStorage.getItem(LS.deal);
  if (lastDeal && store.getDeal(lastDeal)) {
    state.dealId = lastDeal;
    state.view = 'deal';
    state.tab = localStorage.getItem(LS.tab) || 'budget';
  } else if (localStorage.getItem(LS.view) === 'rates') {
    state.view = 'rates';
  }

  store.setMutationListener(() => { markDirty(); });
  bindEvents();
  registerSW();
  render();

  if (store.cache.healedDeals) {
    ui.toast(`${store.cache.healedDeals} עסקאות חוברו מחדש לדרגות התעריפון`);
  }

  window.lexBudget = { store, state, render, seedDemo };
}

/* ============================================================
   Render
   ============================================================ */

function rebuildSnapshots() {
  state.snapshots = new Map();
  for (const deal of store.cache.deals) {
    state.snapshots.set(deal.id, computeDeal({
      deal, teams: store.cache.teams, entries: store.cache.entries,
      rateCard: store.rateCardFor(deal), progress: store.cache.progress,
    }));
  }
}

function currentSnapshot() {
  return state.dealId ? state.snapshots.get(state.dealId) : null;
}

function render() {
  rebuildSnapshots();

  ui.renderDealTabs(els.tabs, {
    deals: store.cache.deals,
    snapshots: state.snapshots,
    activeId: state.view === 'deal' ? state.dealId : null,
  });

  els.main.replaceChildren();

  if (state.view === 'rates') {
    ui.renderRatesView(els.main, { rateCards: store.cache.rateCards, deals: store.cache.deals });
    return;
  }

  if (state.view === 'deal') {
    const snap = currentSnapshot();
    if (!snap) { state.view = 'overview'; state.dealId = null; return render(); }
    ui.renderDealHeader(els.main, { snap, tab: state.tab });
    const body = ui.el('div', { class: 'tab-body' });
    els.main.append(body);
    if (state.tab === 'budget') {
      // מצב הפתיחה נזכר לכל עסקה; בכניסה ראשונה נפתחים רק הצוותים שדורשים טיפול
      if (state.expandedFor !== snap.deal.id) {
        state.expandedFor = snap.deal.id;
        const saved = readExpanded(snap.deal.id);
        if (saved) {
          const live = new Set(snap.teams.map((t) => t.id));
          state.expandedTeams = new Set(saved.filter((id) => live.has(id)));
        } else {
          state.expandedTeams = new Set(snap.teams.filter((t) => t.status === 'over' || t.status === 'risk').map((t) => t.id));
          if (!state.expandedTeams.size && snap.teams.length === 1) state.expandedTeams.add(snap.teams[0].id);
        }
      }
      ui.renderBudgetTab(body, {
        snap, rateCard: store.rateCardFor(snap.deal),
        selected: state.selectedTeams, expanded: state.expandedTeams, sort: state.teamSort,
      });
    }
    else if (state.tab === 'progress') ui.renderProgressTab(body, { snap, period: state.progressPeriod, sources: store.dataSourcesOf(snap.deal.id) });
    else if (state.tab === 'actuals') ui.renderActualsTab(body, { snap, filters: state.filters });
    else if (state.tab === 'control') ui.renderControlTab(body, { snap });
    else if (state.tab === 'review') ui.renderReviewTab(body, { snap });
    else { ui.renderDealSettings(body, { snap, rateCards: store.cache.rateCards }); refreshFolderState(); }
    return;
  }

  ui.renderOverview(els.main, { snapshots: state.snapshots });
}

/** רענון קל: מעדכן רק תאים מחושבים (בזמן הקלדה בגיליון התקציב) */
function refreshLive() {
  const deal = store.getDeal(state.dealId);
  if (!deal) return;
  const snap = computeDeal({
    deal, teams: store.cache.teams, entries: store.cache.entries,
    rateCard: store.rateCardFor(deal), progress: store.cache.progress,
  });
  state.snapshots.set(deal.id, snap);
  ui.refreshComputed(snap, state.selectedTeams);
}

/** מציג את מצב תיקיית המסמכים במסך ההגדרות */
async function refreshFolderState() {
  const box = document.getElementById('docs-folder-state');
  if (!box) return;
  const deal = store.getDeal(state.dealId);
  ui.renderFolderState(box, {
    supported: fileStore.supportsFolder(),
    name: await fileStore.folderName(),
    ready: await fileStore.folderReady(),
    dealFolder: deal ? fileStore.dealFolderName(deal) : '',
  });
}

/** מרענן את כותרת העסקה (תגיות + סרגל) בלי לרנדר מחדש את הטופס שבו המשתמש עובד */
function refreshDealHeader() {
  const deal = store.getDeal(state.dealId);
  const head = els.main.querySelector('.deal-head');
  if (!deal || !head) return;
  rebuildSnapshots();
  const snap = currentSnapshot();
  if (!snap) return;
  const holder = ui.el('div');
  ui.renderDealHeader(holder, { snap, tab: state.tab });
  head.replaceWith(holder.firstElementChild);
  ui.renderDealTabs(els.tabs, {
    deals: store.cache.deals,
    snapshots: state.snapshots,
    activeId: state.view === 'deal' ? state.dealId : null,
  });
}

function markDirty() {
  const badge = document.getElementById('save-state');
  if (!badge) return;
  badge.textContent = 'נשמר';
  badge.classList.add('saved');
  clearTimeout(markDirty._t);
  markDirty._t = setTimeout(() => badge.classList.remove('saved'), 1400);
}

function goDeal(id, tab) {
  if (id !== state.dealId) { state.selectedTeams.clear(); state.expandedFor = null; }   // הסימון שייך לעסקה שממנה יצאנו
  state.view = 'deal';
  state.dealId = id;
  state.tab = tab || state.tab || 'budget';
  localStorage.setItem(LS.deal, id);
  localStorage.setItem(LS.tab, state.tab);
  localStorage.setItem(LS.view, 'deal');
  render();
}

/* ============================================================
   Modal
   ============================================================ */

function openModal({ title, body, actions = [], wide = false }) {
  els.modalTitle.textContent = title;
  els.modalBody.replaceChildren(body);
  els.modalFoot.replaceChildren(...actions);
  els.modal.classList.toggle('modal--wide', !!wide);
  if (!els.modal.open) els.modal.showModal();
  const first = els.modalBody.querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 60);
}

function closeModal() {
  if (els.modal.open) els.modal.close();
  // ניקוי התוכן: טופס שנשאר במודאל הסגור ממשיך להיתפס בשאילתות DOM ובדלגציית האירועים
  els.modalBody.replaceChildren();
  els.modalFoot.replaceChildren();
  importCtx = null;
}

function btn(label, { primary = false, danger = false, action, iconName } = {}) {
  return ui.el('button', {
    class: `btn ${primary ? 'btn--primary' : danger ? 'btn--danger' : 'btn--ghost'}`,
    type: 'button', dataset: action ? { action } : {},
  }, [iconName ? ui.icon(iconName) : null, label]);
}

function confirmModal(title, message, onConfirm, confirmLabel = 'אישור') {
  const ok = btn(confirmLabel, { danger: true });
  ok.addEventListener('click', async () => { closeModal(); await onConfirm(); });
  const cancel = btn('ביטול');
  cancel.addEventListener('click', closeModal);
  openModal({ title, body: ui.el('p', { class: 'modal-text', text: message }), actions: [ok, cancel] });
}

/* ============================================================
   Events
   ============================================================ */

function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
  els.modal.addEventListener('close', () => { importCtx = null; });

  els.fileInput.addEventListener('change', async () => {
    const file = els.fileInput.files?.[0];
    const cb = filePickCallback;
    filePickCallback = null;
    if (file && cb) await cb(file);
  });

  bindReorder();

  // גרירת קבצים לכל המסך כשנמצאים בטאב ביצוע
  const dropTargets = ['dragenter', 'dragover'];
  for (const ev of dropTargets) {
    document.addEventListener(ev, (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      document.body.classList.add('dragging-file');
    });
  }
  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) document.body.classList.remove('dragging-file');
  });
  document.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    document.body.classList.remove('dragging-file');
    if (state.view !== 'deal') { ui.toast('בחר עסקה לפני העלאת קובץ', 'error'); return; }
    // הקובץ נכנס למסלול של הטאב שבו נמצאים: דוח שעות במעקב, חשבון בחשבונות
    const file = e.dataTransfer.files[0];
    if (state.tab === 'progress') await startProgressImport(file);
    else await startEntryImport(file);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.modal.open) closeModal();
  });
  document.addEventListener('keydown', onSheetKeydown);
}

/* ============================================================
   שינוי סדר בגרירה — צוותים (אנכי) ועסקאות (אופקי)
   מנוע אחד לשניהם: ידית גרירה, קו יעד, ומקלדת (Alt+חצים) כחלופה נגישה.
   ============================================================ */

/** סדר חדש למערך מזהים: מזיזים את dragId לפני/אחרי targetId */
function moveId(ids, dragId, targetId, after) {
  const out = ids.filter((id) => id !== dragId);
  const at = out.indexOf(targetId);
  if (at === -1) return ids;
  out.splice(after ? at + 1 : at, 0, dragId);
  return out;
}

function bindReorder() {
  let drag = null;   // { kind: 'team' | 'deal', id, el }

  const clearMarks = () => {
    for (const n of document.querySelectorAll('.drop-before, .drop-after')) {
      n.classList.remove('drop-before', 'drop-after');
    }
  };
  const endDrag = () => {
    drag?.el.classList.remove('dragging');
    drag = null;
    clearMarks();
  };

  // הידית היא מה שהופך את הפריט לגריר — כדי שגרירה בתוך שדות טקסט תמשיך לעבוד
  document.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip) return;
    const item = grip.closest('.trow, .dtab, tr.bline');
    if (item) item.setAttribute('draggable', 'true');
  });
  document.addEventListener('pointerup', () => {
    for (const n of document.querySelectorAll('.trow[draggable], tr.bline[draggable]')) n.removeAttribute('draggable');
  });

  document.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('.trow[draggable="true"]');
    const line = e.target.closest?.('tr.bline[draggable="true"]');
    const tab = e.target.closest?.('.dtab[data-action="select-deal"]');
    const item = row || line || tab;
    if (!item) return;
    if (row) drag = { kind: 'team', id: row.dataset.teamId, el: row };
    else if (line) drag = { kind: 'line', id: line.dataset.lineId, el: line, teamId: line.dataset.teamId };
    else drag = { kind: 'deal', id: tab.dataset.id, el: tab };
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    // חלק מהדפדפנים לא מתחילים גרירה בלי מטען
    try { e.dataTransfer.setData('text/plain', drag.id); } catch { /* noop */ }
  });

  document.addEventListener('dragend', endDrag);

  document.addEventListener('dragover', (e) => {
    if (!drag) return;
    const item = drag.kind === 'team' ? e.target.closest?.('.trow:not(.trow--head)')
      : drag.kind === 'line' ? e.target.closest?.('tr.bline')
        : e.target.closest?.('.dtab[data-action="select-deal"]');
    // שורת דרגה זזה רק בתוך הצוות שלה — מעבר בין צוותים גורר איתו דיווחי ביצוע
    if (!item || item === drag.el) { clearMarks(); return; }
    if (drag.kind === 'line' && item.dataset.teamId !== drag.teamId) { clearMarks(); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    const r = item.getBoundingClientRect();
    // אנכי: חצי עליון/תחתון · עסקאות: RTL — הצד הימני הוא "לפני"
    const after = drag.kind === 'deal'
      ? e.clientX < r.left + r.width / 2
      : e.clientY > r.top + r.height / 2;
    item.classList.add(after ? 'drop-after' : 'drop-before');
  });

  document.addEventListener('drop', async (e) => {
    if (!drag) return;
    const marked = document.querySelector('.drop-before, .drop-after');
    if (!marked) return;
    e.preventDefault();
    const after = marked.classList.contains('drop-after');
    const kind = drag.kind, id = drag.id;
    endDrag();

    if (kind === 'deal') {
      const ids = store.cache.deals.map((d) => d.id);
      await store.reorderDeals(moveId(ids, id, marked.dataset.id, after));
      return render();
    }
    if (kind === 'line') {
      const teamId = marked.dataset.teamId;
      const ids = [...marked.parentElement.rows].map((n) => n.dataset.lineId);
      await store.reorderLines(teamId, moveId(ids, id, marked.dataset.lineId, after));
      return render();
    }
    // סדר לפי מה שרואים על המסך — כך גרירה במיון "לפי דחיפות" מקבעת אותו כסדר ידני
    const visible = [...document.querySelectorAll('.trow:not(.trow--head)')].map((n) => n.dataset.teamId);
    await store.reorderTeams(state.dealId, moveId(visible, id, marked.dataset.teamId, after));
    setTeamSort('manual');
  });

  // חלופה למקלדת: Alt+↑/↓ לצוות, Alt+←/→ לעסקה (RTL — ימין הוא לכיוון ההתחלה)
  document.addEventListener('keydown', async (e) => {
    if (!e.altKey) return;
    const dir = { ArrowUp: -1, ArrowRight: -1, ArrowDown: 1, ArrowLeft: 1 }[e.key];
    if (!dir) return;
    const grip = e.target.closest?.('[data-grip="team"]');
    const lineGrip = e.target.closest?.('[data-grip="line"]') || e.target.closest?.('tr.bline')?.querySelector('[data-grip="line"]');
    const tab = e.target.closest?.('.dtab[data-action="select-deal"]');
    const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';

    if (grip && vertical) {
      e.preventDefault();
      const visible = [...document.querySelectorAll('.trow:not(.trow--head)')].map((n) => n.dataset.teamId);
      const i = visible.indexOf(grip.dataset.teamId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= visible.length) return;
      await store.reorderTeams(state.dealId, moveId(visible, visible[i], visible[j], dir > 0));
      setTeamSort('manual');
      focusAfterRender(`[data-grip="team"][data-team-id="${CSS.escape(grip.dataset.teamId)}"]`);
    } else if (lineGrip && vertical) {
      // Alt+↑/↓ עובד גם כשהפוקוס בתוך תא בשורה — כדי להזיז בלי לעזוב את המקלדת
      e.preventDefault();
      const focusField = e.target.dataset?.field || null;
      const body = lineGrip.closest('tbody');
      const ids = [...body.rows].map((n) => n.dataset.lineId);
      const i = ids.indexOf(lineGrip.dataset.lineId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ids.length) return;
      await store.reorderLines(lineGrip.dataset.teamId, moveId(ids, ids[i], ids[j], dir > 0));
      render();
      const sel = focusField
        ? `tr[data-line-id="${CSS.escape(ids[i])}"] [data-field="${CSS.escape(focusField)}"]`
        : `[data-grip="line"][data-line-id="${CSS.escape(ids[i])}"]`;
      focusAfterRender(sel);
    } else if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const ids = store.cache.deals.map((d) => d.id);
      const i = ids.indexOf(tab.dataset.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ids.length) return;
      await store.reorderDeals(moveId(ids, ids[i], ids[j], dir > 0));
      render();
      focusAfterRender(`.dtab[data-id="${CSS.escape(tab.dataset.id)}"]`);
    }
  });
}

/** אחרי render() ה-DOM מוחלף — מחזירים את הפוקוס לאותו פריט כדי להמשיך להזיז */
function focusAfterRender(selector) {
  requestAnimationFrame(() => document.querySelector(selector)?.focus());
}

function setTeamSort(mode) {
  state.teamSort = mode;
  localStorage.setItem(LS.teamSort, mode);
  render();
}

/* ---------- זיכרון מצב פתוח/סגור של הצוותים, לכל עסקה ---------- */
function readExpanded(dealId) {
  try {
    const raw = localStorage.getItem(`${LS.expanded}${dealId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeExpanded() {
  if (!state.expandedFor) return;
  try {
    localStorage.setItem(`${LS.expanded}${state.expandedFor}`, JSON.stringify([...state.expandedTeams]));
  } catch { /* מכסת אחסון — לא קריטי */ }
}

/* ============================================================
   ניווט מקלדת בגיליון — Enter יורד באותה עמודה, Shift+Enter עולה.
   חצים לא נתפסים: בשדה מספר הם משנים את הערך, וזו התנהגות שמצפים לה.
   ============================================================ */
function onSheetKeydown(e) {
  if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey) return;
  const cell = e.target.closest?.('.btable--sheet .cellinput');
  if (!cell) return;
  const field = cell.dataset.field;
  const row = cell.closest('tr');
  const body = row?.parentElement;
  if (!field || !body) return;

  const rows = [...body.rows];
  const next = rows[rows.indexOf(row) + (e.shiftKey ? -1 : 1)];
  e.preventDefault();
  const target = next?.querySelector(`[data-field="${CSS.escape(field)}"]`);
  if (!target) { cell.blur(); return; }   // סוף הטבלה — יציאה מהעריכה
  target.focus();
  if (target.select) target.select();
}

async function onClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const { action } = target.dataset;

  switch (action) {
    case 'go-overview':
      state.view = 'overview'; state.dealId = null;
      localStorage.setItem(LS.view, 'overview');
      return render();

    case 'go-rates':
      state.view = 'rates';
      localStorage.setItem(LS.view, 'rates');
      return render();

    case 'select-deal':
      return goDeal(target.dataset.id);

    case 'set-tab':
      state.tab = target.dataset.tab;
      localStorage.setItem(LS.tab, state.tab);
      return render();

    case 'new-deal':
      return openDealModal();

    case 'add-team':
      return openTeamModal();

    case 'pick-folder':
      try {
        const name = await fileStore.pickFolder();
        // יוצרים מיד את תת-התיקייה של העסקה, כדי שיהיה ברור שהחיבור עובד
        const res = await fileStore.ensureDealFolder(store.getDeal(state.dealId));
        ui.toast(res.ok ? `מחובר ל-"${name}" · נוצרה התיקייה "${res.name}"` : `מחובר ל-"${name}" · ${res.error}`, res.ok ? '' : 'error');
      } catch (err) { ui.toast(err.message || 'בחירת התיקייה בוטלה', 'error'); }
      return refreshFolderState();

    case 'test-folder': {
      const res = await fileStore.testWrite(store.getDeal(state.dealId));
      ui.toast(res.ok ? `הכתיבה עובדת · ${res.name}` : `הכתיבה נכשלה: ${res.error}`, res.ok ? '' : 'error');
      return refreshFolderState();
    }

    case 'reconnect-folder':
      ui.toast(await fileStore.reconnectFolder() ? 'ההרשאה חודשה' : 'לא ניתנה הרשאה', await fileStore.folderReady() ? '' : 'error');
      return refreshFolderState();

    case 'forget-folder':
      await fileStore.forgetFolder();
      ui.toast('התיקייה נותקה — קבצים חדשים יישמרו בתוך המערכת');
      return refreshFolderState();

    case 'clear-picks':
      state.selectedTeams.clear();
      return render();

    case 'set-team-sort':
      return setTeamSort(target.dataset.sort);

    case 'toggle-team': {
      // לחיצה על שדה בתוך השורה (שם הצוות, סימון) לא מקפלת אותה
      if (e.target.closest('input, select, label, .iconbtn, [data-grip]')) return;
      const id = target.dataset.teamId;
      if (state.expandedTeams.has(id)) state.expandedTeams.delete(id);
      else state.expandedTeams.add(id);
      writeExpanded();
      return render();
    }

    case 'focus-team': {
      const id = target.dataset.teamId;
      state.expandedTeams.add(id);
      writeExpanded();
      render();
      const row = document.querySelector(`.trow[data-team-id="${CSS.escape(id)}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('trow--flash');
        setTimeout(() => row.classList.remove('trow--flash'), 1200);
      }
      return;
    }

    case 'set-period':
      state.progressPeriod = target.dataset.period;
      return render();

    case 'add-progress':
      return openProgressModal(null);

    case 'edit-progress':
      return openProgressModal(store.cache.progress.find((p) => p.id === target.dataset.progressId));

    case 'delete-progress':
      return confirmModal('מחיקת עדכון', 'העדכון יימחק והשעות ירדו מהמעקב.', async () => {
        await store.deleteProgress(target.dataset.progressId);
        ui.toast('העדכון נמחק');
        render();
      }, 'מחק');

    case 'delete-source': {
      const key = target.dataset.sourceKey;
      const src = store.dataSourcesOf(state.dealId).find((s) => s.key === key);
      if (!src) return;
      return confirmModal('מחיקת מקור מידע',
        `"${src.label}" — ${src.count} רשומות · ${src.hours} שעות יימחקו מהמעקב, יחד עם הקובץ השמור.`,
        async () => {
          for (const id of src.fileIds || []) await fileStore.deleteDocument(id).catch(() => {});
          const res = await store.deleteDataSource(key, state.dealId);
          ui.toast(`המקור נמחק · ${res.records} רשומות ירדו מהמעקב`);
          render();
        }, 'מחק');
    }

    case 'import-progress':
      return pickFile((file) => startProgressImport(file));

    case 'export-progress':
      return exportProgressCSV();

    case 'export-review':
      return exportReviewCSV();

    case 'clone-from-actual': {
      const deal = store.getDeal(state.dealId);
      return confirmModal('עסקה חדשה לפי הביצוע', `תיווצר עסקה חדשה עם אותם צוותים ושורות, כשהשעות המוערכות בה הן השעות שבוצעו בפועל ב"${deal.name}". הדיווחים לא מועתקים.`, async () => {
        const copy = await store.duplicateDealFromActual(state.dealId, `${deal.name} — תבנית לפי ביצוע`);
        ui.toast('העסקה נוצרה מהביצוע בפועל');
        goDeal(copy.id, 'budget');
      }, 'צור עסקה');
    }

    case 'split-by-person':
      return openSplitModal(target.dataset.teamId);

    case 'delete-team': {
      const team = store.getTeam(target.dataset.teamId);
      return confirmModal('מחיקת צוות', `למחוק את "${team?.name}"? רישומי הביצוע שלו יישמרו ויעברו למצב "ללא שיוך".`, async () => {
        const snapshot = JSON.parse(JSON.stringify(team));
        const { count, entryIds } = await store.deleteTeam(target.dataset.teamId);
        state.selectedTeams.delete(target.dataset.teamId);
        state.expandedTeams.delete(target.dataset.teamId);
        render();
        ui.undoToast(count ? `"${snapshot.name}" נמחק · ${count} רישומים עברו ל"ללא שיוך"` : `"${snapshot.name}" נמחק`, async () => {
          await store.restoreTeam(snapshot, entryIds);
          ui.toast('הצוות הוחזר');
          render();
        });
      }, 'מחק');
    }

    case 'duplicate-team': {
      const team = store.getTeam(target.dataset.teamId);
      if (!team) return;
      await store.saveTeam({
        ...team, id: undefined, name: `${team.name} — עותק`,
        order: store.nextTeamOrder(team.dealId),
        lines: team.lines.map((l) => ({ ...l, id: undefined })),
      });
      ui.toast('הצוות שוכפל');
      return render();
    }

    case 'add-line': {
      const team = store.getTeam(target.dataset.teamId);
      const roles = store.rateCardFor(store.getDeal(team.dealId)).roles;
      team.lines.push({ id: uid('ln'), roleId: roles[0]?.id || '', roleName: roles[0]?.name || '', estHours: 0, hoursOverride: null, rateOverride: null, note: '' });
      await store.saveTeam(team);
      return render();
    }

    case 'delete-line': {
      const team = store.getTeam(target.dataset.teamId);
      const at = team.lines.findIndex((l) => l.id === target.dataset.lineId);
      if (at < 0) return;
      const removed = JSON.parse(JSON.stringify(team.lines[at]));
      team.lines = team.lines.filter((l) => l.id !== target.dataset.lineId);
      await store.saveTeam(team);
      render();
      ui.undoToast(`השורה "${removed.roleName || 'דרגה'}" נמחקה`, async () => {
        const fresh = store.getTeam(target.dataset.teamId);
        if (!fresh) return;
        const lines = [...fresh.lines];
        lines.splice(Math.min(at, lines.length), 0, removed);
        await store.saveTeam({ ...fresh, lines });
        ui.toast('השורה הוחזרה');
        render();
      });
      return;
    }

    case 'add-entry':
      return openEntryModal(null);

    case 'edit-entry':
      return openEntryModal(store.getEntry(target.dataset.entryId));

    case 'delete-entry':
      return confirmModal('מחיקת רישום', 'הרישום יימחק לצמיתות, יחד עם הקובץ המצורף אם קיים.', async () => {
        await store.deleteEntry(target.dataset.entryId);
        ui.toast('הרישום נמחק');
        render();
      }, 'מחק');

    case 'open-file':
      return openAttachment(target.dataset.fileId);

    case 'import-entries':
      return pickFile((file) => startEntryImport(file));

    case 'import-budget':
      return pickFile((file) => startBudgetImport(file));

    case 'export-entries':
      return exportEntriesCSV();

    case 'export-deal':
      return exportDealCSV();

    case 'export-portfolio':
      return exportPortfolioCSV();

    case 'capture-baseline':
      await store.captureBaseline(state.dealId);
      ui.toast('תקציב הבסיס עודכן');
      return render();

    case 'clear-baseline':
      await store.clearBaseline(state.dealId);
      return render();

    case 'sync-team-roles': {
      const n = await store.syncTeamRoles(state.dealId);
      ui.toast(n ? `${n} צוותים עודכנו בדרגות חדשות` : 'כל הצוותים מעודכנים');
      return render();
    }

    case 'duplicate-deal': {
      const deal = store.getDeal(state.dealId);
      const copy = await store.duplicateDeal(state.dealId, `${deal.name} — עותק`);
      ui.toast('העסקה שוכפלה');
      return goDeal(copy.id, 'budget');
    }

    case 'delete-deal': {
      const dealId = target.dataset.id || state.dealId;
      const deal = store.getDeal(dealId);
      if (!deal) return;
      return confirmModal('מחיקת עסקה', `למחוק את "${deal.name}" על כל הצוותים והרישומים שלה? הפעולה בלתי הפיכה.`, async () => {
        await store.deleteDeal(dealId);
        if (state.dealId === dealId) {
          state.view = 'overview'; state.dealId = null;
          localStorage.removeItem(LS.deal);
          localStorage.setItem(LS.view, 'overview');
        }
        ui.toast('העסקה נמחקה');
        render();
      }, 'מחק לצמיתות');
    }

    case 'new-ratecard': {
      const card = await store.saveRateCard({ name: 'תעריפון חדש', roles: store.defaultRateCard().roles.map((r) => ({ ...r, id: uid('role') })) });
      ui.toast('נוצר תעריפון חדש');
      void card;
      return render();
    }

    case 'set-default-ratecard':
      await store.saveRateCard({ ...store.cache.rateCards.find((c) => c.id === target.dataset.cardId), isDefault: true });
      return render();

    case 'delete-ratecard':
      return confirmModal('מחיקת תעריפון', 'עסקאות שמשויכות לתעריפון יעברו לתעריפון ברירת המחדל.', async () => {
        try { await store.deleteRateCard(target.dataset.cardId); ui.toast('התעריפון נמחק'); }
        catch (err) { ui.toast(err.message, 'error'); }
        render();
      }, 'מחק');

    case 'add-role': {
      const card = store.cache.rateCards.find((c) => c.id === target.dataset.cardId);
      card.roles.push({ id: uid('role'), name: 'דרגה חדשה', rate: 0, junior: false });
      await store.saveRateCard(card);
      return render();
    }

    case 'delete-role': {
      const card = store.cache.rateCards.find((c) => c.id === target.dataset.cardId);
      if (card.roles.length <= 1) return ui.toast('חייבת להישאר דרגה אחת לפחות', 'error');
      card.roles = card.roles.filter((r) => r.id !== target.dataset.roleId);
      await store.saveRateCard(card);
      return render();
    }

    case 'backup':
      return openBackupModal();

    case 'export-backup':
      return exportBackup();

    case 'import-backup':
      return pickFile((file) => importBackup(file), '.json');

    case 'modal-close':
      return closeModal();

    default:
      break;
  }
}

/** הקלדה בגיליון התקציב — עדכון חי ללא רינדור מלא */
function onInput(e) {
  const node = e.target;

  // חיפוש חופשי מרונדר נקודתית כדי לא לאבד פוקוס; שאר המסננים נתפסים ב-change
  if (node.dataset.filter === 'q') {
    state.filters.q = node.value;
    const list = els.main.querySelector('.actuals-body');
    const snap = currentSnapshot();
    if (list && snap) ui.renderActualsList(list, { snap, filters: state.filters });
    return;
  }
  if (node.dataset.filter) return;

  const field = node.dataset.field;
  if (!field) return;

  if (node.dataset.teamId) {
    applyTeamField(node);
    refreshLive();
  }
}

function applyTeamField(node) {
  const team = store.getTeam(node.dataset.teamId);
  if (!team) return null;
  const field = node.dataset.field;
  const line = node.dataset.lineId ? team.lines.find((l) => l.id === node.dataset.lineId) : null;

  if (line) {
    if (field === 'estHours') line.estHours = num(node.value);
    else if (field === 'roleId') {
      line.roleId = node.value;
      // שומרים גם את השם — כך השורה תדע להתחבר לדרגה מקבילה בתעריפון אחר
      const role = store.rateCardFor(store.getDeal(team.dealId)).roles.find((r) => r.id === node.value);
      if (role) line.roleName = role.name;
    }
    else if (field === 'hoursOverride') {
      line.hoursOverride = node.value === '' ? null : num(node.value);
      node.dataset.auto = line.hoursOverride === null ? '1' : '0';
    } else if (field === 'rateOverride') {
      line.rateOverride = node.value === '' ? null : num(node.value);
      node.dataset.auto = line.rateOverride === null ? '1' : '0';
    } else if (field === 'person') line.person = node.value;
  } else if (field === 'name') team.name = node.value;
  else if (field === 'lead') team.lead = node.value;
  else if (field === 'overrunFactor') team.overrunFactor = node.value === '' ? null : num(node.value);

  return team;
}

async function onChange(e) {
  const node = e.target;

  if (node.dataset.imp) return onImportChange(node);

  // סימון צוותים לחישוב מצרפי
  if (node.dataset.pick === 'team') {
    if (node.checked) state.selectedTeams.add(node.dataset.teamId);
    else state.selectedTeams.delete(node.dataset.teamId);
    return render();
  }
  if (node.dataset.pick === 'all') {
    const snap = currentSnapshot();
    state.selectedTeams = new Set(node.checked && snap ? snap.teams.map((t) => t.id) : []);
    return render();
  }

  // טופס פרטי העסקה — שמירה אוטומטית בכל שינוי שדה (כמו בגיליון התקציב),
  // עם רענון התגיות והסרגל בכותרת. כפתור "שמור שינויים" נשאר כגיבוי.
  if (node.form && node.form.id === 'deal-form') {
    await saveDealForm(node.form, { silent: true });
    return;
  }

  // הזנת סך מצטבר בשורה → נרשם כעדכון ביצוע מתוארך (שומר היסטוריה)
  if (node.dataset.field === 'manualHours' && node.dataset.lineId) {
    await store.setLineManualTotal(node.dataset.lineId, node.value === '' ? 0 : num(node.value));
    refreshLive();
    return;
  }

  if (node.dataset.field && node.dataset.teamId) {
    const team = applyTeamField(node);
    if (team) { await store.saveTeam(team); refreshLive(); }
    return;
  }

  if (node.dataset.field && node.dataset.cardId) {
    const card = store.cache.rateCards.find((c) => c.id === node.dataset.cardId);
    if (!card) return;
    const role = node.dataset.roleId ? card.roles.find((r) => r.id === node.dataset.roleId) : null;
    if (node.dataset.field === 'name') card.name = node.value;
    else if (role && node.dataset.field === 'roleName') role.name = node.value;
    else if (role && node.dataset.field === 'roleRate') role.rate = num(node.value);
    else if (role && node.dataset.field === 'roleJunior') role.junior = node.checked;
    await store.saveRateCard(card);
    ui.toast('התעריפון עודכן');
    return;
  }

  if (node.dataset.filter) {
    state.filters[node.dataset.filter] = node.value;
    // רינדור הטבלה בלבד — שומר על מצב סרגל הסינון ועל מיקום הגלילה
    const list = els.main.querySelector('.actuals-body');
    const snap = currentSnapshot();
    if (list && snap) return ui.renderActualsList(list, { snap, filters: state.filters });
    return render();
  }
}

/** שומר את טופס פרטי העסקה. silent = שמירה אוטומטית תוך כדי עריכה (בלי לרנדר מחדש את הטופס) */
async function saveDealForm(form, { silent = false } = {}) {
  const f = Object.fromEntries(new FormData(form).entries());
  const before = store.getDeal(state.dealId);
  await store.saveDeal({
    id: state.dealId,
    name: f.name, client: f.client, code: f.code, status: f.status,
    startDate: f.startDate, targetDate: f.targetDate, notes: f.notes,
    feeModel: f.feeModel, agreedFee: num(f.agreedFee), overrunFactor: num(f.overrunFactor),
    vatRate: num(f.vatRate), rateCardId: f.rateCardId, progressPct: num(f.progressPct),
  });
  // החלפת תעריפון משנה את כל הגיליון — שם חובה רינדור מלא
  if (silent && before && before.rateCardId === f.rateCardId) refreshDealHeader();
  else render();
}

async function onSubmit(e) {
  const form = e.target;
  if (form.id === 'deal-form') {
    e.preventDefault();
    await saveDealForm(form);
    ui.toast('העסקה עודכנה');
    return;
  }
}

/* ============================================================
   מודאלים: עסקה / צוות / רישום
   ============================================================ */

function openDealModal() {
  const body = ui.renderDealForm(null, store.cache.rateCards);
  const presets = body.querySelector('#team-presets');
  for (const name of DEFAULT_TEAM_NAMES) {
    presets.append(ui.el('label', { class: 'inline-check' }, [
      ui.el('input', { type: 'checkbox', value: name, checked: 'checked' }),
      ui.el('span', { text: name }),
    ]));
  }

  const save = btn('צור עסקה', { primary: true, iconName: 'check' });
  save.addEventListener('click', async () => {
    const form = body;
    const f = Object.fromEntries(new FormData(form).entries());
    if (!String(f.name || '').trim()) return ui.toast('שם עסקה הוא שדה חובה', 'error');
    const teamNames = [...presets.querySelectorAll('input:checked')].map((i) => i.value);
    const deal = await store.createDeal({
      name: f.name, client: f.client, code: f.code,
      feeModel: f.feeModel, agreedFee: num(f.agreedFee),
      overrunFactor: num(f.overrunFactor), rateCardId: f.rateCardId,
    }, teamNames);
    closeModal();
    ui.toast('העסקה נוצרה');
    goDeal(deal.id, 'budget');
  });
  const cancel = btn('ביטול');
  cancel.addEventListener('click', closeModal);
  openModal({ title: 'עסקה חדשה', body, actions: [save, cancel] });
}

function openTeamModal() {
  const input = ui.el('input', { class: 'input', name: 'name', placeholder: 'לדוגמה: מיסים / רגולציה / קניין רוחני' });
  const body = ui.el('div', { class: 'modal-form' }, [
    ui.el('label', { class: 'field' }, [
      ui.el('span', { class: 'field__label', text: 'שם הצוות' }), input,
      ui.el('span', { class: 'field__hint', text: 'הצוות ייווצר עם שורה לכל דרגה בתעריפון של העסקה — אותה מתודולוגיה.' }),
    ]),
  ]);
  const save = btn('הוסף צוות', { primary: true, iconName: 'plus' });
  save.addEventListener('click', async () => {
    const name = input.value.trim();
    if (!name) return ui.toast('נדרש שם צוות', 'error');
    await store.addTeam(state.dealId, name);
    closeModal();
    ui.toast('הצוות נוסף');
    render();
  });
  const cancel = btn('ביטול');
  cancel.addEventListener('click', closeModal);
  openModal({ title: 'צוות חדש', body, actions: [save, cancel] });
}

function openEntryModal(entry) {
  const snap = currentSnapshot();
  if (!snap) return;
  const body = ui.renderEntryForm(entry, {
    teams: snap.teams, roles: store.rateCardFor(snap.deal).roles, deal: snap.deal,
  });

  // מילוי תעריף אוטומטי לפי דרגה
  body.querySelector('select[name="roleId"]').addEventListener('change', (e) => {
    const role = store.rateCardFor(snap.deal).roles.find((r) => r.id === e.target.value);
    const rateInput = body.querySelector('input[name="rate"]');
    if (role && !num(rateInput.value)) rateInput.value = String(role.rate);
  });

  const save = btn(entry ? 'שמור' : 'הוסף רישום', { primary: true, iconName: 'check' });
  save.addEventListener('click', async () => {
    const f = Object.fromEntries(new FormData(body).entries());
    const fileEl = body.querySelector('input[name="file"]');
    let fileId = entry?.fileId || '', fileName = entry?.fileName || '';
    if (fileEl?.files?.length) {
      const rec = await fileStore.saveDocument(fileEl.files[0], store.getDeal(state.dealId), { kind: 'invoice' });
      fileId = rec.id; fileName = rec.name;
      if (rec.fallbackReason) ui.toast(`הקובץ נשמר בתוך המערכת — ${rec.fallbackReason}`, 'error');
    }
    const hours = num(f.hours), rate = num(f.rate);
    await store.saveEntry({
      id: entry?.id,
      dealId: state.dealId,
      teamId: f.teamId || '', roleId: f.roleId || '',
      kind: f.kind, date: f.date, description: f.description,
      person: f.person, supplier: f.supplier, docNumber: f.docNumber,
      hours, rate,
      amount: f.amount === '' ? round2(hours * rate) : num(f.amount),
      vatIncluded: !!f.vatIncluded,
      status: f.status, fileId, fileName,
    });
    closeModal();
    ui.toast(entry ? 'הרישום עודכן' : 'הרישום נוסף');
    render();
  });
  const cancel = btn('ביטול');
  cancel.addEventListener('click', closeModal);
  openModal({ title: entry ? 'עריכת רישום' : 'רישום ביצוע', body, actions: [save, cancel] });
}

function openProgressModal(record) {
  const snap = currentSnapshot();
  if (!snap) return;
  const body = ui.renderProgressForm(record, { snap });
  const save = btn(record ? 'שמור' : 'הוסף עדכון', { primary: true, iconName: 'check' });
  save.addEventListener('click', async () => {
    const f = Object.fromEntries(new FormData(body).entries());
    const hours = num(f.hours);
    if (!hours) return ui.toast('נדרשות שעות (אפשר גם שליליות לתיקון)', 'error');
    const [teamId = '', lineId = ''] = String(f.target || '').split('|');
    const line = lineId ? store.findLine(lineId) : null;
    const patch = {
      id: record?.id,
      dealId: state.dealId, teamId, lineId,
      roleId: line?.line.roleId || '', person: line?.line.person || record?.person || '',
      date: f.date, hours, note: f.note, source: record?.source || 'manual',
      fileName: record?.fileName || '', batchId: record?.batchId || '',
    };
    if (record) await store.updateProgress(patch); else await store.addProgress(patch);
    closeModal();
    ui.toast(record ? 'העדכון נשמר' : 'העדכון נוסף');
    render();
  });
  const cancel = btn('ביטול');
  cancel.addEventListener('click', closeModal);
  openModal({ title: record ? 'עריכת עדכון ביצוע' : 'עדכון ביצוע', body, actions: [save, cancel] });
}

/** פריסת צוות לשורות לפי אנשים — לתמחור לפי אדם במקום לפי דרג */
function openSplitModal(teamId) {
  const snap = currentSnapshot();
  const team = store.getTeam(teamId);
  if (!snap || !team) return;
  const roles = store.rateCardFor(snap.deal).roles;
  const known = store.knownPeople(state.dealId);
  const body = ui.renderSplitForm({ team, roles, people: known });
  const save = btn('צור שורות', { primary: true, iconName: 'check' });
  save.addEventListener('click', async () => {
    const rows = [...body.querySelectorAll('[data-person-row]')]
      .map((row) => ({
        name: row.querySelector('[data-person-name]').value.trim(),
        roleId: row.querySelector('[data-person-role]').value,
        rate: row.querySelector('[data-person-rate]').value,
      }))
      .filter((r) => r.name);
    if (!rows.length) return ui.toast('לא הוזנו שמות', 'error');
    const n = await store.splitTeamByPeople(teamId, rows);
    closeModal();
    ui.toast(`${n} שורות נוספו לצוות`);
    render();
  });
  const cancel = btn('ביטול');
  cancel.addEventListener('click', closeModal);
  openModal({ title: `פריסה לפי אנשי צוות · ${team.name}`, body, actions: [save, cancel], wide: true });
}

async function openAttachment(fileId) {
  try { await fileStore.openDocument(fileId); }
  catch (err) { ui.toast(err.message || 'הקובץ לא נמצא', 'error'); }
}

/* ============================================================
   בחירת קובץ
   ============================================================ */

let filePickCallback = null;
function pickFile(cb, accept = '.xlsx,.xlsm,.csv,.tsv,.txt,.pdf') {
  filePickCallback = cb;
  els.fileInput.value = '';
  els.fileInput.accept = accept;
  els.fileInput.click();
}

/* ============================================================
   ייבוא רישומי ביצוע
   ============================================================ */

/** קריאת קובץ לטבלה: XLSX/CSV דרך xlsx.js, PDF דרך pdf-table.js */
async function readAnyTable(file) {
  if (isPdf(file)) return pdfToSheets(file);
  return readTabularFile(file);
}

async function startEntryImport(file) {
  const snap = currentSnapshot();
  if (!snap) return ui.toast('בחר עסקה תחילה', 'error');

  // קובץ שאינו טבלה ואינו PDF — מצרפים אותו כרישום חדש
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['xlsx', 'xlsm', 'csv', 'tsv', 'txt', 'pdf'].includes(ext)) {
    const rec = await fileStore.saveDocument(file, snap.deal, { kind: 'invoice' });
    if (rec.fallbackReason) ui.toast(`הקובץ נשמר בתוך המערכת — ${rec.fallbackReason}`, 'error');
    openEntryModal({ fileId: rec.id, fileName: rec.name, description: file.name.replace(/\.[^.]+$/, ''), kind: 'invoice' });
    return;
  }

  let sheets;
  try { sheets = await readAnyTable(file); }
  catch (err) {
    // PDF שלא ניתן לקריאה — נשמר כמסמך מצורף במקום להיכשל
    if (isPdf(file)) {
      const rec = await fileStore.saveDocument(file, snap.deal, { kind: 'invoice' });
      openEntryModal({ fileId: rec.id, fileName: rec.name, description: file.name.replace(/\.[^.]+$/, ''), kind: 'invoice' });
      return ui.toast(err.message || 'לא ניתן לקרוא את ה-PDF — הקובץ צורף כמסמך', 'error');
    }
    return ui.toast(err.message || 'קריאת הקובץ נכשלה', 'error');
  }

  const sheetIndex = pickBestSheet(sheets, { need: ['amount'] });
  const headerRow = detectHeaderRow(sheets[sheetIndex].rows);
  importCtx = {
    mode: 'entries', file, sheets, sheetIndex,
    headerRow: headerRow < 0 ? 0 : headerRow,
    mapping: guessMapping(sheets[sheetIndex].rows[headerRow < 0 ? 0 : headerRow] || []),
    defaultTeam: '',
    peopleTeams: {},   // key של אדם → teamId (בעסקה הנוכחית)
  };
  syncImportPeople();
  renderImportModal();
}

/** מרענן את רשימת האנשים בקובץ ואת השיוך שלהם — מהזיכרון השמור, בלי לדרוס בחירה ידנית */
function syncImportPeople() {
  const { sheets, sheetIndex, headerRow, mapping } = importCtx;
  const rows = sheetBody(sheets[sheetIndex].rows, headerRow);
  importCtx.people = collectPeople(rows, mapping);

  const remembered = store.peopleTeamIdsFor(state.dealId);
  const teams = store.teamsOf(state.dealId);
  const teamByName = new Map(teams.map((t) => [String(t.name).trim().toLowerCase(), t.id]));
  const rememberedKeys = Object.keys(remembered);
  const next = {};
  for (const p of importCtx.people) {
    const memKey = fuzzyPersonMatch(p.key, rememberedKeys)?.key || (remembered[p.legacyKey] ? p.legacyKey : p.key);
    // 1) בחירה ידנית בהצגה הנוכחית  2) זיכרון קודם  3) הצוות שכתוב בשורה עצמה
    next[p.key] = importCtx.peopleTeams[p.key]
      ?? remembered[memKey]
      ?? (p.teamHint ? (teamByName.get(p.teamHint.toLowerCase()) || '') : '')
      ?? '';
    importCtx.peopleRemembered = importCtx.peopleRemembered || {};
    importCtx.peopleRemembered[p.key] = !!remembered[memKey];
  }
  importCtx.peopleTeams = next;
}

function computeImportPreview() {
  const { sheets, sheetIndex, headerRow, mapping, defaultTeam, peopleTeams } = importCtx;
  const snap = currentSnapshot();
  const rows = sheetBody(sheets[sheetIndex].rows, headerRow);
  const { entries, warnings, skipped } = rowsToEntries(rows, mapping, {
    dealId: state.dealId,
    teams: snap.teams,
    roles: store.rateCardFor(snap.deal).roles,
    personTeams: peopleTeams || {},
    defaults: { teamId: defaultTeam, fileName: importCtx.file.name },
  });
  const marked = markDuplicates(entries, snap.entries);
  importCtx.marked = marked;
  importCtx.warnings = skipped ? [...warnings, `${skipped} שורות דולגו (ללא סכום וללא שעות).`] : warnings;
  return { marked, warnings: importCtx.warnings };
}

function renderImportModal() {
  const snap = currentSnapshot();
  const { marked, warnings } = computeImportPreview();
  const body = ui.renderImportPreview({
    sheets: importCtx.sheets, sheetIndex: importCtx.sheetIndex,
    headerRow: importCtx.headerRow, mapping: importCtx.mapping,
    marked, teams: snap.teams, warnings, mode: 'entries',
    people: importCtx.people, peopleTeams: importCtx.peopleTeams,
    peopleRemembered: importCtx.peopleRemembered,
  });

  const save = btn('ייבא רישומים', { primary: true, iconName: 'check' });
  save.addEventListener('click', async () => {
    const skipDupes = els.modalBody.querySelector('[data-imp="skipDupes"]')?.checked ?? true;
    const remember = els.modalBody.querySelector('[data-imp="rememberPeople"]')?.checked ?? true;
    const list = importCtx.marked.filter((m) => !(skipDupes && m.duplicate)).map((m) => m.entry);
    if (!list.length) { closeModal(); return ui.toast('לא נותרו רישומים לייבוא', 'error'); }
    await store.saveEntries(list);
    // זכירת השיוך לעסקאות הבאות — לפי שם הצוות
    if (remember && importCtx.people?.length) {
      const teamName = new Map(store.teamsOf(state.dealId).map((t) => [t.id, t.name]));
      await store.rememberPeopleTeams(importCtx.people.map((p) => ({
        key: p.key, name: p.name, teamName: teamName.get(importCtx.peopleTeams[p.key]) || '',
      })));
    }
    closeModal();
    ui.toast(`${list.length} רישומים יובאו`);
    state.tab = 'actuals';
    render();
  });
  const cancel = btn('ביטול');
  cancel.addEventListener('click', closeModal);
  openModal({ title: `ייבוא חשבונות · ${importCtx.file.name}`, body, actions: [save, cancel], wide: true });
}

function onImportChange(node) {
  if (!importCtx) return;
  const kind = node.dataset.imp;

  // ---- ייבוא דוח שעות למעקב ----
  if (importCtx.mode === 'progress') {
    if (kind === 'sheet') {
      importCtx.sheetIndex = Number(node.value);
      const hr = detectHeaderRow(importCtx.sheets[importCtx.sheetIndex].rows);
      importCtx.headerRow = hr < 0 ? 0 : hr;
      importCtx.mapping = guessMapping(importCtx.sheets[importCtx.sheetIndex].rows[importCtx.headerRow] || []);
      importCtx.peopleLines = {};
      syncProgressPeople();
    } else if (kind === 'headerRow') {
      importCtx.headerRow = Math.max(0, Number(node.value) - 1);
      importCtx.mapping = guessMapping(importCtx.sheets[importCtx.sheetIndex].rows[importCtx.headerRow] || []);
      importCtx.peopleLines = {};
      syncProgressPeople();
    } else if (kind === 'map') {
      const col = Number(node.dataset.col);
      for (const [k, v] of Object.entries(importCtx.mapping)) if (v === col) delete importCtx.mapping[k];
      if (node.value) importCtx.mapping[node.value] = col;
      syncProgressPeople();
    } else if (kind === 'cumulative') {
      importCtx.cumulative = node.value === '1';
    } else if (kind === 'overlap') {
      importCtx.overlap = node.value;
    } else if (kind === 'personLine') {
      importCtx.peopleLines[node.dataset.personKey] = node.value;
    } else if (kind === 'personTeamBulk') {
      assignPeopleToTeam(node.value);
    }
    return renderProgressImportModal();
  }
  if (kind === 'sheet') {
    importCtx.sheetIndex = Number(node.value);
    const hr = detectHeaderRow(importCtx.sheets[importCtx.sheetIndex].rows);
    importCtx.headerRow = hr < 0 ? 0 : hr;
    importCtx.mapping = guessMapping(importCtx.sheets[importCtx.sheetIndex].rows[importCtx.headerRow] || []);
    importCtx.peopleTeams = {};
    syncImportPeople();
    return renderImportModal();
  }
  if (kind === 'headerRow') {
    importCtx.headerRow = Math.max(0, Number(node.value) - 1);
    importCtx.mapping = guessMapping(importCtx.sheets[importCtx.sheetIndex].rows[importCtx.headerRow] || []);
    importCtx.peopleTeams = {};
    syncImportPeople();
    return renderImportModal();
  }
  if (kind === 'defaultTeam') {
    importCtx.defaultTeam = node.value;
    return renderImportModal();
  }
  if (kind === 'map') {
    const col = Number(node.dataset.col);
    for (const [k, v] of Object.entries(importCtx.mapping)) if (v === col) delete importCtx.mapping[k];
    if (node.value) importCtx.mapping[node.value] = col;
    syncImportPeople();
    return renderImportModal();
  }
  if (kind === 'personTeam') {
    importCtx.peopleTeams[node.dataset.personKey] = node.value;
    return renderImportModal();
  }
  if (kind === 'personTeamAll') {
    for (const p of importCtx.people || []) importCtx.peopleTeams[p.key] = node.value;
    return renderImportModal();
  }
}

/* ============================================================
   ייבוא דוח שעות למעקב השוטף
   ============================================================ */

async function startProgressImport(file) {
  const snap = currentSnapshot();
  if (!snap) return ui.toast('בחר עסקה תחילה', 'error');
  if (!snap.teams.length) return ui.toast('צור צוותים בתקציב לפני ייבוא דוח', 'error');

  let sheets;
  try { sheets = await readAnyTable(file); }
  catch (err) { return ui.toast(err.message || 'קריאת הקובץ נכשלה', 'error'); }

  // בקובץ עם כמה טבלאות (שער חשבון, נספח הוצאות) נבחרת זו שנראית כמו דוח שעות
  const sheetIndex = pickBestSheet(sheets);
  const headerRow = detectHeaderRow(sheets[sheetIndex].rows);
  importCtx = {
    mode: 'progress', file, sheets, sheetIndex,
    headerRow: headerRow < 0 ? 0 : headerRow,
    mapping: guessMapping(sheets[sheetIndex].rows[headerRow < 0 ? 0 : headerRow] || []),
    cumulative: false,
    overlap: 'skip',        // חפיפה עם דיווחים קודמים: skip | replace | add
    peopleTeams: {}, peopleLines: {},
  };
  syncProgressPeople();
  renderProgressImportModal();
}

/** מזהה את האנשים בדוח ומשייך כל אחד לשורת תקציב (לפי הזיכרון, שם השורה או הדרגה) */
function syncProgressPeople() {
  const { sheets, sheetIndex, headerRow, mapping } = importCtx;
  const rows = sheetBody(sheets[sheetIndex].rows, headerRow);
  importCtx.people = collectPeople(rows, mapping);

  const snap = currentSnapshot();
  const remembered = store.peopleTeamIdsFor(state.dealId);
  const memory = store.getPeopleMemory();
  const norm = (s) => String(s || '').trim().toLowerCase();

  const lines = [];
  for (const t of snap.teams) for (const l of t.lines) lines.push({ teamId: t.id, lineId: l.id, roleId: l.roleId, person: l.person, roleName: l.roleName, rate: num(l.rate) });

  // מועמדים לזיהוי מקורב: אנשים שיש להם שורת תקציב, ואנשים שכבר מוכרים מהזיכרון
  const lineKeys = new Map();          // personKey → שורה
  for (const l of lines) { const k = personKey(l.person); if (k && !lineKeys.has(k)) lineKeys.set(k, l); }
  const memoryKeys = Object.keys(memory);

  const next = {};
  const matches = {};
  for (const p of importCtx.people) {
    if (importCtx.peopleLines[p.key]) { next[p.key] = importCtx.peopleLines[p.key]; continue; }

    // 1) שורה שנושאת את שמו — כולל וריאציות כתיב ("עו"ד דנה כהן" / "כהן, דנה" / "ד. כהן")
    const byName = fuzzyPersonMatch(p.key, [...lineKeys.keys()]);
    // 2) הזיכרון: הצוות שאליו שויך בעבר + הדרגה שנרשמה לו
    const memHit = fuzzyPersonMatch(p.key, memoryKeys);
    const memKey = memHit?.key || (memory[p.legacyKey] ? p.legacyKey : '');
    const teamId = remembered[memKey] || remembered[p.key] || '';
    const roleName = memory[memKey]?.roleName || '';
    // 3) הדרגה שכתובה בדוח עצמו, בתוך הצוות הזכור
    const wantRole = roleName || p.roleHint || '';
    const pool = teamId ? lines.filter((l) => l.teamId === teamId) : lines;
    const byRole = wantRole && teamId
      ? pool.find((l) => norm(l.roleName) === norm(wantRole))
      : null;
    // 4) התעריף שבדוח — מזהה את הדרגה גם בדוח שאין בו עמודת "דרגה"
    let byRate = null;
    if (!byRole && p.rateHint > 0) {
      const near = pool.filter((l) => l.rate > 0 && Math.abs(l.rate - p.rateHint) <= Math.max(1, l.rate * 0.02));
      if (near.length === 1) byRate = near[0];
    }

    const hit = (byName ? lineKeys.get(byName.key) : null) || byRole || byRate || null;
    next[p.key] = hit ? `${hit.teamId}|${hit.lineId}` : '';
    if (hit) {
      matches[p.key] = byName && !byName.exact
        ? `זוהה כ"${lineKeys.get(byName.key).person}"`
        : byName ? ''
          : byRole ? `לפי הדרגה "${wantRole}"${memKey ? ' והצוות הזכור' : ''}`
            : byRate ? `לפי התעריף בדוח (${p.rateHint.toLocaleString('he-IL')} ₪)` : '';
    }
  }
  importCtx.peopleLines = next;
  importCtx.peopleMatch = matches;
}

/** שיוך מהיר של כל האנשים בדוח לצוות אחד: לפי שורה על שמם, ואם אין — לפי הדרגה שבדוח */
function assignPeopleToTeam(teamId) {
  if (!teamId) return;
  // דרך ה-snapshot ולא ה-store: רק שם לשורה יש `rate` אפקטיבי (תעריפון + דריסה)
  const team = currentSnapshot()?.teams.find((t) => t.id === teamId);
  if (!team) return;
  const norm = (s) => String(s || '').trim().toLowerCase();
  const keys = team.lines.map((l) => personKey(l.person)).filter(Boolean);
  for (const p of importCtx.people || []) {
    const hitKey = fuzzyPersonMatch(p.key, keys)?.key || '';
    const byPerson = hitKey ? team.lines.find((l) => personKey(l.person) === hitKey) : null;
    const byRole = p.roleHint ? team.lines.find((l) => norm(l.roleName) === norm(p.roleHint)) : null;
    // אין דרגה בדוח? התעריף מזהה אותה. תעריף שלא קיים בתעריפון → הדרגה הקרובה ביותר.
    const rated = p.rateHint > 0 ? team.lines.filter((l) => num(l.rate) > 0) : [];
    const byRate = rated.length
      ? rated.reduce((best, l) => (Math.abs(num(l.rate) - p.rateHint) < Math.abs(num(best.rate) - p.rateHint) ? l : best))
      : null;
    const hit = byPerson || byRole || byRate || team.lines[0];
    if (hit) importCtx.peopleLines[p.key] = `${team.id}|${hit.id}`;
  }
}

function progressPreview() {
  const { sheets, sheetIndex, headerRow, mapping, cumulative, peopleLines, file } = importCtx;
  const rows = sheetBody(sheets[sheetIndex].rows, headerRow);
  const currentByLine = new Map();
  for (const [, target] of Object.entries(peopleLines)) {
    const lineId = String(target || '').split('|')[1];
    if (lineId && !currentByLine.has(lineId)) currentByLine.set(lineId, store.manualHoursOfLine(lineId));
  }
  const resolve = (person) => {
    const target = peopleLines[personKey(person)];
    if (!target) return null;
    const [teamId, lineId] = target.split('|');
    const line = lineId ? store.findLine(lineId) : null;
    return { teamId, lineId, roleId: line?.line.roleId || '' };
  };
  const res = rowsToProgress(rows, mapping, {
    dealId: state.dealId, resolve, cumulative, currentByLine,
    existing: store.progressOf(state.dealId),
    fileName: file.name, batchId: importCtx.batchId || (importCtx.batchId = uid('bat')),
  });
  importCtx.records = res.records;
  importCtx.dateRange = res.dateRange;
  importCtx.billPeriods = res.billPeriods || [];
  return res;
}


function renderProgressImportModal() {
  const snap = currentSnapshot();
  const res = progressPreview();
  const body = ui.renderProgressImportPreview({
    sheets: importCtx.sheets, sheetIndex: importCtx.sheetIndex, headerRow: importCtx.headerRow,
    mapping: importCtx.mapping, people: importCtx.people, peopleLines: importCtx.peopleLines,
    cumulative: importCtx.cumulative, teams: snap.teams, records: res.records,
    unmatched: res.unmatched, skipped: res.skipped, duplicates: res.duplicates,
    dateRange: res.dateRange, overlap: importCtx.overlap || 'skip',
    billPeriods: res.billPeriods || [],
    knownPeriods: store.billPeriodsOf(state.dealId),
    peopleMatch: importCtx.peopleMatch || {},
  });

  const save = btn('הוסף למעקב', { primary: true, iconName: 'check' });
  save.addEventListener('click', async () => {
    const overlap = importCtx.overlap || 'skip';
    let list = (importCtx.records || []).filter((r) => r.lineId || r.teamId);
    const orphans = (importCtx.records || []).length - list.length;

    // טיפול בחפיפה בין דוחות (רק במצב "שעות לתקופה"; דוח מצטבר מטפל בזה בעצמו)
    let replaced = 0, skippedDupes = 0;
    if (!importCtx.cumulative) {
      if (overlap === 'skip') {
        const before = list.length;
        list = list.filter((r) => !r.duplicate);
        skippedDupes = before - list.length;
      } else if (overlap === 'replace' && importCtx.dateRange) {
        replaced = await store.clearImportedProgressRange({
          dealId: state.dealId,
          from: importCtx.dateRange.from, to: importCtx.dateRange.to,
          lineIds: [...new Set(list.map((r) => r.lineId).filter(Boolean))],
        });
      }
    }
    if (!list.length) { closeModal(); return ui.toast('אף שורה לא שויכה לשורת תקציב', 'error'); }
    const remember = els.modalBody.querySelector('[data-imp="rememberPeople"]')?.checked ?? true;
    if (remember) {
      const teamName = new Map(store.teamsOf(state.dealId).map((t) => [t.id, t.name]));
      await store.rememberPeopleTeams((importCtx.people || []).map((p) => {
        const [teamId, lineId] = String(importCtx.peopleLines[p.key] || '').split('|');
        const line = lineId ? store.findLine(lineId) : null;
        return { key: p.key, name: p.name, teamName: teamName.get(teamId) || '', roleName: line?.line.roleName || '' };
      }));
    }
    // שמירת קובץ הדוח עצמו בתיקיית העסקה (או בתוך המערכת אם אין תיקייה)
    let doc = null;
    try {
      doc = await fileStore.saveDocument(importCtx.file, store.getDeal(state.dealId), { kind: 'report' });
      if (doc.fallbackReason) ui.toast(`קובץ הדוח נשמר בתוך המערכת — ${doc.fallbackReason}`, 'error');
    } catch { /* אחסון הקובץ אינו קריטי לייבוא עצמו */ }
    if (doc) for (const r of list) r.fileId = doc.id;
    await store.addProgressMany(list);
    closeModal();
    const extra = [
      orphans ? `${orphans} ללא שיוך` : '',
      skippedDupes ? `${skippedDupes} כפילויות דולגו` : '',
      replaced ? `${replaced} דיווחים קודמים בטווח הוחלפו` : '',
    ].filter(Boolean).join(' · ');
    ui.toast(`${list.length} עדכונים נוספו למעקב${extra ? ` · ${extra}` : ''}`);
    state.tab = 'progress';
    render();
  });
  const cancel = btn('ביטול');
  cancel.addEventListener('click', closeModal);
  openModal({ title: `ייבוא דוח שעות · ${importCtx.file.name}`, body, actions: [save, cancel], wide: true });
}

function exportReviewCSV() {
  const snap = currentSnapshot();
  if (!snap) return;
  const r = dealReview(snap);
  const pct = (v) => (v === null || v === undefined ? '' : v);

  const sheets = [{
    name: 'תחקיר',
    blocks: [
      { t: 'title', text: `תחקיר עסקה — ${snap.deal.name}` },
      { t: 'sub', text: `${snap.deal.client || ''} · הופק ב-${stamp()}` },
      { t: 'gap' },
      { t: 'table',
        head: ['נקודת ייחוס', 'שעות', 'כסף'],
        fmt: ['text', 'hours', 'money'],
        rows: [
          ['הערכה מקורית', r.estHours, r.estCost],
          ['תקציב (אחרי מקדם)', r.budgetHours, r.budgetCost],
          ['ביצוע בפועל', r.actualHours, r.actualCost],
        ],
        total: ['חריגה מהתקציב', r.deltaHours, r.deltaCost] },
      { t: 'gap' },
      { t: 'kv', rows: [
        ['חריגה מול ההערכה — שעות', r.deltaVsEstimateHours, 'hours'],
        ['חריגה מול ההערכה — כסף', r.deltaVsEstimateCost, 'money'],
        ['מהחריגה: עוד שעות', r.volumeEffect, 'money'],
        ['מהחריגה: תמהיל יקר יותר', r.mixEffect, 'money'],
        ['בלנדד מתוכנן', r.blendedPlanned, 'money'],
        ['בלנדד בפועל', r.blendedActual, 'money'],
        ...(snap.realized?.applies ? [
          ['בלנדד שהתקבל בפועל (ללא ג\'וניור)', snap.realized.blendedSenior, 'money'],
          ['בלנדד שהתקבל בפועל (כל השעות)', snap.realized.blendedAll, 'money'],
        ] : []),
        ['מקדם חריגה בשימוש', r.usedFactor, 'pct'],
        ['המקדם שנדרש בפועל', pct(r.requiredFactor), 'pct'],
        ['מקדם מוצע לעסקה דומה', pct(r.suggestedFactor), 'pct'],
      ] },
    ],
  }, {
    name: 'מוקדי חריגה',
    blocks: [
      { t: 'title', text: 'מוקדי החריגה — לפי שורת תקציב' },
      { t: 'gap' },
      { t: 'table',
        head: ['צוות', 'דרגה / אדם', 'הוערך', 'תוקצב', 'בפועל', 'Δ שעות', 'Δ ₪', 'ניצול', 'מקדם שנדרש'],
        fmt: ['text', 'text', 'hours', 'hours', 'hours', 'hours', 'money', 'pct', 'pct'],
        rows: r.hotspots.map((l) => [l.teamName, l.person ? `${l.person} · ${l.roleName}` : l.roleName,
          l.estHours, l.budgetHours, l.actualHours, l.deltaHours, l.deltaCost, l.util, pct(l.vsEstimate)]),
        total: ['סה"כ', '', r.estHours, r.budgetHours, r.actualHours, r.deltaHours, r.deltaCost, '', ''] },
    ],
  }, {
    name: 'תמהיל דרגות',
    blocks: [
      { t: 'title', text: 'תמהיל הדרגות — מתוכנן מול בפועל' },
      { t: 'gap' },
      { t: 'table',
        head: ['דרגה', 'תעריף', 'שעות מתוכננות', '% מהתכנון', 'שעות בפועל', '% מהביצוע', 'Δ שעות', 'Δ ₪'],
        fmt: ['text', 'money', 'hours', 'pct', 'hours', 'pct', 'hours', 'money'],
        rows: r.byRole.map((x) => [x.name + (x.junior ? " (ג'וניור)" : ''), x.rate, x.budgetHours,
          x.plannedShare, x.actualHours, x.actualShare, x.deltaHours, x.deltaCost]) },
    ],
  }];

  if (r.people.length) {
    sheets.push({
      name: 'לפי אדם',
      blocks: [
        { t: 'title', text: 'ביצוע לפי עורך דין' },
        { t: 'gap' },
        { t: 'table',
          head: ['עורך דין', 'צוותים', 'תוקצב', 'בפועל', 'Δ שעות', 'Δ ₪', 'ניצול'],
          fmt: ['text', 'text', 'hours', 'hours', 'hours', 'money', 'pct'],
          rows: r.people.map((x) => [x.name, x.teams.join(' · '), x.budgetHours, x.actualHours, x.deltaHours, x.deltaCost, x.util]) },
      ],
    });
  }

  downloadWorkbook(`תחקיר — ${snap.deal.name} — ${stamp()}`, sheets);
}

function exportProgressCSV() {
  const snap = currentSnapshot();
  if (!snap) return;
  const teamName = new Map(snap.teams.map((t) => [t.id, t.name]));
  const lineLabel = new Map();
  for (const t of snap.teams) for (const l of t.lines) lineLabel.set(l.id, l.person ? `${l.person} · ${l.roleName}` : l.roleName);

  const live = [...snap.execution].filter((r) => !r.superseded)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const periods = ui.progressPeriods(snap, state.progressPeriod);
  const periodLabel = { day: 'יומי', week: 'שבועי', month: 'חודשי' }[state.progressPeriod] || '';
  const sources = store.dataSourcesOf(snap.deal.id);

  downloadWorkbook(`מעקב ביצוע — ${snap.deal.name} — ${stamp()}`, [
    { name: 'דיווחי ביצוע',
      blocks: [
        { t: 'title', text: `דיווחי ביצוע — ${snap.deal.name}` },
        { t: 'sub', text: `${live.length} דיווחים פעילים · ${snap.actualHours} שעות · הופק ב-${stamp()}` },
        { t: 'gap' },
        { t: 'table',
          head: ['תאריך', 'צוות', 'שורת תקציב', 'עורך דין', 'שעות', 'מקור', 'קובץ', 'תקופת חיוב', 'הערה'],
          fmt: ['date', 'text', 'text', 'text', 'hours', 'text', 'text', 'text', 'text'],
          rows: live.map((p) => [p.date, teamName.get(p.teamId) || '', lineLabel.get(p.lineId) || '', p.person,
            p.hours, sourceLabel(p.source), p.fileName || '', p.billPeriod || '', p.note || '']),
          total: ['סה"כ', '', '', '', snap.actualHours, '', '', '', ''] },
      ] },
    { name: `סיכום ${periodLabel}`,
      blocks: [
        { t: 'title', text: `סיכום ${periodLabel}` },
        { t: 'gap' },
        { t: 'table',
          head: ['תקופה', 'שעות', 'עלות', 'מצטבר שעות', 'מצטבר עלות', 'ניצול מצטבר'],
          fmt: ['text', 'hours', 'money', 'hours', 'money', 'pct'],
          rows: periods.map((r) => [r.key, r.hours, r.cost, r.cumulativeHours, r.cumulativeCost,
            snap.budgetCost > 0 ? r.cumulativeCost / snap.budgetCost : '']) },
      ] },
    { name: 'מקורות מידע',
      blocks: [
        { t: 'title', text: 'מקורות המידע' },
        { t: 'gap' },
        { t: 'table',
          head: ['מקור', 'סוג', 'תקופת חיוב', 'מתאריך', 'עד תאריך', 'רשומות', 'שעות'],
          fmt: ['text', 'text', 'text', 'date', 'date', 'int', 'hours'],
          rows: sources.map((s) => [s.label, { import: 'דוח שעות', invoice: 'חשבון', manual: 'ידני' }[s.kind] || s.kind,
            s.periods.join(', '), s.from, s.to, s.count, s.hours]) },
      ] },
  ]);
}

/* ============================================================
   ייבוא גיליון תקציב
   ============================================================ */

async function startBudgetImport(file) {
  const snap = currentSnapshot();
  if (!snap) return ui.toast('בחר עסקה תחילה', 'error');
  let sheets;
  try { sheets = await readTabularFile(file); }
  catch (err) { return ui.toast(err.message || 'קריאת הקובץ נכשלה', 'error'); }

  const roles = store.rateCardFor(snap.deal).roles;
  const parsed = parseBudgetSheet(sheets[0].rows, roles.map((r) => r.name));
  if (!parsed.teams.length) return ui.toast('לא זוהה מבנה תקציב בגיליון', 'error');

  const body = ui.renderBudgetImportPreview(parsed, { roles });
  const save = btn('צור צוותים', { primary: true, iconName: 'check' });
  save.addEventListener('click', async () => {
    const applyFactor = els.modalBody.querySelector('[data-imp="applyFactor"]')?.checked;
    const applyRates = els.modalBody.querySelector('[data-imp="applyRates"]')?.checked;
    closeModal();
    await applyBudgetImport(parsed, { applyFactor, applyRates });
  });
  const cancel = btn('ביטול');
  cancel.addEventListener('click', closeModal);
  openModal({ title: `ייבוא תקציב · ${file.name}`, body, actions: [save, cancel], wide: true });
}

async function applyBudgetImport(parsed, { applyFactor, applyRates }) {
  const deal = store.getDeal(state.dealId);
  const card = store.rateCardFor(deal);

  // דרגות חדשות שזוהו בגיליון
  const byName = new Map(card.roles.map((r) => [r.name.trim(), r]));
  let cardChanged = false;
  for (const t of parsed.teams) {
    for (const l of t.lines) {
      const name = l.roleName.trim();
      if (!byName.has(name)) {
        const role = { id: uid('role'), name, rate: l.rate || 0, junior: /מתמח|סטודנט|junior|intern/i.test(name) };
        card.roles.push(role); byName.set(name, role); cardChanged = true;
      } else if (applyRates && l.rate > 0) {
        byName.get(name).rate = l.rate; cardChanged = true;
      }
    }
  }
  if (applyRates) {
    for (const r of parsed.roles) {
      const hit = byName.get(r.name.trim());
      if (hit && r.rate > 0) { hit.rate = r.rate; cardChanged = true; }
    }
  }
  if (cardChanged) await store.saveRateCard(card);

  if (applyFactor && parsed.overrunFactor !== null) {
    await store.saveDeal({ id: deal.id, overrunFactor: parsed.overrunFactor });
  }

  const factor = applyFactor && parsed.overrunFactor !== null ? parsed.overrunFactor : deal.overrunFactor;
  const base = store.nextTeamOrder(deal.id);
  const teams = parsed.teams.map((t, i) => ({
    id: uid('team'), dealId: deal.id, name: t.name, order: base + i,
    // צוות שזוהה ללא שורות מקבל את מתודולוגיית הבסיס — שורה לכל דרגה, אפס שעות
    lines: (t.lines.length ? t.lines : card.roles.map((r) => ({ roleName: r.name, estHours: 0, budgetHours: 0 }))).map((l) => ({
      id: uid('ln'),
      roleId: byName.get(l.roleName.trim())?.id || '',
      roleName: l.roleName.trim(),
      estHours: l.estHours,
      // אם שעות התקציב בגיליון אינן נגזרות מהנוסחה — נשמרות כדריסה מפורשת
      hoursOverride: l.budgetHours > 0 && l.budgetHours !== roundUpHours(l.estHours * (1 + factor)) ? l.budgetHours : null,
      rateOverride: null,
    })),
  }));
  for (const t of teams) await store.saveTeam(t);
  ui.toast(`${teams.length} צוותים יובאו מהגיליון`);
  state.tab = 'budget';
  render();
}

/* ============================================================
   ייצוא
   ============================================================ */

function downloadFile(name, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function stamp() { return new Date().toISOString().slice(0, 10); }

function exportEntriesCSV() {
  const snap = currentSnapshot();
  if (!snap) return;
  const teamName = new Map(snap.teams.map((t) => [t.id, t.name]));
  const roleName = new Map(store.rateCardFor(snap.deal).roles.map((r) => [r.id, r.name]));
  const rows = ui.filterEntries(snap.entries, state.filters);
  const sumHours = round2(rows.reduce((a, e) => a + num(e.hours), 0));
  const sumAmount = round2(rows.reduce((a, e) => a + num(e.amount), 0));

  downloadWorkbook(`חשבונות — ${snap.deal.name} — ${stamp()}`, [{
    name: 'חשבונות',
    blocks: [
      { t: 'title', text: `חשבונות ומסמכים — ${snap.deal.name}` },
      { t: 'sub', text: `${rows.length} רישומים · הופק ב-${stamp()}` },
      { t: 'gap' },
      { t: 'table',
        head: ['תאריך', 'תיאור', 'עורך דין', 'צוות', 'דרגה', 'סוג', 'שעות', 'תעריף', 'סכום', 'כולל מע"מ', 'סטטוס', 'ספק', 'מסמך'],
        fmt: ['date', 'text', 'text', 'text', 'text', 'text', 'hours', 'money', 'money', 'text', 'text', 'text', 'text'],
        rows: rows.map((e) => [
          e.date, e.description, e.person, teamName.get(e.teamId) || '', roleName.get(e.roleId) || '',
          (ENTRY_KINDS.find((k) => k.id === e.kind) || {}).label || '', e.hours || '', e.rate || '', e.amount,
          e.vatIncluded ? 'כן' : 'לא', (ENTRY_STATUSES.find((s) => s.id === e.status) || {}).label || '',
          e.supplier, e.docNumber,
        ]),
        total: ['סה"כ', '', '', '', '', '', sumHours, '', sumAmount, '', '', '', ''] },
    ],
  }]);
}

function exportDealCSV() {
  const snap = currentSnapshot();
  if (!snap) return;
  const lines = [];
  for (const t of snap.teams) {
    for (const l of t.lines) {
      lines.push([t.name, l.roleName, l.person, l.estHours, l.budgetHours, l.rate, l.budgetCost,
        l.actualHours, l.actualCost, l.remainingHours, l.remainingCost, l.util]);
    }
    lines.push([`${t.name} — סה"כ`, '', '', t.estHours, t.budgetHours, '', t.budgetCost,
      t.actualHours, t.actualCost, t.remainingHours, t.remainingCost, t.util]);
  }

  const sheets = [{
    name: 'תקציב',
    blocks: [
      { t: 'title', text: `תקציב עסקה — ${snap.deal.name}` },
      { t: 'sub', text: `${snap.deal.client || ''} · מקדם חריגה ${fmtPct(snap.deal.overrunFactor)} · הופק ב-${stamp()}` },
      { t: 'gap' },
      { t: 'table',
        head: ['צוות', 'דרגה', 'חבר צוות', 'שעות מוערכות', 'שעות תקציב', 'תעריף', 'תקציב ₪',
          'שעות בפועל', 'עלות בפועל ₪', 'יתרת שעות', 'יתרה ₪', 'ניצול'],
        fmt: ['text', 'text', 'text', 'hours', 'hours', 'money', 'money', 'hours', 'money', 'hours', 'money', 'pct'],
        rows: lines,
        total: ['סה"כ עסקה', '', '', snap.estHours, snap.budgetHours, '', snap.budgetCost,
          snap.actualHours, snap.actualCost, snap.remainingHours, snap.remainingCost, snap.util] },
      { t: 'gap' },
      { t: 'kv', rows: [
        ['תעריף בלנדד (ללא ג\'וניור)', snap.blendedRate, 'money'],
        ['תעריף ממוצע כולל', snap.blendedAll, 'money'],
        ['בלנדד בפועל', snap.blendedActual, 'money'],
        ['תעריף ממוצע בפועל', snap.effectiveRate, 'money'],
        ...(snap.hasFee ? [['שכ"ט מוסכם / תקרה', snap.agreedFee, 'money']] : []),
        ...(snap.realized?.applies ? [
          ['בלנדד שהתקבל בפועל (ללא ג\'וניור)', snap.realized.blendedSenior, 'money'],
          ['בלנדד שהתקבל בפועל (כל השעות)', snap.realized.blendedAll, 'money'],
        ] : []),
        ...(snap.eac !== null ? [['תחזית לסיום (EAC)', snap.eac, 'money'], ['בסיס התחזית', snap.eacBasis]] : []),
      ] },
    ],
  }];

  if (snap.capBudget.applies) {
    sheets.push({
      name: 'תעריפים אפקטיביים',
      blocks: [
        { t: 'title', text: 'תקרת שכ"ט ותעריפים אפקטיביים' },
        { t: 'sub', text: `תקציב ${snap.budgetCost} מול תקרה ${snap.agreedFee} — הנחה אפקטיבית ${fmtPct(snap.capBudget.discountPct, 1)}` },
        { t: 'gap' },
        { t: 'table',
          head: ['דרגה', 'תעריף נומינלי', 'תעריף אפקטיבי', 'הפרש'],
          fmt: ['text', 'money', 'money', 'money'],
          rows: [
            ...snap.effectiveRates.roles.map((r) => [r.name, r.rate, r.effective, r.effective - r.rate]),
            ['בלנדד (ללא ג\'וניור)', snap.blendedRate, snap.effectiveRates.blended, snap.effectiveRates.blended - snap.blendedRate],
            ['ממוצע כולל', snap.blendedAll, snap.effectiveRates.blendedAll, snap.effectiveRates.blendedAll - snap.blendedAll],
          ] },
      ],
    });
  }

  downloadWorkbook(`תקציב — ${snap.deal.name} — ${stamp()}`, sheets);
}

function exportPortfolioCSV() {
  const list = [...state.snapshots.values()];
  const sum = (f) => round2(list.reduce((a, s) => a + num(f(s)), 0));
  downloadWorkbook(`סקירת תקציבים — ${stamp()}`, [{
    name: 'סקירה',
    blocks: [
      { t: 'title', text: 'סקירת תקציבי עסקאות' },
      { t: 'sub', text: `${list.length} עסקאות · הופק ב-${stamp()}` },
      { t: 'gap' },
      { t: 'table',
        head: ['עסקה', 'לקוח', 'סטטוס', 'שעות תקציב', 'שעות בפועל', 'תקציב', 'בפועל', 'יתרה', 'ניצול', 'שכ"ט מוסכם', 'רווח גולמי', 'תחזית לסיום'],
        fmt: ['text', 'text', 'text', 'hours', 'hours', 'money', 'money', 'money', 'pct', 'money', 'money', 'money'],
        rows: list.map((s) => [
          s.deal.name, s.deal.client, (DEAL_STATUSES.find((x) => x.id === s.deal.status) || {}).label || s.deal.status,
          s.budgetHours, s.actualHours, s.budgetCost, s.actualCost, s.remainingCost,
          s.util, s.agreedFee || '', s.margin === null ? '' : s.margin, s.eac === null ? '' : s.eac,
        ]),
        total: ['סה"כ', '', '', sum((s) => s.budgetHours), sum((s) => s.actualHours),
          sum((s) => s.budgetCost), sum((s) => s.actualCost), sum((s) => s.remainingCost), '',
          sum((s) => s.agreedFee), '', ''] },
    ],
  }]);
}

/* ============================================================
   גיבוי / שחזור
   ============================================================ */

function openBackupModal() {
  const stats = ui.el('div', { class: 'facts' }, [
    ui.el('div', { class: 'fact' }, [ui.el('span', { class: 'fact__label', text: 'עסקאות' }), ui.el('span', { class: 'fact__value num', text: String(store.cache.deals.length) })]),
    ui.el('div', { class: 'fact' }, [ui.el('span', { class: 'fact__label', text: 'צוותים' }), ui.el('span', { class: 'fact__value num', text: String(store.cache.teams.length) })]),
    ui.el('div', { class: 'fact' }, [ui.el('span', { class: 'fact__label', text: 'רישומי ביצוע' }), ui.el('span', { class: 'fact__value num', text: String(store.cache.entries.length) })]),
  ]);
  const body = ui.el('div', { class: 'modal-form' }, [
    ui.el('p', { class: 'modal-text', text: 'הנתונים נשמרים במכשיר בלבד (IndexedDB) ועובדים גם ללא חיבור. גיבוי לקובץ מאפשר העברה בין מכשירים.' }),
    stats,
    ui.el('div', { class: 'form-actions form-actions--wrap' }, [
      btn('ייצוא גיבוי (JSON)', { iconName: 'download', action: 'export-backup' }),
      btn('שחזור מגיבוי', { iconName: 'upload', action: 'import-backup' }),
    ]),
    ui.el('p', { class: 'field__hint', text: 'שחזור מחליף את כל הנתונים הקיימים במערכת התקציבים. אינו נוגע ב-CRM.' }),
  ]);
  const close = btn('סגור');
  close.addEventListener('click', closeModal);
  openModal({ title: 'גיבוי ונתונים', body, actions: [close] });
}

async function exportBackup() {
  const data = await store.collectBackup();
  downloadFile(`lexbudget-backup-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
  ui.toast('הגיבוי הורד');
}

async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { return ui.toast('קובץ JSON לא תקין', 'error'); }
  if (!store.isValidBackup(data)) return ui.toast('הקובץ אינו גיבוי של מערכת התקציבים', 'error');
  confirmModal('שחזור מגיבוי', `הגיבוי מכיל ${data.deals.length} עסקאות ו-${data.entries.length} רישומים. כל הנתונים הקיימים יוחלפו.`, async () => {
    await store.applyBackup(data);
    state.dealId = null; state.view = 'overview';
    ui.toast('השחזור הושלם');
    render();
  }, 'שחזר והחלף');
}

/* ============================================================
   Service Worker
   ============================================================ */

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}

/* ============================================================
   נתוני דמו — משחזרים את גיליון התקציב המקורי
   ============================================================ */

async function seedDemo() {
  const card = store.defaultRateCard();
  const roles = Object.fromEntries(card.roles.map((r) => [r.name, r.id]));
  const deal = await store.createDeal({
    name: 'רכישת אלפא טכנולוגיות', client: 'קרן מרידיאן', code: 'M&A-2026-01',
    feeModel: 'capped', agreedFee: 280000, overrunFactor: 0.2,
    startDate: '2026-01-15', targetDate: '2026-06-30', progressPct: 45,
  }, []);

  const plan = [
    ['צוות עסקה', { 'מתמחה': 25, 'עו"ד': 50, 'שותף': 70 }],
    ['בדיקת נאותות', { 'מתמחה': 60, 'עו"ד': 40, 'שותף': 8 }],
    ['קורפורייט', { 'מתמחה': 40, 'עו"ד': 35, 'שותף': 10 }],
    ['דיני עבודה', { 'מתמחה': 40, 'עו"ד': 30, 'שותף': 10 }],
    ['אחרים', { 'מתמחה': 20, 'עו"ד': 20, 'שותף': 10 }],
  ];
  for (const [i, [name, hours]] of plan.entries()) {
    await store.saveTeam({
      id: uid('team'), dealId: deal.id, name, order: i,
      lines: Object.entries(hours).map(([roleName, h]) => ({ id: uid('ln'), roleId: roles[roleName], roleName, estHours: h })),
    });
  }

  const teams = store.teamsOf(deal.id);
  const entries = [];
  const months = ['2026-02-05', '2026-03-08', '2026-04-11', '2026-05-14'];
  teams.forEach((t, ti) => {
    months.forEach((date, mi) => {
      t.lines.forEach((l, li) => {
        const role = card.roles.find((r) => r.id === l.roleId);
        const h = round2(l.estHours * (0.18 + (ti === 1 ? 0.12 : 0) + mi * 0.02 + li * 0.01));
        if (h <= 0) return;
        entries.push({
          id: uid('ent'), dealId: deal.id, teamId: t.id, roleId: l.roleId,
          kind: 'hours', date, description: `${t.name} — עבודה שוטפת`,
          hours: h, rate: role.rate, amount: round2(h * role.rate), status: 'billed',
        });
      });
    });
  });
  entries.push({
    id: uid('ent'), dealId: deal.id, teamId: '', roleId: '', kind: 'disbursement',
    date: '2026-03-20', description: 'אגרות רשם החברות ומומחה שווי', supplier: 'רשם החברות',
    amount: 8400, status: 'paid',
  });
  await store.saveEntries(entries);
  ui.toast('נטענו נתוני דמו');
  goDeal(deal.id, 'budget');
}

init();
