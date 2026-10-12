// demo.js — נתוני דמו לתצוגה המקדימה בלבד. נטען אחרי האפליקציה, ממלא מסד נפרד (lexBudgetPreviewDB)
// רק כשהוא ריק. חמש עסקאות במצבים שונים, ספריית אנשים, ודוחות שעות חודשיים — כמו בשימוש אמיתי.

const PEOPLE = [
  ['דנה כהן', 'שותפה'], ['רון אלמוג', 'שותף'], ['מיכל שגיא', 'שותפה'],
  ['יואב ברק', 'עו״ד בכיר'], ['אורי כץ', 'עו״ד'], ['שירה גולן', 'עו״ד'], ['תומר לוי', 'עו״ד'],
  ['הילה פרץ', 'עו״ד'], ['עידו נחום', 'עו״ד'], ['נועה לוי', 'מתמחה'], ['איתי רוזן', 'מתמחה'],
  ['מאיה דהן', 'מתמחה'], ['גל שמעוני', 'מתמחה'], ['ליאור בן דוד', 'עו״ד (מיסים)'],
];

const MONTH = { '01': 'ינואר', '02': 'פברואר', '03': 'מרץ', '04': 'אפריל', '05': 'מאי', '06': 'יוני', '07': 'יולי', '08': 'אוגוסט', '09': 'ספטמבר', '10': 'אוקטובר', '11': 'נובמבר', '12': 'דצמבר' };
const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const r1 = (n) => Math.round(n * 10) / 10;

/*
 * כל עסקה: צוותים → שורות [דרגה, אדם, שעות מוערכות, מכפיל ביצוע].
 * המכפיל = כמה מההערכה כבר בוצע (1.1 = חריגה של 10% מעל ההערכה, לפני מקדם החריגה).
 */
const DEALS = [
  {
    deal: { name: 'רכישת אלפא טכנולוגיות', client: 'קרן מרידיאן', code: 'M&A-2026-07', feeModel: 'capped', agreedFee: 640000,
      overrunFactor: 0.2, startDate: '2026-05-01', targetDate: '2026-11-30', progressPct: 70, status: 'active' },
    months: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'], weights: [.12, .2, .24, .22, .22],
    teams: [
      ['צוות עסקה', '', [['שותף', 'דנה כהן', 90, .74], ['עו"ד', 'יואב ברק', 160, .78], ['עו"ד', 'שירה גולן', 110, .7], ['מתמחה', 'נועה לוי', 120, .8]]],
      ['בדיקת נאותות', 'dd', [['שותף', 'רון אלמוג', 20, 1.18], ['עו"ד', 'אורי כץ', 90, 1.22], ['עו"ד', 'הילה פרץ', 70, 1.15], ['מתמחה', 'איתי רוזן', 140, 1.3]]],
      ['קורפורייט', '', [['שותף', 'מיכל שגיא', 25, .6], ['עו"ד', 'תומר לוי', 60, .82], ['מתמחה', 'מאיה דהן', 40, .7]]],
      ['דיני עבודה', '', [['עו"ד', 'עידו נחום', 45, .9], ['מתמחה', 'גל שמעוני', 30, .95]]],
      ['מיסים', '', [['עו"ד', 'ליאור בן דוד', 35, .55]]],
    ],
    manual: { team: 1, line: 1, hours: 6.5, date: '2026-10-06', note: 'הערכה עד קבלת דוח אוקטובר' },
  },
  {
    deal: { name: 'מיזוג בטא החזקות', client: 'בטא החזקות בע״מ', code: 'M&A-2026-09', feeModel: 'fixed', agreedFee: 480000,
      overrunFactor: 0.15, startDate: '2026-07-01', targetDate: '2027-01-31', progressPct: 35, status: 'active' },
    months: ['2026-07', '2026-08', '2026-09'], weights: [.25, .35, .4],
    teams: [
      ['צוות עסקה', '', [['שותף', 'רון אלמוג', 110, .38], ['עו"ד', 'שירה גולן', 180, .42], ['מתמחה', 'גל שמעוני', 150, .45]]],
      ['בדיקת נאותות', 'dd', [['עו"ד', 'הילה פרץ', 120, .5], ['מתמחה', 'מאיה דהן', 160, .48]]],
      ['רגולציה ותחרות', '', [['שותף', 'מיכל שגיא', 30, .3], ['עו"ד', 'תומר לוי', 70, .36]]],
    ],
  },
  {
    deal: { name: 'גיוס סדרה C — גמא סייבר', client: 'גמא סייבר', code: 'VC-2026-03', feeModel: 'capped', agreedFee: 165000,
      overrunFactor: 0.1, startDate: '2026-03-01', targetDate: '2026-09-30', progressPct: 92, status: 'active' },
    months: ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'], weights: [.08, .12, .14, .16, .16, .18, .16],
    teams: [
      ['צוות עסקה', '', [['שותף', 'דנה כהן', 45, 1.12], ['עו"ד', 'יואב ברק', 90, 1.18], ['מתמחה', 'נועה לוי', 60, 1.1]]],
      ['ניירות ערך', '', [['עו"ד', 'אורי כץ', 50, 1.35], ['מתמחה', 'איתי רוזן', 40, 1.25]]],
      ['מיסים', '', [['עו"ד', 'ליאור בן דוד', 20, .9]]],
    ],
  },
  {
    deal: { name: 'מכירת דלתא לוגיסטיקה', client: 'דלתא לוגיסטיקה', code: 'M&A-2025-14', feeModel: 'fixed', agreedFee: 280000,
      overrunFactor: 0.2, startDate: '2025-11-01', targetDate: '2026-04-30', progressPct: 100, status: 'closed' },
    months: ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'], weights: [.1, .15, .2, .2, .2, .15], invoices: true,
    teams: [
      ['צוות עסקה', '', [['שותף', 'מיכל שגיא', 70, 1.25], ['עו"ד', 'תומר לוי', 120, 1.3], ['מתמחה', 'מאיה דהן', 80, 1.2]]],
      ['בדיקת נאותות', 'dd', [['עו"ד', 'עידו נחום', 60, 1.45], ['מתמחה', 'גל שמעוני', 90, 1.5]]],
      ['דיני עבודה', '', [['עו"ד', 'הילה פרץ', 30, 1.05]]],
    ],
  },
  {
    deal: { name: 'הסכם בעלי מניות — אפסילון', client: 'אפסילון ביו', code: 'CORP-2026-21', feeModel: 'hourly', agreedFee: 0,
      overrunFactor: 0.2, startDate: '2026-10-01', targetDate: '2026-12-31', progressPct: 0, status: 'onhold' },
    months: [], weights: [],
    teams: [
      ['צוות עסקה', '', [['שותף', 'רון אלמוג', 25, 0], ['עו"ד', 'שירה גולן', 60, 0], ['מתמחה', 'איתי רוזן', 40, 0]]],
    ],
  },
];

async function seed(app) {
  const { store } = app;
  const card = store.defaultRateCard();
  const roleByName = Object.fromEntries(card.roles.map((r) => [r.name, r]));

  const people = {};
  for (const [name, title] of PEOPLE) people[name] = await store.savePerson({ name, title });

  for (const [di, spec] of DEALS.entries()) {
    const deal = await store.createDeal({ ...spec.deal, order: di }, []);
    const progress = [];
    for (const [ti, [teamName, kind, lines]] of spec.teams.entries()) {
      const team = await store.saveTeam({
        dealId: deal.id, name: teamName, order: ti, kind,
        lead: lines[0][1],
        lines: lines.map(([roleName, person, est]) => ({
          roleId: roleByName[roleName].id, roleName, personId: people[person].id, estHours: est,
        })),
      });
      // דוח שעות חודשי לכל אדם: סך הביצוע מתחלק בין החודשים לפי משקלות, עם רעש קטן
      team.lines.forEach((line, li) => {
        const [, person, est, mult] = lines[li];
        const total = est * mult;
        if (!total) return;
        spec.months.forEach((ym, mi) => {
          const noise = 1 + (((ti * 7 + li * 3 + mi * 5) % 9) - 4) / 40;
          const hours = r1(total * spec.weights[mi] * noise);
          if (hours <= 0) return;
          progress.push({
            dealId: deal.id, teamId: team.id, lineId: line.id, roleId: line.roleId, person,
            date: `${ym}-25`, billPeriod: ym, periodFrom: `${ym}-01`, periodTo: monthEnd(ym),
            hours, sourceHours: hours, source: spec.invoices ? 'invoice' : 'import',
            fileName: `${spec.invoices ? 'חשבון' : 'דוח שעות'} ${MONTH[ym.slice(5)]} ${ym.slice(0, 4)}.${spec.invoices ? 'pdf' : 'xlsx'}`, batchId: `demo_${di}_${ym}`,
          });
        });
      });
      if (spec.manual && spec.manual.team === ti) {
        const line = team.lines[spec.manual.line];
        progress.push({
          dealId: deal.id, teamId: team.id, lineId: line.id, roleId: line.roleId, person: lines[spec.manual.line][1],
          date: spec.manual.date, hours: spec.manual.hours, source: 'manual', note: spec.manual.note,
        });
      }
    }
    if (progress.length) await store.addProgressMany(progress);
    if (spec.deal.status === 'active' && di === 0) await store.captureBaseline(deal.id);
  }
}

async function waitForApp() {
  for (let i = 0; i < 100; i++) {
    if (window.lexBudget?.store?.cache?.loaded) return window.lexBudget;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

export async function ensureDemo() {
  const app = await waitForApp();
  if (!app || app.store.cache.deals.length) return;
  await seed(app);
  app.state.view = 'overview';
  app.render();
}

/** איפוס: מחיקת מסד התצוגה המקדימה וטעינה מחדש — הדמו נבנה מחדש מאפס */
export function resetDemo() {
  const req = indexedDB.deleteDatabase(window.LB_DB_NAME);
  const done = () => location.reload();
  req.onsuccess = done; req.onerror = done; req.onblocked = done;
}
