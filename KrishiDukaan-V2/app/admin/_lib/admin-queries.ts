"use client";

/**
 * Scoped reads for admin pages that used to filter whole collections in the
 * browser: sellers by role, docs by owner, subscriptions that are active.
 */

import {
  collection,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  sum,
  Timestamp,
  where,
  type DocumentData,
  type Query,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../../firebase";
import { orderGrandTotal } from "../../../types/order";

export type AdminUser = { id: string; [key: string]: any };

/** Users whose role is one of `roles` (at most 30), e.g. the sellers. */
export async function fetchUsersByRoles(roles: string[]): Promise<AdminUser[]> {
  const snap = await getDocs(query(collection(db, "users"), where("role", "in", roles)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Retailers and manufacturers. */
export function fetchSellers(): Promise<AdminUser[]> {
  return fetchUsersByRoles(["retailer", "manufacturer"]);
}

/** Subscriptions with status "active" that have not expired yet, soonest expiry first. */
export async function fetchActiveSubscriptions(): Promise<any[]> {
  const snap = await getDocs(query(
    collection(db, "subscriptions"),
    where("subscriptionStatus", "==", "active"),
    where("expiryDate", ">", Timestamp.now()),
    orderBy("expiryDate", "asc"),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type OrderQueryFilters = {
  status?: string;          // "all" or an order status
  sellerType?: string;      // "all" | "retailer" | "manufacturer"
  fromMs?: number | null;   // createdAt bounds
  toMs?: number | null;
};

/**
 * Orders newest first with the filters Firestore can apply. Orders without
 * createdAt can't appear in an ordered query; searchOrdersDirect finds them
 * by id, invoice, Razorpay id or phone.
 */
export function ordersQuery(f: OrderQueryFilters): Query<DocumentData> {
  const c: QueryConstraint[] = [];
  if (f.status && f.status !== "all") c.push(where("status", "==", f.status));
  if (f.sellerType && f.sellerType !== "all") c.push(where("sellerType", "==", f.sellerType));
  if (f.fromMs != null) c.push(where("createdAt", ">=", Timestamp.fromMillis(f.fromMs)));
  if (f.toMs != null) c.push(where("createdAt", "<=", Timestamp.fromMillis(f.toMs)));
  return query(collection(db, "orders"), ...c, orderBy("createdAt", "desc"));
}

/**
 * Orders matching a pasted identifier exactly: order id, invoice number,
 * Razorpay order/payment id, or a customer/seller phone (newest 50 each).
 * A few reads, whatever the collection size.
 */
export async function searchOrdersDirect(term: string): Promise<Array<{ id: string } & DocumentData>> {
  const trimmed = term.trim();
  // A phone may be typed with spaces or dashes; anything else is one token.
  const phoneLike = /^[+\d\s-]+$/.test(trimmed);
  const q = phoneLike ? trimmed.replace(/[\s-]/g, "") : trimmed;
  if (q.length < 4 || /\s/.test(q)) return [];
  const orders = collection(db, "orders");
  const digits = phoneLike ? q.replace(/\D/g, "") : "";
  // The web saves the customer phone as typed; try the usual forms.
  const ten = digits.slice(-10);
  const phones = digits.length >= 10 && digits.length <= 12 ? [`+91${ten}`, ten, `91${ten}`] : [];
  const reads: Promise<Array<{ id: string } & DocumentData>>[] = [];
  const run = (qq: Query<DocumentData>) =>
    getDocs(qq).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
  if (/^[A-Za-z0-9_-]{6,}$/.test(q)) {
    reads.push(getDoc(doc(db, "orders", q))
      .then((d) => (d.exists() ? [{ id: d.id, ...d.data() }] : []))
      .catch(() => []));
  }
  for (const v of Array.from(new Set([q, q.toUpperCase()]))) {
    reads.push(run(query(orders, where("invoiceNumber", "==", v), limit(5))));
  }
  if (q.startsWith("order_")) reads.push(run(query(orders, where("payment.razorpayOrderId", "==", q), limit(5))));
  if (q.startsWith("pay_")) reads.push(run(query(orders, where("payment.razorpayPaymentId", "==", q), limit(5))));
  if (phones.length) {
    reads.push(run(query(orders, where("customerPhone", "in", phones), limit(50))));
    reads.push(run(query(orders, where("sellerPhone", "in", phones), limit(50))));
  }
  const byId = new Map<string, { id: string } & DocumentData>();
  for (const rows of await Promise.all(reads)) for (const r of rows) byId.set(r.id, r);
  return Array.from(byId.values());
}

export type OrderTotals = {
  total: number;
  paid: number;
  unpaid: number;
  revenue: number;
  gross: number;
  byStatus: Record<string, number>;
  /** Sum of order values for rejected + admin-rerouted orders (deduplicated). */
  lostValue: number;
};

/**
 * All-time order totals for the Orders page tiles: count and sum queries,
 * plus gross order value from the per-day totals (platformDailyStats), which
 * applies the grandTotal/total/subtotal fallback.
 */
export async function fetchOrderTotals(statuses: string[]): Promise<OrderTotals> {
  const orders = collection(db, "orders");
  const paidQ = query(orders, where("payment.status", "==", "paid"));
  const rejectedQ = query(orders, where("status", "==", "rejected"));
  const reroutedQ = query(orders, where("adminReassignment.at", ">", ""));
  const [total, paid, revenue, byStatusList, days, rejectedSnap, reroutedSnap] = await Promise.all([
    getCountFromServer(orders).then((c) => c.data().count),
    getCountFromServer(paidQ).then((c) => c.data().count),
    getAggregateFromServer(paidQ, { v: sum("payment.amount") }).then((a) => Number(a.data().v ?? 0)),
    Promise.all(statuses.map((s) =>
      getCountFromServer(query(orders, where("status", "==", s))).then((c) => [s, c.data().count] as const))),
    getDocs(collection(db, "platformDailyStats")).catch(() => null),
    getDocs(rejectedQ).catch(() => null),
    getDocs(reroutedQ).catch(() => null),
  ]);
  const gross = (days?.docs ?? []).reduce((g, d) => g + Number(d.get("orders.gmv") ?? 0), 0);

  // Compute lost value: sum of order totals for rejected + rerouted (deduplicated by id).
  const lostById = new Map<string, number>();
  for (const d of rejectedSnap?.docs ?? []) {
    lostById.set(d.id, orderGrandTotal(d.data() as any));
  }
  for (const d of reroutedSnap?.docs ?? []) {
    if (!lostById.has(d.id)) lostById.set(d.id, orderGrandTotal(d.data() as any));
  }
  const lostValue = Array.from(lostById.values()).reduce((s, v) => s + v, 0);

  return {
    total,
    paid,
    unpaid: total - paid,
    revenue,
    gross,
    byStatus: Object.fromEntries(byStatusList),
    lostValue,
  };
}

// ─── Users ───────────────────────────────────────────────────────────────────

/** Spellings a stored name may start with: as typed, lower, Capitalized, Title Case, UPPER. */
function prefixVariants(term: string): string[] {
  const t = term.trim();
  const lower = t.toLowerCase();
  const title = lower.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return Array.from(new Set([t, lower, lower.charAt(0).toUpperCase() + lower.slice(1), title, t.toUpperCase()]))
    .filter(Boolean);
}

/**
 * Users matching a search term without reading the collection: prefix
 * queries on name, shop and business name (several capitalizations) and
 * email, exact phone (any stored form) and exact doc id. At most 10 docs per
 * query, so ~16 small queries whatever the number of users.
 */
export async function searchUsers(term: string): Promise<AdminUser[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const users = collection(db, "users");
  const run = (q: Query<DocumentData>) =>
    getDocs(q).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as AdminUser)).catch(() => [] as AdminUser[]);
  const prefix = (field: string, p: string) =>
    run(query(users, where(field, ">=", p), where(field, "<=", `${p}`), limit(10)));

  const reads: Promise<AdminUser[]>[] = [];
  for (const p of prefixVariants(t)) {
    for (const field of ["name", "shopName", "businessName"]) reads.push(prefix(field, p));
  }
  if (/[@.]/.test(t) || /^[a-z0-9._-]+$/i.test(t)) reads.push(prefix("email", t.toLowerCase()));

  const digits = t.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 12 && digits.length >= t.replace(/[\s+-]/g, "").length) {
    const ten = digits.slice(-10);
    const forms = [`+91${ten}`, ten, `91${ten}`];
    for (const f of forms) {
      reads.push(getDoc(doc(db, "users", f)).then((d) => (d.exists() ? [{ id: d.id, ...d.data() }] : [])).catch(() => []));
    }
    reads.push(run(query(users, where("phone", "in", forms), limit(10))));
  } else if (/^[A-Za-z0-9]{20,}$/.test(t)) {
    // An Auth UID: email accounts live at users/{uid}.
    reads.push(getDoc(doc(db, "users", t)).then((d) => (d.exists() ? [{ id: d.id, ...d.data() }] : [])).catch(() => []));
  }

  const byId = new Map<string, AdminUser>();
  for (const rows of await Promise.all(reads)) for (const u of rows) byId.set(u.id, u);
  return Array.from(byId.values());
}
