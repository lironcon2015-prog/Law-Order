// app.js — bootstrap, ניהול state יחיד, event delegation, ניתוב תצוגות.

import * as store from './store.js';
import * as search from './search.js';
import * as ui from './ui.js';
import * as sync from './sync.js';

/* ---------- State יחיד (single source of truth) ---------- */
const state = {
  contacts: [],
  companies: [],
  selectedContactId: null,
  searchTerm: '',
  view: 'all',          // 'all' | 'followup'
  statusFilter: 'all',  // 'all' | <status key>
  detailTab: 'overview', // 'overview' | 'career' | 'referrals' | 'notes'
  mainView: 'pipeline', // 'pipeline' | 'list'
};

/* ---------- DOM refs ---------- */
const refs = {};

/* ---------- bootstrap ---------- */
async function init() {
  cacheRefs();
  paintIcons();
  wireEvents();
  registerSW();

  try {
    await loadData();
  } catch (err) {
    console.error(err);
    ui.toast('שגיאה בטעינת הנתונים', 'alert');
  }
  render();

  // סנכרון Drive: התראת מוטציה → push מבוזבז; auto-pull בטעינה
  store.setMutationListener(sync.notifyMutation);
  sync.init({
    onChange: async () => { await loadData(); render(); },
    toast: ui.toast,
  });
}

function cacheRefs() {
  refs.list = document.getElementById('list');
  refs.chips = document.getElementById('chips');
  refs.main = document.getElementById('main');
  refs.search = document.getElementById('search-input');
  refs.modal = document.getElementById('modal');
  refs.segAll = document.getElementById('seg-all');
  refs.segFollow = document.getElementById('seg-followup');
  refs.board = document.getElementById('board');
  refs.drawer = document.getElementById('drawer');
  refs.drawerBody = document.getElementById('drawer-body');
  refs.viewPipeline = document.getElementById('view-pipeline');
  refs.viewList = document.getElementById('view-list');
  refs.syncBtn = document.getElementById('sync-btn');
}

function paintIcons() {
  document.querySelectorAll('[data-icon]').forEach((n) => { n.innerHTML = ui.ICONS[n.dataset.icon] || ''; });
}

async function loadData() {
  const [contacts, companies] = await Promise.all([store.getContacts(), store.getCompanies()]);
  state.contacts = contacts;
  state.companies = companies;
}

/* ---------- derived list ---------- */
function computeList() {
  let list = search.filterContacts(state.contacts, state.companies, state.searchTerm);
  list = search.filterByStatus(list, state.statusFilter);
  list = state.view === 'followup' ? search.sortByFollowUp(list) : search.sortByName(list);
  return list;
}

/* ---------- render ---------- */
function render() {
  // מצב תצוגה (Pipeline / רשימה)
  refs.viewPipeline.setAttribute('aria-selected', state.mainView === 'pipeline' ? 'true' : 'false');
  refs.viewList.setAttribute('aria-selected', state.mainView === 'list' ? 'true' : 'false');
  document.body.classList.toggle('view-pipeline', state.mainView === 'pipeline');
  document.body.classList.toggle('view-list', state.mainView === 'list');

  if (state.mainView === 'pipeline') {
    const items = search.filterContacts(state.contacts, state.companies, state.searchTerm);
    ui.renderPipeline(refs.board, items, state.companies, state);
    if (state.selectedContactId && !refs.drawer.hidden) renderDetail();
    return;
  }

  // — תצוגת רשימה —
  const list = computeList();
  const overdueCount = state.contacts.filter(store.isOverdue).length;
  refs.segAll.querySelector('.count').textContent = String(state.contacts.length);
  refs.segFollow.querySelector('.count').textContent = String(overdueCount);
  refs.segAll.setAttribute('aria-selected', state.view === 'all' ? 'true' : 'false');
  refs.segFollow.setAttribute('aria-selected', state.view === 'followup' ? 'true' : 'false');
  ui.renderChips(refs.chips, state.contacts, state.statusFilter);
  ui.renderList(refs.list, list, state.companies, state);
  renderDetail();
}

// יעד הרינדור של תצוגת הפרטים: drawer ב-Pipeline, main ברשימה
function detailTarget() {
  return state.mainView === 'pipeline' ? refs.drawerBody : refs.main;
}

function renderDetail() {
  const contact = state.contacts.find((c) => c.id === state.selectedContactId);
  if (contact) {
    ui.renderDetail(detailTarget(), contact, state.companies, state.detailTab);
    if (state.mainView === 'list' && window.matchMedia('(max-width: 768px)').matches) {
      document.body.classList.add('show-detail');
    }
  } else if (state.mainView === 'list') {
    ui.renderDetailEmpty(refs.main);
    document.body.classList.remove('show-detail');
  }
}

/* ---------- view + drawer ---------- */
function setMainView(view) {
  if (state.mainView === view) return;
  state.mainView = view;
  if (view === 'list') hideDrawer();
  render();
}
function openDrawer() {
  refs.drawer.hidden = false;
  requestAnimationFrame(() => document.body.classList.add('drawer-open'));
}
function hideDrawer() {
  document.body.classList.remove('drawer-open');
  refs.drawer.hidden = true;
  refs.drawerBody.replaceChildren();
}
function closeDrawer() {
  document.body.classList.remove('drawer-open');
  state.selectedContactId = null;
  render(); // עדכון הדגשת הכרטיס בלוח
  setTimeout(() => { if (!state.selectedContactId) { refs.drawer.hidden = true; refs.drawerBody.replaceChildren(); } }, 300);
}

async function changeStatus(id, status) {
  const c = state.contacts.find((x) => x.id === id);
  if (!c || c.status === status) { render(); return; }
  await store.saveContact({ ...c, status });
  await loadData();
  render();
  ui.toast('שלב הליד עודכן');
}

// רינדור מחדש של תצוגת הפרטים בלבד (מעבר טאבים) — עם מעבר חלק
function renderDetailOnly() {
  if (document.startViewTransition) document.startViewTransition(() => renderDetail());
  else renderDetail();
}

/* ---------- events ---------- */
function wireEvents() {
  // search (debounced)
  let t;
  refs.search.addEventListener('input', (e) => {
    clearTimeout(t);
    const v = e.target.value;
    t = setTimeout(() => { state.searchTerm = v; render(); }, 140);
  });

  // segmented view toggle (list mode)
  refs.segAll.addEventListener('click', () => setView('all'));
  refs.segFollow.addEventListener('click', () => setView('followup'));

  // main view toggle (Pipeline / List)
  refs.viewPipeline.addEventListener('click', () => setMainView('pipeline'));
  refs.viewList.addEventListener('click', () => setMainView('list'));

  // pipeline drag-and-drop → שינוי שלב
  wireBoardDnD();

  // sync menu
  refs.syncBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleSyncMenu(); });

  // global click delegation
  document.addEventListener('click', onClick);

  // FAB + header add
  document.getElementById('fab').addEventListener('click', () => openContactForm());
  document.getElementById('btn-add').addEventListener('click', () => openContactForm());
  document.getElementById('btn-add-company').addEventListener('click', () => openCompanyManager());

  // modal close on backdrop click
  refs.modal.addEventListener('click', (e) => { if (e.target === refs.modal) refs.modal.close(); });

  // re-evaluate mobile/desktop on resize
  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 768px)').matches) document.body.classList.remove('show-detail');
    else if (state.selectedContactId) document.body.classList.add('show-detail');
  });
}

function setView(view) {
  state.view = view;
  render();
}

/* ---------- sync menu (popover) ---------- */
function toggleSyncMenu() {
  const open = document.querySelector('.sync-menu');
  if (open) { closeSyncMenu(); return; }

  const menu = ui.syncMenu({
    signedIn: sync.isSignedIn(),
    lastSync: localStorage.getItem('lo_lastSyncAt'),
  });
  document.body.append(menu);

  const r = refs.syncBtn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = (r.bottom + 8) + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 268)) + 'px';

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-sync-action]');
    if (!item) return;
    closeSyncMenu();
    const a = item.dataset.syncAction;
    if (a === 'signin') sync.signIn();
    else if (a === 'backup') sync.backup();
    else if (a === 'restore') sync.restore();
    else if (a === 'signout') sync.signOut();
  });

  setTimeout(() => document.addEventListener('click', onDocCloseSyncMenu), 0);
}
function onDocCloseSyncMenu(e) {
  const menu = document.querySelector('.sync-menu');
  if (!menu) { document.removeEventListener('click', onDocCloseSyncMenu); return; }
  if (menu.contains(e.target) || refs.syncBtn.contains(e.target)) return;
  closeSyncMenu();
}
function closeSyncMenu() {
  document.querySelector('.sync-menu')?.remove();
  document.removeEventListener('click', onDocCloseSyncMenu);
}

/* ---------- pipeline drag & drop ---------- */
function wireBoardDnD() {
  let dragId = null;
  const clearTargets = () => document.querySelectorAll('.lane.drop-target').forEach((l) => l.classList.remove('drop-target'));

  refs.board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.pcard');
    if (!card) return;
    dragId = card.dataset.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch { /* noop */ }
  });
  refs.board.addEventListener('dragend', (e) => {
    e.target.closest('.pcard')?.classList.remove('dragging');
    clearTargets();
    dragId = null;
  });
  refs.board.addEventListener('dragover', (e) => {
    const zone = e.target.closest('.lane__cards');
    if (!zone || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const lane = zone.closest('.lane');
    clearTargets();
    lane.classList.add('drop-target');
  });
  refs.board.addEventListener('drop', (e) => {
    const zone = e.target.closest('.lane__cards');
    if (!zone || !dragId) return;
    e.preventDefault();
    const id = dragId;
    clearTargets();
    changeStatus(id, zone.dataset.drop);
  });
}

async function onClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;

  switch (action) {
    case 'open-contact':
      state.selectedContactId = id;
      state.detailTab = 'overview';
      if (state.mainView === 'pipeline') openDrawer();
      render();
      detailTarget().scrollTop = 0;
      break;
    case 'detail-tab':
      if (state.detailTab === target.dataset.tab) break;
      state.detailTab = target.dataset.tab;
      renderDetailOnly();
      break;
    case 'close-drawer':
      closeDrawer();
      break;
    case 'back':
      if (state.mainView === 'pipeline') { closeDrawer(); break; }
      document.body.classList.remove('show-detail');
      state.selectedContactId = null;
      render();
      break;
    case 'filter-status':
      state.statusFilter = target.dataset.status;
      render();
      break;
    case 'new-contact':
      openContactForm();
      break;
    case 'edit-contact':
      openContactForm(state.contacts.find((c) => c.id === id));
      break;
    case 'delete-contact':
      await handleDeleteContact(id);
      break;
    case 'delete-company':
      await handleDeleteCompany(id);
      break;
    case 'add-note':
      await handleAddNote(id, target);
      break;
  }
}

/* ---------- contact form ---------- */
function openContactForm(contact) {
  const form = ui.renderContactForm(contact, state.companies);
  openModal(contact ? 'עריכת איש קשר' : 'איש קשר חדש', form, async () => {
    const { data, newCompanyName } = ui.readContactForm(form);
    if (!data.fullName) { ui.toast('יש להזין שם מלא', 'alert'); return false; }

    // create new company if requested
    if (newCompanyName) {
      const company = await store.saveCompany({ name: newCompanyName });
      data.currentCompanyId = company.id;
    }

    // preserve existing notes when editing
    let payload = data;
    if (contact) payload = { ...contact, ...data, chronologicalNotes: contact.chronologicalNotes };

    const saved = await store.saveContact(payload);
    await loadData();
    state.selectedContactId = saved.id;
    render();
    ui.toast(contact ? 'איש הקשר עודכן' : 'איש הקשר נוסף');
    return true;
  });
}

/* ---------- companies manager (רשימה + הוספה + מחיקה) ---------- */
function openCompanyManager() {
  const form = ui.renderCompanyManager(state.companies, state.contacts);
  openModal('חברות', form, async () => {
    const data = ui.readCompanyForm(form);
    if (!data.name) return true; // אין הוספה — סגירה (מחיקות מתבצעות מיד מהרשימה)
    await store.saveCompany(data);
    await loadData();
    render();
    ui.toast('החברה נוספה');
    return true;
  });
}

async function handleDeleteCompany(id) {
  const c = state.companies.find((x) => x.id === id);
  if (!c) return;
  const count = state.contacts.filter((x) => x.currentCompanyId === id).length;
  const msg = count
    ? `למחוק את "${c.name}"? ${count} אנשי קשר יישארו ללא שיוך חברה.`
    : `למחוק את "${c.name}"?`;
  if (!confirm(msg)) return;
  await store.deleteCompany(id);
  await loadData();
  // רענון רשימת החברות בתוך המודאל הפתוח
  const listWrap = refs.modal.querySelector('.company-list');
  if (listWrap) listWrap.replaceWith(ui.companyList(state.companies, state.contacts));
  render();
  ui.toast('החברה נמחקה', 'trash');
}

/* ---------- delete ---------- */
async function handleDeleteContact(id) {
  const contact = state.contacts.find((c) => c.id === id);
  if (!contact) return;
  if (!confirm(`למחוק את "${contact.fullName}"? פעולה זו אינה הפיכה.`)) return;
  await store.deleteContact(id);
  if (state.selectedContactId === id) {
    state.selectedContactId = null;
    if (state.mainView === 'pipeline') hideDrawer();
  }
  await loadData();
  render();
  ui.toast('איש הקשר נמחק', 'trash');
}

/* ---------- notes ---------- */
async function handleAddNote(id, btn) {
  const panel = btn.closest('.panel');
  const textarea = panel?.querySelector('[data-role="note-input"]');
  const text = textarea?.value.trim();
  if (!text) { textarea?.focus(); return; }
  await store.addNote(id, text);
  await loadData();
  render();
  ui.toast('ההערה נוספה');
}

/* ---------- modal helper ---------- */
function openModal(title, bodyEl, onSubmit) {
  const modal = refs.modal;
  modal.replaceChildren();

  const close = () => modal.close();

  const head = document.createElement('div');
  head.className = 'modal__head';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal__close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'סגירה');
  closeBtn.innerHTML = ui.ICONS.close;
  closeBtn.addEventListener('click', close);
  head.append(h2, closeBtn);

  const body = document.createElement('div');
  body.className = 'modal__body';
  body.append(bodyEl);

  const foot = document.createElement('div');
  foot.className = 'modal__foot';
  const save = document.createElement('button');
  save.className = 'btn btn--primary';
  save.type = 'button';
  save.innerHTML = ui.ICONS.check + '<span>שמירה</span>';
  const cancel = document.createElement('button');
  cancel.className = 'btn btn--ghost';
  cancel.type = 'button';
  cancel.textContent = 'ביטול';
  cancel.addEventListener('click', close);

  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const ok = await onSubmit();
      if (ok !== false) close();
    } catch (err) {
      console.error(err);
      ui.toast('שמירה נכשלה', 'alert');
    } finally {
      save.disabled = false;
    }
  });

  // submit on Enter inside the form (except textareas)
  bodyEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.shiftKey) {
      e.preventDefault();
      save.click();
    }
  });

  foot.append(save, cancel);
  modal.append(head, body, foot);
  modal.showModal();
  bodyEl.querySelector('input,select,textarea')?.focus();
}

/* ---------- service worker ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // כשגרסת SW חדשה משתלטת — רענון אוטומטי פעם אחת (לא בהתקנה ראשונה),
  // כדי שפרסומים ייכנסו לתוקף בלי hard-refresh ידני.
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

/* ---------- expose seed for console/dev ---------- */
import('./seed.js').then((m) => {
  window.seedDemo = async () => { await m.seedDemo(store); await loadData(); render(); ui.toast('נטענו נתוני דמו'); };
}).catch(() => {});

init();
