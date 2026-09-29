/**
 * Dealer Recovery — restore `dealers` from the enriched recovery CSV.
 * ────────────────────────────────────────────────────────────────────────────
 * Reads scripts/out/dealer-recovery-earliest.csv and creates one document per row
 * in the `dealers` collection, using dealerId as the document ID.
 *
 * SAFETY
 *   · DRY-RUN BY DEFAULT. Nothing is written unless you pass --commit.
 *   · Idempotent: a row whose dealerId already exists in Firestore is SKIPPED
 *     (never overwritten). Uses doc.create() so an existing id can never be
 *     clobbered even under a race.
 *   · Only touches ids present in the CSV — unrelated dealers are never modified.
 *   · Values are taken verbatim from the CSV (no invented data). Timestamps are
 *     parsed back to Firestore Timestamps and geo to a GeoPoint.
 *
 * Field mapping (CSV → dealers doc):
 *   dealerId  → document id
 *   shopName, ownerName, phone, address, type, createdBy → same-name string field
 *   geo       → GeoPoint(lat,lng) parsed from "lat,lng"
 *   active    → boolean (must be true in the recovery data)
 *   createdAt → Timestamp (from ISO)
 *   updatedAt → Timestamp (from ISO if present, else falls back to createdAt)
 *
 * Usage:
 *   npx tsx scripts/restore-dealers.ts                 # dry-run (default)
 *   npx tsx scripts/restore-dealers.ts --commit        # actually write
 *   npx tsx scripts/restore-dealers.ts --commit uat    # target project override
 */

import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const PROJECT_ID = args.find((a) => !a.startsWith('--')) || 'krishidukan-e8315';
const CSV = path.join(__dirname, 'out', 'dealer-recovery-earliest.csv');

// ── firebase-admin (reuse project ADC / env credentials) ─────────────────────
if (getApps().length === 0) {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) {
    initializeApp({ credential: cert({ projectId: PROJECT_ID, clientEmail, privateKey }) });
  } else {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
}
const db = getFirestore();

// ── tiny CSV parser (quoted fields with commas) ──────────────────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch === '\r') { /* skip */ }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function parseGeo(s: string): GeoPoint | null {
  if (!s || !s.trim()) return null;
  const [lat, lng] = s.split(',').map((x) => Number(x.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return new GeoPoint(lat, lng);
}

function parseTs(s: string): Timestamp | null {
  if (!s || !s.trim()) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

// ── load + validate ──────────────────────────────────────────────────────────
type Prepared = {
  id: string;
  data: {
    shopName: string; ownerName: string; phone: string; address: string;
    type: string; geo: GeoPoint | null; active: boolean;
    createdBy: string; createdAt: Timestamp; updatedAt: Timestamp;
  };
};

const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h, i])) as Record<string, number>;
const get = (r: string[], name: string) => (r[idx[name]] ?? '').trim();

const valid: Prepared[] = [];
const invalid: { row: number; id: string; shopName: string; errors: string[] }[] = [];
const seenIds = new Set<string>();

rows.slice(1).forEach((r, i) => {
  const rowNo = i + 2; // 1-based incl. header
  const id = get(r, 'dealerId');
  const shopName = get(r, 'shopName');
  const createdBy = get(r, 'createdBy');
  const createdAt = parseTs(get(r, 'createdAt'));
  const geo = parseGeo(get(r, 'geo'));
  const activeRaw = get(r, 'active').toLowerCase();
  const updatedAt = parseTs(get(r, 'updatedAt')) ?? createdAt; // fallback, not invented

  const errors: string[] = [];
  if (!id) errors.push('missing dealerId');
  if (seenIds.has(id)) errors.push('duplicate dealerId in CSV');
  if (!shopName) errors.push('missing shopName');
  if (!createdBy) errors.push('missing createdBy');
  if (!createdAt) errors.push('missing/invalid createdAt');
  if (get(r, 'geo') && !geo) errors.push('invalid geo');
  if (activeRaw !== 'true') errors.push(`active must be true (got "${get(r, 'active')}")`);

  if (id) seenIds.add(id);

  if (errors.length) { invalid.push({ row: rowNo, id, shopName, errors }); return; }

  valid.push({
    id,
    data: {
      shopName, ownerName: get(r, 'ownerName'), phone: get(r, 'phone'),
      address: get(r, 'address'), type: get(r, 'type'), geo,
      active: true, createdBy, createdAt: createdAt!, updatedAt: updatedAt!,
    },
  });
});

// ── check existing docs (idempotency preview) ────────────────────────────────
(async () => {
  const line = '═'.repeat(70);
  console.log(`\n${line}`);
  console.log(`  DEALER RESTORE — ${COMMIT ? 'COMMIT (writes enabled)' : 'DRY-RUN (no writes)'}`);
  console.log(`  Project: ${PROJECT_ID}`);
  console.log(`  Source : ${CSV}`);
  console.log(line);

  const existingIds = new Set<string>();
  await Promise.all(valid.map(async (v) => {
    const snap = await db.collection('dealers').doc(v.id).get();
    if (snap.exists) existingIds.add(v.id);
  }));

  const toCreate = valid.filter((v) => !existingIds.has(v.id));
  const toSkip = valid.filter((v) => existingIds.has(v.id));

  console.log(`  Total CSV rows        : ${rows.length - 1}`);
  console.log(`  Valid records         : ${valid.length}`);
  console.log(`  Invalid records       : ${invalid.length}`);
  console.log(`  Already in Firestore  : ${existingIds.size}  (will be SKIPPED, never overwritten)`);
  console.log(`  Will be CREATED       : ${toCreate.length}`);
  console.log(line);

  if (invalid.length) {
    console.log('\n  INVALID RECORDS (not written):');
    for (const x of invalid) console.log(`    row ${x.row}  ${x.id || '(no id)'}  "${x.shopName}"  →  ${x.errors.join('; ')}`);
  }

  if (existingIds.size) {
    console.log('\n  EXISTING dealer ids that would be affected (skipped):');
    for (const v of toSkip) console.log(`    · ${v.id}  "${v.data.shopName}"`);
  }

  console.log(`\n  RECORDS TO CREATE (${toCreate.length}):`);
  for (const v of toCreate) {
    const g = v.data.geo ? `${v.data.geo.latitude},${v.data.geo.longitude}` : '—';
    console.log(`    + ${v.id}  "${v.data.shopName}"  owner="${v.data.ownerName || '—'}"  phone="${v.data.phone || '—'}"  type="${v.data.type || '—'}"  geo=${g}  createdAt=${v.data.createdAt.toDate().toISOString()}`);
  }

  if (!COMMIT) {
    console.log(`\n  DRY-RUN complete. No documents written.`);
    console.log(`  Re-run with --commit to create the ${toCreate.length} record(s) above.\n`);
    process.exit(invalid.length ? 1 : 0);
  }

  if (invalid.length) {
    console.log(`\n  ABORTING COMMIT: ${invalid.length} invalid record(s) present. Fix the CSV and retry.\n`);
    process.exit(1);
  }

  // ── write (create-only, idempotent) ───────────────────────────────────────
  console.log(`\n  Writing ${toCreate.length} dealer document(s)…`);
  let created = 0, skipped = 0;
  for (const v of toCreate) {
    try {
      await db.collection('dealers').doc(v.id).create(v.data); // fails if exists
      created++;
      console.log(`    ✓ created ${v.id}  "${v.data.shopName}"`);
    } catch (e: any) {
      if (e?.code === 6 /* ALREADY_EXISTS */) { skipped++; console.log(`    ⚠ skipped (exists) ${v.id}`); }
      else throw e;
    }
  }
  console.log(`\n  DONE. Created: ${created}, skipped(existing): ${skipped + toSkip.length}, invalid: ${invalid.length}.\n`);
  process.exit(0);
})().catch((e) => {
  console.error('\nRESTORE FAILED:', e?.message || e);
  process.exit(1);
});
