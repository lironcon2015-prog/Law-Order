// Shared mock data for LexLedger designs
window.LEX_DATA = {
  year: 2026,
  kpis: {
    opening: 4119.38,
    revenue: 287450,
    commissions: 71862.50,
    payments: 58400,
    balance: 17581.88,
  },
  monthly: [
    { m: 'ינואר',   rev: 18200, com: 4550,  pay: 4550  },
    { m: 'פברואר',  rev: 22400, com: 5600,  pay: 5600  },
    { m: 'מרץ',     rev: 31200, com: 7800,  pay: 7800  },
    { m: 'אפריל',   rev: 19800, com: 4950,  pay: 4950  },
    { m: 'מאי',     rev: 28500, com: 7125,  pay: 5000  },
    { m: 'יוני',    rev: 34100, com: 8525,  pay: 8525  },
    { m: 'יולי',    rev: 26700, com: 6675,  pay: 6675  },
    { m: 'אוגוסט',  rev: 29800, com: 7450,  pay: 4200  },
    { m: 'ספטמבר',  rev: 24500, com: 6125,  pay: 6125  },
    { m: 'אוקטובר', rev: 30250, com: 7562,  pay: 4975  },
    { m: 'נובמבר',  rev: 22000, com: 5500,  pay: 0     },
    { m: 'דצמבר',   rev: 0,     com: 0,     pay: 0     },
  ],
  clients: [
    { name: 'חברת אלון נכסים בע"מ', case: 'תיק #2341 · נדל"ן', status: 'ongoing',    rate: 25, rev: 68400, com: 17100 },
    { name: 'משפחת רוזנברג',         case: 'תיק #2298 · ירושה', status: 'deal',      rate: 20, rev: 42100, com: 8420  },
    { name: 'גולן טכנולוגיות',       case: 'תיק #2412 · חוזים', status: 'ongoing',    rate: 25, rev: 38900, com: 9725  },
    { name: 'ע.י. הנדסה בע"מ',       case: 'תיק #2187 · ליטיגציה', status: 'litigation', rate: 30, rev: 52600, com: 15780 },
    { name: 'שירה לוי',               case: 'תיק #2455 · גירושין', status: 'ongoing',    rate: 25, rev: 24800, com: 6200  },
    { name: 'קבוצת ים תיכון',        case: 'תיק #2376 · מסחרי',  status: 'deal',       rate: 22, rev: 60650, com: 13343 },
  ],
  invoices: [
    { client: 'חברת אלון נכסים', case: '#2341', month: 'אוקטובר', year: 2026, amount: 8500,  rate: 25, com: 2125,  src: 'pdf' },
    { client: 'גולן טכנולוגיות',   case: '#2412', month: 'אוקטובר', year: 2026, amount: 4200,  rate: 25, com: 1050,  src: 'manual' },
    { client: 'ע.י. הנדסה',       case: '#2187', month: 'אוקטובר', year: 2026, amount: 12400, rate: 30, com: 3720,  src: 'pdf' },
    { client: 'משפחת רוזנברג',    case: '#2298', month: 'אוקטובר', year: 2026, amount: 5150,  rate: 20, com: 1030,  src: 'pdf' },
    { client: 'קבוצת ים תיכון',   case: '#2376', month: 'ספטמבר',  year: 2026, amount: 9800,  rate: 22, com: 2156,  src: 'import' },
    { client: 'שירה לוי',          case: '#2455', month: 'ספטמבר',  year: 2026, amount: 3200,  rate: 25, com: 800,   src: 'manual' },
  ],
  payments: [
    { month: 'אוקטובר', year: 2026, amount: 4975,  note: 'העברה בנקאית' },
    { month: 'ספטמבר',  year: 2026, amount: 6125,  note: '' },
    { month: 'אוגוסט',  year: 2026, amount: 4200,  note: 'תשלום חלקי' },
    { month: 'יולי',    year: 2026, amount: 6675,  note: '' },
  ],
};

window.fmtNum = (n) => Math.round(n).toLocaleString('he-IL');
window.fmtNum2 = (n) => n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
