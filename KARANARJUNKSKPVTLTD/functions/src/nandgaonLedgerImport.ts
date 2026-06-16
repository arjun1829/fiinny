import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

// ─── Source Data ──────────────────────────────────────────────────────────────
// UNIMAX AGRI BIO-TECHNOLOGIES → KARAN-ARJUN KRUSHI SEVA KENDRA, NANDGAON
// Period: 4-Feb-26 to 6-Jun-26
// Closing Balance Dr: ₹8,10,993 (Arjun owes UNIMAX this amount — AP)
// Care-Off entries: UNIMAX delivered directly to Arjun's retailers — these
//   are simultaneously Arjun's purchases (AP) AND his sales to retailers (AR)

interface POLine { description: string; quantity: number; rate: number; amount: number; }
interface Invoice {
  vchNo: string; date: string; amount: number;
  lines: POLine[];
  careOff?: string; // present = delivered to this retailer (AR entry needed)
}
interface Payment { receiptNo: string; date: string; amount: number; notes: string; }
interface CreditNote { vchNo: string; date: string; amount: number; notes: string; }

const SUPPLIER = {
  name: 'UNIMAX AGRI BIO-TECHNOLOGIES',
  address: 'Behind Bhairavnath Mandir, Nagar Baramati Road, Gat No. 58/2, Diksal, Karjat 414401, Dist-Ahmednagar (M.H.)',
  email: 'unimaxagribiotechnologies@gmail.com',
};

const INVOICES: Invoice[] = [
  // ── Feb 2026 — Direct stock (F CUT RATE, no care-off) ─────────────────────
  { vchNo: 'UAB/1501/25-26', date: '2026-02-04', amount: 6598, lines: [
    { description: 'FASTER-50 ML', quantity: 100, rate: 33.80, amount: 3380 },
    { description: 'FASTER-100 ML', quantity: 50, rate: 64.35, amount: 3217.50 },
  ]},
  { vchNo: 'UAB/1517/25-26', date: '2026-02-08', amount: 7313, lines: [
    { description: 'VERAZIN-250 GM', quantity: 40, rate: 113.75, amount: 4550 },
    { description: 'VERAZIN-100 GM', quantity: 50, rate: 55.25, amount: 2762.50 },
  ]},
  { vchNo: 'UAB/1560/25-26', date: '2026-02-18', amount: 108800, lines: [
    { description: 'POWER PLUSE-5000 ML', quantity: 40, rate: 950, amount: 38000 },
    { description: 'POWER PLUSE-3000 ML', quantity: 120, rate: 590, amount: 70800 },
  ]},
  { vchNo: 'UAB/1579/25-26', date: '2026-02-20', amount: 11057, lines: [
    { description: 'FASTER-500 ML', quantity: 20, rate: 280.80, amount: 5616 },
    { description: 'FASTER-1000 ML', quantity: 10, rate: 544.05, amount: 5440.50 },
  ]},
  { vchNo: 'UAB/1571/25-26', date: '2026-02-26', amount: 108800, lines: [
    { description: 'POWER PLUSE-3000 ML', quantity: 120, rate: 590, amount: 70800 },
    { description: 'POWER PLUSE-5000 ML', quantity: 40, rate: 950, amount: 38000 },
  ]},
  // ── Feb 2026 — Care-off (AR entries) ──────────────────────────────────────
  { vchNo: 'UAB/1607/25-26', date: '2026-02-26', amount: 18880,
    careOff: 'PARAHIT KRUSHI SEVA KENDRA, CHAKHALAMBA',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 32, rate: 590, amount: 18880 }],
  },
  { vchNo: 'UAB/1612/25-26', date: '2026-02-28', amount: 85200, lines: [
    { description: 'POWER PLUSE-5000 ML', quantity: 40, rate: 950, amount: 38000 },
    { description: 'POWER PLUSE-3000 ML', quantity: 80, rate: 590, amount: 47200 },
  ]},
  // ── Mar 2026 ───────────────────────────────────────────────────────────────
  { vchNo: 'UAB/1619/25-26', date: '2026-03-01', amount: 80300,
    careOff: 'DONGARE PATIL AGRO, YEWALA',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 120, rate: 590, amount: 70800 },
      { description: 'POWER PLUSE-5000 ML', quantity: 10, rate: 950, amount: 9500 },
    ],
  },
  { vchNo: 'UAB/1620/25-26', date: '2026-03-01', amount: 213000, lines: [
    { description: 'POWER PLUSE-3000 ML', quantity: 200, rate: 590, amount: 118000 },
    { description: 'POWER PLUSE-5000 ML', quantity: 100, rate: 950, amount: 95000 },
  ]},
  { vchNo: 'UAB/1625/25-26', date: '2026-03-03', amount: 11800,
    careOff: 'KISAN AGRO TRADERS, KOKAMTHAN',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1627/25-26', date: '2026-03-03', amount: 4720,
    careOff: 'SUYOG KRUSHI SEVA KENDRA, DOITHAN',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 8, rate: 590, amount: 4720 }],
  },
  { vchNo: 'UAB/1628/25-26', date: '2026-03-03', amount: 29600, lines: [
    { description: 'GRIPPER GR-25KG', quantity: 50, rate: 500, amount: 25000 },
    { description: 'VERABOR-500 GM', quantity: 20, rate: 115, amount: 2300 },
    { description: 'VERABOR-1000 GM', quantity: 10, rate: 230, amount: 2300 },
  ]},
  { vchNo: 'UAB/1629/25-26', date: '2026-03-03', amount: 8520,
    careOff: 'SACHIN AGRO CLINIC, KARMALA',
    lines: [
      { description: 'POWER PLUSE-5000 ML', quantity: 4, rate: 950, amount: 3800 },
      { description: 'POWER PLUSE-3000 ML', quantity: 8, rate: 590, amount: 4720 },
    ],
  },
  { vchNo: 'UAB/1630/25-26', date: '2026-03-04', amount: 4260,
    careOff: 'SACHIN AGRO AGENCY, GHOGARGAON',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 4, rate: 590, amount: 2360 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1631/25-26', date: '2026-03-04', amount: 4260,
    careOff: 'BHOS KRUSHI SEVA KENDRA, RUICHATTISHI',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 4, rate: 590, amount: 2360 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1634/25-26', date: '2026-03-05', amount: 4720,
    careOff: 'SANGRAM KRUSHI SEVA KENDRA, KOREGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 8, rate: 590, amount: 4720 }],
  },
  { vchNo: 'UAB/1641/25-26', date: '2026-03-06', amount: 4720,
    careOff: 'WAGHESHWAR KRUSHI SEVA KENDRA, BHATODI PARGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 8, rate: 590, amount: 4720 }],
  },
  { vchNo: 'UAB/1643/25-26', date: '2026-03-06', amount: 7080,
    careOff: 'SACHIN AGRO SERVICES, GHOGARGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 12, rate: 590, amount: 7080 }],
  },
  { vchNo: 'UAB/1649/25-26', date: '2026-03-07', amount: 7080,
    careOff: 'JAY KISAN AGRO SERVICES, BELWANDI',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 12, rate: 590, amount: 7080 }],
  },
  { vchNo: 'UAB/1650/25-26', date: '2026-03-07', amount: 118000, lines: [
    { description: 'POWER PLUSE-3000 ML', quantity: 200, rate: 590, amount: 118000 },
  ]},
  { vchNo: 'UAB/1652/25-26', date: '2026-03-07', amount: 8520,
    careOff: 'SANTKRUPA KSK, GHATPIMPRI ASTI',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 8, rate: 590, amount: 4720 },
      { description: 'POWER PLUSE-5000 ML', quantity: 4, rate: 950, amount: 3800 },
    ],
  },
  { vchNo: 'UAB/1653/25-26', date: '2026-03-09', amount: 6620,
    careOff: 'SHAURYA KSK, NEWASA',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 8, rate: 590, amount: 4720 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1654/25-26', date: '2026-03-09', amount: 11340,
    careOff: 'YOGESH KSK, GANGADHARI TAL-NANDGAON',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 16, rate: 590, amount: 9440 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1655/25-26', date: '2026-03-09', amount: 10880,
    careOff: 'RAYHUBA KSK, GHULEWADI',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 12, rate: 590, amount: 7080 },
      { description: 'POWER PLUSE-5000 ML', quantity: 4, rate: 950, amount: 3800 },
    ],
  },
  { vchNo: 'UAB/1656/25-26', date: '2026-03-09', amount: 7080,
    careOff: 'LAXMI AGRO, KUSADGAON CHAUFULA',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 12, rate: 590, amount: 7080 }],
  },
  { vchNo: 'UAB/1657/25-26', date: '2026-03-09', amount: 11800,
    careOff: 'CHATRAPATI AGRO, TAMBAVE',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1658/25-26', date: '2026-03-09', amount: 9440,
    careOff: 'VAISHNAVI AGRO, SHEVGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 16, rate: 590, amount: 9440 }],
  },
  { vchNo: 'UAB/1660/25-26', date: '2026-03-09', amount: 7080,
    careOff: 'WAGHESHWAR KSK, BHATODI PHATA',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 12, rate: 590, amount: 7080 }],
  },
  { vchNo: 'UAB/1661/25-26', date: '2026-03-09', amount: 6620,
    careOff: 'PASAYADAN AGRO, SALABATPUR TAL-NEWASA',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 8, rate: 590, amount: 4720 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1662/25-26', date: '2026-03-09', amount: 35400,
    careOff: 'DONGARE PATIL AGRO, PATODA',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 60, rate: 590, amount: 35400 }],
  },
  { vchNo: 'UAB/1663/25-26', date: '2026-03-09', amount: 11800,
    careOff: 'DONGARE PATIL KSK, SHETKARI BRAMHGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1664/25-26', date: '2026-03-09', amount: 11340,
    careOff: 'SHRI SAIRAM KSK, BHATKUDGAON',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 16, rate: 590, amount: 9440 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1666/25-26', date: '2026-03-10', amount: 4260,
    careOff: 'YASHWANT AGRO, ANNAPUR',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 4, rate: 590, amount: 2360 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1675/25-26', date: '2026-03-10', amount: 113400, lines: [
    { description: 'POWER PLUSE-3000 ML', quantity: 160, rate: 590, amount: 94400 },
    { description: 'POWER PLUSE-5000 ML', quantity: 20, rate: 950, amount: 19000 },
  ]},
  { vchNo: 'UAB/1677/25-26', date: '2026-03-12', amount: 11800,
    careOff: 'VAISHNAVI AGRO SERVICES, SHEVGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1680/25-26', date: '2026-03-12', amount: 11800,
    careOff: 'OM SAI KSK, CHINCHAPUR PANGUL',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1683/25-26', date: '2026-03-13', amount: 27400,
    careOff: 'DHARTI AGRO SERVICES, CHAUDHANE',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 40, rate: 590, amount: 23600 },
      { description: 'POWER PLUSE-5000 ML', quantity: 4, rate: 950, amount: 3800 },
    ],
  },
  { vchNo: 'UAB/1685/25-26', date: '2026-03-13', amount: 17500,
    careOff: 'AADISHAKTI KRUSHI SEVA KENDRA, KALWAN',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 },
      { description: 'POWER PLUSE-5000 ML', quantity: 6, rate: 950, amount: 5700 },
    ],
  },
  { vchNo: 'UAB/1691/25-26', date: '2026-03-14', amount: 11800,
    careOff: 'JAY KISAN KRUSHI SEVA KENDRA, PARGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1692/25-26', date: '2026-03-14', amount: 13700,
    careOff: 'NIKHIL AGRO SERVICES, DHAVALGAON',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1693/25-26', date: '2026-03-16', amount: 11800,
    careOff: 'JAY MALHAR KSK, WAKADI TAL-RAHATA',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1694/25-26', date: '2026-03-16', amount: 118000, lines: [
    { description: 'POWER PLUSE-3000 ML', quantity: 120, rate: 590, amount: 70800 },
    { description: 'POWER PLUSE-5000 ML', quantity: 40, rate: 950, amount: 38000 },
    { description: 'VERABOR-500 GM', quantity: 40, rate: 115, amount: 4600 },
    { description: 'VERABOR-1000 GM', quantity: 20, rate: 230, amount: 4600 },
  ]},
  { vchNo: 'UAB/1696/25-26', date: '2026-03-16', amount: 22220,
    careOff: 'DONGARE PATIL AGRO, PATODA TAL-YEWALA DIST-NASHIK',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 28, rate: 590, amount: 16520 },
      { description: 'POWER PLUSE-5000 ML', quantity: 6, rate: 950, amount: 5700 },
    ],
  },
  { vchNo: 'UAB/1703/25-26', date: '2026-03-16', amount: 47200,
    careOff: 'KRUSHIDEEPAK KRUSHI SEVA KENDRA, KOPARGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 80, rate: 590, amount: 47200 }],
  },
  { vchNo: 'UAB/1704/25-26', date: '2026-03-16', amount: 11800,
    careOff: 'ARYAN KRUSHI SEVA KENDRA, KHADAKI',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1707/25-26', date: '2026-03-17', amount: 8980,
    careOff: 'BHOS KRUSHI SEVA KENDRA, RUICHATISHI',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 12, rate: 590, amount: 7080 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1705/25-26', date: '2026-03-18', amount: 8980,
    careOff: 'KANIFNATH KSK, CHANDA TAL-NEWASA',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 12, rate: 590, amount: 7080 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1706/25-26', date: '2026-03-18', amount: 7080,
    careOff: 'NEW SHETKARI AGRO, PIMPALWANDI TAL-PAITHAN',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 12, rate: 590, amount: 7080 }],
  },
  { vchNo: 'UAB/1708/25-26', date: '2026-03-18', amount: 28320,
    careOff: 'KANSARA KSK, KANASHI TAL-KALWAN DIST-NASHIK',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 48, rate: 590, amount: 28320 }],
  },
  { vchNo: 'UAB/1711/25-26', date: '2026-03-19', amount: 11800,
    careOff: 'KRUSHISANJIVANI AGRO, GHARGAON TAL-SHRIGONDA',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1714/25-26', date: '2026-03-19', amount: 42125,
    careOff: 'DONGARE PATIL AGRO, PATODA TAL-YEWALA (25% less)',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 60, rate: 590, amount: 35400 },
      { description: 'POWER PLUSE-5000 ML', quantity: 4, rate: 950, amount: 3800 },
      { description: 'UNI K UPTEK-5000 ML (25% less)', quantity: 2, rate: 1462.50, amount: 2925 },
    ],
  },
  { vchNo: 'UAB/1715/25-26', date: '2026-03-19', amount: 118000,
    careOff: 'KRUSHIDIPAK KSK, KOPARGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 200, rate: 590, amount: 118000 }],
  },
  { vchNo: 'UAB/1718/25-26', date: '2026-03-19', amount: 23600,
    careOff: 'YOGESH KRUSHI SEVA KENDRA, GANGADHARI NADGAON DIST-NASHIK',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 40, rate: 590, amount: 23600 }],
  },
  { vchNo: 'UAB/1721/25-26', date: '2026-03-20', amount: 11800,
    careOff: 'SITARAM MAHARAJ KSK, PIMPRI PENDHAR',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1723/25-26', date: '2026-03-23', amount: 23600,
    careOff: 'YOGESH KRUSHI AGENCIES, LASALGAON TAL-NIPHAD',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 40, rate: 590, amount: 23600 }],
  },
  { vchNo: 'UAB/1726/25-26', date: '2026-03-24', amount: 7080,
    careOff: 'WAGHESHWAR KRUSHI SEVA KENDRA, BHOTODI PARGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 12, rate: 590, amount: 7080 }],
  },
  { vchNo: 'UAB/1729/25-26', date: '2026-03-26', amount: 52600, lines: [
    { description: 'POWER PLUS-1000 ML', quantity: 100, rate: 290, amount: 29000 },
    { description: 'POWER PLUSE-3000 ML', quantity: 40, rate: 590, amount: 23600 },
  ]},
  { vchNo: 'UAB/1730/25-26', date: '2026-03-27', amount: 11800,
    careOff: 'KISAN AGRO TRADERS, KOKAMTHAN KOPARGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  { vchNo: 'UAB/1731/25-26', date: '2026-03-27', amount: 2900,
    careOff: 'BHOS AGRO AGENCY, RUICHATTISHI',
    lines: [{ description: 'POWER PLUS-1000 ML', quantity: 10, rate: 290, amount: 2900 }],
  },
  { vchNo: 'UAB/1732/25-26', date: '2026-03-29', amount: 7600,
    careOff: 'BALIRAJA KRUSHI SEVA KENDRA, PATHARDI',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 8, rate: 950, amount: 7600 }],
  },
  { vchNo: 'UAB/1733/25-26', date: '2026-03-31', amount: 4260,
    careOff: 'MORYA KRUSHI SEVA KENDRA, BITKEWADI',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 4, rate: 590, amount: 2360 },
      { description: 'POWER PLUSE-5000 ML', quantity: 2, rate: 950, amount: 1900 },
    ],
  },
  { vchNo: 'UAB/1734/25-26', date: '2026-03-31', amount: 11800,
    careOff: 'KRUSHISANJIVANI AGRO AGENCY, GHARGAON',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 }],
  },
  // ── Apr 2026 (FY 26-27) ────────────────────────────────────────────────────
  { vchNo: 'UAB/0038/26-27', date: '2026-04-01', amount: 19000, lines: [
    { description: 'POWER PLUSE-5000 ML', quantity: 20, rate: 950, amount: 19000 },
  ]},
  { vchNo: 'UAB/0040/26-27', date: '2026-04-02', amount: 23600,
    careOff: 'YOGESH KRUSHI SEVA KENDRA, GANGADHARI',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 40, rate: 590, amount: 23600 }],
  },
  { vchNo: 'UAB/0041/26-27', date: '2026-04-02', amount: 7080,
    careOff: 'NEW SHETKARI AGRO, PIMPALWANDI PAITHAN',
    lines: [{ description: 'POWER PLUSE-3000 ML', quantity: 12, rate: 590, amount: 7080 }],
  },
  { vchNo: 'UAB/0067/26-27', date: '2026-04-11', amount: 21400,
    careOff: 'DONGARE PATIL AGRO SERVICES, PATODA TAL-YEWALA',
    lines: [
      { description: 'POWER PLUSE-3000 ML', quantity: 20, rate: 590, amount: 11800 },
      { description: 'POWER PLUS-1000 ML', quantity: 20, rate: 290, amount: 5800 },
      { description: 'POWER PLUSE-5000 ML', quantity: 4, rate: 950, amount: 3800 },
    ],
  },
];

const PAYMENTS: Payment[] = [
  { receiptNo: 'WB/0930/25-26', date: '2026-02-25', amount: 50000,  notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/0957/25-26', date: '2026-03-01', amount: 75000,  notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/0958/25-26', date: '2026-03-01', amount: 19000,  notes: 'By Hand Kale Saheb — from Dongare Patil Agro, Yewala' },
  { receiptNo: 'WB/0966/25-26', date: '2026-03-02', amount: 100000, notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/1007/25-26', date: '2026-03-09', amount: 50000,  notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/1035/25-26', date: '2026-03-13', amount: 150000, notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/1088/25-26', date: '2026-03-18', amount: 100000, notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/1132/25-26', date: '2026-03-23', amount: 150000, notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/1154/25-26', date: '2026-03-25', amount: 50000,  notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/1222/25-26', date: '2026-03-31', amount: 39000,  notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/0007/26-27', date: '2026-04-04', amount: 50000,  notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/0022/26-27', date: '2026-04-10', amount: 60000,  notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/0067/26-27', date: '2026-05-08', amount: 100000, notes: 'By Hand Kale Saheb' },
  { receiptNo: 'WB/0096/26-27', date: '2026-06-02', amount: 50000,  notes: 'By Hand Kale Saheb' },
];

const CREDIT_NOTES: CreditNote[] = [
  {
    vchNo: 'SRT/0003/26-27', date: '2026-04-13', amount: 4720,
    notes: 'Sales return by Hand Jagtap Saheb — from New Shetkari Krushi Seva Kendra, Pimpalwandi',
  },
];

const CLOSING_BALANCE = 810993;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normName(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

/** Extract shop name (before first comma) from care-off string */
function careOffShopName(careOff: string): string {
  return careOff.split(',')[0].trim();
}

/** Extract location (after first comma) from care-off string */
function careOffLocation(careOff: string): string {
  const idx = careOff.indexOf(',');
  return idx >= 0 ? careOff.substring(idx + 1).trim() : '';
}

// ─── Cloud Function ────────────────────────────────────────────────────────────

export const importNandgaonLedger = functions
  .region('asia-south1')
  .https.onCall(async (data: any, context: any) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');

    const { tenantId, force = false } = data as { tenantId: string; force?: boolean };
    if (!tenantId) throw new functions.https.HttpsError('invalid-argument', 'Missing tenantId');

    const db = admin.firestore();

    // ── Idempotency guard ────────────────────────────────────────────────────
    if (!force) {
      const existing = await db.collection(`tenants/${tenantId}/purchaseOrders`)
        .where('sourceRef', '==', 'UNIMAX_NANDGAON_LEDGER_IMPORT')
        .limit(1)
        .get();
      if (!existing.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Ledger already imported. Pass { force: true } to re-import (will create duplicates).'
        );
      }
    }

    // ── Pre-load existing retailers for AR linking ───────────────────────────
    const retailerSnap = await db.collection(`tenants/${tenantId}/retailers`).get();
    // Map: normalized name → doc id
    const retailerMap = new Map<string, string>();
    retailerSnap.docs.forEach(d => {
      const n = normName((d.data().name as string) || '');
      if (n) retailerMap.set(n, d.id);
    });

    // Track newly created retailer refs (careOff shop name → ref) to avoid duplicates within this run
    const newRetailerRefs = new Map<string, admin.firestore.DocumentReference>();

    const BATCH_LIMIT = 490;
    let batch = db.batch();
    let batchOps = 0;

    const commit = async () => {
      if (batchOps > 0) { await batch.commit(); batch = db.batch(); batchOps = 0; }
    };

    const counts = { purchaseOrders: 0, arOrders: 0, newRetailers: 0, payments: 0 };

    // ── 1. Invoices → Purchase Orders (AP) + Orders (AR for care-offs) ───────
    for (const inv of INVOICES) {
      // Purchase order (AP side — always)
      const poRef = db.collection(`tenants/${tenantId}/purchaseOrders`).doc();
      batch.set(poRef, {
        poNumber: inv.vchNo,
        poDate: inv.date,
        expectedDate: inv.date,
        supplierName: SUPPLIER.name,
        supplierContact: '',
        supplierGstin: '',
        supplierAddress: SUPPLIER.address,
        lines: inv.lines.map(l => ({
          description: l.description,
          hsnCode: '',
          quantity: l.quantity,
          receivedQty: l.quantity,
          rate: l.rate,
          gstPct: 0,
          amount: l.amount,
        })),
        totalAmount: inv.amount,
        taxableValue: inv.amount,
        cgst: 0, sgst: 0, totalTax: 0,
        notes: inv.careOff ? `Care Off: ${inv.careOff}` : 'Direct stock',
        status: 'received',
        sourceRef: 'UNIMAX_NANDGAON_LEDGER_IMPORT',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batchOps++;
      counts.purchaseOrders++;

      // AR order (care-off side — only when retailer name present)
      if (inv.careOff) {
        const shopName = careOffShopName(inv.careOff);
        const shopLoc = careOffLocation(inv.careOff);
        const normShop = normName(shopName);

        // Find or create retailer
        let retailerId = retailerMap.get(normShop);

        if (!retailerId) {
          // Check if already queued in this run
          const existingRef = newRetailerRefs.get(normShop);
          if (existingRef) {
            retailerId = existingRef.id;
          } else {
            // Create new minimal retailer
            const newRef = db.collection(`tenants/${tenantId}/retailers`).doc();
            batch.set(newRef, {
              name: shopName,
              location: shopLoc,
              portfolioSize: 'Small',
              outstandingAmount: 0,
              sourceRef: 'UNIMAX_NANDGAON_LEDGER_IMPORT',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            newRetailerRefs.set(normShop, newRef);
            retailerId = newRef.id;
            batchOps++;
            counts.newRetailers++;
          }
        }

        // Create order (AR)
        const orderRef = db.collection(`tenants/${tenantId}/orders`).doc();
        batch.set(orderRef, {
          retailerId,
          retailerName: shopName,
          productId: 'UNIMAX_CAREOFF',
          productName: inv.lines.map(l => `${l.description} ×${l.quantity}`).join(' + '),
          quantity: 1,
          unit: 'N/A',
          amount: inv.amount,
          paymentStatus: 'Unpaid',
          isDelivered: true,
          sourceInvoice: inv.vchNo,
          sourceRef: 'UNIMAX_NANDGAON_LEDGER_IMPORT',
          notes: `UNIMAX Care-Off | ${inv.vchNo} | ${inv.lines.map(l => `${l.description}: ${l.quantity} NAG @₹${l.rate}`).join(', ')}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batchOps++;
        counts.arOrders++;
      }

      if (batchOps >= BATCH_LIMIT) await commit();
    }

    // ── 2. Payments to UNIMAX (AP payments) ──────────────────────────────────
    for (const pmt of PAYMENTS) {
      const ref = db.collection(`tenants/${tenantId}/supplierPayments`).doc();
      batch.set(ref, {
        supplierName: SUPPLIER.name,
        receiptNo: pmt.receiptNo,
        date: pmt.date,
        amount: pmt.amount,
        paymentMode: 'cash',
        notes: pmt.notes,
        sourceRef: 'UNIMAX_NANDGAON_LEDGER_IMPORT',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batchOps++;
      counts.payments++;
      if (batchOps >= BATCH_LIMIT) await commit();
    }

    // ── 3. Credit notes ───────────────────────────────────────────────────────
    for (const cn of CREDIT_NOTES) {
      const ref = db.collection(`tenants/${tenantId}/supplierPayments`).doc();
      batch.set(ref, {
        supplierName: SUPPLIER.name,
        receiptNo: cn.vchNo,
        date: cn.date,
        amount: cn.amount,
        paymentMode: 'credit_note',
        notes: cn.notes,
        sourceRef: 'UNIMAX_NANDGAON_LEDGER_IMPORT',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batchOps++;
      if (batchOps >= BATCH_LIMIT) await commit();
    }

    // ── 4. Supplier master record ─────────────────────────────────────────────
    const supplierRef = db.doc(`tenants/${tenantId}/suppliers/UNIMAX_AGRI_BIO_TECHNOLOGIES`);
    batch.set(supplierRef, {
      name: SUPPLIER.name,
      address: SUPPLIER.address,
      email: SUPPLIER.email,
      outstandingBalance: CLOSING_BALANCE,
      balanceAsOf: '2026-06-06',
      totalInvoiced: INVOICES.reduce((s, i) => s + i.amount, 0),
      totalPaid: PAYMENTS.reduce((s, p) => s + p.amount, 0),
      sourceRef: 'UNIMAX_NANDGAON_LEDGER_IMPORT',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    batchOps++;

    await commit();

    return {
      ...counts,
      closingBalance: CLOSING_BALANCE,
      supplier: SUPPLIER.name,
      message: `Done. ${counts.purchaseOrders} POs (AP) + ${counts.arOrders} retailer orders (AR) + ${counts.payments} payments. Outstanding payable to UNIMAX: ₹${CLOSING_BALANCE.toLocaleString('en-IN')}.`,
    };
  });
