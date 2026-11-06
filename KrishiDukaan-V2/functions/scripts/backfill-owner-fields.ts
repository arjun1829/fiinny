/**
 * One-time backfill for functions/src/marketplace/owner-fields.ts: applies the
 * same owner-field fixes to every existing product. New writes are handled by
 * the normalizeProductOwnerOnWrite trigger.
 *
 *   npx tsx scripts/backfill-owner-fields.ts --project krishidukan-e8315           # preview
 *   npx tsx scripts/backfill-owner-fields.ts --project krishidukan-e8315 --write   # apply
 *
 * --write also saves each product's previous values to
 * owner-fields-backup-<project>-<time>.json first.
 */
import * as admin from "firebase-admin";
import { writeFileSync } from "fs";
import { ownerFieldFixes, uidIndexLookup } from "../src/marketplace/owner-fields";

const args = process.argv.slice(2);
const project = args[args.indexOf("--project") + 1];
const write = args.includes("--write");
if (!project || args.indexOf("--project") < 0) {
  console.error("Usage: --project <id> [--write]");
  process.exit(1);
}

admin.initializeApp({ projectId: project });
const db = admin.firestore();

(async () => {
  console.log(`${write ? "Applying" : "Previewing (dry run)"} owner-field fixes for ${project}...`);
  const snap = await db.collection("products").get();
  const lookup = uidIndexLookup(db);
  const plan: { id: string; before: Record<string, unknown>; fixes: Record<string, unknown> }[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const fixes = await ownerFieldFixes(data, lookup);
    if (Object.keys(fixes).length === 0) continue;
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(fixes)) before[k] = data[k] ?? null;
    plan.push({ id: d.id, before, fixes });
  }

  const byField: Record<string, number> = {};
  for (const p of plan) for (const k of Object.keys(p.fixes)) byField[k] = (byField[k] ?? 0) + 1;
  console.table({ products: snap.size, needFixes: plan.length, ...byField });
  for (const p of plan.slice(0, 15)) console.log(" ", p.id, JSON.stringify(p.before), "->", JSON.stringify(p.fixes));

  if (!write) {
    console.log("Re-run with --write to apply.");
    return;
  }
  const backup = `owner-fields-backup-${project}-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify(plan, null, 2));
  console.log("Backup:", backup);
  for (let i = 0; i < plan.length; i += 400) {
    const batch = db.batch();
    for (const p of plan.slice(i, i + 400)) batch.update(db.collection("products").doc(p.id), p.fixes);
    await batch.commit();
  }
  console.log(`Updated ${plan.length} products.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
