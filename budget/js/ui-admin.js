// ui-admin.js — מסכי ניהול: הגדרות עסקה, ספריית אנשי הצוות, תעריפונים, וטפסי המודאלים
// (עסקה חדשה, בורר אנשים, אנשי קשר, ייבוא תקציב).

import { DEAL_STATUSES, FEE_MODELS, fmtMoney, fmtHours, fmtPct } from './model.js';
import { BUILD } from './version.js';
import { personKey } from './importer.js';
import {
  el, icon, field, fact, button, iconButton, menu, card, table, limitItems, emptyState, fmtDate, fmtDelta,
  avatar, personSlot, infoTip,
} from './ui-kit.js';

/* ============================================================
   הגדרות עסקה — שני טורים: כותרת | שדות. ההסבר על כל מקטע מאחורי ⓘ;
   רק אזהרה (מחיקה) נשארת גלויה.
   ============================================================ */

function srow(title, text, body, cls = '', { visible = false } = {}) {
  return el('section', { class: `srow ${cls}`.trim() }, [
    el('div', { class: 'srow__info' }, [
      el('h2', { class: 'srow__title' }, [title, text && !visible ? infoTip(text) : null]),
      text && visible ? el('p', { class: 'srow__text', text }) : null,
    ]),
    el('div', { class: 'srow__body' }, [].concat(body)),
  ]);
}

export function renderDealSettings(root, { snap, rateCards }) {
  const d = snap.deal;
  const form = el('form', { class: 'settings', id: 'deal-form', autocomplete: 'off' });

  form.append(srow('פרטי העסקה', 'תאריך היעד משמש גם לתחזית לסיום לפי קצב לוח הזמנים, כשלא הוזן אחוז התקדמות.', [
    el('div', { class: 'grid-2' }, [
      field('שם העסקה', el('input', { class: 'input', name: 'name', value: d.name, required: 'required' })),
      field('לקוח', el('input', { class: 'input', name: 'client', value: d.client, placeholder: 'שם הלקוח' })),
      field('מספר עסקה / תיק', el('input', { class: 'input', name: 'code', value: d.code, placeholder: 'לדוגמה: M&A-2026-04' })),
      field('סטטוס', el('select', { class: 'select', name: 'status' }, DEAL_STATUSES.map((s) => el('option', { value: s.id, text: s.label, selected: s.id === d.status ? 'selected' : null }))),
        'עסקה שנסגרה או בארכיון יוצאת מהסרגל ומתיק העסקאות הפתוחות.'),
      field('תאריך פתיחה', el('input', { class: 'input num', type: 'date', name: 'startDate', value: d.startDate })),
      field('תאריך סגירה יעד', el('input', { class: 'input num', type: 'date', name: 'targetDate', value: d.targetDate })),
    ]),
    field('הערות', el('textarea', { class: 'input', name: 'notes', rows: '3', text: d.notes })),
  ]));

  form.append(srow('שכר טרחה ותקציב', 'מודל החיוב והתקרה קובעים את הרווחיות ואת התעריפים האפקטיביים. מקדם החריגה מגדיל את השעות המוערכות לשעות התקציב.', [
    el('div', { class: 'grid-2' }, [
      field('מודל שכר טרחה', el('select', { class: 'select', name: 'feeModel' }, FEE_MODELS.map((f) => el('option', { value: f.id, text: f.label, selected: f.id === d.feeModel ? 'selected' : null }))),
        (FEE_MODELS.find((f) => f.id === d.feeModel) || {}).hint),
      field(d.feeModel === 'retainer' ? 'סכום חודשי (₪)' : 'שכ"ט מוסכם / תקרה (₪)', el('input', { class: 'input num', type: 'number', step: '1000', min: '0', name: 'agreedFee', value: String(d.agreedFee) })),
      field('מקדם חריגה', el('input', { class: 'input num', type: 'number', step: '0.05', min: '0', max: '2', name: 'overrunFactor', value: String(d.overrunFactor) }),
        `שעות התקציב = מוערכות × (1 + מקדם), מעוגל כלפי מעלה. ${d.overrunFactor} = תוספת של ${fmtPct(d.overrunFactor)}.`),
      field('תעריפון', el('select', { class: 'select', name: 'rateCardId' }, rateCards.map((c) => el('option', { value: c.id, text: c.name, selected: c.id === d.rateCardId ? 'selected' : null }))),
        'החלפת תעריפון מתאימה את השורות לפי שם הדרגה.'),
      field('התקדמות מדווחת (%)', el('input', { class: 'input num', type: 'number', step: '5', min: '0', max: '100', name: 'progressPct', value: String(d.progressPct) }),
        'הבסיס לתחזית לסיום. 0 = לפי קצב לוח הזמנים.'),
    ]),
    el('div', { class: 'form-actions' }, [
      el('button', { class: 'btn btn--sm', type: 'submit' }, [icon('check'), 'שמור']),
      el('span', { class: 'field__hint', text: 'השינויים נשמרים אוטומטית ביציאה מכל שדה.' }),
    ]),
  ]));
  root.append(el('section', { class: 'card card--pad' }, [form]));

  const extra = el('div', { class: 'settings' });
  extra.append(srow('תקציב בסיס', 'קיבוע התקציב המאושר כדי לזהות זחילת היקף: כל שינוי אחריו מוצג כסטייה בניתוח (₪).', [
    d.baseline
      ? el('div', { class: 'facts' }, [
        fact('תקציב הבסיס', fmtMoney(d.baseline.budgetCost)),
        fact('נקבע בתאריך', fmtDate(new Date(d.baseline.capturedAt).toISOString().slice(0, 10))),
        fact('התקציב הנוכחי', fmtMoney(snap.budgetCost)),
        fact('סטייה', fmtDelta(snap.baselineDelta.delta, 'money'), snap.baselineDelta.delta > 0 ? 'neg' : ''),
      ])
      : el('p', { class: 'muted', text: 'טרם נקבע תקציב בסיס.' }),
    el('div', { class: 'form-actions form-actions--wrap' }, [
      button(d.baseline ? 'עדכן לתקציב הנוכחי' : 'קבע תקציב בסיס', { action: 'capture-baseline', iconName: 'flag' }),
      d.baseline ? button('בטל בסיס', { action: 'clear-baseline', kind: 'ghost' }) : null,
    ]),
  ]));

  // תיקיית המסמכים — מקומית למכשיר, לא חלק מנתוני העסקה
  extra.append(srow('תיקיית מסמכים', 'כל דוח, חשבון או מסמך שמועלה נשמר בתיקייה שתבחר, בתת-תיקייה נפרדת לכל עסקה שנוצרת אוטומטית. בלי תיקייה — הקבצים נשמרים בתוך המערכת.', [
    el('div', { class: 'facts', id: 'docs-folder-state' }, [fact('סטטוס', 'נטען…')]),
    el('div', { class: 'form-actions form-actions--wrap' }, [
      button('בחר תיקייה', { action: 'pick-folder', iconName: 'upload' }),
      button('בדוק כתיבה', { action: 'test-folder', iconName: 'check', kind: 'ghost' }),
      button('חדש הרשאה', { action: 'reconnect-folder', iconName: 'refresh', kind: 'ghost' }),
      button('נתק', { action: 'forget-folder', iconName: 'close', kind: 'ghost' }),
    ]),
  ], 'srow--folder'));

  extra.append(renderBuildRow());
  extra.append(srow('מחיקת העסקה', 'מוחקת את העסקה, הצוותים והדיווחים שלה. הפעולה אינה הפיכה — כדאי לייצא גיבוי לפני.', [
    el('div', {}, [button('מחק את העסקה', { action: 'delete-deal', iconName: 'trash', kind: 'danger' })]),
  ], 'srow--danger', { visible: true }));
  root.append(el('section', { class: 'card card--pad' }, [extra]));
}

/**
 * חותמת הגרסה — מאיזה בילד רץ מה שאתה רואה עכשיו.
 * מאפשר להשוות בשנייה בין קובץ אופליין לאתר החי, ובין שני קבצים, בלי לנחש.
 */
function renderBuildRow() {
  const when = BUILD.builtAt ? BUILD.builtAt.slice(0, 16).replace('T', ' ') : '—';
  return srow('גרסה', 'נכתבת אוטומטית בכל בנייה. השוו בין הקובץ שבידכם לאתר החי — המאוחר יותר הוא המעודכן.', [
    el('div', { class: 'buildinfo' }, [
      fact('נבנה בתאריך', when),
      fact('מקור', BUILD.channel === 'offline' ? 'קובץ אופליין' : 'אתר / PWA'),
      fact('commit', BUILD.commit || '—'),
      fact('גרסת cache', BUILD.cache || '—'),
    ]),
  ]);
}

/** מצב תיקיית המסמכים במסך ההגדרות */
export function renderFolderState(root, { supported, name, ready, dealFolder }) {
  if (!root) return;
  root.replaceChildren();
  if (!supported) {
    root.append(fact('סטטוס', 'הדפדפן אינו תומך — הקבצים נשמרים בתוך המערכת', 'warn'));
    return;
  }
  root.append(
    fact('תיקייה מחוברת', name || 'לא נבחרה', name ? '' : 'warn'),
    fact('הרשאת כתיבה', name ? (ready ? 'בתוקף' : 'נדרש חידוש') : '—', name && !ready ? 'warn' : ''),
    fact('תת-התיקייה של העסקה', dealFolder || '—'),
  );
}

/* ============================================================
   ספריית אנשי הצוות — משותפת לכל העסקאות
   ============================================================ */

export function renderPeopleView(root, { people, usageOf, dupes = [] }) {
  root.replaceChildren();
  const page = el('div', { class: 'page' });
  root.append(page);
  page.append(el('header', { class: 'phead' }, [
    el('div', { class: 'phead__main' }, [
      el('h1', { class: 'phead__title' }, ['אנשי צוות', infoTip('מקור האמת לשמות: כל שם בעסקה נבחר מכאן, ותיקון כאן משתקף בכל העסקאות ובכל הייצואים.')]),
    ]),
    el('div', { class: 'phead__actions' }, [
      menu({
        label: 'אקסל', iconName: 'file', items: [
          { label: 'ייבוא אנשי קשר מאקסל', action: 'import-people', icon: 'upload' },
          { label: 'הורדת תבנית לייבוא', action: 'people-template', icon: 'download' },
          '-',
          { label: 'ייצוא המסומנים (או כולם)', action: 'export-people', icon: 'download' },
        ],
      }),
      button('איש צוות חדש', { action: 'new-person', iconName: 'plus', kind: 'primary' }),
    ]),
  ]));

  if (dupes.length) {
    page.append(card({ title: 'ייתכן שאותו אדם נרשם פעמיים', count: dupes.length, info: 'מיזוג מעביר את כל השורות לרשומה שנשארת, ושומר את הכתיב השני כזיהוי נוסף.', flush: true }, [
      el('ul', { class: 'alist' }, dupes.map(([a, b]) => el('li', { class: 'alist__item' }, [el('div', { class: 'dupe' }, [
        el('span', { class: 'strong', text: `${a.name}  ·  ${b.name}` }),
        el('span', { class: 'toolbar__spacer' }),
        button(`השאר "${a.name}"`, { action: 'merge-people', kind: 'ghost', dataset: { keepId: a.id, dropId: b.id } }),
        button(`השאר "${b.name}"`, { action: 'merge-people', kind: 'ghost', dataset: { keepId: b.id, dropId: a.id } }),
      ])]))),
    ]));
  }

  if (!people.length) {
    page.append(el('section', { class: 'card' }, [emptyState('הספרייה ריקה',
      'אפשר להוסיף ידנית, לייבא מאקסל, או לבחור "איש צוות חדש" מתוך הגיליון של עסקה.',
      [button('איש צוות חדש', { action: 'new-person', iconName: 'plus', kind: 'primary', size: '' })])]));
    return;
  }

  const rows = people.map((person) => {
    const use = usageOf(person.id);
    return el('tr', { class: person.active ? '' : 'is-inactive', dataset: { personId: person.id, search: [person.key, ...(person.aliases || []).map(personKey)].join(' ') } }, [
      el('td', { class: 'c-pick' }, [el('input', { type: 'checkbox', dataset: { pick: 'person', personId: person.id }, 'aria-label': `סימון ${person.name}` })]),
      el('td', {}, [el('div', { class: 'pname' }, [
        avatar(person.name, personSlot(person), { size: 'sm' }),
        el('div', { class: 'pname__text' }, [
          el('input', { class: 'qinput strong', value: person.name, dataset: { pfield: 'name', personId: person.id }, 'aria-label': 'שם' }),
          person.aliases.length ? el('span', { class: 'sub', text: `ידוע גם כ: ${person.aliases.join(' · ')}` }) : null,
        ]),
      ])]),
      el('td', {}, [el('input', { class: 'qinput', value: person.title, placeholder: 'שותף / עו״ד', dataset: { pfield: 'title', personId: person.id }, 'aria-label': 'תפקיד' })]),
      el('td', {}, [el('input', { class: 'qinput', value: person.defaultTeamName, placeholder: 'צוות ברירת מחדל', dataset: { pfield: 'defaultTeamName', personId: person.id }, 'aria-label': 'צוות' })]),
      el('td', {}, [el('input', { class: 'qinput ltr', type: 'email', value: person.email, placeholder: 'name@firm.co.il', dataset: { pfield: 'email', personId: person.id }, 'aria-label': 'דוא״ל' })]),
      el('td', {}, [el('input', { class: 'qinput ltr', value: person.phone, placeholder: '050-0000000', dataset: { pfield: 'phone', personId: person.id }, 'aria-label': 'טלפון' })]),
      el('td', { class: 'num muted', title: `${use.lines} שורות תקציב`, text: use.deals ? `${use.deals}` : '—' }),
      el('td', { class: 'c-pick' }, [el('input', { type: 'checkbox', checked: person.active ? 'checked' : null, title: 'פעיל — מופיע בחלונות הבחירה', dataset: { pfield: 'active', personId: person.id }, 'aria-label': 'פעיל' })]),
      el('td', { class: 'c-tools' }, [iconButton('trash', {
        action: 'delete-person', danger: true, tabindex: '-1', cls: 'iconbtn--sm',
        title: use.lines ? 'משויך לשורות תקציב — אפשר לסמן כלא פעיל' : 'מחיקה', dataset: { personId: person.id },
      })]),
    ]);
  });

  page.append(el('section', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('div', { class: 'toolbar' }, [
        el('label', { class: 'search' }, [icon('search'), el('input', { class: 'input', type: 'search', placeholder: 'חיפוש לפי שם…', dataset: { peopleSearch: '1' }, 'aria-label': 'חיפוש אנשי צוות' })]),
        el('span', { class: 'muted', id: 'people-count', text: `${people.length} אנשים` }),
      ]),
    ]),
    el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl tbl--people' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { class: 'c-pick' }, [el('input', { type: 'checkbox', dataset: { pick: 'people-all' }, 'aria-label': 'סימון הכל' })]),
        el('th', { text: 'שם' }), el('th', { text: 'תפקיד' }), el('th', { text: 'צוות' }),
        el('th', { text: 'דוא"ל' }), el('th', { text: 'טלפון' }), el('th', { text: 'עסקאות', title: 'בכמה עסקאות משויך לשורת תקציב' }),
        el('th', { text: 'פעיל' }), el('th', { class: 'c-tools' }),
      ])),
      el('tbody', { class: 'has-more' }, limitItems(rows, 40, { colspan: 9, noun: 'אנשים' })),
    ])),
  ]));
}

/** חיפוש חי בספרייה — מסנן שורות בלי רינדור מחדש (לפי מפתח הזהות: "כהן" מוצא "עו״ד דנה כהן") */
export function filterPeople(query) {
  const q = personKey(query || '');
  const body = document.querySelector('.tbl--people tbody');
  if (!body) return;
  body.classList.toggle('show-all', !!q);
  let shown = 0;
  for (const tr of body.querySelectorAll('tr[data-person-id]')) {
    const hit = !q || (tr.dataset.search || '').includes(q);
    tr.hidden = !hit;
    if (hit) shown += 1;
  }
  const more = body.querySelector('.more-row');
  if (more) more.hidden = !!q;
  const count = document.getElementById('people-count');
  if (count) count.textContent = q ? `${shown} תוצאות` : `${body.querySelectorAll('tr[data-person-id]').length} אנשים`;
}

/** טופס איש צוות — לחלון "חדש" ולעריכה מלאה */
export function renderPersonForm(person = {}) {
  const form = el('form', { class: 'modal-form', id: 'person-form' }, [
    field('שם מלא', el('input', { class: 'input', name: 'name', value: person.name || '', required: 'required', placeholder: 'לדוגמה: דנה כהן' })),
    el('div', { class: 'grid-2' }, [
      field('תפקיד', el('input', { class: 'input', name: 'title', value: person.title || '', placeholder: 'שותף / עו״ד / מתמחה' })),
      field('צוות ברירת מחדל', el('input', { class: 'input', name: 'defaultTeamName', value: person.defaultTeamName || '', placeholder: 'לדוגמה: קורפורייט' })),
      field('דוא"ל', el('input', { class: 'input ltr', type: 'email', name: 'email', value: person.email || '', placeholder: 'name@firm.co.il' })),
      field('טלפון', el('input', { class: 'input ltr', name: 'phone', value: person.phone || '', placeholder: '050-0000000' })),
    ]),
  ]);
  if (person.id) form.append(el('input', { type: 'hidden', name: 'id', value: person.id }));
  return form;
}

/**
 * חלון בחירת איש צוות — הדרך היחידה לשייך שם לשורה.
 * מחפש לפי מפתח זהות (כך ש"כהן" מוצא גם "עו״ד דנה כהן"), ומציע הקמה כשאין התאמה.
 */
export function renderPersonPicker({ people, query = '', currentId = '' }) {
  const wrap = el('div', { class: 'picker' });
  wrap.append(el('label', { class: 'search' }, [icon('search'), el('input', {
    class: 'input picker__search', id: 'person-search', value: query, type: 'search',
    placeholder: 'חיפוש לפי שם…', autocomplete: 'off', dataset: { pickerSearch: '1' }, 'aria-label': 'חיפוש איש צוות',
  })]));
  const list = el('div', { class: 'picker__list', id: 'person-picker-list' });
  wrap.append(list);
  renderPersonPickerList(list, { people, query, currentId });
  return wrap;
}

export function renderPersonPickerList(list, { people, query = '', currentId = '' }) {
  list.replaceChildren();
  if (!people.length) {
    list.append(el('div', { class: 'picker__empty' }, [
      el('p', { text: query ? `"${query}" לא נמצא בספריית אנשי הצוות.` : 'הספרייה ריקה.' }),
      button(query ? `הקם את "${query}" כאיש צוות` : 'איש צוות חדש', { action: 'new-person-from-picker', iconName: 'plus', kind: 'primary', dataset: { name: query } }),
    ]));
    return;
  }
  for (const person of people) {
    list.append(el('button', {
      class: `picker__item${person.id === currentId ? ' is-current' : ''}`, type: 'button',
      dataset: { action: 'pick-person', personId: person.id },
    }, [
      el('span', { class: 'picker__name', text: person.name }),
      el('span', { class: 'picker__meta', text: [person.title, person.defaultTeamName].filter(Boolean).join(' · ') }),
    ]));
  }
  list.append(el('button', { class: 'picker__new', type: 'button', dataset: { action: 'new-person-from-picker', name: query } },
    [icon('plus'), query ? `לא זה? הקם את "${query}" כאיש צוות` : 'איש צוות חדש…']));
}

/** בחירת אנשי הקשר לייצוא מתוך העסקה — עם מקור השיוך לכל אחד */
export function renderDealContactsForm({ rows, dealName }) {
  const form = el('form', { class: 'modal-form', id: 'deal-contacts-form' }, [
    el('p', { class: 'modal-text', text: `האנשים שהמערכת מזהה כמשויכים ל"${dealName}". בטל סימון למי שלא צריך להיכנס לרשימה.` }),
  ]);
  form.append(table([{ text: '', cls: 'c-pick' }, 'שם', 'תפקיד', 'צוות בעסקה', 'מקור השיוך', 'שעות', 'דוא"ל'], rows.map((r) => el('tr', {}, [
    el('td', { class: 'c-pick' }, [el('input', { type: 'checkbox', checked: 'checked', dataset: { contactPick: '1', personId: r.person.id }, 'aria-label': `כלול את ${r.person.name}` })]),
    el('td', { class: 'c-strong', text: r.person.name }),
    el('td', { text: r.person.title || '—' }),
    el('td', { text: r.teams.join(' · ') || '—' }),
    el('td', { class: 'muted', text: r.sources.join(' · ') }),
    el('td', { class: 'num', text: r.hours ? fmtHours(r.hours) : '—' }),
    el('td', { class: 'ltr muted', text: r.person.email || '—' }),
  ])), { cls: 'tbl--compact' }));
  return form;
}

/** תצוגה מקדימה לייבוא אנשי קשר — סטטוס לכל שורה והחלטה לכל שורה */
export function renderContactsImportPreview({ rows, header, mapping, fileName, skipped }) {
  const STATUS = {
    create: { label: 'חדש', tone: 'ok' },
    same: { label: 'קיים · זהה', tone: 'muted' },
    update: { label: 'קיים · עדכון', tone: 'info' },
    fuzzy: { label: 'התאמה מקורבת', tone: 'risk' },
  };
  const names = { name: 'שם', title: 'תפקיד', team: 'צוות', email: 'דוא"ל', phone: 'טלפון' };
  const found = Object.entries(mapping).filter(([, idx]) => idx !== undefined)
    .map(([f, idx]) => `${names[f] || f} ← "${String(header[idx] ?? '').trim()}"`);
  const form = el('form', { class: 'modal-form', id: 'contacts-import-form' }, [
    el('p', { class: 'modal-text', text: `${fileName} · ${rows.length} שורות${skipped ? ` · ${skipped} שורות בלי שם דולגו` : ''}` }),
    el('p', { class: 'field__hint', text: `עמודות שזוהו: ${found.length ? found.join(' · ') : 'לא זוהו — ודא שיש שורת כותרות'}` }),
    field('עדכון רשומות קיימות', el('select', { class: 'select', dataset: { importMode: '1' } }, [
      el('option', { value: 'fill', text: 'השלמת שדות ריקים בלבד (מומלץ)' }),
      el('option', { value: 'full', text: 'עדכון מלא — הקובץ דורס את הקיים' }),
    ])),
  ]);
  form.append(el('div', { class: 'tbl-scroll' }, el('table', { class: 'tbl tbl--compact' }, [
    el('thead', {}, el('tr', {}, ['שם בקובץ', 'סטטוס', 'ברשומה בספרייה', 'תפקיד', 'צוות', 'דוא"ל', 'טלפון', 'פעולה'].map((t) => el('th', { text: t })))),
    el('tbody', {}, rows.map((r, i) => {
      const st = STATUS[r.status];
      const options = r.status === 'create'
        ? [['create', 'צור חדש'], ['skip', 'דלג']]
        : r.status === 'same'
          ? [['skip', 'דלג'], ['update', 'עדכן בכל זאת']]
          : [['update', r.status === 'fuzzy' ? `עדכן את "${r.match.name}"` : 'עדכן'], ['create', 'צור רשומה נפרדת'], ['skip', 'דלג']];
      return el('tr', {}, [
        el('td', { class: 'c-strong', text: r.contact.name }),
        el('td', {}, [el('span', { class: `pill pill--${st.tone}`, text: st.label })]),
        el('td', { class: 'muted', text: r.match?.name || '—' }),
        el('td', { text: r.contact.title || '—' }),
        el('td', { text: r.contact.defaultTeamName || '—' }),
        el('td', { class: 'ltr', text: r.contact.email || '—' }),
        el('td', { class: 'ltr', text: r.contact.phone || '—' }),
        el('td', {}, [el('select', { class: 'select select--sm', dataset: { rowAction: String(i) } },
          options.map(([v, label], k) => el('option', { value: v, text: label, selected: k === 0 ? 'selected' : null })))]),
      ]);
    })),
  ])));
  return form;
}

/* ============================================================
   תעריפונים — משותפים לכל העסקאות
   ============================================================ */

export function renderRatesView(root, { rateCards, deals }) {
  root.replaceChildren();
  const page = el('div', { class: 'page' });
  root.append(page);
  page.append(el('header', { class: 'phead' }, [
    el('div', { class: 'phead__main' }, [
      el('h1', { class: 'phead__title' }, ['תעריפונים', infoTip('הדרגות והתעריפים שכל העסקאות משתמשות בהם. אפשר להחזיק כמה תעריפונים — לקוח אסטרטגי, שנה קודמת, מטבע אחר.')]),
    ]),
    el('div', { class: 'phead__actions' }, [button('תעריפון חדש', { action: 'new-ratecard', iconName: 'plus', kind: 'primary' })]),
  ]));

  for (const rc of rateCards) {
    const used = deals.filter((d) => d.rateCardId === rc.id).length;
    page.append(el('section', { class: 'card', dataset: { cardId: rc.id } }, [
      el('header', { class: 'card__head' }, [
        el('div', { class: 'toolbar' }, [
          el('input', { class: 'rc-name', value: rc.name, dataset: { field: 'name', cardId: rc.id }, 'aria-label': 'שם התעריפון' }),
          rc.isDefault ? el('span', { class: 'pill pill--ok', text: 'ברירת מחדל' }) : null,
          el('span', { class: 'muted', text: used === 1 ? 'עסקה אחת' : `${used} עסקאות` }),
        ]),
        el('div', { class: 'card__tools' }, [
          rc.isDefault ? null : button('הפוך לברירת מחדל', { action: 'set-default-ratecard', kind: 'ghost', dataset: { cardId: rc.id } }),
          iconButton('trash', { action: 'delete-ratecard', title: 'מחיקת התעריפון', danger: true, dataset: { cardId: rc.id } }),
        ]),
      ]),
      el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl tbl--rates' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: 'דרגה' }), el('th', { text: 'תעריף לשעה (₪)' }),
          el('th', { text: 'ג׳וניור', title: 'דרגות ג׳וניור אינן נכללות בתעריף הבלנדד' }), el('th', { class: 'c-tools' }),
        ])),
        el('tbody', {}, rc.roles.map((r) => el('tr', {}, [
          el('td', {}, [el('input', { class: 'qinput strong', value: r.name, 'aria-label': 'שם הדרגה', dataset: { field: 'roleName', cardId: rc.id, roleId: r.id } })]),
          el('td', {}, [el('input', { class: 'qinput num', type: 'number', step: '10', min: '0', value: String(r.rate), 'aria-label': 'תעריף לשעה', dataset: { field: 'roleRate', cardId: rc.id, roleId: r.id } })]),
          el('td', {}, [el('input', { type: 'checkbox', checked: r.junior ? 'checked' : null, 'aria-label': 'ג׳וניור', dataset: { field: 'roleJunior', cardId: rc.id, roleId: r.id } })]),
          el('td', { class: 'c-tools' }, [iconButton('trash', { action: 'delete-role', title: 'מחיקת הדרגה', danger: true, cls: 'iconbtn--sm', dataset: { cardId: rc.id, roleId: r.id } })]),
        ]))),
      ])),
      el('div', { class: 'card__foot' }, [button('דרגה', { action: 'add-role', iconName: 'plus', kind: 'ghost', dataset: { cardId: rc.id } })]),
    ]));
  }
}

/* ============================================================
   טפסים במודאל
   ============================================================ */

export function renderDealForm(deal, rateCards) {
  const d = deal || {};
  return el('form', { class: 'modal-form', id: 'deal-modal-form' }, [
    field('שם העסקה', el('input', { class: 'input', name: 'name', value: d.name || '', required: 'required', placeholder: 'רכישת חברת …' })),
    el('div', { class: 'grid-2' }, [
      field('לקוח', el('input', { class: 'input', name: 'client', value: d.client || '' })),
      field('מספר תיק', el('input', { class: 'input', name: 'code', value: d.code || '' })),
      field('מודל שכר טרחה', el('select', { class: 'select', name: 'feeModel' }, FEE_MODELS.map((f) => el('option', { value: f.id, text: f.label })))),
      field('שכ"ט מוסכם / תקרה (₪)', el('input', { class: 'input num', type: 'number', step: '1000', min: '0', name: 'agreedFee', value: '0' })),
      field('מקדם חריגה', el('input', { class: 'input num', type: 'number', step: '0.05', min: '0', max: '2', name: 'overrunFactor', value: '0.2' }), '0.2 = תוספת של 20% לשעות המוערכות'),
      field('תעריפון', el('select', { class: 'select', name: 'rateCardId' }, rateCards.map((c) => el('option', { value: c.id, text: c.name, selected: c.isDefault ? 'selected' : null })))),
    ]),
    el('div', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'צוותים ראשוניים' }),
      el('div', { class: 'checkline', id: 'team-presets' }),
      el('span', { class: 'field__hint', text: 'כל צוות נוצר עם שורה לכל דרגה בתעריפון. אפשר להוסיף ולמחוק צוותים בהמשך.' }),
    ]),
  ]);
}

export function renderBudgetImportPreview(parsed, { roles }) {
  const wrap = el('div', { class: 'import' });
  wrap.append(el('p', { class: 'modal-text', text: 'זה מבנה התקציב שזוהה בקובץ. הצוותים ייווצרו בעסקה הנוכחית עם השעות המוערכות שבו.' }));

  const opts = [];
  if (parsed.overrunFactor !== null) {
    opts.push(el('label', { class: 'inline-check' }, [
      el('input', { type: 'checkbox', checked: 'checked', dataset: { imp: 'applyFactor' } }),
      el('span', { text: `החל את מקדם החריגה שזוהה (${fmtPct(parsed.overrunFactor)}) על העסקה` }),
    ]));
  }
  if (parsed.roles.length) {
    opts.push(el('label', { class: 'inline-check' }, [
      el('input', { type: 'checkbox', dataset: { imp: 'applyRates' } }),
      el('span', { text: `עדכן את התעריפון לתעריפים שזוהו: ${parsed.roles.map((r) => `${r.name} ${fmtMoney(r.rate)}`).join(' · ')}` }),
    ]));
  }
  if (opts.length) wrap.append(el('div', { class: 'stack-sm' }, opts));

  const roleNames = new Set(roles.map((r) => r.name.trim()));
  wrap.append(el('div', { class: 'tbl-scroll' }, el('table', { class: 'tbl tbl--compact' }, [
    el('thead', {}, el('tr', {}, ['צוות', 'דרגה', 'שעות מוערכות', 'שעות תקציב', 'עלות', 'התאמה'].map((t) => el('th', { text: t })))),
    el('tbody', {}, parsed.teams.flatMap((t) => (t.lines.length ? t.lines : [null]).map((l, i) => (l === null
      ? el('tr', {}, [
        el('td', { class: 'c-strong', text: t.name }),
        el('td', { class: 'muted', colspan: '4', text: 'בלי שעות בגיליון — ייווצר עם שורה לכל דרגה' }),
        el('td', { class: 'muted', text: '—' }),
      ])
      : el('tr', {}, [
        el('td', { class: 'c-strong', text: i === 0 ? t.name : '' }),
        el('td', { text: l.roleName }),
        el('td', { class: 'num', text: fmtHours(l.estHours) }),
        el('td', { class: 'num', text: fmtHours(l.budgetHours) }),
        el('td', { class: 'num', text: fmtMoney(l.cost) }),
        el('td', {}, [el('span', { class: `pill pill--${roleNames.has(l.roleName.trim()) ? 'ok' : 'risk'}`, text: roleNames.has(l.roleName.trim()) ? 'דרגה קיימת' : 'דרגה חדשה' })]),
      ]))))),
  ])));

  if (parsed.notes.length) {
    wrap.append(el('div', { class: 'stack-sm' }, parsed.notes.map((n) => el('div', { class: 'notice' }, [icon('info'), el('span', { text: n })]))));
  }
  return wrap;
}
