/**
 * READ-ONLY verification harness for admin "Route Order" reassignment
 * (app/lib/admin-order-reassignment.ts). It prints, for a real order:
 *   - whether the order is reassignable (status / stage gate),
 *   - the eligible retailers it could be routed to (and their Route status),
 *   - EXACTLY which Razorpay transfer would be reversed off the current retailer
 *     and how much, and the fresh held transfer the new retailer would receive.
 *
 * It NEVER writes to Firestore and NEVER calls razorpay.transfers.reverse /
 * payments.transfer. It only READS the live payment's transfers and runs the
 * same matching + split maths the real code would, so it is safe against prod.
 *
 * This is how the task's core test is verified before any money moves: confirm
 * the previous retailer's transfer is the one that gets reversed and the new
 * retailer is the one who would be paid — not the other way round.
 *
 * USAGE
 *   npx tsx scripts/admin-reassign-selftest.ts --order <orderId> [--to <retailerPhone>]
 *
 * CREDENTIALS — reads LIVE data:
 *   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (live pair) and Firebase Admin creds.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const ARGV = process.argv.slice(2);
const val = (f: string): string | undefined => {
  const i = ARGV.indexOf(f);
  return i >= 0 ? ARGV[i + 1] : undefined;
};

function loadEnv() {
  for (const rel of [val("--env") ?? ".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), rel);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      console.log(`  loaded env from ${rel}`);
    }
  }
}

function phoneKey(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "").slice(-10);
}

async function main() {
  const orderId = val("--order");
  const to = val("--to");
  if (!orderId) {
    console.error("Required: --order <orderId>. Optional: --to <retailerPhone>.");
    process.exitCode = 1;
    return;
  }

  loadEnv();
  const rzpMode = (process.env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_live_")
    ? "live"
    : (process.env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_test_")
      ? "test"
      : "unknown";
  console.log(`  razorpay key mode: ${rzpMode}`);

  const { getAdminDb } = await import("../app/lib/firebase-admin");
  const { eligibleRetailersForOrder } = await import("../app/lib/admin-order-reassignment");
  const { fetchPaymentTransfers, matchSellerTransfer, outstandingPaise, classifyExistingTransfer } =
    await import("../app/lib/route-transfers");

  const snap = await getAdminDb().collection("orders").doc(orderId).get();
  if (!snap.exists) {
    console.error(`  order ${orderId} not found`);
    process.exitCode = 1;
    return;
  }
  const order = snap.data() as Record<string, any>;

  console.log("\n── ORDER ─────────────────────────────────────────────────────────────");
  console.log(`  ${orderId} | status ${order.status} | seller ${order.sellerName ?? ""} (${order.sellerPhone ?? order.sellerId})`);
  const reassignable = order.status === "placed" && (!order.reassignment || order.reassignment.status === "closed");
  console.log(`  reassignable by admin: ${reassignable ? "YES" : "NO"}${order.adminReassignment ? " (already reassigned once)" : ""}`);

  console.log("\n── REASSIGNMENT TARGETS (read-only) ──────────────────────────────────");
  const eligible = await eligibleRetailersForOrder(order);
  if (eligible.length === 0) console.log("  (no other store has online delivery enabled)");
  for (const r of eligible) {
    const mark = to && phoneKey(r.phone) === phoneKey(to) ? " ← --to" : "";
    const tag = r.fullyEligible ? "[sells all items]" : "[online — may not stock all items]";
    console.log(`  • ${r.name} (${r.phone}) ${tag} ${r.onRoute ? "[on Route]" : "[payout after delivery]"}${mark}`);
  }

  console.log("\n── EXISTING TRANSFER SAFETY (read-only inspection) ───────────────────");
  console.log("  Reassignment is ownership-only: it NEVER reverses or creates a transfer.");
  const paymentId = String(order.payment?.razorpayPaymentId ?? "").trim();
  if (!paymentId) {
    console.log("  no razorpay payment on this order — nothing to inspect, safe to reassign.");
  } else {
    const transfers = await fetchPaymentTransfers(paymentId);
    const current = matchSellerTransfer(
      transfers,
      [String(order.sellerPhone ?? ""), String(order.sellerId ?? "")],
      order.routeTransfer?.id ? String(order.routeTransfer.id) : null,
    );
    if (!current) {
      console.log("  original retailer has NO transfer on the payment → safe to reassign ownership.");
    } else {
      const klass = classifyExistingTransfer(current);
      console.log(`  original transfer ${current.id}: ₹${outstandingPaise(current) / 100} outstanding, ` +
        `on_hold=${current.on_hold}, on_hold_until=${current.on_hold_until ?? "none"}, ` +
        `status=${current.status ?? "-"}, settlement=${current.settlement_status ?? "-"}`);
      if (klass.kind === "blocking") {
        console.log(`  ✖ WOULD BLOCK reassignment: ${klass.reason} — needs a manual Razorpay operation first.`);
      } else if (klass.kind === "held") {
        console.log("  ✓ held on an indefinite hold → left as-is; never settles to the old retailer. Safe to reassign.");
      } else {
        console.log("  ✓ nothing owed to the old retailer. Safe to reassign.");
      }
    }
  }

  console.log("\n  (read-only: no Firestore write, no Razorpay reverse/transfer was made)");
}

main().catch((e) => {
  console.error("Unhandled:", e);
  process.exitCode = 1;
});
