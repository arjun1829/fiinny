import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { AggregateField, FieldValue, type Query } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { fetchPaymentTransfers, matchSellerTransfer, outstandingPaise } from "../../../lib/route-transfers";

/**
 * /api/admin/route-payouts: admin view of seller money in Razorpay Route.
 *
 * GET  → totals per payout state, onboarded sellers, and a page of transfers.
 * POST → { action: "release", orderId }: release a delivered order's held
 *        transfer (one that the delivery trigger never released, e.g. it was
 *        delivered while settings/route.releaseEnabled was off).
 *
 * WHERE THE STATUS COMES FROM
 * orders/{id}.payout, which functions/src/payouts/payout-status.ts keeps in
 * step with Razorpay (transfer status, settlement status, hold, settlement
 * id). This page used to call Razorpay once per order on every load (25
 * orders per seller); now it reads Firestore, and counts and sums come from
 * aggregation queries rather than reading every order.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const SELLER_COLLECTIONS = ["retailers", "manufacturers"] as const;
const PAGE = 50;
const PAYOUT_STATES = ["on_hold", "scheduled", "processing", "settled", "failed", "reversed", "not_routed"] as const;

type AdminAuthResult =
  | { ok: true; uid: string; role: "admin" | "team"; response?: undefined }
  | { ok: false; uid?: undefined; role?: undefined; response: NextResponse };

/**
 * Admins can do everything here; team members granted "routePayouts" can
 * look (GET) but not move money or change settings.
 */
async function requireAdmin(req: NextRequest, opts: { allowTeam?: boolean } = {}): Promise<AdminAuthResult> {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization token" }, { status: 401 }) };
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid authorization token" }, { status: 401 }) };
  }

  const db = getAdminDb();
  const [byUid, idx] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("uidIndex").doc(uid).get(),
  ]);
  let profile = byUid.exists ? byUid.data() : undefined;
  if (profile?.role !== "admin" && idx.exists) {
    const phone = idx.data()?.phone;
    if (phone) {
      const byPhone = await db.collection("users").doc(String(phone)).get();
      if (byPhone.exists && (byPhone.data()?.role === "admin" || !profile)) profile = byPhone.data();
    }
  }
  if (profile?.role === "admin") return { ok: true, uid, role: "admin" };
  const sections = Array.isArray(profile?.adminSections) ? profile.adminSections : [];
  if (opts.allowTeam && profile?.role === "team" && sections.includes("routePayouts")) {
    return { ok: true, uid, role: "team" };
  }
  return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

const ms = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | null | undefined;
  if (t && typeof t.toMillis === "function") return t.toMillis();
  return typeof v === "number" && v > 0 ? v : null;
};

type TransferRow = {
  orderId: string;
  createdAt: number | null;
  orderStatus: string;
  sellerName: string;
  sellerPhone: string;
  via: string;
  transferId: string | null;
  account: string | null;
  amount: number;
  reversed: number;
  transferStatus: string | null;
  settlementStatus: string | null;
  state: string;
  onHoldUntil: number | null;
  settlementId: string | null;
  settledAt: number | null;
  checkedAt: number | null;
  error: string | null;
  /** When the seller marked it delivered (last "delivered" in the history). */
  deliveredAt: number | null;
  /** When Razorpay processed the transfer. */
  processedAt: number | null;
  /** When it settled to the seller's bank (Razorpay's time, else when we saw it). */
  settlementAt: number | null;
  /** Bank reference of the settlement. */
  utr: string | null;
  /** The order fields the payment timeline reads (app/lib/payout-timeline.ts). */
  timeline: Record<string, unknown>;
};

function deliveredAtOf(o: FirebaseFirestore.DocumentData): number | null {
  const h = Array.isArray(o.statusHistory) ? o.statusHistory : [];
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i]?.status !== "delivered") continue;
    const at = h[i].at;
    const t = ms(at) ?? (typeof at === "string" ? Date.parse(at) : NaN);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** The Transfers table as CSV, for reconciling with the bank statement. */
function toCsv(rows: TransferRow[]): string {
  const day = (v: number | null) =>
    v ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const cols: [string, (r: TransferRow) => unknown][] = [
    ["Order ID", (r) => r.orderId],
    ["Seller", (r) => r.sellerName],
    ["Seller phone", (r) => r.sellerPhone],
    ["Order date", (r) => day(r.createdAt)],
    ["Delivery date", (r) => day(r.deliveredAt)],
    ["Transfer ID", (r) => r.transferId],
    ["Paid via", (r) => (r.via === "balance" ? "Payout run" : r.transferId ? "Route" : "")],
    ["Seller account", (r) => r.account],
    ["Amount (INR)", (r) => (r.transferId ? r.amount.toFixed(2) : "")],
    ["Reversed (INR)", (r) => (r.reversed ? r.reversed.toFixed(2) : "")],
    ["Transfer status", (r) => r.transferStatus],
    ["Payment processed date", (r) => day(r.processedAt)],
    ["Settlement status", (r) => r.settlementStatus],
    ["Release scheduled", (r) => (r.state === "scheduled" ? day(r.onHoldUntil) : "")],
    ["Settled date", (r) => day(r.settlementAt)],
    ["Settlement ID", (r) => r.settlementId],
    ["UTR", (r) => r.utr],
    ["State", (r) => r.state],
  ];
  const cell = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols.map(([h]) => h).join(","), ...rows.map((r) => cols.map(([, f]) => cell(f(r))).join(","))].join("\n");
}

function rowOf(doc: FirebaseFirestore.DocumentSnapshot): TransferRow {
  const o = doc.data() ?? {};
  const p = (o.payout ?? {}) as Record<string, unknown>;
  return {
    orderId: doc.id,
    createdAt: ms(o.createdAt),
    orderStatus: String(o.status ?? ""),
    sellerName: String(o.sellerName ?? o.storeName ?? o.shopName ?? ""),
    sellerPhone: String(o.sellerPhone ?? ""),
    via: String(p.via ?? ""),
    transferId: (p.transferId as string) ?? null,
    account: (p.account as string) ?? null,
    amount: Number(p.amount ?? 0) || 0,
    reversed: Number(p.reversed ?? 0) || 0,
    transferStatus: (p.transferStatus as string) ?? null,
    settlementStatus: (p.settlementStatus as string) ?? null,
    state: String(p.state ?? "checking"),
    onHoldUntil: ms(p.onHoldUntil),
    settlementId: (p.settlementId as string) ?? null,
    settledAt: ms(p.settledAt),
    checkedAt: ms(p.checkedAt),
    error: (p.error as string) ?? null,
    deliveredAt: deliveredAtOf(o),
    processedAt: ms(p.processedAt),
    settlementAt: ms(p.settlementAt) ?? ms(p.settledAt),
    utr: (p.utr as string) ?? null,
    timeline: {
      createdAt: ms(o.createdAt),
      status: o.status ?? null,
      total: o.total ?? o.grandTotal ?? null,
      statusHistory: (Array.isArray(o.statusHistory) ? o.statusHistory : [])
        .filter((h: { status?: string }) => ["delivered", "rejected", "cancelled", "refunded"].includes(String(h?.status)))
        .map((h: { status?: string; at?: unknown }) => ({ status: h.status, at: ms(h.at) ?? h.at ?? null })),
      payment: {
        status: o.payment?.status ?? null,
        amount: o.payment?.amount ?? null,
        paidAt: ms(o.payment?.paidAt) ?? o.payment?.paidAt ?? null,
        razorpayPaymentId: o.payment?.razorpayPaymentId ?? null,
        razorpayOrderId: o.payment?.razorpayOrderId ?? null,
        transferId: o.payment?.transferId ?? null,
        transferredAt: ms(o.payment?.transferredAt) ?? o.payment?.transferredAt ?? null,
        refundedAmount: o.payment?.refundedAmount ?? null,
        refundedAt: ms(o.payment?.refundedAt) ?? o.payment?.refundedAt ?? null,
        payoutError: o.payment?.payoutError ?? null,
        payoutClaimed: Boolean(o.payment?.payoutClaim),
        payoutVia: o.payment?.payoutVia ?? null,
      },
      routeRelease: o.routeRelease
        ? { status: o.routeRelease.status ?? null, releaseAt: ms(o.routeRelease.releaseAt), recordedAt: ms(o.routeRelease.recordedAt ?? o.routeRelease.scheduledAt) }
        : null,
      payout: { ...p, settledAt: ms(p.settledAt), checkedAt: ms(p.checkedAt) },
    },
  };
}

/** Orders matching a search: order id, trf_/pay_/order_ id, or seller phone. */
async function searchOrders(q: string): Promise<FirebaseFirestore.DocumentSnapshot[]> {
  const orders = getAdminDb().collection("orders");
  const term = q.trim();
  if (/^trf_[A-Za-z0-9]+$/.test(term)) {
    const [a, b] = await Promise.all([
      orders.where("payout.transferId", "==", term).limit(50).get(),
      orders.where("payment.transferId", "==", term).limit(50).get(),
    ]);
    const byId = new Map([...a.docs, ...b.docs].map((d) => [d.id, d]));
    return Array.from(byId.values());
  }
  if (/^pay_[A-Za-z0-9]+$/.test(term)) return (await orders.where("payment.razorpayPaymentId", "==", term).limit(50).get()).docs;
  if (/^order_[A-Za-z0-9]+$/.test(term)) return (await orders.where("payment.razorpayOrderId", "==", term).limit(50).get()).docs;
  const digits = term.replace(/\D/g, "");
  if (digits.length >= 10 && /^[+\d\s-]+$/.test(term)) {
    const ten = digits.slice(-10);
    const snap = await orders.where("sellerPhone", "in", [`+91${ten}`, ten, `91${ten}`]).limit(200).get();
    return snap.docs
      .filter((d) => d.get("payment.razorpayPaymentId") || d.get("payment.transferId"))
      .sort((a, b) => (ms(b.get("createdAt")) ?? 0) - (ms(a.get("createdAt")) ?? 0))
      .slice(0, 100);
  }
  if (/^[A-Za-z0-9_-]{1,120}$/.test(term.replace(/^#/, ""))) {
    const d = await orders.doc(term.replace(/^#/, "")).get();
    return d.exists ? [d] : [];
  }
  return [];
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, { allowTeam: true });
  if (!auth.ok) return auth.response;

  try {
    const db = getAdminDb();
    const orders = db.collection("orders");
    const params = req.nextUrl.searchParams;
    const filter = params.get("state") ?? "all";
    const cursor = params.get("cursor");
    const search = (params.get("q") ?? "").trim();
    const asCsv = params.get("format") === "csv";

    // Totals per state: one count+sum query each.
    const summaryP = Promise.all(
      [...PAYOUT_STATES.map((s) => ({ key: s as string, q: orders.where("payout.state", "==", s) as Query })),
        // Delivered but still held: money a release never reached.
        { key: "needs_action", q: orders.where("payout.state", "==", "on_hold").where("status", "==", "delivered") as Query },
      ].map(async ({ key, q }) => {
        const agg = await q.aggregate({ count: AggregateField.count(), amount: AggregateField.sum("payout.amount") }).get();
        return [key, { count: agg.data().count, amount: Math.round((Number(agg.data().amount) || 0) * 100) / 100 }] as const;
      }),
    ).then((pairs) => Object.fromEntries(pairs));

    let q: Query =
      filter === "needs_action"
        ? orders.where("payout.state", "==", "on_hold").where("status", "==", "delivered")
        : (PAYOUT_STATES as readonly string[]).includes(filter)
          ? orders.where("payout.state", "==", filter)
          : orders.where("payout.state", "in", [...PAYOUT_STATES]);
    q = q.orderBy("createdAt", "desc").limit(asCsv ? 5000 : PAGE);
    if (cursor && /^[A-Za-z0-9_-]{1,120}$/.test(cursor)) {
      const after = await orders.doc(cursor).get();
      if (after.exists) q = q.startAfter(after);
    }

    const sellersP = (async () => {
      const rows: { phone: string; collection: string; businessName: string; razorpayAccountId: string; routeStatus: string }[] = [];
      for (const collection of SELLER_COLLECTIONS) {
        // Only sellers with a Route account (a filter on the field, not a scan).
        const snap = await db.collection(collection).where("razorpayAccountId", ">", "").get();
        for (const doc of snap.docs) {
          const d = doc.data();
          rows.push({
            phone: doc.id,
            collection,
            businessName: String(d.businessName ?? d.shopName ?? d.storeName ?? d.name ?? doc.id),
            razorpayAccountId: String(d.razorpayAccountId),
            routeStatus: String(d.routeStatus ?? "unknown"),
          });
        }
      }
      return rows;
    })();

    const settingsP = db.collection("settings").doc("route").get().then((d) => ({
      // Same defaults as functions/src/route-release.ts and app/lib/route-split.ts.
      releaseEnabled: d.exists && d.data()?.releaseEnabled === true,
      holdTransfers: !d.exists || d.data()?.holdTransfers !== false,
    }));
    const [summary, page, sellers, settings] = await Promise.all([
      summaryP,
      search ? searchOrders(search).then((docs) => ({ docs, size: 0 })) : q.get(),
      sellersP,
      settingsP,
    ]);
    const transfers = page.docs.map(rowOf);
    if (asCsv) {
      // Excel opens UTF-8 CSV correctly with a byte-order mark (₹, Hindi names).
      return new NextResponse("\uFEFF" + toCsv(transfers), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="seller-transfers-${filter}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }
    return NextResponse.json({
      summary,
      sellers,
      settings,
      canEdit: auth.role === "admin",
      transfers,
      nextCursor: !search && page.size === PAGE ? page.docs[page.docs.length - 1].id : null,
    });
  } catch (error) {
    console.error("[route-payouts] failed:", error);
    return NextResponse.json({ error: "Could not load Route payout data" }, { status: 500 });
  }
}

/**
 * Release a delivered order's held Route transfer now. Checks with Razorpay
 * first (never from our own fields alone): the transfer must be this seller's,
 * still on hold, and not reversed. Razorpay then settles it to the seller by
 * the next working day.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  let body: { action?: string; orderId?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.action === "setReleaseEnabled") {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Expected { enabled: boolean }" }, { status: 400 });
    }
    // Read per delivery by functions/src/route-release.ts; no redeploy needed.
    await getAdminDb().collection("settings").doc("route").set(
      { releaseEnabled: body.enabled, releaseEnabledUpdatedAt: FieldValue.serverTimestamp(), releaseEnabledUpdatedBy: auth.uid },
      { merge: true },
    );
    return NextResponse.json({ ok: true, releaseEnabled: body.enabled });
  }
  if (body.action !== "release" || !body.orderId || !/^[A-Za-z0-9_-]{1,120}$/.test(body.orderId)) {
    return NextResponse.json({ error: "Expected { action: 'release', orderId }" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("orders").doc(body.orderId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const o = snap.data()!;

  if (o.status !== "delivered") {
    return NextResponse.json({ error: "Only a delivered order's money can be released." }, { status: 409 });
  }
  if (o.payment?.transferId) {
    return NextResponse.json({ error: "This order was paid by the payout run, not a Route transfer." }, { status: 409 });
  }
  const paymentId = String(o.payment?.razorpayPaymentId ?? "").trim();
  if (!paymentId) return NextResponse.json({ error: "No online payment on this order." }, { status: 409 });

  try {
    const transfers = await fetchPaymentTransfers(paymentId);
    const preferred = String(o.routeTransfer?.id ?? o.routeRelease?.transferId ?? "").trim() || null;
    const match = matchSellerTransfer(transfers, [o.sellerPhone, o.sellerId], preferred);
    if (!match) return NextResponse.json({ error: "No Route transfer for this seller on the payment." }, { status: 409 });
    if (outstandingPaise(match) <= 0) return NextResponse.json({ error: "That transfer has been reversed." }, { status: 409 });
    if (!match.on_hold) {
      await ref.set({ payout: { nextCheckAt: 0 } }, { merge: true });
      return NextResponse.json({ ok: true, alreadyReleased: true, transferId: match.id });
    }

    await razorpay.transfers.edit(match.id, { on_hold: 0 });

    await ref.set(
      {
        routeRelease: {
          transferId: match.id,
          amount: match.amount,
          status: "released_by_admin",
          releasedBy: auth.uid,
          recordedAt: FieldValue.serverTimestamp(),
        },
        payout: { nextCheckAt: 0 },
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true, transferId: match.id });
  } catch (error) {
    console.error("[route-payouts] release failed:", error);
    const message = (error as { error?: { description?: string } })?.error?.description ?? "Razorpay refused the release.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
