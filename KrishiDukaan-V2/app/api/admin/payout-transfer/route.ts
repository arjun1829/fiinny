import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import {
  computeSellerEarnings,
  PAYOUT_HOLD_DAYS,
  type OrderLike,
} from "../../../dashboard/_lib/seller-earnings";
import {
  fetchPaymentTransfers,
  matchSellerTransfer,
  outstandingPaise,
} from "../../../lib/route-transfers";

/**
 * Releases due seller earnings as Razorpay Route transfers.
 *
 * WHY BALANCE TRANSFERS, NOT PAYMENT-LINKED ONES
 * Route can transfer against a specific payment (POST /payments/:id/transfers)
 * or from the platform's balance (POST /transfers). Payouts here are held for
 * PAYOUT_HOLD_DAYS after delivery, by which time the original payment has
 * already settled out of the Razorpay balance to our bank — verified against
 * the live account, where settlements process within a couple of days. A
 * payment-linked transfer would have nothing left to draw on, so this uses
 * balance transfers.
 *
 * SAFETY
 * - dryRun defaults to TRUE. Moving money must be an explicit, deliberate
 *   request; an accidental or mistyped call previews instead of paying.
 * - Idempotent: an order that already carries payment.transferId is skipped,
 *   so a retry after a partial failure cannot pay the same order twice.
 * - Each seller is transferred independently and failures are collected, so
 *   one bad linked account doesn't block every other seller's payout.
 * - Requires the seller's payout account to be status 'verified' AND carry a
 *   linked account id — an unverified seller is never paid.
 *
 * Gated by settings/payouts.transfersEnabled so this can be switched off
 * without a redeploy if Razorpay Route access changes.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

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
  if (!isAdmin) return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, uid };
}

/** Every identity form an order might store for one seller. Orders are keyed
 *  inconsistently across platforms (phone on mobile, uid on web), so a payout
 *  keyed on only one of them would silently miss orders. */
function sellerKeyOf(order: FirebaseFirestore.DocumentData): string | null {
  const phone = String(order.sellerPhone ?? "").trim();
  if (phone) return phone;
  const id = String(order.sellerId ?? "").trim();
  return id || null;
}

/**
 * Current state of the payouts kill-switch.
 *
 * Exposed through this route because settings/* is `allow write: if false` for
 * clients (firestore.rules) — the flag can only be read and set server-side,
 * so the admin UI has no way to manage it directly.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const snap = await getAdminDb().collection("settings").doc("payouts").get();
    return NextResponse.json({
      transfersEnabled: snap.data()?.transfersEnabled === true,
      holdDays: PAYOUT_HOLD_DAYS,
      updatedAt: snap.data()?.updatedAt ?? null,
      updatedBy: snap.data()?.updatedBy ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Could not read payout settings" }, { status: 500 });
  }
}

/** Turns live transfers on or off. Recorded with who changed it and when,
 *  because enabling this is what lets real money leave the account. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { transfersEnabled } = (await req.json()) as { transfersEnabled?: boolean };
    if (typeof transfersEnabled !== "boolean") {
      return NextResponse.json({ error: "transfersEnabled must be true or false" }, { status: 400 });
    }
    await getAdminDb().collection("settings").doc("payouts").set(
      {
        transfersEnabled,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.uid,
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true, transfersEnabled });
  } catch {
    return NextResponse.json({ error: "Could not update payout settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const db = getAdminDb();

  try {
    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      sellerPhone?: string;
    };
    // Default TRUE: only an explicit dryRun:false moves money.
    const dryRun = body.dryRun !== false;

    if (!dryRun) {
      const flag = await db.collection("settings").doc("payouts").get();
      if (flag.data()?.transfersEnabled !== true) {
        return NextResponse.json(
          {
            error:
              "Transfers are disabled. Set settings/payouts.transfersEnabled = true to enable them.",
          },
          { status: 409 },
        );
      }
    }

    // ── Collect payable orders ───────────────────────────────────────────
    // Delivered orders only; the hold is applied per order below.
    const ordersSnap = await db
      .collection("orders")
      .where("status", "==", "delivered")
      .get();

    const bySeller = new Map<string, { id: string; data: FirebaseFirestore.DocumentData }[]>();
    for (const doc of ordersSnap.docs) {
      const data = doc.data();
      if (data.payment?.transferId) continue; // already paid out
      const key = sellerKeyOf(data);
      if (!key) continue;
      if (body.sellerPhone && key !== body.sellerPhone) continue;
      const list = bySeller.get(key) ?? [];
      list.push({ id: doc.id, data });
      bySeller.set(key, list);
    }

    const results: {
      seller: string;
      orders: string[];
      amount: number;
      status: "transferred" | "skipped" | "failed" | "preview";
      reason?: string;
      transferId?: string;
    }[] = [];

    for (const [seller, orders] of Array.from(bySeller.entries())) {
      // Only orders whose hold has elapsed are payable right now.
      const summary = computeSellerEarnings(
        orders.map((o) => ({ id: o.id, ...(o.data as object) }) as OrderLike),
      );
      const candidateRows = summary.rows.filter((r) => r.state === "due");
      if (candidateRows.length === 0) continue;

      // An order whose payment already carries a live Route transfer to this
      // seller is paid by Razorpay itself (checkout's held transfer, released
      // on delivery by functions/src/route-release.ts, or the one written when
      // an order is reassigned). Paying it again here was a real double-pay:
      // this run only skipped payment.transferId, which Route transfers never
      // set. Asked of Razorpay per order, not inferred from Firestore fields.
      const dueRows: typeof candidateRows = [];
      const routeManaged: string[] = [];
      for (const row of candidateRows) {
        const data = orders.find((o) => o.id === row.orderId)?.data;
        const paymentId = String(data?.payment?.razorpayPaymentId ?? "").trim();
        if (!paymentId) {
          dueRows.push(row);
          continue;
        }
        try {
          const transfers = await fetchPaymentTransfers(paymentId);
          const t = matchSellerTransfer(
            transfers,
            [seller, String(data?.sellerPhone ?? ""), String(data?.sellerId ?? "")],
            data?.routeTransfer?.id ? String(data.routeTransfer.id) : null,
          );
          if (t && outstandingPaise(t) > 0) routeManaged.push(row.orderId);
          else dueRows.push(row);
        } catch (e) {
          // Unknown Route state is not a reason to pay: skipping only delays
          // this order to the next run, paying could pay it twice.
          results.push({
            seller,
            orders: [row.orderId],
            amount: 0,
            status: "skipped",
            reason:
              "Could not check Route transfers: " + (e instanceof Error ? e.message : String(e)),
          });
        }
      }
      if (routeManaged.length > 0) {
        results.push({
          seller,
          orders: routeManaged,
          amount: 0,
          status: "skipped",
          reason: "Paid by a Razorpay Route transfer on the payment",
        });
      }
      if (dueRows.length === 0) continue;

      const amount = Math.round(dueRows.reduce((sum, r) => sum + r.net, 0) * 100) / 100;
      const orderIds = dueRows.map((r) => r.orderId);
      if (amount <= 0) {
        results.push({ seller, orders: orderIds, amount, status: "skipped", reason: "Nothing payable" });
        continue;
      }

      const payoutSnap = await db.collection("payoutAccounts").doc(seller).get();
      const payout = payoutSnap.data();
      if (!payoutSnap.exists || payout?.status !== "verified") {
        results.push({
          seller,
          orders: orderIds,
          amount,
          status: "skipped",
          reason: "Payout account not verified",
        });
        continue;
      }
      const linkedAccount = String(payout?.razorpayLinkedAccountId ?? "");
      if (!/^acc_[A-Za-z0-9]{14}$/.test(linkedAccount)) {
        results.push({
          seller,
          orders: orderIds,
          amount,
          status: "skipped",
          reason: "No valid Razorpay linked account id",
        });
        continue;
      }

      if (dryRun) {
        results.push({ seller, orders: orderIds, amount, status: "preview" });
        continue;
      }

      try {
        const transfer = (await razorpay.transfers.create({
          account: linkedAccount,
          amount: Math.round(amount * 100), // paise
          currency: "INR",
          notes: {
            sellerKey: seller,
            orderCount: String(orderIds.length),
            // Recorded so a transfer can be traced back to exactly which
            // orders it settled, which reconciliation and any future reversal
            // both need.
            orderIds: orderIds.join(","),
          },
        } as never)) as { id: string };

        // Stamp every order this transfer covered. Batched so a partial write
        // can't leave some orders looking unpaid and payable again.
        const batch = db.batch();
        const transferredAt = new Date().toISOString();
        for (const orderId of orderIds) {
          batch.update(db.collection("orders").doc(orderId), {
            "payment.transferId": transfer.id,
            "payment.transferredAt": transferredAt,
          });
        }
        await batch.commit();

        results.push({
          seller,
          orders: orderIds,
          amount,
          status: "transferred",
          transferId: transfer.id,
        });
      } catch (e) {
        // Collected, not thrown: one seller's bad linked account must not
        // block payouts for everyone else in the run.
        results.push({
          seller,
          orders: orderIds,
          amount,
          status: "failed",
          reason: e instanceof Error ? e.message : "Transfer failed",
        });
      }
    }

    const totals = results.reduce(
      (acc, r) => {
        if (r.status === "transferred") { acc.transferred += r.amount; acc.transferredCount += 1; }
        if (r.status === "preview") { acc.payable += r.amount; acc.payableCount += 1; }
        if (r.status === "failed") acc.failedCount += 1;
        if (r.status === "skipped") acc.skippedCount += 1;
        return acc;
      },
      { transferred: 0, transferredCount: 0, payable: 0, payableCount: 0, failedCount: 0, skippedCount: 0 },
    );

    return NextResponse.json({ dryRun, holdDays: PAYOUT_HOLD_DAYS, totals, results });
  } catch (error) {
    console.error("[payout-transfer] failed:", error);
    return NextResponse.json({ error: "Payout run failed" }, { status: 500 });
  }
}
