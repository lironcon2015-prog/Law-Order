// seed.js — נתוני דמו לבדיקה. הפעלה ידנית: window.seedDemo() בקונסולה.
// לא רץ אוטומטית.

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function seedDemo(store) {
  const orbit = await store.saveCompany({ name: 'Orbit Capital', sector: 'קרן פרייבט אקוויטי', investors: ['Sequoia', 'Viola'], website: 'orbitcapital.com' });
  const helios = await store.saveCompany({ name: 'Helios Semiconductors', sector: 'היי-טק / שבבים', investors: ['Intel Capital'], website: 'helios.io' });
  const meridian = await store.saveCompany({ name: 'Meridian Foods', sector: 'מזון וצריכה', investors: [], website: 'meridianfoods.co.il' });

  await store.saveContact({
    fullName: 'דנה לוי',
    role: 'שותפה מנהלת',
    status: 'client',
    currentCompanyId: orbit.id,
    origin: 'היכרות מעסקת רכישה ב-2019',
    contactInfo: { phone: '054-1234567', email: 'dana@orbitcapital.com', linkedin: 'linkedin.com/in/danalevi' },
    tags: ['Private Equity', 'M&A', 'לקוח VIP'],
    lastContactDate: daysAgo(12),
    contactFrequencyDays: 30,
    careerTimeline: [
      { companyName: 'Orbit Capital', role: 'שותפה מנהלת', startYear: 2018, endYear: null },
      { companyName: 'Goldman Sachs', role: 'VP השקעות', startYear: 2012, endYear: 2018 },
    ],
    referrals: [
      { dealName: 'רכישת TechNova', status: 'נסגר', estimatedValue: 45000000 },
      { dealName: 'מיזוג Helios-Apex', status: 'בתהליך', estimatedValue: 120000000 },
    ],
    chronologicalNotes: [
      { timestamp: new Date(Date.now() - 12 * 86400000).toISOString(), noteText: 'שיחת עדכון רבעונית. מעוניינת בליווי עסקה חדשה ברבעון הבא.' },
      { timestamp: new Date(Date.now() - 60 * 86400000).toISOString(), noteText: 'נפגשנו בכנס ה-PE. הציגה הזדמנות במזון.' },
    ],
  });

  await store.saveContact({
    fullName: 'יואב שמש',
    role: 'מנכ"ל',
    status: 'meeting',
    currentCompanyId: helios.id,
    origin: 'הופנה ע"י דנה לוי',
    contactInfo: { phone: '052-7654321', email: 'yoav@helios.io', linkedin: 'linkedin.com/in/yoavshemesh' },
    tags: ['היי-טק', 'סמיקונדקטור'],
    lastContactDate: daysAgo(95),
    contactFrequencyDays: 45,
    careerTimeline: [
      { companyName: 'Helios Semiconductors', role: 'מנכ"ל', startYear: 2020, endYear: null },
      { companyName: 'Mellanox', role: 'סמנכ"ל מוצר', startYear: 2014, endYear: 2020 },
    ],
    referrals: [
      { dealName: 'גיוס סדרה C', status: 'מתעניין', estimatedValue: 30000000 },
    ],
    chronologicalNotes: [
      { timestamp: new Date(Date.now() - 95 * 86400000).toISOString(), noteText: 'פגישת היכרות. שוקל מהלך M&A בשנה הקרובה — לעקוב!' },
    ],
  });

  await store.saveContact({
    fullName: 'מירב כהן',
    role: 'סמנכ"לית כספים',
    status: 'warm',
    currentCompanyId: meridian.id,
    origin: 'לקוח עבר ממשרד קודם',
    contactInfo: { phone: '050-9988776', email: 'merav@meridianfoods.co.il', linkedin: '' },
    tags: ['CFO', 'מזון'],
    lastContactDate: daysAgo(40),
    contactFrequencyDays: 90,
    careerTimeline: [
      { companyName: 'Meridian Foods', role: 'CFO', startYear: 2021, endYear: null },
      { companyName: 'Strauss', role: 'בקרת מטה', startYear: 2016, endYear: 2021 },
    ],
    referrals: [],
    chronologicalNotes: [
      { timestamp: new Date(Date.now() - 40 * 86400000).toISOString(), noteText: 'עברה תפקיד ל-Meridian. הזדמנות — חברה לקראת סבב צמיחה.' },
    ],
  });

  await store.saveContact({
    fullName: 'אבי רוזן',
    role: 'יועץ אסטרטגי',
    status: 'cold',
    currentCompanyId: '',
    origin: 'נטוורקינג בלינקדאין',
    contactInfo: { phone: '', email: 'avi.rozen@gmail.com', linkedin: 'linkedin.com/in/avirozen' },
    tags: ['ייעוץ'],
    lastContactDate: daysAgo(200),
    contactFrequencyDays: 120,
    careerTimeline: [],
    referrals: [],
    chronologicalNotes: [],
  });
}
