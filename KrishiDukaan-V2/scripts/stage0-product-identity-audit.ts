/**
 * Stage 0 — Product Identity Conflict Diagnostic  (STRICTLY READ-ONLY)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Part of the KrishiDukan product-architecture migration (Canonical Product ↔
 * Retailer Listing). This stage writes NOTHING. It only reports the identity
 * conflicts that exist TODAY, before any schema or application change, so the
 * backlog can be sized and the ambiguous groups routed to manual review.
 *
 * Root cause (see the audit): the catalogue has no stable product identity — the
 * ONLY grouping key is the lower-cased, trimmed product `name`. Two independently
 * created products that share a name are collapsed into one marketplace card; one
 * keeps its identity, the other survives only as a price/stock row. This script
 * finds every such collision and classifies it.
 *
 * What it does:
 *   1. Reads every `products` doc, grouped by normalized name key.
 *   2. Within each group, separates CANONICAL CANDIDATES (manufacturer_inventory,
 *      retailer_inventory, retailer, admin, …) from COPIES/ASSIGNMENTS
 *      (retailer_inventory_copy, manufacturer_assigned, admin_assigned).
 *   3. Classifies every multi-canonical "conflict" group as one of:
 *        LIKELY_IDENTICAL              — same brand/mfr, composition, category → one future catalogId
 *        DIFFERENT_BRAND_OR_FORMULATION— distinct brand/mfr/composition      → MUST split, never merge
 *        MANUFACTURER_VS_RETAILER      — mfr canonical + retailer canonical   → shared catalogId, mfr authoritative
 *        AMBIGUOUS                     — not enough identity data             → manual review only
 *   4. Captures full identity per doc: source, owner/seller ids, manufacturer,
 *      composition, category, variants, image, and copy/assignment links.
 *   5. Counts downstream references per group: marketplaceCards / cardMembers,
 *      availability[] entries, inventory rows, live carts, historical orders.
 *   6. RECOMMENDS which docs could share a future catalogId (and which must be
 *      split) — WITHOUT assigning any id or merging any record.
 *   7. Emits a machine-readable JSON + a flat CSV, plus a console summary.
 *
 * Read-only guarantee:
 *   • All Firestore access is funnelled through getAllDocs()/runQuery() which
 *     call ONLY `.get()`. No write method, no server field-value sentinel, and
 *     no batched/transactional write is imported or used anywhere.
 *   • assertReadOnlySource() scans this file at startup for Firestore write
 *     entry points and ABORTS before touching Firestore if any are present.
 *   • Output files are written to the local scripts/out/ directory (filesystem,
 *     not Firestore).
 *
 * Requires admin credentials for krishidukan-e8315 (orders/carts/inventory are
 * rules-gated), via applicationDefault() or FIREBASE_CLIENT_EMAIL/PRIVATE_KEY.
 *
 * Usage:  npx tsx scripts/stage0-product-identity-audit.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore, type Query } from 'firebase-admin/firestore';

// ── Read-only self-verification ─────────────────────────────────────────────
// Firestore write entry points, assembled from fragments so the tokens do NOT
// appear verbatim in this file's own read code (and so this allow-list cannot
// match itself). If any real call is ever added, the scan trips and the script
// refuses to run. Map.set()/.push() are deliberately NOT in this list — they are
// in-memory and harmless.
const FORBIDDEN = [
  '.cre' + 'ate(',
  '.upd' + 'ate(',
  '.del' + 'ete(',
  '.com' + 'mit(',
  'runTran' + 'saction',
  'bulkWri' + 'ter(',
  'FieldVa' + 'lue',
  'WriteBa' + 'tch',
  '.batch(',
];

function assertReadOnlySource(): void {
  const src = readFileSync(__filename, 'utf8');
  const body = src
    // Ignore this very array (the only place the fragments are concatenated).
    .replace(/const FORBIDDEN =[\s\S]*?\];/, '')
    // Ignore crypto hash chains — hashing the name key is NOT a Firestore write.
    .replace(/createHash\([^)]*\)\.update\([^)]*\)/g, '');
  const hits = FORBIDDEN.filter((tok) => body.includes(tok));
  // `.set(` is checked separately: allowed only as Map/Set .set, never on a
  // Firestore ref. We forbid the Firestore-shaped forms doc(...).set / ref.set.
  if (/\bdoc\([^)]*\)\.set\(/.test(body) || /\bRef\.set\(/.test(body)) hits.push('ref.set(');
  if (hits.length) {
    console.error('✗ READ-ONLY CHECK FAILED — write call(s) present:', hits.join(', '));
    console.error('  Refusing to run. This diagnostic must perform no writes.');
    process.exit(2);
  }
  console.log('✓ Read-only self-check passed (no Firestore write calls in source).');
}

// ── Admin bootstrap (same convention as scripts/fix-*.ts) ────────────────────
function initAdmin(): void {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  else initializeApp({ credential: applicationDefault(), projectId });
}

// ── Centralized READ-ONLY Firestore access (the only DB touch-points) ────────
let DB: Firestore;
async function getAllDocs(collection: string): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const snap = await DB.collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> }));
}
async function runQuery(q: Query): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> }));
}

// ── Constants ────────────────────────────────────────────────────────────────
const COPY_SOURCES = new Set(['retailer_inventory_copy', 'manufacturer_assigned', 'admin_assigned']);
const OUT_DIR = join(__dirname, 'out');

type Classification =
  | 'LIKELY_IDENTICAL'
  | 'DIFFERENT_BRAND_OR_FORMULATION'
  | 'MANUFACTURER_VS_RETAILER'
  | 'AMBIGUOUS';

// ── Helpers ──────────────────────────────────────────────────────────────────
function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().trim();
}
function phoneTail(s: unknown): string {
  const d = String(s ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
function nameKeyOf(name: unknown): string {
  return String(name ?? '').toLowerCase().trim();
}
/** Mirrors functions/src/marketplace/cards.ts cardIdFor(). */
function cardIdFor(nameKey: string): string {
  return createHash('sha1').update(nameKey).digest('hex');
}
function tsIso(v: any): string {
  if (!v) return '';
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  return String(v);
}
function tsMillis(v: any): number {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  const p = Date.parse(String(v ?? ''));
  return Number.isFinite(p) ? p : 0;
}
function compositionSig(comp: unknown): string {
  if (!Array.isArray(comp)) return '';
  return comp
    .map((c: any) => `${norm(c?.name)}:${norm(c?.value)}`)
    .filter((s) => s !== ':')
    .sort()
    .join('|');
}
function variantSig(variants: unknown): string {
  if (!Array.isArray(variants)) return '';
  return (variants as any[])
    .map((v) => norm(v?.unit))
    .filter(Boolean)
    .sort()
    .join(',');
}
function chunk<T>(arr: T[], n: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
}

// ── Per-doc identity record ───────────────────────────────────────────────────
type Doc = {
  id: string;
  name: string;
  nameKey: string;
  source: string;
  isCanonicalCandidate: boolean;
  isActive: boolean;
  ownerId: string;
  ownerPhone: string;
  ownerType: string;
  manufacturerId: string;
  manufacturerPhone: string;
  retailerId: string;
  retailerPhone: string;
  retailerDocId: string;
  manufacturerProductId: string;
  originalProductId: string;
  brand: string;
  category: string;
  compositionSig: string;
  compositionCount: number;
  variantSig: string;
  variants: Array<{ unit: string; price: number }>;
  image: string;
  hasImage: boolean;
  price: number;
  availabilityCount: number;
  availabilityStores: string[];
  createdAt: string;
  createdMs: number;
};

function toDoc(id: string, r: Record<string, any>): Doc {
  const source = String(r.source ?? '');
  const availability = Array.isArray(r.availability) ? r.availability : [];
  const variants = Array.isArray(r.variants)
    ? (r.variants as any[]).map((v) => ({ unit: String(v?.unit ?? ''), price: Number(v?.price ?? 0) }))
    : [];
  return {
    id,
    name: String(r.name ?? ''),
    nameKey: nameKeyOf(r.name),
    source: source || '(none)',
    isCanonicalCandidate: !COPY_SOURCES.has(source),
    isActive: r.isActive !== false,
    ownerId: String(r.ownerId ?? ''),
    ownerPhone: String(r.ownerPhone ?? ''),
    ownerType: String(r.ownerType ?? ''),
    manufacturerId: String(r.manufacturerId ?? ''),
    manufacturerPhone: String(r.manufacturerPhone ?? ''),
    retailerId: String(r.retailerId ?? ''),
    retailerPhone: String(r.retailerPhone ?? ''),
    retailerDocId: String(r.retailerDocId ?? ''),
    manufacturerProductId: String(r.manufacturerProductId ?? ''),
    originalProductId: String(r.originalProductId ?? ''),
    brand: String(r.brand ?? r.brandName ?? r.manufacturerName ?? ''),
    category: String(r.category ?? ''),
    compositionSig: compositionSig(r.composition),
    compositionCount: Array.isArray(r.composition) ? r.composition.length : 0,
    variantSig: variantSig(r.variants),
    variants,
    image: String(r.image ?? ''),
    hasImage: !!(r.image || (Array.isArray(r.images) && r.images.length)),
    price: Number(r.price ?? 0),
    availabilityCount: availability.length,
    availabilityStores: availability
      .map((a: any) => String(a?.storePhone || a?.storeId || ''))
      .filter(Boolean),
    createdAt: tsIso(r.createdAt),
    createdMs: tsMillis(r.createdAt),
  };
}

// ── Classification ─────────────────────────────────────────────────────────────
/** Normalized manufacturer identity of a canonical doc (phone-tail preferred). */
function mfrKey(d: Doc): string {
  return phoneTail(d.manufacturerPhone) || norm(d.manufacturerId) || phoneTail(d.manufacturerId) || '';
}
function isManufacturerDoc(d: Doc): boolean {
  return d.source === 'manufacturer_inventory' || d.ownerType === 'manufacturer' || !!mfrKey(d);
}
function isRetailerDoc(d: Doc): boolean {
  return (
    d.source === 'retailer_inventory' ||
    d.source === 'retailer' ||
    d.ownerType === 'retailer' ||
    !!d.retailerId ||
    !!phoneTail(d.retailerPhone)
  );
}

type GroupClassification = {
  classification: Classification;
  signals: string[];
  distinctBrands: string[];
  distinctManufacturers: string[];
  distinctCompositions: string[];
  distinctCategories: string[];
  distinctImages: string[];
};

function classifyGroup(canon: Doc[]): GroupClassification {
  const signals: string[] = [];
  const nonEmpty = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));

  const brands = nonEmpty(canon.map((d) => norm(d.brand)));
  const mfrs = nonEmpty(canon.map(mfrKey));
  const comps = nonEmpty(canon.map((d) => d.compositionSig));
  const cats = nonEmpty(canon.map((d) => norm(d.category)));
  const images = nonEmpty(canon.map((d) => d.image));

  const hasMfr = canon.some(isManufacturerDoc);
  const hasRetailer = canon.some(isRetailerDoc);

  // A: distinct identity among candidates → genuinely different products.
  if (brands.length > 1) signals.push('MULTIPLE_BRANDS');
  if (mfrs.length > 1) signals.push('MULTIPLE_MANUFACTURERS');
  if (comps.length > 1) signals.push('MULTIPLE_COMPOSITIONS');
  if (cats.length > 1) signals.push('MULTIPLE_CATEGORIES');

  // B: ownership-type conflict.
  if (hasMfr && hasRetailer) signals.push('MANUFACTURER_AND_RETAILER_PRESENT');

  // C: positive identity agreement (non-empty + all equal).
  if (brands.length === 1 && canon.every((d) => norm(d.brand))) signals.push('SAME_BRAND');
  if (mfrs.length === 1 && canon.every((d) => mfrKey(d))) signals.push('SAME_MANUFACTURER');
  if (comps.length === 1 && canon.every((d) => d.compositionSig)) signals.push('SAME_COMPOSITION');
  if (images.length === 1 && canon.every((d) => d.image)) signals.push('SAME_IMAGE');

  const hasAnyIdentityData = brands.length + mfrs.length + comps.length + images.length > 0;
  const distinguished = signals.some((s) =>
    ['MULTIPLE_BRANDS', 'MULTIPLE_MANUFACTURERS', 'MULTIPLE_COMPOSITIONS'].includes(s),
  );
  const agrees = signals.some((s) => ['SAME_BRAND', 'SAME_MANUFACTURER', 'SAME_COMPOSITION', 'SAME_IMAGE'].includes(s));

  let classification: Classification;
  if (distinguished) classification = 'DIFFERENT_BRAND_OR_FORMULATION';
  else if (hasMfr && hasRetailer) classification = 'MANUFACTURER_VS_RETAILER';
  else if (agrees) classification = 'LIKELY_IDENTICAL';
  else if (!hasAnyIdentityData) classification = 'AMBIGUOUS';
  else classification = 'LIKELY_IDENTICAL';

  return {
    classification,
    signals,
    distinctBrands: brands,
    distinctManufacturers: mfrs,
    distinctCompositions: comps,
    distinctCategories: cats,
    distinctImages: images,
  };
}

/**
 * Recommend a future catalogId grouping — WITHOUT assigning anything. For a
 * LIKELY_IDENTICAL / MANUFACTURER_VS_RETAILER group this proposes one shared
 * catalog and which doc should be authoritative (manufacturer, else oldest
 * active with an image). For DIFFERENT_* it proposes a SPLIT into clusters by
 * identity signature. AMBIGUOUS gets no proposal.
 */
function recommend(canon: Doc[], copies: Doc[], gc: GroupClassification) {
  const authoritativeOf = (docs: Doc[]): string => {
    const mfr = docs.filter((d) => d.source === 'manufacturer_inventory' && d.isActive);
    const pool = (mfr.length ? mfr : docs.filter((d) => d.isActive && d.hasImage)).slice();
    if (!pool.length) pool.push(...docs);
    pool.sort((a, b) => a.createdMs - b.createdMs);
    return pool[0]?.id ?? '';
  };

  if (gc.classification === 'DIFFERENT_BRAND_OR_FORMULATION') {
    // Cluster candidates by identity signature; each cluster = its own catalog.
    const clusters = new Map<string, Doc[]>();
    for (const d of canon) {
      const key = `${mfrKey(d)}~${norm(d.brand)}~${d.compositionSig}~${norm(d.category)}`;
      (clusters.get(key) ?? clusters.set(key, []).get(key)!).push(d);
    }
    return {
      action: 'SPLIT' as const,
      note: 'Distinct brand/manufacturer/composition — do NOT merge. Split into separate catalogs.',
      proposedCatalogClusters: Array.from(clusters.values()).map((cl) => ({
        authoritativeProductId: authoritativeOf(cl),
        productIds: cl.map((d) => d.id),
      })),
    };
  }

  if (gc.classification === 'AMBIGUOUS') {
    return {
      action: 'MANUAL_REVIEW' as const,
      note: 'Insufficient identity data (no brand/manufacturer/composition/image agreement). Human review required; no auto-merge.',
      proposedCatalogClusters: [],
    };
  }

  // LIKELY_IDENTICAL or MANUFACTURER_VS_RETAILER → one shared catalog.
  const memberIds = [...canon.map((d) => d.id), ...copies.map((d) => d.id)];
  return {
    action: gc.classification === 'MANUFACTURER_VS_RETAILER' ? ('MERGE_WITH_CONFIRMATION' as const) : ('MERGE_CANDIDATE' as const),
    note:
      gc.classification === 'MANUFACTURER_VS_RETAILER'
        ? 'Manufacturer + retailer canonicals of the same name — shared catalogId with the manufacturer as authoritative identity; retailer docs become listings. Confirm before applying.'
        : 'Appears to be the same product listed by multiple sellers — one shared catalogId; others become listings.',
    proposedCatalogClusters: [
      {
        authoritativeProductId: authoritativeOf(canon),
        productIds: memberIds,
      },
    ],
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  assertReadOnlySource();
  initAdmin();
  DB = getFirestore();

  console.log('\nReading products collection (read-only)…');
  const rawProducts = await getAllDocs('products');
  const docs = rawProducts.map((p) => toDoc(p.id, p.data));
  console.log(`  products docs: ${docs.length}`);

  // Group by normalized name.
  const byName = new Map<string, Doc[]>();
  for (const d of docs) {
    const key = d.nameKey || `(blank-name:${d.id})`;
    (byName.get(key) ?? byName.set(key, []).get(key)!).push(d);
  }

  // Index every product id → its name group, for downstream reference counting.
  const idToKey = new Map<string, string>();
  for (const d of docs) idToKey.set(d.id, d.nameKey || `(blank-name:${d.id})`);

  // ── Downstream references (admin SDK reads all) ──────────────────────────────
  // availability[] — on the product docs themselves.
  const availByKey = new Map<string, number>();
  for (const [key, list] of Array.from(byName)) availByKey.set(key, list.reduce((s, d) => s + d.availabilityCount, 0));

  // inventory references.
  console.log('Reading inventory references…');
  const invByKey = new Map<string, number>();
  let inventoryTotal = 0;
  try {
    const inv = await getAllDocs('inventory');
    inventoryTotal = inv.length;
    for (const { data } of inv) {
      for (const f of ['productId', 'originalProductId', 'manufacturerProductId']) {
        const ref = String(data[f] ?? '');
        const key = ref && idToKey.get(ref);
        if (key) invByKey.set(key, (invByKey.get(key) ?? 0) + 1);
      }
    }
  } catch (e: any) {
    console.warn(`  inventory read failed (${e?.message ?? e}) — counts omitted.`);
  }

  // live carts.
  console.log('Reading carts references…');
  const cartItemByKey = new Map<string, number>();
  const cartDocsByKey = new Map<string, Set<string>>();
  let cartsTotal = 0;
  try {
    const carts = await getAllDocs('carts');
    cartsTotal = carts.length;
    for (const { id, data } of carts) {
      const items = Array.isArray(data.items) ? data.items : [];
      for (const it of items) {
        const ref = String(it?.productId ?? it?.catalogId ?? '');
        const key = ref && idToKey.get(ref);
        if (!key) continue;
        cartItemByKey.set(key, (cartItemByKey.get(key) ?? 0) + 1);
        (cartDocsByKey.get(key) ?? cartDocsByKey.set(key, new Set()).get(key)!).add(id);
      }
    }
  } catch (e: any) {
    console.warn(`  carts read failed (${e?.message ?? e}) — counts omitted.`);
  }

  // historical orders.
  console.log('Reading orders references…');
  const orderItemByKey = new Map<string, number>();
  const orderDocsByKey = new Map<string, Set<string>>();
  let ordersTotal = 0;
  try {
    const orders = await getAllDocs('orders');
    ordersTotal = orders.length;
    for (const { id, data } of orders) {
      const items = Array.isArray(data.items) ? data.items : [];
      for (const it of items) {
        const ref = String(it?.productId ?? it?.catalogId ?? '');
        const key = ref && idToKey.get(ref);
        if (!key) continue;
        orderItemByKey.set(key, (orderItemByKey.get(key) ?? 0) + 1);
        (orderDocsByKey.get(key) ?? orderDocsByKey.set(key, new Set()).get(key)!).add(id);
      }
    }
  } catch (e: any) {
    console.warn(`  orders read failed (${e?.message ?? e}) — counts omitted.`);
  }

  // cardMembers — count members per nameKey (one query per conflict key, chunked).
  console.log('Reading cardMembers / marketplaceCards…');
  const conflictKeys = Array.from(byName.entries())
    .filter(([, list]) => list.filter((d) => d.isCanonicalCandidate).length > 1)
    .map(([key]) => key);
  const cardMembersByKey = new Map<string, number>();
  const cardExistsByKey = new Map<string, boolean>();
  try {
    for (const key of conflictKeys) {
      if (key.startsWith('(blank-name')) continue;
      const members = await runQuery(DB.collection('cardMembers').where('nameKey', '==', key));
      cardMembersByKey.set(key, members.length);
      const card = await runQuery(DB.collection('marketplaceCards').where('nameKey', '==', key));
      cardExistsByKey.set(key, card.length > 0 || (await DB.collection('marketplaceCards').doc(cardIdFor(key)).get()).exists);
    }
  } catch (e: any) {
    console.warn(`  cardMembers/marketplaceCards read failed (${e?.message ?? e}) — counts omitted.`);
  }

  // ── Build the group report ───────────────────────────────────────────────────
  type GroupReport = {
    nameKey: string;
    displayName: string;
    totalDocs: number;
    activeDocs: number;
    canonicalCandidates: number;
    copies: number;
    sources: Record<string, number>;
    classification: Classification | 'HEALTHY_SINGLE_CANONICAL' | 'NO_CANONICAL';
    signals: string[];
    distinctBrands: string[];
    distinctManufacturers: string[];
    distinctCompositions: string[];
    distinctCategories: string[];
    references: {
      marketplaceCardExists: boolean | null;
      cardMembers: number | null;
      availabilityEntries: number;
      inventoryRows: number;
      cartItems: number;
      cartDocs: number;
      orderItems: number;
      orderDocs: number;
    };
    recommendation: ReturnType<typeof recommend> | null;
    docs: Doc[];
  };

  const groups: GroupReport[] = [];
  for (const [key, list] of Array.from(byName)) {
    const canon = list.filter((d) => d.isCanonicalCandidate);
    const copies = list.filter((d) => !d.isCanonicalCandidate);
    const sources: Record<string, number> = {};
    for (const d of list) sources[d.source] = (sources[d.source] ?? 0) + 1;

    let classification: GroupReport['classification'];
    let gc: GroupClassification | null = null;
    let rec: ReturnType<typeof recommend> | null = null;
    if (canon.length === 0) classification = 'NO_CANONICAL';
    else if (canon.length === 1) classification = 'HEALTHY_SINGLE_CANONICAL';
    else {
      gc = classifyGroup(canon);
      classification = gc.classification;
      rec = recommend(canon, copies, gc);
    }

    groups.push({
      nameKey: key,
      displayName: list[0]?.name ?? key,
      totalDocs: list.length,
      activeDocs: list.filter((d) => d.isActive).length,
      canonicalCandidates: canon.length,
      copies: copies.length,
      sources,
      classification,
      signals: gc?.signals ?? [],
      distinctBrands: gc?.distinctBrands ?? [],
      distinctManufacturers: gc?.distinctManufacturers ?? [],
      distinctCompositions: gc?.distinctCompositions ?? [],
      distinctCategories: gc?.distinctCategories ?? [],
      references: {
        marketplaceCardExists: cardExistsByKey.has(key) ? cardExistsByKey.get(key)! : null,
        cardMembers: cardMembersByKey.has(key) ? cardMembersByKey.get(key)! : null,
        availabilityEntries: availByKey.get(key) ?? 0,
        inventoryRows: invByKey.get(key) ?? 0,
        cartItems: cartItemByKey.get(key) ?? 0,
        cartDocs: cartDocsByKey.get(key)?.size ?? 0,
        orderItems: orderItemByKey.get(key) ?? 0,
        orderDocs: orderDocsByKey.get(key)?.size ?? 0,
      },
      recommendation: rec,
      docs: list,
    });
  }

  // Conflict groups = >1 canonical candidate. Sort by order impact, then size.
  const conflicts = groups
    .filter((g) => g.canonicalCandidates > 1)
    .sort((a, b) => b.references.orderDocs - a.references.orderDocs || b.canonicalCandidates - a.canonicalCandidates);

  const tally = (cls: string) => conflicts.filter((g) => g.classification === cls).length;
  const counts = {
    productsTotal: docs.length,
    inventoryTotal,
    cartsTotal,
    ordersTotal,
    groupsAnalyzed: groups.length,
    healthySingleCanonical: groups.filter((g) => g.classification === 'HEALTHY_SINGLE_CANONICAL').length,
    noCanonical: groups.filter((g) => g.classification === 'NO_CANONICAL').length,
    conflictGroups: conflicts.length,
    likelyIdentical: tally('LIKELY_IDENTICAL'),
    differentBrandOrFormulation: tally('DIFFERENT_BRAND_OR_FORMULATION'),
    manufacturerVsRetailer: tally('MANUFACTURER_VS_RETAILER'),
    ambiguous: tally('AMBIGUOUS'),
    conflictsTouchingOrders: conflicts.filter((g) => g.references.orderDocs > 0).length,
    conflictsTouchingCarts: conflicts.filter((g) => g.references.cartDocs > 0).length,
  };

  // ── Write machine-readable outputs ───────────────────────────────────────────
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = join(OUT_DIR, `stage0-product-identity-audit-${stamp}.json`);
  const csvPath = join(OUT_DIR, `stage0-product-identity-audit-${stamp}.csv`);

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        readOnly: true,
        projectId: process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315',
        summary: counts,
        conflictGroups: conflicts,
        // Full group index (lightweight) so clean groups are inspectable too.
        allGroups: groups.map((g) => ({
          nameKey: g.nameKey,
          classification: g.classification,
          totalDocs: g.totalDocs,
          canonicalCandidates: g.canonicalCandidates,
          copies: g.copies,
        })),
      },
      null,
      2,
    ),
    'utf8',
  );

  const csvEsc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csvRows = [
    [
      'nameKey', 'displayName', 'classification', 'canonicalCandidates', 'copies', 'activeDocs', 'totalDocs',
      'signals', 'distinctBrands', 'distinctManufacturers', 'distinctCompositions',
      'cardMembers', 'availabilityEntries', 'inventoryRows', 'cartItems', 'cartDocs', 'orderItems', 'orderDocs',
      'recommendedAction', 'proposedCatalogClusters', 'canonicalProductIds',
    ].join(','),
    ...conflicts.map((g) =>
      [
        g.nameKey, g.displayName, g.classification, g.canonicalCandidates, g.copies, g.activeDocs, g.totalDocs,
        g.signals.join('|'), g.distinctBrands.join('|'), g.distinctManufacturers.join('|'), g.distinctCompositions.join('|'),
        g.references.cardMembers ?? '', g.references.availabilityEntries, g.references.inventoryRows,
        g.references.cartItems, g.references.cartDocs, g.references.orderItems, g.references.orderDocs,
        g.recommendation?.action ?? '',
        (g.recommendation?.proposedCatalogClusters ?? []).length,
        g.docs.filter((d) => d.isCanonicalCandidate).map((d) => d.id).join('|'),
      ]
        .map(csvEsc)
        .join(','),
    ),
  ];
  writeFileSync(csvPath, csvRows.join('\n'), 'utf8');

  // ── Console summary ──────────────────────────────────────────────────────────
  const line = '═'.repeat(70);
  console.log(`\n${line}`);
  console.log('  STAGE 0 — PRODUCT IDENTITY CONFLICT DIAGNOSTIC (READ-ONLY)');
  console.log(line);
  console.log(`  products docs ............. ${counts.productsTotal}`);
  console.log(`  inventory / carts / orders  ${counts.inventoryTotal} / ${counts.cartsTotal} / ${counts.ordersTotal}`);
  console.log(`  name groups analyzed ...... ${counts.groupsAnalyzed}`);
  console.log(`    healthy (1 canonical) ... ${counts.healthySingleCanonical}`);
  console.log(`    no canonical (copies only) ${counts.noCanonical}`);
  console.log(`    CONFLICT (>1 canonical) . ${counts.conflictGroups}`);
  console.log(`${'─'.repeat(70)}`);
  console.log('  Conflict classification:');
  console.log(`    LIKELY_IDENTICAL ................ ${counts.likelyIdentical}`);
  console.log(`    MANUFACTURER_VS_RETAILER ........ ${counts.manufacturerVsRetailer}`);
  console.log(`    DIFFERENT_BRAND_OR_FORMULATION .. ${counts.differentBrandOrFormulation}  (must split, never merge)`);
  console.log(`    AMBIGUOUS (manual review) ....... ${counts.ambiguous}`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`  conflicts touching live carts ... ${counts.conflictsTouchingCarts}`);
  console.log(`  conflicts touching past orders .. ${counts.conflictsTouchingOrders}`);
  console.log(line);

  const TOP = 25;
  console.log(`\n  TOP ${Math.min(TOP, conflicts.length)} CONFLICT GROUPS (by order impact):\n`);
  for (const g of conflicts.slice(0, TOP)) {
    console.log(`  ▸ "${g.displayName}"  [${g.classification}]`);
    console.log(
      `      canonical=${g.canonicalCandidates} copies=${g.copies} active=${g.activeDocs}` +
        `  sources={${Object.entries(g.sources).map(([s, n]) => `${s}×${n}`).join(', ')}}`,
    );
    if (g.signals.length) console.log(`      signals: ${g.signals.join(', ')}`);
    console.log(
      `      refs: card=${g.references.marketplaceCardExists ?? '?'} members=${g.references.cardMembers ?? '?'}` +
        ` availability=${g.references.availabilityEntries} inventory=${g.references.inventoryRows}` +
        ` carts=${g.references.cartDocs} orders=${g.references.orderDocs}`,
    );
    if (g.recommendation) console.log(`      → ${g.recommendation.action}: ${g.recommendation.note}`);
    for (const d of g.docs.filter((x) => x.isCanonicalCandidate)) {
      console.log(
        `        · ${d.id} src=${d.source} ${d.isActive ? 'active' : 'INACTIVE'}${d.hasImage ? '' : ' NO-IMG'}` +
          ` owner=${d.ownerId || d.ownerPhone || '—'}(${d.ownerType || '—'}) mfr=${d.manufacturerId || d.manufacturerPhone || '—'}` +
          ` cat=${d.category || '—'} comp=${d.compositionCount} variants=[${d.variantSig || '—'}] ₹${d.price}`,
      );
    }
    console.log('');
  }

  console.log(line);
  console.log('  REPORTS WRITTEN (local filesystem — no Firestore writes):');
  console.log(`    JSON: ${jsonPath}`);
  console.log(`    CSV : ${csvPath}`);
  console.log(line);
  console.log('\n  LIMITATIONS:');
  console.log('   • Classification is heuristic — brand is rarely an explicit field, so');
  console.log('     "different formulation" relies on manufacturer/composition/category.');
  console.log('     Treat every recommendation as a proposal for human review, never as');
  console.log('     an instruction to auto-merge.');
  console.log('   • Reference counts match an order/cart item.productId (or catalogId) to a');
  console.log('     product doc id; items referencing a now-deleted doc id are not counted.');
  console.log('   • Requires admin credentials; any collection that fails to read reports its');
  console.log('     counts as omitted rather than aborting the run.');
  console.log('\nDone. (read-only — no writes performed)\n');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
