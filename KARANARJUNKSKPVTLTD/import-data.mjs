/**
 * One-time Firestore import script — runs with Firebase CLI credentials
 * Imports: retailers CSV + UNIMAX Nandgaon ledger
 */
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── Init ──────────────────────────────────────────────────────────────────────
process.env.GOOGLE_APPLICATION_CREDENTIALS =
  'C:\\Users\\91723\\AppData\\Roaming\\firebase\\arjun_tanpure_fiinny.com_application_default_credentials.json';

const app = initializeApp({ credential: applicationDefault(), projectId: 'karanarjun-pvt-ltd' });
const db = getFirestore(app);

// ── Find tenant ID ────────────────────────────────────────────────────────────
async function getTenantId() {
  const snap = await db.collection('users').where('role', '==', 'admin').limit(5).get();
  console.log(`\nFound ${snap.size} admin user(s):`);
  let tenantId = null;
  for (const d of snap.docs) {
    const u = d.data();
    console.log(`  uid=${d.id}  email=${u.email}  tenantId=${u.tenantId}`);
    if (u.tenantId) tenantId = u.tenantId;
  }
  return tenantId;
}

// ── Retailers CSV import ──────────────────────────────────────────────────────
const CSV_ROWS = [
  { name: 'Surve Agro',                       number: '9921929137', location: 'Vadgaon, Maval, Pune',                portfolioSize: 'Medium', outstandingAmount: 3682.5,  email: 'sai.surve@fiinny.com' },
  { name: 'Baliraja Krushi Seva Pathardi',     number: '8658032751', location: 'Pathardi, Pathardi, Pathardi',        portfolioSize: 'Small',  outstandingAmount: 0 },
  { name: 'Adishakti Krushi Agency Abhona',    number: '9822789600', location: 'Abhona, Kalwan, Nashik 423502',       portfolioSize: 'Medium', outstandingAmount: 0 },
  { name: 'Monigari Krushi Deepak',            number: '7038842814', location: 'Yeola Road, Kopargaon, Ahmednagar',   portfolioSize: 'Big',    outstandingAmount: 0 },
  { name: 'Ashwini Navanath Tandale',          number: '8668541281', location: '',                                    portfolioSize: 'Small',  outstandingAmount: 0 },
  { name: 'prathmesh devkar',                  number: '9921241439', location: '',                                    portfolioSize: 'Small',  outstandingAmount: 1900 },
  { name: 'Wagheshwari krushi seva kendra',    number: '9563454243', location: 'Wagh, Wagh, Ahilyanagar',             portfolioSize: 'Small',  outstandingAmount: 10600 },
  { name: 'Sachin Agro clinic',                number: '9359118868', location: 'Karmala, Karmala, Karmala',           portfolioSize: 'Small',  outstandingAmount: 0 },
  { name: 'Kisan agro traders',                number: '7038143893', location: 'Kokamgaon, Kopargaon, Ahilyanagar',  portfolioSize: 'Medium', outstandingAmount: 19000 },
  { name: 'Dongre Patil Agro',                 number: '8605760219', location: 'Patoda, Yeola, Nashik',               portfolioSize: 'Big',    outstandingAmount: 129000 },
  { name: 'Parhith krushi seva kendra',        number: '9373285852', location: 'Chaklamba, Gavrai, Beed',             portfolioSize: 'Medium', outstandingAmount: 0 },
  { name: 'Bhose Ksk Ruichattishi',            number: '8658032751', location: 'Rui Chattisi, Nagar',                 portfolioSize: 'Small',  outstandingAmount: 9800, email: 'arjun.tanpure@fiinny.com' },
  // Skipped: Ramesh Agro Test (test data), Sachin Agro Agency ghogargaon (phone "865" invalid)
];

// For master tenant, collections are at root; otherwise under tenants/{id}
function col(tenantId, name) {
  return tenantId === 'master' ? db.collection(name) : db.collection(`tenants/${tenantId}/${name}`);
}
function docRef(tenantId, name, id) {
  return tenantId === 'master' ? db.doc(`${name}/${id}`) : db.doc(`tenants/${tenantId}/${name}/${id}`);
}

async function importRetailers(tenantId) {
  const existingSnap = await col(tenantId, 'retailers').get();
  const existingNames = new Set(existingSnap.docs.map(d => (d.data().name || '').toLowerCase().trim()));
  console.log(`\nExisting retailers: ${existingSnap.size}`);

  let batch = db.batch();
  let ops = 0;
  let imported = 0, skipped = 0, ordersCreated = 0;
  const ts = FieldValue.serverTimestamp();

  for (const row of CSV_ROWS) {
    const nameKey = row.name.toLowerCase().trim();
    if (existingNames.has(nameKey)) { skipped++; continue; }

    const ref = col(tenantId, 'retailers').doc();
    batch.set(ref, {
      name: row.name,
      number: row.number || '',
      location: row.location || '',
      portfolioSize: row.portfolioSize || 'Small',
      outstandingAmount: row.outstandingAmount || 0,
      email: row.email || '',
      alternateNumber: '',
      createdAt: ts,
    });
    ops++;
    existingNames.add(nameKey);
    imported++;

    if (row.outstandingAmount && row.outstandingAmount > 0) {
      const orderRef = col(tenantId, 'orders').doc();
      batch.set(orderRef, {
        retailerId: ref.id,
        retailerName: row.name,
        productId: 'UDHARI_IMPORT',
        productName: 'Imported Opening Balance',
        quantity: 1, unit: 'N/A',
        amount: row.outstandingAmount,
        paymentStatus: 'Unpaid',
        isDelivered: true,
        createdAt: ts,
        notes: 'Imported via script',
      });
      ops++;
      ordersCreated++;
    }

    if (ops >= 490) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  console.log(`Retailers: ${imported} imported, ${skipped} skipped, ${ordersCreated} outstanding orders created`);
}

// ── UNIMAX Nandgaon Ledger import ─────────────────────────────────────────────
const SOURCE_REF = 'UNIMAX_NANDGAON_LEDGER_IMPORT';
const SUPPLIER_NAME = 'UNIMAX AGRI BIO-TECHNOLOGIES';

const INVOICES = [
  // Direct stock
  { vchNo:'UAB/1501/25-26', date:'2026-02-04', amount:6598,   lines:[{d:'FASTER-50 ML',q:100,r:33.80,a:3380},{d:'FASTER-100 ML',q:50,r:64.35,a:3217.5}] },
  { vchNo:'UAB/1517/25-26', date:'2026-02-08', amount:7313,   lines:[{d:'VERAZIN-250 GM',q:40,r:113.75,a:4550},{d:'VERAZIN-100 GM',q:50,r:55.25,a:2762.5}] },
  { vchNo:'UAB/1560/25-26', date:'2026-02-18', amount:108800, lines:[{d:'POWER PLUSE-5000 ML',q:40,r:950,a:38000},{d:'POWER PLUSE-3000 ML',q:120,r:590,a:70800}] },
  { vchNo:'UAB/1579/25-26', date:'2026-02-20', amount:11057,  lines:[{d:'FASTER-500 ML',q:20,r:280.80,a:5616},{d:'FASTER-1000 ML',q:10,r:544.05,a:5440.5}] },
  { vchNo:'UAB/1571/25-26', date:'2026-02-26', amount:108800, lines:[{d:'POWER PLUSE-3000 ML',q:120,r:590,a:70800},{d:'POWER PLUSE-5000 ML',q:40,r:950,a:38000}] },
  { vchNo:'UAB/1612/25-26', date:'2026-02-28', amount:85200,  lines:[{d:'POWER PLUSE-5000 ML',q:40,r:950,a:38000},{d:'POWER PLUSE-3000 ML',q:80,r:590,a:47200}] },
  { vchNo:'UAB/1620/25-26', date:'2026-03-01', amount:213000, lines:[{d:'POWER PLUSE-3000 ML',q:200,r:590,a:118000},{d:'POWER PLUSE-5000 ML',q:100,r:950,a:95000}] },
  { vchNo:'UAB/1628/25-26', date:'2026-03-03', amount:29600,  lines:[{d:'GRIPPER GR-25KG',q:50,r:500,a:25000},{d:'VERABOR-500 GM',q:20,r:115,a:2300},{d:'VERABOR-1000 GM',q:10,r:230,a:2300}] },
  { vchNo:'UAB/1650/25-26', date:'2026-03-07', amount:118000, lines:[{d:'POWER PLUSE-3000 ML',q:200,r:590,a:118000}] },
  { vchNo:'UAB/1675/25-26', date:'2026-03-10', amount:113400, lines:[{d:'POWER PLUSE-3000 ML',q:160,r:590,a:94400},{d:'POWER PLUSE-5000 ML',q:20,r:950,a:19000}] },
  { vchNo:'UAB/1694/25-26', date:'2026-03-16', amount:118000, lines:[{d:'POWER PLUSE-3000 ML',q:120,r:590,a:70800},{d:'POWER PLUSE-5000 ML',q:40,r:950,a:38000},{d:'VERABOR-500 GM',q:40,r:115,a:4600},{d:'VERABOR-1000 GM',q:20,r:230,a:4600}] },
  { vchNo:'UAB/1729/25-26', date:'2026-03-26', amount:52600,  lines:[{d:'POWER PLUS-1000 ML',q:100,r:290,a:29000},{d:'POWER PLUSE-3000 ML',q:40,r:590,a:23600}] },
  { vchNo:'UAB/0038/26-27', date:'2026-04-01', amount:19000,  lines:[{d:'POWER PLUSE-5000 ML',q:20,r:950,a:19000}] },
  // Care-off (AP + AR)
  { vchNo:'UAB/1607/25-26', date:'2026-02-26', amount:18880,  careOff:'PARAHIT KRUSHI SEVA KENDRA, CHAKHALAMBA',      lines:[{d:'POWER PLUSE-3000 ML',q:32,r:590,a:18880}] },
  { vchNo:'UAB/1619/25-26', date:'2026-03-01', amount:80300,  careOff:'DONGARE PATIL AGRO, YEWALA',                   lines:[{d:'POWER PLUSE-3000 ML',q:120,r:590,a:70800},{d:'POWER PLUSE-5000 ML',q:10,r:950,a:9500}] },
  { vchNo:'UAB/1625/25-26', date:'2026-03-03', amount:11800,  careOff:'KISAN AGRO TRADERS, KOKAMTHAN',                lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1627/25-26', date:'2026-03-03', amount:4720,   careOff:'SUYOG KRUSHI SEVA KENDRA, DOITHAN',            lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720}] },
  { vchNo:'UAB/1629/25-26', date:'2026-03-03', amount:8520,   careOff:'SACHIN AGRO CLINIC, KARMALA',                  lines:[{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800},{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720}] },
  { vchNo:'UAB/1630/25-26', date:'2026-03-04', amount:4260,   careOff:'SACHIN AGRO AGENCY, GHOGARGAON',               lines:[{d:'POWER PLUSE-3000 ML',q:4,r:590,a:2360},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1631/25-26', date:'2026-03-04', amount:4260,   careOff:'BHOS KRUSHI SEVA KENDRA, RUICHATTISHI',        lines:[{d:'POWER PLUSE-3000 ML',q:4,r:590,a:2360},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1634/25-26', date:'2026-03-05', amount:4720,   careOff:'SANGRAM KRUSHI SEVA KENDRA, KOREGAON',         lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720}] },
  { vchNo:'UAB/1641/25-26', date:'2026-03-06', amount:4720,   careOff:'WAGHESHWAR KRUSHI SEVA KENDRA, BHATODI PARGAON', lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720}] },
  { vchNo:'UAB/1643/25-26', date:'2026-03-06', amount:7080,   careOff:'SACHIN AGRO SERVICES, GHOGARGAON',             lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1649/25-26', date:'2026-03-07', amount:7080,   careOff:'JAY KISAN AGRO SERVICES, BELWANDI',            lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1652/25-26', date:'2026-03-07', amount:8520,   careOff:'SANTKRUPA KSK, GHATPIMPRI ASTI',               lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720},{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800}] },
  { vchNo:'UAB/1653/25-26', date:'2026-03-09', amount:6620,   careOff:'SHAURYA KSK, NEWASA',                          lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1654/25-26', date:'2026-03-09', amount:11340,  careOff:'YOGESH KSK, GANGADHARI TAL-NANDGAON',          lines:[{d:'POWER PLUSE-3000 ML',q:16,r:590,a:9440},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1655/25-26', date:'2026-03-09', amount:10880,  careOff:'RAYHUBA KSK, GHULEWADI',                       lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080},{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800}] },
  { vchNo:'UAB/1656/25-26', date:'2026-03-09', amount:7080,   careOff:'LAXMI AGRO, KUSADGAON CHAUFULA',               lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1657/25-26', date:'2026-03-09', amount:11800,  careOff:'CHATRAPATI AGRO, TAMBAVE',                     lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1658/25-26', date:'2026-03-09', amount:9440,   careOff:'VAISHNAVI AGRO, SHEVGAON',                     lines:[{d:'POWER PLUSE-3000 ML',q:16,r:590,a:9440}] },
  { vchNo:'UAB/1660/25-26', date:'2026-03-09', amount:7080,   careOff:'WAGHESHWAR KSK, BHATODI PHATA',                lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1661/25-26', date:'2026-03-09', amount:6620,   careOff:'PASAYADAN AGRO, SALABATPUR TAL-NEWASA',        lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1662/25-26', date:'2026-03-09', amount:35400,  careOff:'DONGARE PATIL AGRO, PATODA',                   lines:[{d:'POWER PLUSE-3000 ML',q:60,r:590,a:35400}] },
  { vchNo:'UAB/1663/25-26', date:'2026-03-09', amount:11800,  careOff:'DONGARE PATIL KSK, SHETKARI BRAMHGAON',        lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1664/25-26', date:'2026-03-09', amount:11340,  careOff:'SHRI SAIRAM KSK, BHATKUDGAON',                lines:[{d:'POWER PLUSE-3000 ML',q:16,r:590,a:9440},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1666/25-26', date:'2026-03-10', amount:4260,   careOff:'YASHWANT AGRO, ANNAPUR',                       lines:[{d:'POWER PLUSE-3000 ML',q:4,r:590,a:2360},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1677/25-26', date:'2026-03-12', amount:11800,  careOff:'VAISHNAVI AGRO SERVICES, SHEVGAON',            lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1680/25-26', date:'2026-03-12', amount:11800,  careOff:'OM SAI KSK, CHINCHAPUR PANGUL',                lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1683/25-26', date:'2026-03-13', amount:27400,  careOff:'DHARTI AGRO SERVICES, CHAUDHANE',              lines:[{d:'POWER PLUSE-3000 ML',q:40,r:590,a:23600},{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800}] },
  { vchNo:'UAB/1685/25-26', date:'2026-03-13', amount:17500,  careOff:'AADISHAKTI KRUSHI SEVA KENDRA, KALWAN',        lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800},{d:'POWER PLUSE-5000 ML',q:6,r:950,a:5700}] },
  { vchNo:'UAB/1691/25-26', date:'2026-03-14', amount:11800,  careOff:'JAY KISAN KRUSHI SEVA KENDRA, PARGAON',        lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1692/25-26', date:'2026-03-14', amount:13700,  careOff:'NIKHIL AGRO SERVICES, DHAVALGAON',             lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1693/25-26', date:'2026-03-16', amount:11800,  careOff:'JAY MALHAR KSK, WAKADI TAL-RAHATA',            lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1696/25-26', date:'2026-03-16', amount:22220,  careOff:'DONGARE PATIL AGRO, PATODA TAL-YEWALA',        lines:[{d:'POWER PLUSE-3000 ML',q:28,r:590,a:16520},{d:'POWER PLUSE-5000 ML',q:6,r:950,a:5700}] },
  { vchNo:'UAB/1703/25-26', date:'2026-03-16', amount:47200,  careOff:'KRUSHIDEEPAK KRUSHI SEVA KENDRA, KOPARGAON',   lines:[{d:'POWER PLUSE-3000 ML',q:80,r:590,a:47200}] },
  { vchNo:'UAB/1704/25-26', date:'2026-03-16', amount:11800,  careOff:'ARYAN KRUSHI SEVA KENDRA, KHADAKI',            lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1707/25-26', date:'2026-03-17', amount:8980,   careOff:'BHOS KRUSHI SEVA KENDRA, RUICHATISHI',         lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1705/25-26', date:'2026-03-18', amount:8980,   careOff:'KANIFNATH KSK, CHANDA TAL-NEWASA',             lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1706/25-26', date:'2026-03-18', amount:7080,   careOff:'NEW SHETKARI AGRO, PIMPALWANDI TAL-PAITHAN',   lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1708/25-26', date:'2026-03-18', amount:28320,  careOff:'KANSARA KSK, KANASHI TAL-KALWAN DIST-NASHIK',  lines:[{d:'POWER PLUSE-3000 ML',q:48,r:590,a:28320}] },
  { vchNo:'UAB/1711/25-26', date:'2026-03-19', amount:11800,  careOff:'KRUSHISANJIVANI AGRO, GHARGAON TAL-SHRIGONDA', lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1714/25-26', date:'2026-03-19', amount:42125,  careOff:'DONGARE PATIL AGRO, PATODA (25% less)',        lines:[{d:'POWER PLUSE-3000 ML',q:60,r:590,a:35400},{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800},{d:'UNI K UPTEK-5000 ML',q:2,r:1462.5,a:2925}] },
  { vchNo:'UAB/1715/25-26', date:'2026-03-19', amount:118000, careOff:'KRUSHIDIPAK KSK, KOPARGAON',                   lines:[{d:'POWER PLUSE-3000 ML',q:200,r:590,a:118000}] },
  { vchNo:'UAB/1718/25-26', date:'2026-03-19', amount:23600,  careOff:'YOGESH KRUSHI SEVA KENDRA, GANGADHARI',        lines:[{d:'POWER PLUSE-3000 ML',q:40,r:590,a:23600}] },
  { vchNo:'UAB/1721/25-26', date:'2026-03-20', amount:11800,  careOff:'SITARAM MAHARAJ KSK, PIMPRI PENDHAR',          lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1723/25-26', date:'2026-03-23', amount:23600,  careOff:'YOGESH KRUSHI AGENCIES, LASALGAON TAL-NIPHAD', lines:[{d:'POWER PLUSE-3000 ML',q:40,r:590,a:23600}] },
  { vchNo:'UAB/1726/25-26', date:'2026-03-24', amount:7080,   careOff:'WAGHESHWAR KRUSHI SEVA KENDRA, BHOTODI PARGAON', lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1730/25-26', date:'2026-03-27', amount:11800,  careOff:'KISAN AGRO TRADERS, KOKAMTHAN KOPARGAON',      lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1731/25-26', date:'2026-03-27', amount:2900,   careOff:'BHOS AGRO AGENCY, RUICHATTISHI',               lines:[{d:'POWER PLUS-1000 ML',q:10,r:290,a:2900}] },
  { vchNo:'UAB/1732/25-26', date:'2026-03-29', amount:7600,   careOff:'BALIRAJA KRUSHI SEVA KENDRA, PATHARDI',        lines:[{d:'POWER PLUSE-3000 ML',q:8,r:950,a:7600}] },
  { vchNo:'UAB/1733/25-26', date:'2026-03-31', amount:4260,   careOff:'MORYA KRUSHI SEVA KENDRA, BITKEWADI',          lines:[{d:'POWER PLUSE-3000 ML',q:4,r:590,a:2360},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1734/25-26', date:'2026-03-31', amount:11800,  careOff:'KRUSHISANJIVANI AGRO AGENCY, GHARGAON',        lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/0040/26-27', date:'2026-04-02', amount:23600,  careOff:'YOGESH KRUSHI SEVA KENDRA, GANGADHARI',        lines:[{d:'POWER PLUSE-3000 ML',q:40,r:590,a:23600}] },
  { vchNo:'UAB/0041/26-27', date:'2026-04-02', amount:7080,   careOff:'NEW SHETKARI AGRO, PIMPALWANDI PAITHAN',       lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/0067/26-27', date:'2026-04-11', amount:21400,  careOff:'DONGARE PATIL AGRO SERVICES, PATODA TAL-YEWALA', lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800},{d:'POWER PLUS-1000 ML',q:20,r:290,a:5800},{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800}] },
];

const PAYMENTS = [
  { receiptNo:'WB/0930/25-26', date:'2026-02-25', amount:50000,  notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/0957/25-26', date:'2026-03-01', amount:75000,  notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/0958/25-26', date:'2026-03-01', amount:19000,  notes:'By Hand Kale Saheb — from Dongare Patil Agro, Yewala' },
  { receiptNo:'WB/0966/25-26', date:'2026-03-02', amount:100000, notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/1007/25-26', date:'2026-03-09', amount:50000,  notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/1035/25-26', date:'2026-03-13', amount:150000, notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/1088/25-26', date:'2026-03-18', amount:100000, notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/1132/25-26', date:'2026-03-23', amount:150000, notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/1154/25-26', date:'2026-03-25', amount:50000,  notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/1222/25-26', date:'2026-03-31', amount:39000,  notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/0007/26-27', date:'2026-04-04', amount:50000,  notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/0022/26-27', date:'2026-04-10', amount:60000,  notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/0067/26-27', date:'2026-05-08', amount:100000, notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/0096/26-27', date:'2026-06-02', amount:50000,  notes:'By Hand Kale Saheb' },
];

async function importUnimax(tenantId) {
  // Idempotency check
  const existing = await col(tenantId,'purchaseOrders').where('sourceRef','==',SOURCE_REF).limit(1).get();
  if (!existing.empty) { console.log('UNIMAX ledger already imported — skipping'); return; }

  const retailerSnap = await col(tenantId,'retailers').get();
  const retailerMap = new Map();
  retailerSnap.docs.forEach(d => {
    const n = (d.data().name||'').toLowerCase().trim().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ');
    if (n) retailerMap.set(n, d.id);
  });
  const newRetailerCache = new Map();

  let batch = db.batch();
  let ops = 0;
  const ts = FieldValue.serverTimestamp();
  const flush = async () => { await batch.commit(); batch = db.batch(); ops = 0; };
  let poCount = 0, arCount = 0, newRetCount = 0;

  for (const inv of INVOICES) {
    const poRef = col(tenantId,'purchaseOrders').doc();
    batch.set(poRef, {
      poNumber: inv.vchNo, poDate: inv.date, expectedDate: inv.date,
      supplierName: SUPPLIER_NAME, supplierContact: '', supplierGstin: '',
      supplierAddress: 'Behind Bhairavnath Mandir, Nagar Baramati Road, Gat No.58/2, Diksal, Karjat 414401',
      lines: inv.lines.map(l => ({ description:l.d, hsnCode:'', quantity:l.q, receivedQty:l.q, rate:l.r, gstPct:0, amount:l.a })),
      totalAmount: inv.amount, taxableValue: inv.amount, cgst:0, sgst:0, totalTax:0,
      notes: inv.careOff ? `Care Off: ${inv.careOff}` : 'Direct stock',
      status: 'received', sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; poCount++;

    if (inv.careOff) {
      const shopName = inv.careOff.split(',')[0].trim();
      const shopLoc  = inv.careOff.includes(',') ? inv.careOff.substring(inv.careOff.indexOf(',')+1).trim() : '';
      const normShop = shopName.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ');
      let retailerId = retailerMap.get(normShop) || newRetailerCache.get(normShop);
      if (!retailerId) {
        const nr = col(tenantId,'retailers').doc();
        batch.set(nr, { name:shopName, location:shopLoc, portfolioSize:'Small', outstandingAmount:0, sourceRef:SOURCE_REF, createdAt:ts });
        ops++; newRetCount++;
        retailerId = nr.id;
        newRetailerCache.set(normShop, retailerId);
      }
      const orderRef = col(tenantId,'orders').doc();
      batch.set(orderRef, {
        retailerId, retailerName: shopName, productId:'UNIMAX_CAREOFF',
        productName: inv.lines.map(l=>`${l.d} ×${l.q}`).join(' + '),
        quantity:1, unit:'N/A', amount: inv.amount,
        paymentStatus:'Unpaid', isDelivered:true,
        sourceInvoice: inv.vchNo, sourceRef: SOURCE_REF,
        notes:`UNIMAX Care-Off | ${inv.vchNo}`, createdAt: ts,
      });
      ops++; arCount++;
    }
    if (ops >= 490) await flush();
  }

  for (const p of PAYMENTS) {
    const pRef = col(tenantId,'supplierPayments').doc();
    batch.set(pRef, { supplierName:SUPPLIER_NAME, receiptNo:p.receiptNo, date:p.date, amount:p.amount, paymentMode:'cash', notes:p.notes, sourceRef:SOURCE_REF, createdAt:ts });
    ops++;
    if (ops >= 490) await flush();
  }

  const cnRef = col(tenantId,'supplierPayments').doc();
  batch.set(cnRef, { supplierName:SUPPLIER_NAME, receiptNo:'SRT/0003/26-27', date:'2026-04-13', amount:4720, paymentMode:'credit_note', notes:'Return from New Shetkari KSK, Pimpalwandi', sourceRef:SOURCE_REF, createdAt:ts });
  ops++;

  const supRef = docRef(tenantId,'suppliers','UNIMAX_AGRI_BIO_TECHNOLOGIES');
  batch.set(supRef, { name:SUPPLIER_NAME, outstandingBalance:810993, balanceAsOf:'2026-06-06', totalInvoiced:INVOICES.reduce((s,i)=>s+i.amount,0), totalPaid:PAYMENTS.reduce((s,p)=>s+p.amount,0), sourceRef:SOURCE_REF, updatedAt:ts }, { merge:true });
  ops++;

  if (ops > 0) await flush();
  console.log(`UNIMAX: ${poCount} purchase orders, ${arCount} AR orders, ${newRetCount} new retailers, 14 payments`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Fiinny ERP Data Import ===');
  const tenantId = await getTenantId();
  if (!tenantId) { console.error('ERROR: No tenantId found. Make sure you are onboarded.'); process.exit(1); }
  console.log(`\nUsing tenantId: ${tenantId}`);

  await importRetailers(tenantId);
  await importUnimax(tenantId);

  console.log('\n✅ All done! Refresh your ERP to see the data.');
  process.exit(0);
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); });
