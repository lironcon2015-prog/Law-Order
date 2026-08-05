// app.js — bootstrap, state יחיד, ניתוב תצוגות ו-event delegation.
// כל המוטציות עוברות דרך store.js; render() הוא מקור האמת לתצוגה.

import * as store from './store.js';
import * as db from './db.js';
import {
  computeDeal, uid, num, round2, fmtPct, roundUpHours,
  DEFAULT_TEAM_NAMES, ENTRY_KINDS, ENTRY_STATUSES,
} from './model.js';
import * as ui from './ui.js';
import { readTabularFile } from './xlsx.js';
import {
  detectHeaderRow, guessMapping, rowsToEntries, markDuplicates, parseBudgetSheet, collectPeople,
} from './importer.js';

/* ============================================================
   State
   ============================================================ */

const LS = { deal: 'lb_dealId', tab: 'lb_tab', view: 'lb_view' };

const state = {
  view: 'overview',        // 'overview' | 'deal' | 'rates'
  dealId: null,
  tab: 'budget',           // 'budget' | 'actuals' | 'control' | 'settings'
  filters: { q: '', teamId: '', kind: '', status: '' },
  snapshots: new Map(),
  selectedTeams: new Set(),   // צוותים מסומנים לחישוב מצרפי (בעסקה הפעילה)
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
      deal, teams: store.cache.teams, entries: store.cache.entries, rateCard: store.rateCardFor(deal),
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
    if (state.tab === 'budget') ui.renderBudgetTab(body, { snap, rateCard: store.rateCardFor(snap.deal), selected: state.selectedTeams });
    else if (state.tab === 'actuals') ui.renderActualsTab(body, { snap, filters: state.filters });
    else if (state.tab === 'control') ui.renderControlTab(body, { snap });
    else ui.renderDealSettings(body, { snap, rateCards: store.cache.rateCards });
    return;
  }

  ui.renderOverview(els.main, { snapshots: state.snapshots });
}

/** רענון קל: מעדכן רק תאים מחושבים (בזמן הקלדה בגיליון התקציב) */
function refreshLive() {
  const deal = store.getDeal(state.dealId);
  if (!deal) return;
  const snap = computeDeal({ deal, teams: store.cache.teams, entries: store.cache.entries, rateCard: store.rateCardFor(deal) });
  state.snapshots.set(deal.id, snap);
  ui.refreshComputed(snap, state.selectedTeams);
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
  if (id !== state.dealId) state.selectedTeams.clear();   // הסימון שייך לעסקה שממנה יצאנו
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

  // גרירה לשינוי סדר הטאבים
  let dragId = null;
  els.tabs.addEventListener('dragstart', (e) => {
    const tab = e.target.closest('[data-action="select-deal"]');
    if (!tab) return;
    dragId = tab.dataset.id;
    tab.classList.add('dragging');
  });
  els.tabs.addEventListener('dragend', (e) => {
    e.target.closest?.('.dtab')?.classList.remove('dragging');
    dragId = null;
  });
  els.tabs.addEventListener('dragover', (e) => {
    if (dragId) e.preventDefault();
  });
  els.tabs.addEventListener('drop', async (e) => {
    const target = e.target.closest('[data-action="select-deal"]');
    if (!dragId || !target || target.dataset.id === dragId) return;
    e.preventDefault();
    const ids = store.cache.deals.map((d) => d.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(target.dataset.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    await store.reorderDeals(ids);
    render();
  });

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
    await startEntryImport(e.dataTransfer.files[0]);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.modal.open) closeModal();
  });
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

    case 'clear-picks':
      state.selectedTeams.clear();
      return render();

    case 'delete-team': {
      const team = store.getTeam(target.dataset.teamId);
      return confirmModal('מחיקת צוות', `למחוק את "${team?.name}"? רישומי הביצוע שלו יישמרו ויעברו למצב "ללא שיוך".`, async () => {
        const moved = await store.deleteTeam(target.dataset.teamId);
        state.selectedTeams.delete(target.dataset.teamId);
        ui.toast(moved ? `הצוות נמחק · ${moved} רישומים עברו ל"ללא שיוך"` : 'הצוות נמחק');
        render();
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
      team.lines = team.lines.filter((l) => l.id !== target.dataset.lineId);
      await store.saveTeam(team);
      return render();
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
    }
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
      const rec = await store.saveFile(fileEl.files[0]);
      fileId = rec.id; fileName = rec.name;
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

async function openAttachment(fileId) {
  const rec = await store.getFile(fileId);
  if (!rec) return ui.toast('הקובץ לא נמצא', 'error');
  const url = URL.createObjectURL(rec.blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ============================================================
   בחירת קובץ
   ============================================================ */

let filePickCallback = null;
function pickFile(cb, accept = '.xlsx,.xlsm,.csv,.tsv,.txt') {
  filePickCallback = cb;
  els.fileInput.value = '';
  els.fileInput.accept = accept;
  els.fileInput.click();
}

/* ============================================================
   ייבוא רישומי ביצוע
   ============================================================ */

async function startEntryImport(file) {
  const snap = currentSnapshot();
  if (!snap) return ui.toast('בחר עסקה תחילה', 'error');

  // קובץ שאינו טבלה — מצרפים אותו כרישום חדש
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['xlsx', 'xlsm', 'csv', 'tsv', 'txt'].includes(ext)) {
    const rec = await store.saveFile(file);
    openEntryModal({ fileId: rec.id, fileName: rec.name, description: file.name.replace(/\.[^.]+$/, ''), kind: 'invoice' });
    return;
  }

  let sheets;
  try { sheets = await readTabularFile(file); }
  catch (err) { return ui.toast(err.message || 'קריאת הקובץ נכשלה', 'error'); }

  const sheetIndex = 0;
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
  const rows = sheets[sheetIndex].rows.slice(headerRow + 1);
  importCtx.people = collectPeople(rows, mapping);

  const remembered = store.peopleTeamIdsFor(state.dealId);
  const teams = store.teamsOf(state.dealId);
  const teamByName = new Map(teams.map((t) => [String(t.name).trim().toLowerCase(), t.id]));
  const next = {};
  for (const p of importCtx.people) {
    // 1) בחירה ידנית בהצגה הנוכחית  2) זיכרון קודם  3) הצוות שכתוב בשורה עצמה
    next[p.key] = importCtx.peopleTeams[p.key]
      ?? remembered[p.key]
      ?? (p.teamHint ? (teamByName.get(p.teamHint.toLowerCase()) || '') : '')
      ?? '';
    importCtx.peopleRemembered = importCtx.peopleRemembered || {};
    importCtx.peopleRemembered[p.key] = !!remembered[p.key];
  }
  importCtx.peopleTeams = next;
}

function computeImportPreview() {
  const { sheets, sheetIndex, headerRow, mapping, defaultTeam, peopleTeams } = importCtx;
  const snap = currentSnapshot();
  const rows = sheets[sheetIndex].rows.slice(headerRow + 1).filter((r) => r && r.some((c) => c !== null && c !== undefined && c !== ''));
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

function toCSV(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

function stamp() { return new Date().toISOString().slice(0, 10); }

function exportEntriesCSV() {
  const snap = currentSnapshot();
  if (!snap) return;
  const teamName = new Map(snap.teams.map((t) => [t.id, t.name]));
  const roleName = new Map(store.rateCardFor(snap.deal).roles.map((r) => [r.id, r.name]));
  const rows = [['תאריך', 'תיאור', 'עורך דין', 'צוות', 'דרגה', 'סוג', 'שעות', 'תעריף', 'סכום', 'כולל מע"מ', 'סטטוס', 'ספק', 'מסמך']];
  for (const e of ui.filterEntries(snap.entries, state.filters)) {
    rows.push([
      e.date, e.description, e.person, teamName.get(e.teamId) || '', roleName.get(e.roleId) || '',
      (ENTRY_KINDS.find((k) => k.id === e.kind) || {}).label || '', e.hours, e.rate, e.amount,
      e.vatIncluded ? 'כן' : 'לא', (ENTRY_STATUSES.find((s) => s.id === e.status) || {}).label || '',
      e.supplier, e.docNumber,
    ]);
  }
  downloadFile(`ביצוע-${snap.deal.name}-${stamp()}.csv`, toCSV(rows));
}

function exportDealCSV() {
  const snap = currentSnapshot();
  if (!snap) return;
  const rows = [];
  rows.push([`תקציב עסקה: ${snap.deal.name}`, snap.deal.client, '', '', '', '', '']);
  rows.push([]);
  rows.push(['צוות', 'דרגה', 'שעות מוערכות', 'שעות תקציב', 'תעריף', 'תקציב ₪', 'שעות בפועל', 'בפועל ₪', 'יתרה ₪', 'ניצול']);
  for (const t of snap.teams) {
    for (const l of t.lines) {
      rows.push([t.name, l.roleName, l.estHours, l.budgetHours, l.rate, l.budgetCost, l.actualHours, l.actualCost, l.remainingCost, fmtPct(l.util)]);
    }
    rows.push([`${t.name} — סה"כ`, '', t.estHours, t.budgetHours, '', t.budgetCost, t.actualHours, t.actualCost, t.remainingCost, fmtPct(t.util)]);
  }
  rows.push([]);
  rows.push(['סה"כ עסקה', '', snap.estHours, snap.budgetHours, '', snap.budgetCost, snap.actualHours, snap.actualCost, snap.remainingCost, fmtPct(snap.util)]);
  rows.push(['תעריף בלנדד (שעות ללא ג\'וניור)', snap.blendedRate]);
  rows.push(['תעריף ממוצע כולל', snap.blendedAll]);
  rows.push(['תעריף אפקטיבי בפועל', snap.effectiveRate]);
  if (snap.eac !== null) rows.push(['תחזית לסיום (EAC)', snap.eac, snap.eacBasis]);
  downloadFile(`תקציב-${snap.deal.name}-${stamp()}.csv`, toCSV(rows));
}

function exportPortfolioCSV() {
  const rows = [['עסקה', 'לקוח', 'סטטוס', 'תקציב', 'בפועל', 'יתרה', 'ניצול', 'שכ"ט מוסכם', 'רווח גולמי', 'תחזית לסיום']];
  for (const s of state.snapshots.values()) {
    rows.push([
      s.deal.name, s.deal.client, s.deal.status, s.budgetCost, s.actualCost, s.remainingCost,
      fmtPct(s.util), s.agreedFee || '', s.margin === null ? '' : s.margin, s.eac === null ? '' : s.eac,
    ]);
  }
  downloadFile(`סקירת-תקציבים-${stamp()}.csv`, toCSV(rows));
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
