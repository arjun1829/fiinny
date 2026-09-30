/**
 * Referral codes — sales / marketing attribution for subscription purchases.
 *
 * NOT the manufacturer "invite code" (`?inviteCode=`, lib/invite/), which links
 * a retailer to a manufacturer's network. A referral code says which sales or
 * marketing person brought a paying seller in. Share link:
 *
 *     https://krishidukan.com/subscribe?ref=CODE[&plan=<planKey>][&seats=<n>]
 *
 * WHERE THE TRUTH LIVES
 *   referralCodes/{CODE}     the code itself — admin-written through
 *                            /api/admin/referral-codes (never client-written),
 *                            readable only by admins and the owning rep.
 *   paymentAttempts/{order}  `referralCode` stamped SERVER-side by create-order
 *                            after validating the code. Started / paid / failed
 *                            come from here, so a client cannot fake a paid
 *                            referral: status "paid" is set by verify/ and the
 *                            Razorpay webhook, never by the buyer's device.
 *   referralEvents/{auto}    link opens and "reached checkout" views — the top
 *                            of the funnel, before any money moves. Client-
 *                            written, validated by firestore.rules (the code
 *                            must exist), so these are indicative counts.
 *
 * ATTRIBUTION (owner's decision): credit goes to the code applied at THAT
 * checkout only. Nothing is remembered on the account or re-applied later.
 */

import { getAdminDb } from "./firebase-admin";

/** Codes are stored and compared uppercased: A–Z, 0–9, 3–20 characters. */
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{3,20}$/;

export function normalizeReferralCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidReferralCodeFormat(code: string): boolean {
  return REFERRAL_CODE_PATTERN.test(code);
}

export type ReferralOwnerType = "sales" | "marketing" | "partner" | "other";

export const REFERRAL_OWNER_TYPES: ReferralOwnerType[] = ["sales", "marketing", "partner", "other"];

export interface ReferralCode {
  code: string;
  active: boolean;
  /** Display name of the person the code credits. */
  ownerName: string;
  ownerType: ReferralOwnerType;
  /**
   * Firebase uid of the sales-app account that owns the code, when there is
   * one. That rep can then see this code's stats in the sales app. Null for a
   * marketing person or partner without a sales-app login.
   */
  ownerUid: string | null;
  /** Admin-only note (e.g. "Pune district drive"). */
  note: string;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string | null;
}

export function mapReferralCode(id: string, d: Record<string, unknown>): ReferralCode {
  const ts = (v: unknown): string | null => {
    const t = v as { toDate?: () => Date } | null | undefined;
    if (t && typeof t.toDate === "function") return t.toDate().toISOString();
    return typeof v === "string" ? v : null;
  };
  const type = String(d.ownerType ?? "sales") as ReferralOwnerType;
  return {
    code: id,
    active: d.active !== false,
    ownerName: String(d.ownerName ?? ""),
    ownerType: REFERRAL_OWNER_TYPES.includes(type) ? type : "other",
    ownerUid: d.ownerUid ? String(d.ownerUid) : null,
    note: String(d.note ?? ""),
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
    createdBy: d.createdBy ? String(d.createdBy) : null,
  };
}

/**
 * The active code a checkout asked for, or null. Used by create-order.
 *
 * A code that is unknown or paused is IGNORED (the purchase proceeds without
 * attribution) rather than refused: a rep's code being paused must never be
 * the reason a seller cannot pay.
 */
export async function resolveActiveReferralCode(raw: unknown): Promise<ReferralCode | null> {
  const code = normalizeReferralCode(raw);
  if (!isValidReferralCodeFormat(code)) return null;
  try {
    const snap = await getAdminDb().collection("referralCodes").doc(code).get();
    if (!snap.exists) return null;
    const rc = mapReferralCode(snap.id, snap.data() ?? {});
    return rc.active ? rc : null;
  } catch (e) {
    console.error("[referrals] code lookup failed:", e);
    return null;
  }
}

// ─── Funnel stats ───────────────────────────────────────────────────────────

/** An attempt this long in "created" without paying counts as abandoned. */
export const ABANDON_AFTER_MS = 30 * 60 * 1000;

export type AttemptLike = {
  id: string;
  status: string;
  amount: number;
  userId: string;
  userName: string | null;
  userPhone: string | null;
  seatCount: number | null;
  durationMonths: number | null;
  createdAtMs: number;
};

export type EventLike = {
  type: string;
  uid: string | null;
  atMs: number;
};

export type LeadStatus = "viewed" | "pending" | "abandoned" | "failed";

export interface ReferralLead {
  userId: string;
  name: string | null;
  phone: string | null;
  status: LeadStatus;
  /** Rupees of their most recent unpaid attempt, when they got that far. */
  amount: number | null;
  seatCount: number | null;
  durationMonths: number | null;
  lastAt: string;
}

export interface ReferralStats {
  /** Link opens (web + app), deduplicated per browser session. */
  opens: number;
  /** Distinct signed-in people who saw the checkout with this code applied. */
  reachedCheckout: number;
  /** Distinct people who started a payment with the code. */
  startedBuyers: number;
  /** Distinct people with at least one paid purchase on the code. */
  paidBuyers: number;
  /** Paid purchases (a buyer can have several). */
  paidOrders: number;
  failedOrders: number;
  abandonedOrders: number;
  pendingOrders: number;
  /** Rupees actually charged across paid purchases. */
  revenue: number;
  /** paidBuyers / reachedCheckout, 0–100, one decimal. */
  conversionPct: number;
  /** Last [days] days, oldest first, IST calendar days. */
  daily: { date: string; opens: number; started: number; paid: number }[];
  /** People who got some way in but have not paid on this code. */
  leads: ReferralLead[];
}

/** YYYY-MM-DD in India time, the calendar the team works in. */
export function istDay(ms: number): string {
  return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Pure aggregation — no I/O, so it is unit-tested directly. [now] is passed in
 * for the same reason.
 */
export function computeReferralStats(
  attempts: AttemptLike[],
  events: EventLike[],
  now: number,
  days = 30,
): ReferralStats {
  const opens = events.filter((e) => e.type === "open").length;
  const viewers = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "checkout_view" || !e.uid) continue;
    viewers.set(e.uid, Math.max(viewers.get(e.uid) ?? 0, e.atMs));
  }

  const statusOf = (a: AttemptLike): "paid" | "failed" | "abandoned" | "pending" => {
    if (a.status === "paid") return "paid";
    if (a.status === "failed") return "failed";
    return now - a.createdAtMs > ABANDON_AFTER_MS ? "abandoned" : "pending";
  };

  let paidOrders = 0, failedOrders = 0, abandonedOrders = 0, pendingOrders = 0, revenue = 0;
  const started = new Set<string>();
  const paid = new Set<string>();
  for (const a of attempts) {
    started.add(a.userId);
    const s = statusOf(a);
    if (s === "paid") {
      paidOrders++;
      revenue += Number(a.amount) || 0;
      paid.add(a.userId);
    } else if (s === "failed") failedOrders++;
    else if (s === "abandoned") abandonedOrders++;
    else pendingOrders++;
  }

  // Leads: the latest unpaid attempt of everyone who never paid on this code,
  // then signed-in viewers who never even started a payment.
  const latestUnpaid = new Map<string, AttemptLike>();
  for (const a of attempts) {
    if (paid.has(a.userId)) continue;
    const cur = latestUnpaid.get(a.userId);
    if (!cur || a.createdAtMs > cur.createdAtMs) latestUnpaid.set(a.userId, a);
  }
  const leads: ReferralLead[] = Array.from(latestUnpaid.values()).map((a) => ({
    userId: a.userId,
    name: a.userName,
    phone: a.userPhone,
    status: statusOf(a) as LeadStatus,
    amount: Number(a.amount) || 0,
    seatCount: a.seatCount,
    durationMonths: a.durationMonths,
    lastAt: new Date(a.createdAtMs).toISOString(),
  }));
  viewers.forEach((at, uid) => {
    if (started.has(uid)) return;
    leads.push({
      userId: uid, name: null, phone: null, status: "viewed",
      amount: null, seatCount: null, durationMonths: null,
      lastAt: new Date(at).toISOString(),
    });
  });
  leads.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

  // Daily series over the last [days] IST days.
  const series = new Map<string, { opens: number; started: number; paid: number }>();
  for (let i = days - 1; i >= 0; i--) {
    series.set(istDay(now - i * 86400000), { opens: 0, started: 0, paid: 0 });
  }
  for (const e of events) {
    if (e.type !== "open") continue;
    const row = series.get(istDay(e.atMs));
    if (row) row.opens++;
  }
  for (const a of attempts) {
    const row = series.get(istDay(a.createdAtMs));
    if (!row) continue;
    row.started++;
    if (a.status === "paid") row.paid++;
  }

  const reached = new Set<string>();
  viewers.forEach((_, uid) => reached.add(uid));
  started.forEach((uid) => reached.add(uid));
  const reachedCheckout = reached.size;
  return {
    opens,
    reachedCheckout,
    startedBuyers: started.size,
    paidBuyers: paid.size,
    paidOrders,
    failedOrders,
    abandonedOrders,
    pendingOrders,
    revenue,
    conversionPct: reachedCheckout ? Math.round((paid.size / reachedCheckout) * 1000) / 10 : 0,
    daily: Array.from(series.entries()).map(([date, v]) => ({ date, ...v })),
    leads,
  };
}

const toMs = (v: unknown): number => {
  const t = v as { toMillis?: () => number; toDate?: () => Date } | null | undefined;
  if (t && typeof t.toMillis === "function") return t.toMillis();
  if (t && typeof t.toDate === "function") return t.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  const n = Date.parse(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Loads one code's attempts and events and aggregates them. Leads are then
 * filled in with name/phone for signed-in viewers who never started a payment
 * (attempts already carry the buyer's name and phone, written server-side).
 */
export async function loadReferralStats(code: string, days = 30): Promise<ReferralStats> {
  const db = getAdminDb();
  const [attemptSnap, eventSnap] = await Promise.all([
    db.collection("paymentAttempts").where("referralCode", "==", code).get(),
    db.collection("referralEvents").where("code", "==", code).get(),
  ]);

  const attempts: AttemptLike[] = attemptSnap.docs
    .map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter((d) => d.kind === "subscription")
    .map((d) => ({
      id: String(d.id),
      status: String(d.status ?? "created"),
      amount: Number(d.amount) || 0,
      userId: String(d.userId ?? d.userPhone ?? d.id),
      userName: d.userName ? String(d.userName) : null,
      userPhone: d.userPhone ? String(d.userPhone) : null,
      seatCount: typeof d.seatCount === "number" ? d.seatCount : null,
      durationMonths: typeof d.durationMonths === "number" ? d.durationMonths : null,
      createdAtMs: toMs(d.createdAt),
    }));

  const events: EventLike[] = eventSnap.docs.map((d) => {
    const e = d.data();
    return { type: String(e.type ?? ""), uid: e.uid ? String(e.uid) : null, atMs: toMs(e.at) };
  });

  const stats = computeReferralStats(attempts, events, Date.now(), days);

  // Name + phone for "viewed but never started" leads (up to 50).
  const needs = stats.leads.filter((l) => l.status === "viewed").slice(0, 50);
  await Promise.all(
    needs.map(async (lead) => {
      try {
        const idx = await db.collection("uidIndex").doc(lead.userId).get();
        const phone = idx.exists ? String(idx.data()?.phone ?? "") : "";
        const user = await db.collection("users").doc(phone || lead.userId).get();
        const u = user.data() ?? {};
        lead.phone = phone || (u.phone ? String(u.phone) : null);
        lead.name =
          (u.businessName && String(u.businessName)) ||
          (u.name && String(u.name)) ||
          null;
      } catch {
        /* leave the lead anonymous */
      }
    }),
  );
  return stats;
}
