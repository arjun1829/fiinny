/**
 * One-time migration: finds all active retailer product copies whose price
 * differs from the manufacturer's canonical product and updates them.
 *
 * Usage:
 *   DRY_RUN=true npx ts-node scripts/repair-product-prices.ts
 *   npx ts-node scripts/repair-product-prices.ts
 *
 * Skips retailer copies with hasCustomPrice:true.
 */

import "dotenv/config";
import * as admin from "firebase-admin";
import { getDb } from "../src/wa/firebase";

const DRY_RUN = process.env.DRY_RUN === "true";

function log(msg: string) { console.log(msg); }

async function main() {
  const db = getDb();

  log(`\n${"═".repeat(64)}`);
  log(`  Retailer price repair`);
  log(`  Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  log(`${"═".repeat(64)}\n`);

  // Find all active assigned seat listings — each has a retailerProductId + manufacturerProductId
  const listingsSnap = await db
    .collection("retailerSeatListings")
    .where("listingType", "==", "assigned")
    .where("status", "==", "active")
    .get();

  log(`Found ${listingsSnap.size} active assigned listing(s)\n`);

  // Group by manufacturerProductId so we fetch each canonical product once
  const byMfrProduct = new Map<string, { copyId: string; listingId: string }[]>();
  for (const doc of listingsSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const mfrId = String(d.manufacturerProductId ?? "");
    const copyId = String(d.productId ?? "");
    if (!mfrId || !copyId) continue;
    const existing = byMfrProduct.get(mfrId) ?? [];
    existing.push({ copyId, listingId: doc.id });
    byMfrProduct.set(mfrId, existing);
  }

  log(`Unique manufacturer products: ${byMfrProduct.size}\n`);

  let totalStale = 0;
  let totalFixed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [mfrProductId, copies] of Array.from(byMfrProduct.entries())) {
    const mfrSnap = await db.collection("products").doc(mfrProductId).get();
    if (!mfrSnap.exists) {
      log(`⚠️  Manufacturer product ${mfrProductId} not found — skipping ${copies.length} copies`);
      continue;
    }

    const mfr = mfrSnap.data() as Record<string, unknown>;
    const canonicalPrice = Number(mfr.price ?? 0);
    const canonicalVariants = Array.isArray(mfr.variants) ? mfr.variants : [];
    const productName = String(mfr.name ?? mfrProductId);

    log(`─── ${productName} (${mfrProductId})`);
    log(`    Canonical price: ₹${canonicalPrice}  variants: ${canonicalVariants.length}`);

    const batch = db.batch();
    let batchCount = 0;

    for (const { copyId } of copies) {
      const copySnap = await db.collection("products").doc(copyId).get();
      if (!copySnap.exists) {
        log(`    ⚠️  Copy ${copyId} not found`);
        continue;
      }

      const copy = copySnap.data() as Record<string, unknown>;

      if (copy.hasCustomPrice === true) {
        log(`    ⏭  ${copyId} — hasCustomPrice:true, skipping`);
        totalSkipped++;
        continue;
      }

      const copyPrice = Number(copy.price ?? 0);
      const copyVariants = Array.isArray(copy.variants) ? copy.variants : [];
      const priceMatch = copyPrice === canonicalPrice;
      const variantsMatch =
        JSON.stringify(copyVariants.map((v: Record<string, unknown>) => ({ unit: v.unit, price: v.price }))) ===
        JSON.stringify(canonicalVariants.map((v: Record<string, unknown>) => ({ unit: v.unit, price: v.price })));

      if (priceMatch && variantsMatch) {
        log(`    ✅  ${copyId} — price matches (₹${copyPrice})`);
        continue;
      }

      totalStale++;
      log(`    ❌  ${copyId} — stale: ₹${copyPrice} → ₹${canonicalPrice}`);

      if (!DRY_RUN) {
        batch.update(db.collection("products").doc(copyId), {
          price: canonicalPrice,
          variants: canonicalVariants,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batchCount++;
        totalFixed++;
      }
    }

    if (!DRY_RUN && batchCount > 0) {
      try {
        await batch.commit();
        log(`    ✅  Committed ${batchCount} fix(es)`);
      } catch (err) {
        log(`    ❌  Batch failed: ${err instanceof Error ? err.message : String(err)}`);
        totalErrors++;
      }
    }

    log("");
  }

  log(`${"═".repeat(64)}`);
  log(`  Stale copies found : ${totalStale}`);
  log(`  Fixed              : ${totalFixed}`);
  log(`  Skipped (custom)   : ${totalSkipped}`);
  log(`  Errors             : ${totalErrors}`);
  log(`${"═".repeat(64)}\n`);

  if (DRY_RUN && totalStale > 0) {
    log("  Run without DRY_RUN=true to apply fixes.\n");
  }
}

main().catch((err) => {
  console.error("[repair-product-prices] Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
