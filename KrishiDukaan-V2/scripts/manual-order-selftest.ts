/**
 * READ-ONLY verification harness for the admin "Create order manually" feature
 * (app/lib/manual-order.ts). It prices a proposed order and verifies a payment
 * against Razorpay + Firestore, printing every blocker/warning. It NEVER writes:
 * it does not call createManualOrder, so it is safe to run against prod.
 *
 * It exercises the exact code the admin API routes call, so the test scenarios
 * from the task map onto inputs you give it:
 *
 *   1. Successful payment, no existing order   → pick a captured pay_… with no order
 *      and matching items → verification ok:true.
 *   2. Payment already linked to an order       → same payment after an order exists
 *      → blocker "already linked".
 *   3. Failed / uncaptured payment              → a non-captured pay_… → blocker
 *      "status … not captured".
 *   4. Payment amount mismatch                  → items whose total ≠ the captured
 *      amount → blocker with the exact rupee difference.
 *   5. Payment for a different customer         → --customer a uid ≠ the Razorpay
 *      order's notes.userId → blocker "different customer".
 *   6. Product of a different retailer          → a productId not in --seller's
 *      catalogue → priced from canonical/none (priceSource shows it); pick the
 *      correct retailer to avoid.
 *   7. Duplicate submit                         → createManualOrder keys the order
 *      deterministically (man_<razorpayOrderId>) and creates only if absent, so a
 *      re-run returns the existing order — verify in the UI / Orders page.
 *
 * USAGE
 *   npx tsx scripts/manual-order-selftest.ts \
 *     --seller +919370505272 --customer <uid> \
 *     --payment pay_XXXXXXXX \
 *     --item <productId>:2:"1 L" [--item <productId>:1] [--state Kerala]
 *
 * CREDENTIALS — acts on LIVE data (.env.local does not carry prod):
 *   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (live pair) and Firebase Admin creds.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const ARGV = process.argv.slice(2);
const val = (f: string): string | undefined => {
  const i = ARGV.indexOf(f);
  return i >= 0 ? ARGV[i + 1] : undefined;
};
const all = (f: string): string[] => ARGV.flatMap((a, i) => (a === f ? [ARGV[i + 1]] : []));

function loadEnv() {
  for (const rel of [val('--env') ?? '.env.local', '.env']) {
    const p = path.resolve(process.cwd(), rel);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      console.log(`  loaded env from ${rel}`);
    }
  }
}

function parseItem(raw: string): { productId: string; qty: number; variantUnit?: string } {
  // productId:qty:variantUnit  (qty and variant optional)
  const [productId, qtyStr, ...rest] = raw.split(':');
  return {
    productId,
    qty: Math.max(1, Math.floor(Number(qtyStr) || 1)),
    variantUnit: rest.length ? rest.join(':') : undefined,
  };
}

async function main() {
  const seller = val('--seller');
  const customer = val('--customer');
  const payment = val('--payment');
  const state = val('--state') ?? null;
  const items = all('--item').map(parseItem);

  if (!seller || !payment || items.length === 0) {
    console.error('Required: --seller <phone> --payment <pay_…> --item <productId[:qty[:variant]]> (repeatable). Optional: --customer <uid> --state <state>.');
    process.exitCode = 1;
    return;
  }

  loadEnv();
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
  console.log(`  firebase project: ${projectId}`);
  const rzpMode = (process.env.RAZORPAY_KEY_ID ?? '').startsWith('rzp_live_') ? 'live'
    : (process.env.RAZORPAY_KEY_ID ?? '').startsWith('rzp_test_') ? 'test' : 'unknown';
  console.log(`  razorpay key mode: ${rzpMode}`);

  const { priceManualOrder, verifyPaymentForManualOrder } = await import('../app/lib/manual-order');

  console.log('\n── PRICING (read-only) ───────────────────────────────────────────────');
  const pricing = await priceManualOrder(seller, items, state);
  for (const l of pricing.lines) {
    console.log(`  • ${l.name} [${l.priceSource}] ${l.qty} × ${l.variantUnit ?? '-'} @ ₹${l.unitPrice}` +
      `${l.gstApplicable ? ` (GST ${l.gstRate}%)` : ''} = ₹${l.lineTotal}`);
  }
  console.log(`  subtotal ₹${pricing.subtotal} | GST added ₹${pricing.totalGstAdded} | delivery ₹${pricing.deliveryCharge}` +
    ` (${pricing.deliveryType}${pricing.deliveryBreakdown.free ? ', free' : ''})`);
  console.log(`  GRAND TOTAL ₹${pricing.grandTotal}`);

  console.log('\n── PAYMENT VERIFICATION (read-only) ──────────────────────────────────');
  const v = await verifyPaymentForManualOrder({
    razorpayPaymentId: payment,
    customerId: customer ?? null,
    expectedTotalRupees: pricing.grandTotal,
  });
  console.log(`  payment ${v.razorpayPaymentId} | status ${v.status} | ₹${v.amountRupees} | rzpOrder ${v.razorpayOrderId}`);
  console.log(`  notes.userId ${v.notesUserId ?? '(none)'} | existing orders [${v.existingOrderIds.join(', ')}]` +
    `${v.isOwnManualOrder ? ' (own manual order)' : ''}`);
  v.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  v.blocking.forEach((b) => console.log(`  ✖ BLOCK: ${b}`));
  console.log(`\n  RESULT: ${v.ok ? 'OK — this payment can back the order' : 'BLOCKED — cannot create'}`);
  console.log('  (read-only: no order was written)');
}

main().catch((e) => {
  console.error('Unhandled:', e);
  process.exitCode = 1;
});
