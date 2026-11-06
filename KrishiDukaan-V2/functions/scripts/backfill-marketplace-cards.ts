/**
 * Builds cardMembers/{productId} and marketplaceCards/{id} for every product.
 * Run once after deploying the card functions, before deploying the website
 * and app that read the cards. Safe to re-run: it only writes what changed.
 *
 *   gcloud auth application-default login
 *   cd functions
 *   npx tsx scripts/backfill-marketplace-cards.ts --project krishidukan-e8315           # preview
 *   npx tsx scripts/backfill-marketplace-cards.ts --project krishidukan-e8315 --write   # apply
 */
const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
const project = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
const write = args.includes("--write");

if (!project) {
  console.error("Usage: npx tsx scripts/backfill-marketplace-cards.ts --project <project-id> [--write]");
  process.exit(1);
}
process.env.FIREBASE_PROJECT_ID = project;

async function main(): Promise<void> {
  // Imported after FIREBASE_PROJECT_ID is set: getDb() reads it on first use.
  const { getDb } = await import("../src/wa/firebase");
  const { reconcileAllCards } = await import("../src/marketplace/cards");
  getDb();

  console.log(`${write ? "Writing" : "Previewing (dry run)"} marketplace cards for project ${project}...`);
  const started = Date.now();
  const report = await reconcileAllCards({ dryRun: !write });
  console.table(report);
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s.${write ? "" : " Re-run with --write to apply."}`);
  if (report.failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// A module, not a global script: keeps its names out of other scripts.
export {};
