/**
 * Product Collection Audit
 * Reads every doc in `products`, groups by normalized name, and reports:
 *   1. Count per group
 *   2. Source values per group
 *   3. Owner IDs per group
 *   4. Groups where count > 1
 *   5. Groups with multiple manufacturer_inventory docs
 *   6. Groups with mixed sources
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: 'krishidukan-e8315.firebaseapp.com',
  projectId: 'krishidukan-e8315',
  storageBucket: 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: '650303885415',
  appId: '1:650303885415:web:7db7619260aa478b2b84c2',
});
const db = getFirestore(app);

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductEntry = {
  id: string;
  name: string;
  normalizedName: string;
  source: string;
  ownerId: string;
  ownerType: string;
  ownerPhone: string;
  manufacturerId: string;
  manufacturerProductId: string;
  originalProductId: string;
  retailerDocId: string;
  isActive: boolean;
  price: number;
  hasImage: boolean;
  createdAt: string;
};

type Group = {
  normalizedName: string;
  count: number;
  activeCount: number;
  inactiveCount: number;
  docs: ProductEntry[];
  sources: string[];
  ownerIds: string[];
  flags: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ts(val: any): string {
  if (!val) return '—';
  if (typeof val.toDate === 'function') return val.toDate().toISOString().slice(0, 10);
  return String(val);
}

function truncate(s: string, n = 24): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('Fetching products collection…\n');
  const snap = await getDocs(collection(db, 'products'));
  console.log(`Total docs in collection: ${snap.size}\n`);

  // Map all docs
  const all: ProductEntry[] = snap.docs.map(d => {
    const r = d.data() as Record<string, any>;
    return {
      id: d.id,
      name: String(r.name ?? ''),
      normalizedName: String(r.name ?? '').toLowerCase().trim(),
      source: String(r.source ?? '(none)'),
      ownerId: String(r.ownerId ?? ''),
      ownerType: String(r.ownerType ?? ''),
      ownerPhone: String(r.ownerPhone ?? r.retailerPhone ?? r.manufacturerPhone ?? ''),
      manufacturerId: String(r.manufacturerId ?? ''),
      manufacturerProductId: String(r.manufacturerProductId ?? ''),
      originalProductId: String(r.originalProductId ?? ''),
      retailerDocId: String(r.retailerDocId ?? ''),
      isActive: r.isActive !== false,
      price: Number(r.price ?? 0),
      hasImage: !!(r.image || (Array.isArray(r.images) && r.images.length)),
      createdAt: ts(r.createdAt),
    };
  });

  // Group by normalizedName
  const groupMap = new Map<string, ProductEntry[]>();
  for (const p of all) {
    const key = p.normalizedName || `(blank-name:${p.id})`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(p);
  }

  // Build group objects
  const groups: Group[] = Array.from(groupMap.entries()).map(([key, docs]) => {
    const sources = [...new Set(docs.map(d => d.source))];
    const ownerIds = [...new Set(docs.map(d => d.ownerId).filter(Boolean))];
    const activeCount = docs.filter(d => d.isActive).length;
    const inactiveCount = docs.length - activeCount;

    const mfgInventoryDocs = docs.filter(d => d.source === 'manufacturer_inventory');
    const flags: string[] = [];

    if (docs.length > 1) flags.push('DUPLICATE_GROUP');
    if (mfgInventoryDocs.length > 1) flags.push('MULTIPLE_MFG_INVENTORY');
    if (sources.length > 1) flags.push('MIXED_SOURCES');
    const nonCopySources = new Set(['manufacturer_inventory', 'retailer_inventory', 'admin']);
    const canonicalCandidates = docs.filter(d => nonCopySources.has(d.source) || !d.source);
    if (canonicalCandidates.length > 1) flags.push('MULTIPLE_CANONICAL_CANDIDATES');
    if (docs.some(d => !d.hasImage) && docs.some(d => d.hasImage)) flags.push('SOME_MISSING_IMAGE');
    if (docs.every(d => !d.hasImage)) flags.push('ALL_MISSING_IMAGE');

    return { normalizedName: key, count: docs.length, activeCount, inactiveCount, docs, sources, ownerIds, flags };
  });

  // Sort: flagged groups first, then by count desc, then name asc
  groups.sort((a, b) => {
    const af = a.flags.length > 0 ? 1 : 0;
    const bf = b.flags.length > 0 ? 1 : 0;
    if (bf !== af) return bf - af;
    if (b.count !== a.count) return b.count - a.count;
    return a.normalizedName.localeCompare(b.normalizedName);
  });

  // ── Summary counts ────────────────────────────────────────────────────────

  const total = all.length;
  const activeTotal = all.filter(d => d.isActive).length;
  const uniqueNames = groups.length;
  const duplicateGroups = groups.filter(g => g.count > 1);
  const multipleMfg = groups.filter(g => g.flags.includes('MULTIPLE_MFG_INVENTORY'));
  const mixedGroups = groups.filter(g => g.flags.includes('MIXED_SOURCES'));
  const multiCanonical = groups.filter(g => g.flags.includes('MULTIPLE_CANONICAL_CANDIDATES'));

  const sourceCount = new Map<string, number>();
  for (const p of all) sourceCount.set(p.source, (sourceCount.get(p.source) ?? 0) + 1);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PRODUCT COLLECTION AUDIT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total product docs        : ${total}`);
  console.log(`  Active docs               : ${activeTotal}`);
  console.log(`  Inactive docs             : ${total - activeTotal}`);
  console.log(`  Unique normalized names   : ${uniqueNames}`);
  console.log(`  Groups with count > 1     : ${duplicateGroups.length}`);
  console.log(`  Multi-mfg_inventory groups: ${multipleMfg.length}`);
  console.log(`  Mixed-source groups       : ${mixedGroups.length}`);
  console.log(`  Multi-canonical groups    : ${multiCanonical.length}`);
  console.log('');
  console.log('  Docs by source:');
  [...sourceCount.entries()].sort((a,b) => b[1]-a[1]).forEach(([src, n]) => {
    console.log(`    ${pad(src, 30)} ${n}`);
  });
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── Section A: Flagged groups (all flags) ─────────────────────────────────

  const flagged = groups.filter(g => g.flags.length > 0);

  console.log(`\n${'─'.repeat(63)}`);
  console.log(`  SECTION A — FLAGGED GROUPS  (${flagged.length} groups)`);
  console.log(`${'─'.repeat(63)}\n`);

  for (const g of flagged) {
    console.log(`  ▸ "${g.normalizedName}"`);
    console.log(`    Count: ${g.count}  (active: ${g.activeCount}, inactive: ${g.inactiveCount})`);
    console.log(`    Flags: ${g.flags.join(', ')}`);
    console.log(`    Sources: ${g.sources.join(', ')}`);
    console.log(`    OwnerIds: ${g.ownerIds.slice(0, 4).join(', ')}${g.ownerIds.length > 4 ? ` +${g.ownerIds.length-4} more` : ''}`);
    console.log('');
    for (const d of g.docs) {
      const active = d.isActive ? 'ACTIVE  ' : 'INACTIVE';
      const img = d.hasImage ? '📷' : '  ';
      const linked = d.manufacturerProductId
        ? `mfgProd:${truncate(d.manufacturerProductId, 16)}`
        : d.originalProductId
          ? `origProd:${truncate(d.originalProductId, 15)}`
          : '';
      console.log(`      [${active}] ${img} id:${truncate(d.id, 20)}  src:${pad(d.source, 26)}  owner:${truncate(d.ownerId || '—', 24)}  ₹${d.price}  ${linked}`);
    }
    console.log('');
  }

  // ── Section B: Clean groups (no flags, count == 1) ───────────────────────

  const cleanSingles = groups.filter(g => g.flags.length === 0 && g.count === 1);

  console.log(`\n${'─'.repeat(63)}`);
  console.log(`  SECTION B — CLEAN SINGLE-DOC GROUPS  (${cleanSingles.length} groups)`);
  console.log(`${'─'.repeat(63)}`);
  console.log('  (listing name · source · ownerId · active)\n');

  for (const g of cleanSingles) {
    const d = g.docs[0];
    const active = d.isActive ? '✓' : '✗';
    console.log(`  ${active} "${truncate(g.normalizedName, 32)}"  src:${d.source}  owner:${truncate(d.ownerId || '—', 20)}`);
  }

  // ── Section C: All groups table (machine-readable summary) ───────────────

  console.log(`\n\n${'─'.repeat(63)}`);
  console.log(`  SECTION C — FULL GROUP TABLE`);
  console.log(`${'─'.repeat(63)}`);
  console.log(`  ${'NAME'.padEnd(35)} ${'CNT'.padEnd(5)} ${'ACT'.padEnd(5)} ${'SOURCES'.padEnd(40)} FLAGS`);
  console.log(`  ${'─'.repeat(100)}`);

  for (const g of groups) {
    const name = pad(truncate(g.normalizedName, 33), 35);
    const cnt = pad(String(g.count), 5);
    const act = pad(String(g.activeCount), 5);
    const src = pad(g.sources.join('|'), 40);
    const flags = g.flags.join(',') || '—';
    console.log(`  ${name} ${cnt} ${act} ${src} ${flags}`);
  }

  console.log('\nDone.\n');
  process.exit(0);
})();
