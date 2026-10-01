import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";

/**
 * GET /api/admin/route-payouts
 *
 * Admin visibility into the AUTOMATIC Route payout system — separate from
 * /admin/payouts, which shows the older payoutAccounts/{phone} KYC-review flow.
 *
 * WHY THIS EXISTS
 * ----------------
 * A seller onboarded onto Route lives at retailers/{phone} or
 * manufacturers/{phone} (razorpayAccountId, routeStatus — see
 * app/lib/route-server.ts), with NO bank details ever stored in Firestore.
 * /admin/payouts has no way to show any of that; it queries a different
 * collection entirely, built for a different workflow. Before this route, a
 * seller could be fully wired into Route — a real linked account, a real held
 * transfer sitting in Razorpay — and admin would see nothing at all.
 *
 * WHY A LIVE RAZORPAY CALL PER ORDER, NOT JUST FIRESTORE
 * --------------------------------------------------------
 * A transfer only ever gets written back onto the order doc (routeRelease)
 * AFTER delivery, by functions/src/route-release.ts. Before that — the exact
 * window where "is this actually held and correct?" matters most — Firestore
 * knows nothing about it. Razorpay is the only source of truth for a transfer
 * that has not been released yet, so this fetches it live.
 *
 * SCOPED, NOT PAGINATED. Onboarded-seller count and per-seller order volume
 * are both tiny right now (lazy onboarding — see onboard-seller/route.ts).
 * ORDERS_PER_SELLER bounds the fan-out if that changes before this does.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const SELLER_COLLECTIONS = ["retailers", "manufacturers"] as const;
const ORDERS_PER_SELLER = 25;

type AdminAuthResult =
  | { ok: true; uid: string; response?: undefined }
  | { ok: false; uid?: undefined; response: NextResponse };

async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
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
  let isAdmin = byUid.exists && byUid.data()?.role === "admin";
  if (!isAdmin && idx.exists) {
    const phone = idx.data()?.phone;
    if (phone) {
      const byPhone = await db.collection("users").doc(String(phone)).get();
      isAdmin = byPhone.exists && byPhone.data()?.role === "admin";
    }
  }
  if (!isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, uid };
}

type RazorpayTransfer = {
  id: string;
  amount: number;
  on_hold: boolean;
  on_hold_until: number | null;
  status: string;
  recipient: string;
  notes?: Record<string, string>;
};

type OrderRow = {
  orderId: string;
  status: string;
  createdAt: string | null;
  customerName: string;
  total: number;
  transfer: {
    id: string;
    amountPaise: number;
    state: "held" | "scheduled" | "released" | "not_routed" | "no_payment";
    releaseAt: string | null;
  };
};

type SellerRow = {
  phone: string;
  collection: (typeof SELLER_COLLECTIONS)[number];
  businessName: string;
  razorpayAccountId: string;
  routeStatus: string;
  orders: OrderRow[];
};

/** Every transfer Razorpay has recorded against one captured payment. */
async function fetchTransfers(paymentId: string): Promise<RazorpayTransfer[]> {
  try {
    const res = (await razorpay.payments.fetchTransfer(paymentId)) as {
      items?: RazorpayTransfer[];
    };
    return res.items ?? [];
  } catch {
    // A payment with no transfers yet (or one that predates Route) 404s here
    // depending on SDK version; either way, "no transfer" is the right read.
    return [];
  }
}

function classify(
  t: RazorpayTransfer | undefined,
  hadPayment: boolean,
): OrderRow["transfer"] {
  if (!t) {
    return {
      id: "",
      amountPaise: 0,
      state: hadPayment ? "not_routed" : "no_payment",
      releaseAt: null,
    };
  }
  if (t.on_hold && t.on_hold_until) {
    return {
      id: t.id,
      amountPaise: t.amount,
      state: "scheduled",
      releaseAt: new Date(t.on_hold_until * 1000).toISOString(),
    };
  }
  if (t.on_hold) {
    return { id: t.id, amountPaise: t.amount, state: "held", releaseAt: null };
  }
  return { id: t.id, amountPaise: t.amount, state: "released", releaseAt: null };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const db = getAdminDb();

    // Full-collection scans, filtered in memory. Both collections run in the
    // low hundreds today (see onboard-seller/route.ts) and this runs on an
    // admin page load, not per-request traffic — a targeted query would save
    // reads at a scale this does not yet have.
    const sellers: SellerRow[] = [];
    for (const collection of SELLER_COLLECTIONS) {
      const snap = await db.collection(collection).get();
      for (const doc of snap.docs) {
        const d = doc.data();
        const accountId = d.razorpayAccountId;
        if (!accountId) continue;
        sellers.push({
          phone: doc.id,
          collection,
          businessName: String(d.businessName ?? d.shopName ?? d.storeName ?? d.name ?? doc.id),
          razorpayAccountId: String(accountId),
          routeStatus: String(d.routeStatus ?? "unknown"),
          orders: [],
        });
      }
    }

    // Per seller: their recent orders, each resolved against Razorpay's own
    // transfer record rather than assumed from the order doc alone.
    await Promise.all(
      sellers.map(async (seller) => {
        const ordersSnap = await db
          .collection("orders")
          .where("sellerPhone", "==", seller.phone)
          .orderBy("createdAt", "desc")
          .limit(ORDERS_PER_SELLER)
          .get();

        seller.orders = await Promise.all(
          ordersSnap.docs.map(async (doc) => {
            const o = doc.data();
            const paymentId = String(o.payment?.razorpayPaymentId ?? "").trim();
            const transfers = paymentId ? await fetchTransfers(paymentId) : [];
            const match =
              transfers.find((t) => t.notes?.sellerKey === seller.phone) ??
              (transfers.length === 1 ? transfers[0] : undefined);

            return {
              orderId: doc.id,
              status: String(o.status ?? ""),
              createdAt: o.createdAt?.toDate?.()?.toISOString() ?? null,
              customerName: String(o.customerName ?? ""),
              total: Number(o.total ?? o.subtotal ?? 0),
              transfer: classify(match, Boolean(paymentId)),
            } satisfies OrderRow;
          }),
        );
      }),
    );

    return NextResponse.json({ sellers });
  } catch (error) {
    console.error("[route-payouts] failed:", error);
    return NextResponse.json({ error: "Could not load Route payout data" }, { status: 500 });
  }
}
