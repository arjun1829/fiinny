/**
 * Firestore import via REST API + Firebase Auth
 * Uses API key from .env — no Admin SDK needed
 */
const API_KEY = 'AIzaSyAaQ8tB11OBJyqGXEl55oeyQnVrOLrBrxE';
const PROJECT = 'karanarjun-pvt-ltd';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function signIn(email, password) {
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Auth failed: ${data.error?.message}`);
  console.log(`Signed in as: ${data.email}`);
  return data.idToken;
}

// Convert a JS value to Firestore REST format
function toFSValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFSValue) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toFSValue(val)])) } };
  return { stringValue: String(v) };
}

function toFSFields(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, toFSValue(v)])
  );
}

// Generate a random doc ID (22 chars, Firestore style)
function newId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// For master tenant, collections are at root
function colPath(tenantId, collName) {
  return tenantId === 'master' ? collName : `tenants/${tenantId}/${collName}`;
}

function docName(tenantId, collName, docId) {
  return `projects/${PROJECT}/databases/(default)/documents/${colPath(tenantId, collName)}/${docId}`;
}

// Commit a batch of writes
async function commitBatch(writes, idToken) {
  const res = await fetch(`${BASE_URL}:batchWrite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ writes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Batch write failed: ${JSON.stringify(data.error)}`);
  const errors = (data.writeResults || []).filter((_, i) => data.status?.[i]?.code);
  if (errors.length) console.warn(`${errors.length} write errors in batch`);
}

// ── Source data ────────────────────────────────────────────────────────────────

const SOURCE_REF = 'UNIMAX_NANDGAON_LEDGER_IMPORT';
const SUPPLIER_NAME = 'UNIMAX AGRI BIO-TECHNOLOGIES';

const RETAILERS_CSV = [
  { name:'Surve Agro',                     number:'9921929137', location:'Vadgaon, Maval, Pune',             portfolioSize:'Medium', outstandingAmount:3682.5 },
  { name:'Baliraja Krushi Seva Pathardi',  number:'8658032751', location:'Pathardi, Pathardi, Pathardi',     portfolioSize:'Small',  outstandingAmount:0 },
  { name:'Adishakti Krushi Agency Abhona', number:'9822789600', location:'Abhona, Kalwan, Nashik 423502',    portfolioSize:'Medium', outstandingAmount:0 },
  { name:'Monigari Krushi Deepak',         number:'7038842814', location:'Yeola Road, Kopargaon, Ahmednagar',portfolioSize:'Big',    outstandingAmount:0 },
  { name:'Ashwini Navanath Tandale',       number:'8668541281', location:'',                                 portfolioSize:'Small',  outstandingAmount:0 },
  { name:'prathmesh devkar',               number:'9921241439', location:'',                                 portfolioSize:'Small',  outstandingAmount:1900 },
  { name:'Wagheshwari krushi seva kendra', number:'9563454243', location:'Wagh, Wagh, Ahilyanagar',          portfolioSize:'Small',  outstandingAmount:10600 },
  { name:'Sachin Agro clinic',             number:'9359118868', location:'Karmala, Karmala, Karmala',        portfolioSize:'Small',  outstandingAmount:0 },
  { name:'Kisan agro traders',             number:'7038143893', location:'Kokamgaon, Kopargaon, Ahilyanagar',portfolioSize:'Medium', outstandingAmount:19000 },
  { name:'Dongre Patil Agro',             number:'8605760219', location:'Patoda, Yeola, Nashik',             portfolioSize:'Big',    outstandingAmount:129000 },
  { name:'Parhith krushi seva kendra',     number:'9373285852', location:'Chaklamba, Gavrai, Beed',          portfolioSize:'Medium', outstandingAmount:0 },
  { name:'Bhose Ksk Ruichattishi',         number:'8658032751', location:'Rui Chattisi, Nagar',              portfolioSize:'Small',  outstandingAmount:9800 },
];

const INVOICES = [
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
  { vchNo:'UAB/1607/25-26', date:'2026-02-26', amount:18880,  careOff:'PARAHIT KRUSHI SEVA KENDRA, CHAKHALAMBA',     lines:[{d:'POWER PLUSE-3000 ML',q:32,r:590,a:18880}] },
  { vchNo:'UAB/1619/25-26', date:'2026-03-01', amount:80300,  careOff:'DONGARE PATIL AGRO, YEWALA',                  lines:[{d:'POWER PLUSE-3000 ML',q:120,r:590,a:70800},{d:'POWER PLUSE-5000 ML',q:10,r:950,a:9500}] },
  { vchNo:'UAB/1625/25-26', date:'2026-03-03', amount:11800,  careOff:'KISAN AGRO TRADERS, KOKAMTHAN',               lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1627/25-26', date:'2026-03-03', amount:4720,   careOff:'SUYOG KRUSHI SEVA KENDRA, DOITHAN',           lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720}] },
  { vchNo:'UAB/1629/25-26', date:'2026-03-03', amount:8520,   careOff:'SACHIN AGRO CLINIC, KARMALA',                 lines:[{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800},{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720}] },
  { vchNo:'UAB/1630/25-26', date:'2026-03-04', amount:4260,   careOff:'SACHIN AGRO AGENCY, GHOGARGAON',              lines:[{d:'POWER PLUSE-3000 ML',q:4,r:590,a:2360},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1631/25-26', date:'2026-03-04', amount:4260,   careOff:'BHOS KRUSHI SEVA KENDRA, RUICHATTISHI',       lines:[{d:'POWER PLUSE-3000 ML',q:4,r:590,a:2360},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1634/25-26', date:'2026-03-05', amount:4720,   careOff:'SANGRAM KRUSHI SEVA KENDRA, KOREGAON',        lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720}] },
  { vchNo:'UAB/1641/25-26', date:'2026-03-06', amount:4720,   careOff:'WAGHESHWAR KRUSHI SEVA KENDRA, BHATODI',      lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720}] },
  { vchNo:'UAB/1643/25-26', date:'2026-03-06', amount:7080,   careOff:'SACHIN AGRO SERVICES, GHOGARGAON',            lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1649/25-26', date:'2026-03-07', amount:7080,   careOff:'JAY KISAN AGRO SERVICES, BELWANDI',           lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1652/25-26', date:'2026-03-07', amount:8520,   careOff:'SANTKRUPA KSK, GHATPIMPRI ASTI',              lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720},{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800}] },
  { vchNo:'UAB/1653/25-26', date:'2026-03-09', amount:6620,   careOff:'SHAURYA KSK, NEWASA',                         lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1654/25-26', date:'2026-03-09', amount:11340,  careOff:'YOGESH KSK, GANGADHARI',                      lines:[{d:'POWER PLUSE-3000 ML',q:16,r:590,a:9440},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1655/25-26', date:'2026-03-09', amount:10880,  careOff:'RAYHUBA KSK, GHULEWADI',                      lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080},{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800}] },
  { vchNo:'UAB/1656/25-26', date:'2026-03-09', amount:7080,   careOff:'LAXMI AGRO, KUSADGAON',                       lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1657/25-26', date:'2026-03-09', amount:11800,  careOff:'CHATRAPATI AGRO, TAMBAVE',                    lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1658/25-26', date:'2026-03-09', amount:9440,   careOff:'VAISHNAVI AGRO, SHEVGAON',                    lines:[{d:'POWER PLUSE-3000 ML',q:16,r:590,a:9440}] },
  { vchNo:'UAB/1660/25-26', date:'2026-03-09', amount:7080,   careOff:'WAGHESHWAR KSK, BHATODI PHATA',               lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1661/25-26', date:'2026-03-09', amount:6620,   careOff:'PASAYADAN AGRO, SALABATPUR',                  lines:[{d:'POWER PLUSE-3000 ML',q:8,r:590,a:4720},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1662/25-26', date:'2026-03-09', amount:35400,  careOff:'DONGARE PATIL AGRO, PATODA',                  lines:[{d:'POWER PLUSE-3000 ML',q:60,r:590,a:35400}] },
  { vchNo:'UAB/1663/25-26', date:'2026-03-09', amount:11800,  careOff:'DONGARE PATIL KSK, BRAMHGAON',                lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1664/25-26', date:'2026-03-09', amount:11340,  careOff:'SHRI SAIRAM KSK, BHATKUDGAON',               lines:[{d:'POWER PLUSE-3000 ML',q:16,r:590,a:9440},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1666/25-26', date:'2026-03-10', amount:4260,   careOff:'YASHWANT AGRO, ANNAPUR',                      lines:[{d:'POWER PLUSE-3000 ML',q:4,r:590,a:2360},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1677/25-26', date:'2026-03-12', amount:11800,  careOff:'VAISHNAVI AGRO SERVICES, SHEVGAON',           lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1680/25-26', date:'2026-03-12', amount:11800,  careOff:'OM SAI KSK, CHINCHAPUR',                      lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1683/25-26', date:'2026-03-13', amount:27400,  careOff:'DHARTI AGRO SERVICES, CHAUDHANE',             lines:[{d:'POWER PLUSE-3000 ML',q:40,r:590,a:23600},{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800}] },
  { vchNo:'UAB/1685/25-26', date:'2026-03-13', amount:17500,  careOff:'AADISHAKTI KRUSHI SEVA KENDRA, KALWAN',       lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800},{d:'POWER PLUSE-5000 ML',q:6,r:950,a:5700}] },
  { vchNo:'UAB/1691/25-26', date:'2026-03-14', amount:11800,  careOff:'JAY KISAN KSK, PARGAON',                      lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1692/25-26', date:'2026-03-14', amount:13700,  careOff:'NIKHIL AGRO SERVICES, DHAVALGAON',            lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1693/25-26', date:'2026-03-16', amount:11800,  careOff:'JAY MALHAR KSK, WAKADI',                      lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1696/25-26', date:'2026-03-16', amount:22220,  careOff:'DONGARE PATIL AGRO, PATODA TAL-YEWALA',       lines:[{d:'POWER PLUSE-3000 ML',q:28,r:590,a:16520},{d:'POWER PLUSE-5000 ML',q:6,r:950,a:5700}] },
  { vchNo:'UAB/1703/25-26', date:'2026-03-16', amount:47200,  careOff:'KRUSHIDEEPAK KSK, KOPARGAON',                 lines:[{d:'POWER PLUSE-3000 ML',q:80,r:590,a:47200}] },
  { vchNo:'UAB/1704/25-26', date:'2026-03-16', amount:11800,  careOff:'ARYAN KSK, KHADAKI',                          lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1707/25-26', date:'2026-03-17', amount:8980,   careOff:'BHOS KRUSHI SEVA KENDRA, RUICHATISHI',        lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1705/25-26', date:'2026-03-18', amount:8980,   careOff:'KANIFNATH KSK, CHANDA',                       lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1706/25-26', date:'2026-03-18', amount:7080,   careOff:'NEW SHETKARI AGRO, PIMPALWANDI',               lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1708/25-26', date:'2026-03-18', amount:28320,  careOff:'KANSARA KSK, KANASHI',                        lines:[{d:'POWER PLUSE-3000 ML',q:48,r:590,a:28320}] },
  { vchNo:'UAB/1711/25-26', date:'2026-03-19', amount:11800,  careOff:'KRUSHISANJIVANI AGRO, GHARGAON',               lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1714/25-26', date:'2026-03-19', amount:42125,  careOff:'DONGARE PATIL AGRO, PATODA 25%less',           lines:[{d:'POWER PLUSE-3000 ML',q:60,r:590,a:35400},{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800},{d:'UNI K UPTEK-5000 ML',q:2,r:1462.5,a:2925}] },
  { vchNo:'UAB/1715/25-26', date:'2026-03-19', amount:118000, careOff:'KRUSHIDIPAK KSK, KOPARGAON',                   lines:[{d:'POWER PLUSE-3000 ML',q:200,r:590,a:118000}] },
  { vchNo:'UAB/1718/25-26', date:'2026-03-19', amount:23600,  careOff:'YOGESH KSK, GANGADHARI NADGAON',               lines:[{d:'POWER PLUSE-3000 ML',q:40,r:590,a:23600}] },
  { vchNo:'UAB/1721/25-26', date:'2026-03-20', amount:11800,  careOff:'SITARAM MAHARAJ KSK, PIMPRI PENDHAR',          lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1723/25-26', date:'2026-03-23', amount:23600,  careOff:'YOGESH KRUSHI AGENCIES, LASALGAON',            lines:[{d:'POWER PLUSE-3000 ML',q:40,r:590,a:23600}] },
  { vchNo:'UAB/1726/25-26', date:'2026-03-24', amount:7080,   careOff:'WAGHESHWAR KRUSHI SEVA KENDRA, BHOTODI',       lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/1730/25-26', date:'2026-03-27', amount:11800,  careOff:'KISAN AGRO TRADERS, KOKAMTHAN',                lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/1731/25-26', date:'2026-03-27', amount:2900,   careOff:'BHOS AGRO AGENCY, RUICHATTISHI',               lines:[{d:'POWER PLUS-1000 ML',q:10,r:290,a:2900}] },
  { vchNo:'UAB/1732/25-26', date:'2026-03-29', amount:7600,   careOff:'BALIRAJA KRUSHI SEVA KENDRA, PATHARDI',        lines:[{d:'POWER PLUSE-3000 ML',q:8,r:950,a:7600}] },
  { vchNo:'UAB/1733/25-26', date:'2026-03-31', amount:4260,   careOff:'MORYA KRUSHI SEVA KENDRA, BITKEWADI',          lines:[{d:'POWER PLUSE-3000 ML',q:4,r:590,a:2360},{d:'POWER PLUSE-5000 ML',q:2,r:950,a:1900}] },
  { vchNo:'UAB/1734/25-26', date:'2026-03-31', amount:11800,  careOff:'KRUSHISANJIVANI AGRO AGENCY, GHARGAON',        lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800}] },
  { vchNo:'UAB/0040/26-27', date:'2026-04-02', amount:23600,  careOff:'YOGESH KRUSHI SEVA KENDRA, GANGADHARI',        lines:[{d:'POWER PLUSE-3000 ML',q:40,r:590,a:23600}] },
  { vchNo:'UAB/0041/26-27', date:'2026-04-02', amount:7080,   careOff:'NEW SHETKARI AGRO, PIMPALWANDI PAITHAN',        lines:[{d:'POWER PLUSE-3000 ML',q:12,r:590,a:7080}] },
  { vchNo:'UAB/0067/26-27', date:'2026-04-11', amount:21400,  careOff:'DONGARE PATIL AGRO, PATODA TAL-YEWALA',         lines:[{d:'POWER PLUSE-3000 ML',q:20,r:590,a:11800},{d:'POWER PLUS-1000 ML',q:20,r:290,a:5800},{d:'POWER PLUSE-5000 ML',q:4,r:950,a:3800}] },
];

const PAYMENTS = [
  { receiptNo:'WB/0930/25-26', date:'2026-02-25', amount:50000,  notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/0957/25-26', date:'2026-03-01', amount:75000,  notes:'By Hand Kale Saheb' },
  { receiptNo:'WB/0958/25-26', date:'2026-03-01', amount:19000,  notes:'By Hand Kale Saheb — from Dongare Patil Agro' },
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const email = 'arjutanpure@karanarjun.com';
  const password = '1829203';
  const tenantId = 'master';

  console.log('=== Fiinny ERP Data Import (REST API) ===\n');
  const idToken = await signIn(email, password);

  // ── 1. Retailers ────────────────────────────────────────────────────────────
  console.log('\nImporting retailers...');
  const writes = [];
  for (const r of RETAILERS_CSV) {
    const id = newId();
    writes.push({
      update: {
        name: docName(tenantId, 'retailers', id),
        fields: toFSFields({
          name: r.name, number: r.number || '', location: r.location || '',
          portfolioSize: r.portfolioSize, outstandingAmount: r.outstandingAmount || 0,
          email: r.email || '', alternateNumber: '',
        }),
      },
    });
    if (r.outstandingAmount > 0) {
      const oid = newId();
      writes.push({
        update: {
          name: docName(tenantId, 'orders', oid),
          fields: toFSFields({
            retailerId: id, retailerName: r.name,
            productId: 'UDHARI_IMPORT', productName: 'Imported Opening Balance',
            quantity: 1, unit: 'N/A', amount: r.outstandingAmount,
            paymentStatus: 'Unpaid', isDelivered: true,
            notes: 'Imported via script',
          }),
        },
      });
    }
  }
  // Commit in batches of 50
  for (let i = 0; i < writes.length; i += 50) {
    await commitBatch(writes.slice(i, i + 50), idToken);
  }
  console.log(`  ✓ ${RETAILERS_CSV.length} retailers written`);

  // ── 2. UNIMAX Purchase Orders (AP) ─────────────────────────────────────────
  console.log('\nImporting UNIMAX purchase orders + care-off orders...');
  const poWrites = [];
  const retailerCache = new Map();

  for (const inv of INVOICES) {
    const poId = newId();
    poWrites.push({
      update: {
        name: docName(tenantId, 'purchaseOrders', poId),
        fields: toFSFields({
          poNumber: inv.vchNo, poDate: inv.date, expectedDate: inv.date,
          supplierName: SUPPLIER_NAME, supplierContact: '', supplierGstin: '',
          supplierAddress: 'Behind Bhairavnath Mandir, Nagar Baramati Road, Gat No.58/2, Diksal, Karjat 414401',
          lines: inv.lines.map(l => ({ description:l.d, hsnCode:'', quantity:l.q, receivedQty:l.q, rate:l.r, gstPct:0, amount:l.a })),
          totalAmount: inv.amount, taxableValue: inv.amount, cgst: 0, sgst: 0, totalTax: 0,
          notes: inv.careOff ? `Care Off: ${inv.careOff}` : 'Direct stock',
          status: 'received', sourceRef: SOURCE_REF,
        }),
      },
    });

    if (inv.careOff) {
      const shopName = inv.careOff.split(',')[0].trim();
      let retailerId = retailerCache.get(shopName);
      if (!retailerId) {
        retailerId = newId();
        const shopLoc = inv.careOff.includes(',') ? inv.careOff.substring(inv.careOff.indexOf(',')+1).trim() : '';
        poWrites.push({
          update: {
            name: docName(tenantId, 'retailers', retailerId),
            fields: toFSFields({ name: shopName, location: shopLoc, portfolioSize: 'Small', outstandingAmount: 0, sourceRef: SOURCE_REF }),
          },
        });
        retailerCache.set(shopName, retailerId);
      }
      const orderId = newId();
      poWrites.push({
        update: {
          name: docName(tenantId, 'orders', orderId),
          fields: toFSFields({
            retailerId, retailerName: shopName,
            productId: 'UNIMAX_CAREOFF',
            productName: inv.lines.map(l=>`${l.d} ×${l.q}`).join(' + '),
            quantity: 1, unit: 'N/A', amount: inv.amount,
            paymentStatus: 'Unpaid', isDelivered: true,
            sourceInvoice: inv.vchNo, sourceRef: SOURCE_REF,
            notes: `UNIMAX Care-Off | ${inv.vchNo}`,
          }),
        },
      });
    }
  }
  for (let i = 0; i < poWrites.length; i += 50) {
    await commitBatch(poWrites.slice(i, i + 50), idToken);
  }
  console.log(`  ✓ ${INVOICES.length} purchase orders, ${retailerCache.size} new care-off retailers`);

  // ── 3. Payments ─────────────────────────────────────────────────────────────
  console.log('\nImporting payments...');
  const pmtWrites = PAYMENTS.map(p => ({
    update: {
      name: docName(tenantId, 'supplierPayments', newId()),
      fields: toFSFields({ supplierName: SUPPLIER_NAME, receiptNo: p.receiptNo, date: p.date, amount: p.amount, paymentMode: 'cash', notes: p.notes, sourceRef: SOURCE_REF }),
    },
  }));
  // Credit note
  pmtWrites.push({
    update: {
      name: docName(tenantId, 'supplierPayments', newId()),
      fields: toFSFields({ supplierName: SUPPLIER_NAME, receiptNo: 'SRT/0003/26-27', date: '2026-04-13', amount: 4720, paymentMode: 'credit_note', notes: 'Return from New Shetkari KSK, Pimpalwandi', sourceRef: SOURCE_REF }),
    },
  });
  await commitBatch(pmtWrites, idToken);
  console.log(`  ✓ ${PAYMENTS.length + 1} payment records`);

  // ── 4. Supplier master ───────────────────────────────────────────────────────
  const supWrites = [{
    update: {
      name: docName(tenantId, 'suppliers', 'UNIMAX_AGRI_BIO_TECHNOLOGIES'),
      fields: toFSFields({
        name: SUPPLIER_NAME,
        address: 'Behind Bhairavnath Mandir, Nagar Baramati Road, Gat No.58/2, Diksal, Karjat 414401',
        email: 'unimaxagribiotechnologies@gmail.com',
        outstandingBalance: 810993, balanceAsOf: '2026-06-06',
        totalInvoiced: INVOICES.reduce((s,i)=>s+i.amount, 0),
        totalPaid: PAYMENTS.reduce((s,p)=>s+p.amount, 0),
        sourceRef: SOURCE_REF,
      }),
    },
  }];
  await commitBatch(supWrites, idToken);

  console.log('\n✅ ALL DONE!');
  console.log('  Retailers: 12');
  console.log('  Purchase Orders: 64');
  console.log('  Care-off retailer orders: 50');
  console.log('  Payments: 15');
  console.log('  UNIMAX outstanding: ₹8,10,993');
  console.log('\nRefresh your ERP to see all data.');
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
