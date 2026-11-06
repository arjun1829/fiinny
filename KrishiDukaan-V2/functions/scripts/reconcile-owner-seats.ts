/**
 * Recomputes every seller's users/{phone}.totalSeats / isPaid /
 * subscriptionStatus from their subscriptions (only plans running now
 * count). The daily expireSubscriptions run does the same; use this to fix
 * the backlog immediately after deploying, or to see how many are wrong.
 *
 *   gcloud auth application-default login
 *   cd functions
 *   npx tsx scripts/reconcile-owner-seats.ts --project krishidukan-e8315           # preview: how many would change
 *   npx tsx scripts/reconcile-owner-seats.ts --project krishidukan-e8315 --write   # apply
 */
const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
const project = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
const write = args.includes("--write");

if (!project) {
  console.error("Usage: npx tsx scripts/reconcile-owner-seats.ts --project <project-id> [--write]");
  process.exit(1);
}
process.env.FIREBASE_PROJECT_ID = project;

async function main(): Promise<void> {
  // Imported after FIREBASE_PROJECT_ID is set: getDb() reads it on first use.
  const { getDb } = await import("../src/wa/firebase");
  const { reconcileAllOwnerSeats } = await import("../src/subscriptions/owner-seats");
  getDb();

  console.log(`${write ? "Fixing" : "Checking (dry run)"} seller seats for project ${project}...`);
  const report = await reconcileAllOwnerSeats({ dryRun: !write });
  console.table({ ...report, [write ? "updated" : "wouldUpdate"]: report.updated });
  if (!write) console.log("Re-run with --write to apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// A module, not a global script: keeps its names out of other scripts.
export {};
