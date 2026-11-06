/**
 * Builds productBuyStats/{productId} ("N people bought this in the last …")
 * from the last 90 days of orders. The rebuildProductBuyStats function does
 * the same every 6 hours; run this once after deploying it so product pages
 * show the line straight away. Safe to re-run: it only writes what changed.
 *
 *   gcloud auth application-default login
 *   cd functions
 *   npx tsx scripts/build-product-buy-stats.ts --project krishidukan-e8315           # preview
 *   npx tsx scripts/build-product-buy-stats.ts --project krishidukan-e8315 --write   # apply
 */
const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
const project = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
const write = args.includes("--write");

if (!project) {
  console.error("Usage: npx tsx scripts/build-product-buy-stats.ts --project <project-id> [--write]");
  process.exit(1);
}
process.env.FIREBASE_PROJECT_ID = project;

async function main(): Promise<void> {
  // Imported after FIREBASE_PROJECT_ID is set: getDb() reads it on first use.
  const { getDb } = await import("../src/wa/firebase");
  const { rebuildAllProductBuyStats } = await import("../src/stats/product-buy-stats");
  getDb();

  console.log(`${write ? "Writing" : "Previewing (dry run)"} product buy stats for project ${project}...`);
  const started = Date.now();
  const report = await rebuildAllProductBuyStats({ dryRun: !write });
  console.table(report);
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s.${write ? "" : " Re-run with --write to apply."}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// A module, not a global script: keeps its names out of other scripts.
export {};
