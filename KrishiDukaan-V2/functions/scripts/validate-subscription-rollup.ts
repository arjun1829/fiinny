/**
 * READ-ONLY. Applies the real rollup contribution functions
 * (paymentRevenueContribution for revenue, subscriptionContribution for counts)
 * over every live payments + subscriptions doc and prints the totals the
 * backfill would write — so revenue can be reconciled against the payments
 * ledger before deploying. Writes NOTHING.
 *
 *   npx tsx scripts/validate-subscription-rollup.ts --project krishidukan-e8315
 */
const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
process.env.FIREBASE_PROJECT_ID = projectIdx >= 0 ? args[projectIdx + 1] : "krishidukan-e8315";

async function main(): Promise<void> {
  const { getDb } = await import("../src/wa/firebase");
  const stats = await import("../src/stats/platform-daily");
  const { addTo } = await import("../src/stats/increments");
  type Contribution = import("../src/stats/increments").Contribution;
  const db = getDb();

  const totals: Contribution = new Map();
  const add = (c: Contribution) => {
    for (const [, fields] of Array.from(c)) for (const [f, v] of Object.entries(fields)) addTo(totals, "ALL", f, v);
  };

  const paySnap = await db.collection("payments").get();
  for (const d of paySnap.docs) add(stats.paymentRevenueContribution(d.data()));

  // Renewal flag doesn't affect revenue/seat totals; pass false (promo is skipped anyway).
  const subSnap = await db.collection("subscriptions").get();
  for (const d of subSnap.docs) add(stats.subscriptionContribution(d.data(), false));

  const f = totals.get("ALL") ?? {};
  const g = (k: string) => Math.round((f[k] ?? 0) * 100) / 100;

  console.log("Rollup totals the backfill would write (summed across all days):\n");
  console.log(`  subs.revenuePaid    = ${g("subs.revenuePaid")}   (gateway, payments status=success)`);
  console.log(`  subs.revenueManual  = ${g("subs.revenueManual")}   (manual_admin + admin_granted)`);
  console.log(`  TOTAL revenue       = ${g("subs.revenuePaid") + g("subs.revenueManual")}`);
  console.log(`  subs.count          = ${g("subs.count")}   (genuine non-promo subscriptions)`);
  console.log(`  subs.seats          = ${g("subs.seats")}`);
  console.log(`  subs.renewals       = ${g("subs.renewals")}  (0 here: renewal flag not computed in this check)`);
  console.log(`  subs.promoCount     = ${g("subs.promoCount")}   (promotional grants — NOT revenue)`);
  console.log(`  subs.promoSeats     = ${g("subs.promoSeats")}`);

  // Independent cross-check straight off the payments ledger.
  let paid = 0, manual = 0;
  for (const d of paySnap.docs) {
    const p = d.data();
    const amt = Number(p.amount) || 0;
    if (p.status === "success") paid += amt;
    else if (p.status === "manual_admin" || p.status === "admin_granted") manual += amt;
  }
  console.log(`\nIndependent payments-ledger check: paid=${Math.round(paid)} manual=${Math.round(manual)} total=${Math.round(paid + manual)}`);
  const ok = Math.abs(paid - g("subs.revenuePaid")) < 1 && Math.abs(manual - g("subs.revenueManual")) < 1;
  console.log(ok ? "✓ revenue contribution matches the ledger" : "✗ MISMATCH — investigate");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
