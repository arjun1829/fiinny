import * as admin from "firebase-admin";
import { createHash } from "crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { millisOf } from "./increments";

/**
 * "300+ people bought this in the last 2 months" on the product page.
 *
 *   productBuyStats/{productId} = {
 *     d30, d60, d90,              distinct buyers in each window
 *     show: { count, label, days } | null   what the page says (null = say nothing)
 *     recent: [{ i, c }]          up to 4 recent buyers as an initial + colour —
 *                                 never a name, phone or photo
 *     updatedAt
 *   }
 *
 * Rebuilt every 6 hours from the last 90 days of orders, so the product page
 * reads one small doc and never touches orders. Every product doc that shares
 * a marketplace card (cardMembers: the same product name across sellers) gets
 * the same totals — the page reads whichever product id it shows. Only docs
 * whose content changed are written.
 *
 * Counted: orders not cancelled, rejected or refunded, and whose payment did
 * not fail. A person (customer phone, else uid) counts once per product per
 * window however many times they ordered it.
 */

const REGION = "asia-south1";
export const BUY_STATS = "productBuyStats";
const MEMBERS = "cardMembers";
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOWS = [30, 60, 90] as const;
/** Below this many buyers in 90 days the page says nothing — "1 person bought" is not social proof. */
export const MIN_BUYERS = 3;
/** A shorter window is preferred once it has at least this many buyers. */
const PREFERRED_MIN = 10;
const MAX_AVATARS = 4;
const EXCLUDED_STATUSES = new Set(["cancelled", "rejected", "refunded", "payment_failed", "failed"]);

export type BuyOrder = {
  createdMs: number;
  status?: string;
  paymentStatus?: string;
  buyerKey: string;
  buyerName: string;
  productIds: string[];
};

export type BuyStatsDoc = {
  d30: number;
  d60: number;
  d90: number;
  show: { count: number; label: string; days: number } | null;
  recent: { i: string; c: number }[];
};

/** "47", "60+", "300+": exact while small, then rounded down so it never overstates. */
export function countLabel(n: number): string {
  if (n < 50) return String(n);
  if (n < 100) return `${Math.floor(n / 10) * 10}+`;
  if (n < 1000) return `${Math.floor(n / 50) * 50}+`;
  return `${Math.floor(n / 100) * 100}+`;
}

/** The first letter of the buyer's first name (any script), or "" if none. */
function initialOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const ch = Array.from(first)[0] ?? "";
  return /\p{L}/u.test(ch) ? ch.toLocaleUpperCase("en-IN") : "";
}

function colourOf(buyerKey: string): number {
  return createHash("sha1").update(buyerKey).digest()[0] % 6;
}

/** Which window the page shows: the shortest one that is already convincing. */
export function chooseShow(d: { d30: number; d60: number; d90: number }): BuyStatsDoc["show"] {
  if (d.d90 < MIN_BUYERS) return null;
  const counts = { 30: d.d30, 60: d.d60, 90: d.d90 } as const;
  for (const days of WINDOWS) {
    const n = counts[days];
    // Either enough on its own, or everyone in the 90 days bought within it.
    if (n >= PREFERRED_MIN || n === d.d90) return { count: n, label: countLabel(n), days };
  }
  return { count: d.d90, label: countLabel(d.d90), days: 90 };
}

/**
 * Pure: stats per group key from orders. [groupOf] maps a product id to its
 * group (the card's name key), falling back to the id itself.
 */
export function computeBuyStats(
  orders: BuyOrder[],
  groupOf: (productId: string) => string,
  now: number,
): Map<string, BuyStatsDoc> {
  const buyers = new Map<string, Map<string, { lastMs: number; name: string }>>();
  for (const o of orders) {
    if (!o.buyerKey || !o.createdMs || now - o.createdMs > 90 * DAY_MS) continue;
    if (o.status && EXCLUDED_STATUSES.has(o.status.toLowerCase())) continue;
    if (o.paymentStatus && o.paymentStatus.toLowerCase() === "failed") continue;
    const groups = new Set(o.productIds.filter(Boolean).map(groupOf));
    for (const g of Array.from(groups)) {
      const m = buyers.get(g) ?? new Map();
      const prev = m.get(o.buyerKey);
      if (!prev || o.createdMs > prev.lastMs) m.set(o.buyerKey, { lastMs: o.createdMs, name: o.buyerName || prev?.name || "" });
      buyers.set(g, m);
    }
  }

  const out = new Map<string, BuyStatsDoc>();
  for (const [g, m] of Array.from(buyers)) {
    const entries = Array.from(m.entries());
    const within = (days: number) => entries.filter(([, v]) => now - v.lastMs <= days * DAY_MS).length;
    const d = { d30: within(30), d60: within(60), d90: entries.length };
    const recent = entries
      .sort((a, b) => b[1].lastMs - a[1].lastMs)
      .slice(0, MAX_AVATARS)
      .map(([key, v]) => ({ i: initialOf(v.name), c: colourOf(key) }));
    out.set(g, { ...d, show: chooseShow(d), recent });
  }
  return out;
}

function buyerKeyOf(d: admin.firestore.DocumentData): string {
  const digits = String(d.customerPhone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return `+91${digits.slice(-10)}`;
  return String(d.customerId ?? "").trim();
}

function productIdsOf(d: admin.firestore.DocumentData): string[] {
  const items = Array.isArray(d.items) ? d.items : [];
  // Web writes productId, the app catalogId (see types/order.ts normalizeOrderItem).
  return items.map((it: Record<string, unknown>) => String(it?.productId ?? it?.catalogId ?? "").trim());
}

/** JSON with object keys sorted, so equal docs compare equal whatever order Firestore returns. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

async function readPaged(
  q: admin.firestore.Query,
  onDoc: (d: admin.firestore.QueryDocumentSnapshot) => void,
): Promise<void> {
  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    const snap: admin.firestore.QuerySnapshot = await (last ? q.startAfter(last) : q).limit(1000).get();
    snap.docs.forEach(onDoc);
    if (snap.size < 1000) return;
    last = snap.docs[snap.docs.length - 1];
  }
}

export type BuyStatsReport = { orders: number; products: number; written: number; deleted: number; unchanged: number };

/** Rebuilds every productBuyStats doc. `dryRun` reports without writing. */
export async function rebuildAllProductBuyStats(opts: { dryRun?: boolean } = {}): Promise<BuyStatsReport> {
  const db = admin.firestore();
  const now = Date.now();

  // Product id → card name key, and name key → every product id on that card.
  const groupById = new Map<string, string>();
  const idsByGroup = new Map<string, string[]>();
  await readPaged(db.collection(MEMBERS).select("nameKey").orderBy(admin.firestore.FieldPath.documentId()), (d) => {
    const key = String(d.get("nameKey") ?? "");
    if (!key) return;
    groupById.set(d.id, key);
    idsByGroup.set(key, [...(idsByGroup.get(key) ?? []), d.id]);
  });

  const orders: BuyOrder[] = [];
  const since = admin.firestore.Timestamp.fromMillis(now - 90 * DAY_MS);
  await readPaged(
    db.collection("orders")
      .where("createdAt", ">=", since)
      .orderBy("createdAt")
      .select("createdAt", "status", "payment", "customerPhone", "customerId", "customerName", "items"),
    (d) => {
      const data = d.data();
      orders.push({
        createdMs: millisOf(data.createdAt),
        status: typeof data.status === "string" ? data.status : undefined,
        paymentStatus: typeof data.payment?.status === "string" ? data.payment.status : undefined,
        buyerKey: buyerKeyOf(data),
        buyerName: String(data.customerName ?? ""),
        productIds: productIdsOf(data),
      });
    },
  );

  const byGroup = computeBuyStats(orders, (id) => groupById.get(id) ?? `id:${id}`, now);

  // Fan each group's stats out to every product id the page might be showing.
  const target = new Map<string, BuyStatsDoc>();
  for (const [g, stats] of Array.from(byGroup)) {
    const ids = g.startsWith("id:") ? [g.slice(3)] : idsByGroup.get(g) ?? [];
    for (const id of ids) target.set(id, stats);
  }

  const existing = new Map<string, string>();
  await readPaged(db.collection(BUY_STATS).orderBy(admin.firestore.FieldPath.documentId()), (d) => {
    const data = { ...d.data() };
    delete data.updatedAt;
    existing.set(d.id, stableJson(data));
  });

  const writes: Array<[string, BuyStatsDoc]> = [];
  let unchanged = 0;
  for (const [id, stats] of Array.from(target)) {
    if (existing.get(id) === stableJson(stats)) unchanged++;
    else writes.push([id, stats]);
  }
  const deletes = Array.from(existing.keys()).filter((id) => !target.has(id));

  if (!opts.dryRun) {
    const ops: Array<(b: admin.firestore.WriteBatch) => void> = [
      ...writes.map(([id, stats]) => (b: admin.firestore.WriteBatch) =>
        b.set(db.collection(BUY_STATS).doc(id), { ...stats, updatedAt: admin.firestore.FieldValue.serverTimestamp() })),
      ...deletes.map((id) => (b: admin.firestore.WriteBatch) => b.delete(db.collection(BUY_STATS).doc(id))),
    ];
    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
  }

  return { orders: orders.length, products: target.size, written: writes.length, deleted: deletes.length, unchanged };
}

export const rebuildProductBuyStats = onSchedule(
  { schedule: "every 6 hours", region: REGION, timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const report = await rebuildAllProductBuyStats();
    logger.info("[productBuyStats] rebuilt", report);
  },
);
