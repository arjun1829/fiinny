/**
 * Own products with no seat listing (or no inventory record) — what an app
 * build before 2026-11-07 left behind when a manufacturer added a product from
 * the app catalogue: the seat was never taken, so "Used" stayed at 0.
 *
 * For one seller, creates the missing `retailerSeatListings` (listingType own)
 * and `inventory` record for each own product, exactly as the web's
 * createManufacturerProduct writes them. Never takes more seats than the
 * seller's active subscriptions have free.
 *
 *   npx tsx scripts/backfill-own-seat-listings.ts --project krishidukan-e8315 --phone +91XXXXXXXXXX           # preview
 *   npx tsx scripts/backfill-own-seat-listings.ts --project krishidukan-e8315 --phone +91XXXXXXXXXX --write   # apply
 */
import * as admin from "firebase-admin";

const args = process.argv.slice(2);
const arg = (n: string) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : undefined);
const project = arg("--project");
const phone = arg("--phone");
const write = args.includes("--write");
if (!project || !phone || !/^\+91\d{10}$/.test(phone)) {
  console.error("Usage: --project <id> --phone +91XXXXXXXXXX [--write]");
  process.exit(1);
}
admin.initializeApp({ projectId: project });
const db = admin.firestore();
const ms = (v: any) => (v?.toMillis ? v.toMillis() : 0);

(async () => {
  const now = Date.now();
  const user = (await db.collection("users").doc(phone).get()).data() ?? {};
  const uidSnap = await db.collection("uidIndex").where("phone", "==", phone).limit(5).get();
  const uids = uidSnap.docs.map((d) => d.id);
  const owners = [phone, ...uids];

  const subs = (await Promise.all(owners.map((o) =>
    db.collection("subscriptions").where(o === phone ? "ownerPhone" : "ownerId", "==", o).get())))
    .flatMap((s) => s.docs).filter((d, i, a) => a.findIndex((x) => x.id === d.id) === i)
    .map((d) => d.data())
    .filter((s) => (s.subscriptionStatus ?? "active") === "active" && ms(s.expiryDate) > now);
  const purchased = subs.reduce((n, s) => n + (Number(s.seatsPurchased) || 0), 0);
  const expiry = subs.reduce<admin.firestore.Timestamp | null>((m, s) => (!m || ms(s.expiryDate) > ms(m) ? s.expiryDate : m), null);

  const listings = (await Promise.all([
    ...owners.map((o) => db.collection("retailerSeatListings").where("ownerId", "==", o).get()),
    db.collection("retailerSeatListings").where("ownerPhone", "==", phone).get(),
  ])).flatMap((s) => s.docs).filter((d, i, a) => a.findIndex((x) => x.id === d.id) === i);
  const active = listings.filter((d) => d.get("status") === "active" && ms(d.get("expiresAt")) > now);
  const seated = new Set(active.map((d) => d.get("productId")));

  const products = (await db.collection("products").where("ownerPhone", "==", phone).get()).docs
    .filter((d) => ["manufacturer_inventory", "retailer_inventory"].includes(String(d.get("source"))));
  const inv = await db.collection("inventory").where("ownerPhone", "==", phone).get();
  const hasInv = new Set(inv.docs.map((d) => d.get("productId")));

  let free = purchased - active.length;
  console.log(`${write ? "Applying" : "Preview"} for ..${phone.slice(-4)} (${user.role}): seats ${purchased}, used ${active.length}, free ${free}, own products ${products.length}`);
  const batch = db.batch();
  let seats = 0;
  let invs = 0;
  for (const p of products) {
    const d = p.data();
    const ownerType = d.source === "manufacturer_inventory" ? "manufacturer" : "retailer";
    const ownerId = String(d.ownerId ?? uids[0] ?? phone);
    const variants = Array.isArray(d.variants) ? d.variants : [];
    const qty = variants.reduce((n: number, v: any) => n + (Number.isFinite(Number(v.stock)) ? Number(v.stock) : 0), 0);
    const notes: string[] = [];
    if (!seated.has(p.id)) {
      if (free <= 0 || !expiry) notes.push("NO FREE SEAT, skipped");
      else {
        free--; seats++; notes.push("+ seat listing");
        const ref = db.collection("retailerSeatListings").doc();
        batch.set(ref, {
          id: ref.id, ownerId, ownerPhone: phone, ownerType,
          manufacturerId: ownerType === "manufacturer" ? ownerId : null,
          manufacturerPhone: ownerType === "manufacturer" ? phone : null,
          retailerDocId: ownerType === "retailer" ? phone : null,
          retailerId: ownerType === "retailer" ? ownerId : null,
          retailerPhone: ownerType === "retailer" ? phone : null,
          productId: p.id, manufacturerProductId: null, listingType: "own", status: "active",
          assignedAt: d.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: expiry, releasedAt: null, backfilled: "own-seat-2026-11-07",
        });
      }
    }
    if (!hasInv.has(p.id)) {
      invs++; notes.push(`+ inventory (stock ${qty})`);
      const ref = db.collection("inventory").doc();
      batch.set(ref, {
        id: ref.id, ownerId, ownerPhone: phone, ownerType,
        ...(ownerType === "manufacturer" ? { manufacturerId: ownerId, manufacturerPhone: phone } : { retailerId: ownerId, retailerPhone: phone }),
        productId: p.id, stockQuantity: qty, sellingPrice: Number(d.price ?? 0), reorderThreshold: 0,
        isAvailable: qty > 0, updatedAt: admin.firestore.FieldValue.serverTimestamp(), backfilled: "own-seat-2026-11-07",
      });
    }
    console.log(`  ${p.id}  ${String(d.name).padEnd(20)} ${notes.join(", ") || "ok"}`);
  }
  console.log(`Seat listings to add: ${seats}, inventory records to add: ${invs}. Used after: ${active.length + seats}/${purchased}`);
  if (!write) { console.log("Re-run with --write to apply."); return; }
  if (seats + invs > 0) await batch.commit();
  console.log("Done.");
})().catch((e) => { console.error(e); process.exit(1); });
