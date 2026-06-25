// app.js — bootstrap, ניהול state יחיד, event delegation, ניתוב תצוגות.

import * as store from './store.js';
import * as search from './search.js';
import * as ui from './ui.js';

/* ---------- State יחיד (single source of truth) ---------- */
const state = {
  contacts: [],
  companies: [],
  selectedContactId: null,
  searchTerm: '',
  view: 'all',          // 'all' | 'followup'
  statusFilter: 'all',  // 'all' | <status key>
  detailTab: 'overview', // 'overview' | 'career' | 'referrals' | 'notes'
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
}

function cacheRefs() {
  refs.list = document.getElementById('list');
  refs.chips = document.getElementById('chips');
  refs.main = document.getElementById('main');
  refs.search = document.getElementById('search-input');
  refs.modal = document.getElementById('modal');
  refs.segAll = document.getElementById('seg-all');
  refs.segFollow = document.getElementById('seg-followup');
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
  const list = computeList();

  // segmented counts
  const overdueCount = state.contacts.filter(store.isOverdue).length;
  refs.segAll.querySelector('.count').textContent = String(state.contacts.length);
  refs.segFollow.querySelector('.count').textContent = String(overdueCount);
  refs.segAll.setAttribute('aria-selected', state.view === 'all' ? 'true' : 'false');
  refs.segFollow.setAttribute('aria-selected', state.view === 'followup' ? 'true' : 'false');

  ui.renderChips(refs.chips, state.contacts, state.statusFilter);
  ui.renderList(refs.list, list, state.companies, state);
  renderDetail();
}

function renderDetail() {
  const contact = state.contacts.find((c) => c.id === state.selectedContactId);
  if (contact) {
    ui.renderDetail(refs.main, contact, state.companies, state.detailTab);
    if (window.matchMedia('(max-width: 768px)').matches) document.body.classList.add('show-detail');
  } else {
    ui.renderDetailEmpty(refs.main);
    document.body.classList.remove('show-detail');
  }
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

  // segmented view toggle
  refs.segAll.addEventListener('click', () => setView('all'));
  refs.segFollow.addEventListener('click', () => setView('followup'));

  // global click delegation
  document.addEventListener('click', onClick);

  // FAB + header add
  document.getElementById('fab').addEventListener('click', () => openContactForm());
  document.getElementById('btn-add').addEventListener('click', () => openContactForm());
  document.getElementById('btn-add-company').addEventListener('click', () => openCompanyForm());

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

async function onClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;

  switch (action) {
    case 'open-contact':
      state.selectedContactId = id;
      state.detailTab = 'overview';
      render();
      refs.main.scrollTop = 0;
      break;
    case 'detail-tab':
      if (state.detailTab === target.dataset.tab) break;
      state.detailTab = target.dataset.tab;
      renderDetailOnly();
      break;
    case 'back':
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

/* ---------- company form ---------- */
function openCompanyForm(company) {
  const form = ui.renderCompanyForm(company);
  openModal(company ? 'עריכת חברה' : 'חברה חדשה', form, async () => {
    const data = ui.readCompanyForm(form);
    if (!data.name) { ui.toast('יש להזין שם חברה', 'alert'); return false; }
    await store.saveCompany(company ? { ...company, ...data } : data);
    await loadData();
    render();
    ui.toast(company ? 'החברה עודכנה' : 'החברה נוספה');
    return true;
  });
}

/* ---------- delete ---------- */
async function handleDeleteContact(id) {
  const contact = state.contacts.find((c) => c.id === id);
  if (!contact) return;
  if (!confirm(`למחוק את "${contact.fullName}"? פעולה זו אינה הפיכה.`)) return;
  await store.deleteContact(id);
  if (state.selectedContactId === id) state.selectedContactId = null;
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
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
    });
  }
}

/* ---------- expose seed for console/dev ---------- */
import('./seed.js').then((m) => {
  window.seedDemo = async () => { await m.seedDemo(store); await loadData(); render(); ui.toast('נטענו נתוני דמו'); };
}).catch(() => {});

init();
