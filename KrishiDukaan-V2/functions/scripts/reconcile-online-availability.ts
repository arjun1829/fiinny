/**
 * Re-decides availability[].isOnline (copy online AND account Online Delivery
 * on, exactly as checkout) and ownerOnline on every canonical product.
 * Same code as the daily reconcileOnlineAvailability function.
 *
 *   npx tsx scripts/reconcile-online-availability.ts --project krishidukan-e8315           # preview
 *   npx tsx scripts/reconcile-online-availability.ts --project krishidukan-e8315 --write   # apply
 *
 * --write first saves every product's availability to a local backup file.
 */
import * as admin from "firebase-admin";
import { writeFileSync } from "fs";

const args = process.argv.slice(2);
const project = args[args.indexOf("--project") + 1];
const write = args.includes("--write");
if (!project || args.indexOf("--project") < 0) {
  console.error("Usage: --project <id> [--write]");
  process.exit(1);
}
admin.initializeApp({ projectId: project });

(async () => {
  const { reconcileAllOnlineAvailability } = await import("../src/marketplace/online-eligibility");
  if (write) {
    const snap = await admin.firestore().collection("products").select("availability", "ownerOnline").get();
    const backup = snap.docs.filter((d) => Array.isArray(d.get("availability")) && d.get("availability").length)
      .map((d) => ({ id: d.id, availability: d.get("availability"), ownerOnline: d.get("ownerOnline") ?? null }));
    const file = `online-availability-backup-${project}-${Date.now()}.json`;
    writeFileSync(file, JSON.stringify(backup));
    console.log("Backup:", file, backup.length, "products");
  }
  const names = new Map<string, string>();
  const r = await reconcileAllOnlineAvailability({ dryRun: !write });
  for (const [id] of r.top) names.set(id, String((await admin.firestore().collection("products").doc(id).get()).get("name")));
  console.log(`${write ? "Applied" : "Preview"}: products checked ${r.checked}, products changed ${r.products}, entries → offline ${r.toOff}, → online ${r.toOn}`);
  for (const [id, n] of r.top) console.log(`  ${names.get(id)} (${id}): ${n}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
