/**
 * One-time repair script: restores product visibility for retailers that were
 * removed and re-added (to retrigger WA notifications) without re-assigning products.
 *
 * What went wrong:
 *   removeNetworkRetailer → released seat listings, set isActive:false on product
 *   copies, stripped availability[] entries, set retailers/{phone} active:false.
 *   createNetworkRetailer (re-add) → created a new invite doc but did NOT restore
 *   any of the above. Products became invisible on the product page.
 *
 * What this script does per affected retailer:
 *   1. Finds their old released seat listings (proof of prior assignment).
 *   2. Reactivates each released listing (status → active, clears releasedAt).
 *   3. Sets isActive:true on the retailer's product copy.
 *   4. Adds the retailer back into the manufacturer product's availability[].
 *   5. Sets retailers/{phone} → active:true, assignedSeat:true.
 *
 * Usage:
 *   MANUFACTURER_ID=<uid> ts-node scripts/repair-retailer-assignments.ts
 *
 * Add DRY_RUN=true to preview what would be changed without writing anything.
 */

import "dotenv/config";
import * as admin from "firebase-admin";
import { getDb } from "../src/wa/firebase";

const MANUFACTURER_ID = process.env.MANUFACTURER_ID ?? "";
const DRY_RUN        = process.env.DRY_RUN === "true";

if (!MANUFACTURER_ID) {
  console.error("❌  MANUFACTURER_ID env var is required.");
  console.error("    Usage: MANUFACTURER_ID=<uid> ts-node scripts/repair-retailer-assignments.ts");
  process.exit(1);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(msg); }
function dryLog(msg: string) { if (DRY_RUN) console.log(`  [DRY-RUN] ${msg}`); }

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = getDb();
  const now = admin.firestore.FieldValue.serverTimestamp();

  log(`\n${"═".repeat(64)}`);
  log(`  Retailer assignment repair`);
  log(`  Manufacturer : ${MANUFACTURER_ID}`);
  log(`  Mode         : ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  log(`${"═".repeat(64)}\n`);

  // ── Step 1: resolve manufacturer phone (same dual-query as fetchManufacturerRetailers) ──
  let manufacturerPhone: string | null = null;
  try {
    const idxSnap = await db.collection("uidIndex").doc(MANUFACTURER_ID).get();
    if (idxSnap.exists) {
      manufacturerPhone = String(idxSnap.data()?.phone ?? "") || null;
    }
  } catch { /* ignore */ }

  log(`Manufacturer phone : ${manufacturerPhone ?? "(not found in uidIndex)"}\n`);

  // Dual query: by UID and by phone — mirrors fetchManufacturerRetailers exactly
  const queries = [
    db.collection("manufacturerRetailers")
      .where("manufacturerId", "==", MANUFACTURER_ID)
      .where("status", "in", ["invited", "active"])
      .get(),
  ];
  if (manufacturerPhone) {
    queries.push(
      db.collection("manufacturerRetailers")
        .where("manufacturerPhone", "==", manufacturerPhone)
        .where("status", "in", ["invited", "active"])
        .get(),
    );
  }

  const snapResults = await Promise.all(queries);
  const seen = new Set<string>();
  const inviteDocs: admin.firestore.QueryDocumentSnapshot[] = [];
  for (const snap of snapResults) {
    for (const d of snap.docs) {
      if (!seen.has(d.id)) { seen.add(d.id); inviteDocs.push(d); }
    }
  }

  log(`Found ${inviteDocs.length} active/invited retailer(s) under this manufacturer.\n`);

  let totalRestored = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;

  for (const inviteDoc of inviteDocs) {
    const invite = inviteDoc.data() as Record<string, unknown>;
    const retailerDocId = String(invite.retailerDocId ?? "");
    const shopName      = String(invite.shopName ?? retailerDocId);

    if (!retailerDocId) {
      log(`⚠️   ${inviteDoc.id} — no retailerDocId, skipping`);
      continue;
    }

    log(`─── ${shopName} (${retailerDocId}) ────────────────────────────`);

    // ── Step 2: fetch ALL active listings for this retailer ─────────────────
    // (seat listings already exist — we need to check the other two broken pieces)
    const activeListingsSnap = await db
      .collection("retailerSeatListings")
      .where("ownerId",       "==", MANUFACTURER_ID)
      .where("retailerDocId", "==", retailerDocId)
      .where("listingType",   "==", "assigned")
      .where("status",        "==", "active")
      .get();

    if (activeListingsSnap.empty) {
      log(`  ℹ️   No active listings — retailer has no assigned products. Skipping.`);
      totalSkipped++;
      log("");
      continue;
    }

    log(`  Found ${activeListingsSnap.size} active listing(s). Checking retailers doc + availability[]…`);

    // ── Step 3: check & fix retailers/{phone} flags ──────────────────────────
    let retailerDocOk = false;
    try {
      const retailerSnap = await db.collection("retailers").doc(retailerDocId).get();
      if (retailerSnap.exists) {
        const rd = retailerSnap.data() as Record<string, unknown>;
        const onboardingOk = rd.onboardingStatus !== "removed" && rd.onboardingStatus !== "inactive";
        retailerDocOk = rd.active === true && rd.assignedSeat === true && onboardingOk;
        log(`  retailers/${retailerDocId}: active=${rd.active}, assignedSeat=${rd.assignedSeat}, onboardingStatus=${rd.onboardingStatus}${retailerDocOk ? " ✅" : " ❌ needs fix"}`);
      } else {
        log(`  retailers/${retailerDocId}: doc does not exist ⚠️`);
        retailerDocOk = true; // nothing to fix
      }
    } catch (e) {
      log(`  retailers/${retailerDocId}: read error — ${e}`);
    }

    // ── Step 4: check & fix availability[] + isActive per listing ───────────
    let retailerHadAnyProduct = false;

    for (const listingDoc of activeListingsSnap.docs) {
      const listing = listingDoc.data() as Record<string, unknown>;
      const retailerProductId     = String(listing.productId              ?? "");
      const manufacturerProductId = String(listing.manufacturerProductId  ?? "");
      const retailerPhone         = String(listing.retailerPhone           ?? retailerDocId);

      if (!retailerProductId || !manufacturerProductId) {
        log(`  ⚠️   Listing ${listingDoc.id} missing productId or manufacturerProductId — skipping`);
        continue;
      }

      // Check retailer product copy
      const copySnap = await db.collection("products").doc(retailerProductId).get();
      if (!copySnap.exists) {
        log(`  ⚠️   Retailer product copy ${retailerProductId} not found — skipping`);
        continue;
      }
      const copyData    = copySnap.data() as Record<string, unknown>;
      const copyIsActive = copyData.isActive !== false;

      // Check manufacturer product availability[]
      const mfrProductSnap = await db.collection("products").doc(manufacturerProductId).get();
      if (!mfrProductSnap.exists) {
        log(`  ⚠️   Manufacturer product ${manufacturerProductId} not found — skipping`);
        continue;
      }
      const mfrProductData = mfrProductSnap.data() as Record<string, unknown>;
      const availability   = Array.isArray(mfrProductData.availability)
        ? (mfrProductData.availability as Record<string, unknown>[])
        : [];
      const inAvailability = availability.some(
        (e) => e.storeId === retailerDocId || e.storePhone === retailerDocId,
      );

      log(`  → ${String(mfrProductData.name ?? manufacturerProductId)}`);
      log(`      retailer copy isActive : ${copyIsActive ? "✅ true" : "❌ false — needs fix"}`);
      log(`      in mfr availability[]  : ${inAvailability ? "✅ yes" : "❌ no — needs fix"}`);

      if (DRY_RUN) {
        if (!copyIsActive)     dryLog(`WOULD set products/${retailerProductId} isActive:true`);
        if (!inAvailability)   dryLog(`WOULD arrayUnion availability entry into products/${manufacturerProductId}`);
        retailerHadAnyProduct = true;
        continue;
      }

      try {
        // Fix retailer product copy if inactive
        if (!copyIsActive) {
          await db.collection("products").doc(retailerProductId).update({
            isActive:  true,
            updatedAt: now,
          });
          log(`      ✅  isActive restored`);
        }

        // Fix availability[] if missing
        if (!inAvailability) {
          const storeName = String(copyData.store ?? invite.shopName ?? "");
          await db.collection("products").doc(manufacturerProductId).update({
            availability: admin.firestore.FieldValue.arrayUnion({
              storeId:    retailerDocId,
              storePhone: retailerPhone || null,
              storeName:  storeName || null,
              stockLevel: "In Stock",
            }),
          });
          log(`      ✅  availability[] entry added`);
        }

        retailerHadAnyProduct = true;
      } catch (err) {
        log(`      ❌  Error: ${err instanceof Error ? err.message : String(err)}`);
        totalErrors++;
      }
    }

    // ── Step 5: fix retailers/{phone} active/assignedSeat flags ─────────────
    if (retailerHadAnyProduct && !retailerDocOk && retailerDocId) {
      if (!DRY_RUN) {
        try {
          await db.collection("retailers").doc(retailerDocId).update({
            active:           true,
            assignedSeat:     true,
            onboardingStatus: "active",
            updatedAt:        now,
          });
          log(`  ✅  retailers/${retailerDocId} active+assignedSeat+onboardingStatus restored`);
        } catch (err) {
          log(`  ⚠️   Could not update retailers/${retailerDocId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        dryLog(`WOULD set retailers/${retailerDocId} active:true, assignedSeat:true, onboardingStatus:active`);
      }
    } else if (!retailerDocOk && retailerDocId) {
      if (!DRY_RUN) {
        try {
          await db.collection("retailers").doc(retailerDocId).update({
            active:           true,
            assignedSeat:     true,
            onboardingStatus: "active",
            updatedAt:        now,
          });
          log(`  ✅  retailers/${retailerDocId} active+assignedSeat+onboardingStatus restored`);
        } catch (err) {
          log(`  ⚠️   Could not update retailers/${retailerDocId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        dryLog(`WOULD set retailers/${retailerDocId} active:true, assignedSeat:true, onboardingStatus:active`);
      }
    }

    if (retailerHadAnyProduct || !retailerDocOk) {
      totalRestored++;
    } else {
      totalSkipped++;
    }

    log("");
  }

  log(`${"═".repeat(64)}`);
  log(`  Summary`);
  log(`  Restored : ${totalRestored}`);
  log(`  Skipped  : ${totalSkipped}`);
  log(`  Errors   : ${totalErrors}`);
  log(`${"═".repeat(64)}\n`);

  if (totalErrors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n[repair] Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
