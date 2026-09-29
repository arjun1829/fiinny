/**
 * Dealer Schema Recovery — AUDIT / EXPORT ONLY (NO WRITES)
 * ────────────────────────────────────────────────────────────────────────────
 * The `dealers` collection was accidentally deleted. This script reconstructs a
 * recovery dataset from the surviving `dealerVisits` collection.
 *
 * It performs ZERO Firestore writes. It only reads `dealerVisits` and writes two
 * local files:
 *   - scripts/out/dealer-recovery.csv          (visitSequence == 1 dataset)
 *   - scripts/out/dealer-recovery-earliest.csv (earliest-visit-per-dealer set)
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=... npx tsx scripts/audit-dealer-recovery.ts [projectId]
 *   (defaults to ADC + project krishidukan-e8315)
 *
 * ── Field mapping (Dealer target schema  ←  dealerVisits source) ──────────────
 *   <docId>   ← dealerId          (the visit's dealerId field == original dealer
 *                                  doc id; the VISIT doc id is NOT the dealer id)
 *   shopName  ← dealerName
 *   createdAt ← createdAt
 *   createdBy ← salesExecutiveId
 *   geo       ← geo (GeoPoint)
 *   ownerName ← (not present in dealerVisits) — BLANK, cannot recover
 *   address   ← (not present) — BLANK
 *   phone     ← (not present) — BLANK
 *   type      ← (not present) — BLANK
 *   active    ← (not stored)  — BLANK (restore-time default, likely true)
 *   updatedAt ← (not applicable) — BLANK (set at restore time)
 */

import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = process.argv[2] || 'krishidukan-e8315';

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

// ── helpers ──────────────────────────────────────────────────────────────────

function isoOf(v: any): string {
  if (!v) return '';
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  if (typeof v?._seconds === 'number') return new Date(v._seconds * 1000).toISOString();
  return String(v);
}

function millisOf(v: any): number {
  if (!v) return Number.POSITIVE_INFINITY;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?._seconds === 'number') return v._seconds * 1000;
  return Number.POSITIVE_INFINITY;
}

function geoStr(g: any): string {
  if (!g) return '';
  const lat = g.latitude ?? g._latitude;
  const lng = g.longitude ?? g._longitude;
  if (lat == null || lng == null) return '';
  return `${lat},${lng}`;
}

function csvCell(s: string): string {
  const v = s ?? '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function pad(s: string, n: number): string {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

// Target Dealer schema column order (+ dealerId as the doc id).
const DEALER_COLS = [
  'dealerId', 'shopName', 'ownerName', 'phone', 'address',
  'geo', 'active', 'type', 'createdBy', 'createdAt', 'updatedAt',
];

type Rec = {
  dealerId: string;
  shopName: string;
  geo: string;
  createdBy: string;
  createdAt: string;
  // provenance
  visitDocId: string;
  visitSequence: number | null;
  visitedAt: string;
};

function toRec(id: string, d: Record<string, any>): Rec {
  return {
    dealerId: String(d.dealerId ?? ''),
    shopName: String(d.dealerName ?? ''),
    geo: geoStr(d.geo),
    createdBy: String(d.salesExecutiveId ?? ''),
    createdAt: isoOf(d.createdAt),
    visitDocId: id,
    visitSequence: typeof d.visitSequence === 'number' ? d.visitSequence : null,
    visitedAt: isoOf(d.visitedAt),
  };
}

function recToRow(r: Rec): string {
  const map: Record<string, string> = {
    dealerId: r.dealerId,
    shopName: r.shopName,
    ownerName: '',
    phone: '',
    address: '',
    geo: r.geo,
    active: '',       // not stored in visits; restore-time default
    type: '',         // not stored in visits
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: '',    // set at restore time
  };
  return DEALER_COLS.map((c) => csvCell(map[c])).join(',');
}

// ── main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\nProject: ${PROJECT_ID}  (READ-ONLY — no Firestore writes)\n`);
  console.log('Fetching dealerVisits collection…');
  const snap = await db.collection('dealerVisits').get();
  console.log(`Total dealerVisits docs: ${snap.size}\n`);

  if (snap.empty) {
    console.log('No dealerVisits documents found. Nothing to reconstruct.');
    process.exit(0);
  }

  // 1. Field-name census across ALL visit docs (verify exact source field names).
  const fieldCount = new Map<string, number>();
  const raw: { id: string; d: Record<string, any> }[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    raw.push({ id: doc.id, d });
    for (const k of Object.keys(d)) fieldCount.set(k, (fieldCount.get(k) ?? 0) + 1);
  }

  // 2. visitSequence == 1 subset (as requested).
  const seq1 = raw
    .filter(({ d }) => d.visitSequence === 1)
    .map(({ id, d }) => toRec(id, d));

  // 3. Group by dealerId across ALL visits → earliest visit per dealer.
  const byDealerAll = new Map<string, Rec[]>();
  for (const { id, d } of raw) {
    const dealerId = String(d.dealerId ?? '');
    const key = dealerId || `(BLANK_DEALERID:${id})`;
    if (!byDealerAll.has(key)) byDealerAll.set(key, []);
    byDealerAll.get(key)!.push(toRec(id, d));
  }
  const earliestPerDealer: Rec[] = [];
  for (const [, recs] of byDealerAll) {
    const sorted = [...recs].sort((a, b) => {
      const ta = millisOf(a.createdAt ? new Date(a.createdAt) : null);
      const tb = millisOf(b.createdAt ? new Date(b.createdAt) : null);
      return ta - tb;
    });
    earliestPerDealer.push(sorted[0]);
  }

  // 4. Duplicate / conflicting visitSequence==1 per dealerId.
  const seq1ByDealer = new Map<string, Rec[]>();
  for (const r of seq1) {
    const key = r.dealerId || `(BLANK_DEALERID:${r.visitDocId})`;
    if (!seq1ByDealer.has(key)) seq1ByDealer.set(key, []);
    seq1ByDealer.get(key)!.push(r);
  }
  const dupDealers = [...seq1ByDealer.entries()].filter(([, rs]) => rs.length > 1);

  // Conflicting = duplicates whose shopName differs.
  const conflicting = dupDealers.filter(([, rs]) => new Set(rs.map((r) => r.shopName.trim())).size > 1);

  // 5. Coverage gap: dealers that have visits but NO visitSequence==1 record.
  const allDealerIds = new Set([...byDealerAll.keys()]);
  const seq1DealerIds = new Set([...seq1ByDealer.keys()]);
  const dealersMissingSeq1 = [...allDealerIds].filter((id) => !seq1DealerIds.has(id));

  // 6. Missing required-field counts (on the seq1 recovery set).
  const missing = { dealerId: 0, shopName: 0, createdBy: 0, createdAt: 0, geo: 0 };
  for (const r of seq1) {
    if (!r.dealerId) missing.dealerId++;
    if (!r.shopName) missing.shopName++;
    if (!r.createdBy) missing.createdBy++;
    if (!r.createdAt) missing.createdAt++;
    if (!r.geo) missing.geo++;
  }
  const missingEarliest = { dealerId: 0, shopName: 0, createdBy: 0, createdAt: 0, geo: 0 };
  for (const r of earliestPerDealer) {
    if (!r.dealerId) missingEarliest.dealerId++;
    if (!r.shopName) missingEarliest.shopName++;
    if (!r.createdBy) missingEarliest.createdBy++;
    if (!r.createdAt) missingEarliest.createdAt++;
    if (!r.geo) missingEarliest.geo++;
  }

  // ── Write CSVs ───────────────────────────────────────────────────────────
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const header = DEALER_COLS.join(',');

  // For the seq1 CSV, if a dealer has multiple seq1 rows keep the earliest.
  const seq1Deduped: Rec[] = [];
  for (const [, rs] of seq1ByDealer) {
    const sorted = [...rs].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    seq1Deduped.push(sorted[0]);
  }

  const csv1 = [header, ...seq1Deduped.map(recToRow)].join('\n');
  const csv2 = [header, ...earliestPerDealer.map(recToRow)].join('\n');
  fs.writeFileSync(path.join(outDir, 'dealer-recovery.csv'), csv1);
  fs.writeFileSync(path.join(outDir, 'dealer-recovery-earliest.csv'), csv2);

  // Provenance CSV (all seq1 rows incl. duplicates) for manual conflict review.
  const provHeader = 'dealerId,shopName,geo,createdBy,createdAt,visitSequence,visitedAt,visitDocId';
  const provRows = seq1
    .sort((a, b) => (a.dealerId + a.createdAt).localeCompare(b.dealerId + b.createdAt))
    .map((r) => [r.dealerId, r.shopName, r.geo, r.createdBy, r.createdAt, r.visitSequence, r.visitedAt, r.visitDocId].map((x) => csvCell(String(x ?? ''))).join(','));
  fs.writeFileSync(path.join(outDir, 'dealer-recovery-provenance.csv'), [provHeader, ...provRows].join('\n'));

  // ── Report ───────────────────────────────────────────────────────────────
  const line = '═'.repeat(70);
  console.log(line);
  console.log('  DEALER RECOVERY AUDIT  —  visitSequence == 1');
  console.log(line);
  console.log(`  1. visitSequence == 1 records found : ${seq1.length}`);
  console.log(`  2. Unique dealerIds (seq==1)        : ${seq1ByDealer.size}`);
  console.log(`     Unique dealerIds (ALL visits)    : ${byDealerAll.size}`);
  console.log(`  3. Dealers w/ >1 seq==1 (duplicate) : ${dupDealers.length}`);
  console.log(`     …of those with NAME conflicts    : ${conflicting.length}`);
  console.log(`  4. Dealers with visits but NO seq==1: ${dealersMissingSeq1.length}  <-- would be LOST if using seq==1 only`);
  console.log('');
  console.log('  5. Missing-field counts (seq==1 deduped set):');
  console.log(`     dealerId blank : ${missing.dealerId}`);
  console.log(`     shopName blank : ${missing.shopName}`);
  console.log(`     createdBy blank: ${missing.createdBy}`);
  console.log(`     createdAt blank: ${missing.createdAt}`);
  console.log(`     geo blank      : ${missing.geo}`);
  console.log('     (ownerName / phone / address / type / active: NOT stored in dealerVisits — blank for ALL rows)');
  console.log('');
  console.log('  Missing-field counts (earliest-per-dealer set):');
  console.log(`     dealerId blank : ${missingEarliest.dealerId}`);
  console.log(`     shopName blank : ${missingEarliest.shopName}`);
  console.log(`     createdBy blank: ${missingEarliest.createdBy}`);
  console.log(`     createdAt blank: ${missingEarliest.createdAt}`);
  console.log(`     geo blank      : ${missingEarliest.geo}`);
  console.log(line);

  console.log('\n  FIELD CENSUS — actual field names present in dealerVisits docs:');
  console.log(`  ${pad('field', 22)} ${pad('present in', 10)} of ${snap.size}`);
  console.log(`  ${'-'.repeat(50)}`);
  for (const [k, n] of [...fieldCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(k, 22)} ${pad(String(n), 10)}`);
  }

  console.log('\n  EXACT FIELD MAPPING  (Dealer  <-  dealerVisits):');
  console.log('    dealerId (docId) <- dealerId        [field, NOT the visit doc id]');
  console.log('    shopName         <- dealerName');
  console.log('    createdAt        <- createdAt');
  console.log('    createdBy        <- salesExecutiveId');
  console.log('    geo              <- geo (GeoPoint)');
  console.log('    ownerName        <- (unavailable)   blank');
  console.log('    phone            <- (unavailable)   blank');
  console.log('    address          <- (unavailable)   blank');
  console.log('    type             <- (unavailable)   blank');
  console.log('    active           <- (unavailable)   blank (restore default -> true)');
  console.log('    updatedAt        <- (unavailable)   blank (set at restore)');

  // Duplicate detail
  if (dupDealers.length) {
    console.log('\n  DUPLICATE / CONFLICTING seq==1 RECORDS:');
    for (const [dealerId, rs] of dupDealers.slice(0, 30)) {
      const names = [...new Set(rs.map((r) => r.shopName))];
      const flag = names.length > 1 ? ' *** NAME CONFLICT ***' : '';
      console.log(`    ${pad(dealerId, 24)} x${rs.length}  names=[${names.join(' | ')}]${flag}`);
    }
    if (dupDealers.length > 30) console.log(`    …and ${dupDealers.length - 30} more`);
  }

  // Preview
  console.log('\n  6. PREVIEW — reconstructed dealers (seq==1 deduped, first 15):');
  console.log(`     ${pad('dealerId', 22)} ${pad('shopName', 26)} ${pad('geo', 20)} ${pad('createdAt', 20)} createdBy`);
  for (const r of seq1Deduped.slice(0, 15)) {
    console.log(`     ${pad(r.dealerId, 22)} ${pad(r.shopName, 26)} ${pad(r.geo || '—', 20)} ${pad(r.createdAt || '—', 20)} ${r.createdBy}`);
  }

  console.log('\n  OUTPUT FILES (local only — NOTHING written to Firestore):');
  console.log(`    ${path.join(outDir, 'dealer-recovery.csv')}            (${seq1Deduped.length} rows, seq==1)`);
  console.log(`    ${path.join(outDir, 'dealer-recovery-earliest.csv')}   (${earliestPerDealer.length} rows, earliest/dealer — RECOMMENDED)`);
  console.log(`    ${path.join(outDir, 'dealer-recovery-provenance.csv')} (${seq1.length} rows, all seq==1 incl. dups)`);
  console.log('\nDone. Audit only — no restoration performed.\n');
  process.exit(0);
})().catch((e) => {
  console.error('\nAUDIT FAILED:', e?.message || e);
  process.exit(1);
});
