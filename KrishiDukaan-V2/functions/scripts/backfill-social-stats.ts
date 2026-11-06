/**
 * Builds socialStats/{phone} (the per-seller Followers + Reel views/likes/
 * comments the Analytics "Audience" tiles read) from every reel and follow.
 * Run once after deploying rebuildSocialStats so sellers see numbers before the
 * first daily scheduled run; re-run any time to correct drift.
 *
 *   gcloud auth application-default login
 *   cd functions
 *   npx tsx scripts/backfill-social-stats.ts --project krishidukan-e8315           # preview
 *   npx tsx scripts/backfill-social-stats.ts --project krishidukan-e8315 --write   # apply
 *
 * Reads every reel and every follow once (same cost as one scheduled run).
 */
const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
const project = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
const write = args.includes("--write");

if (!project) {
  console.error("Usage: npx tsx scripts/backfill-social-stats.ts --project <project-id> [--write]");
  process.exit(1);
}
process.env.FIREBASE_PROJECT_ID = project;

async function main(): Promise<void> {
  // Imported after FIREBASE_PROJECT_ID is set: getDb() reads it on first use.
  const { getDb } = await import("../src/wa/firebase");
  const { rebuildSocialStatsOnce } = await import("../src/stats/social-stats");
  const db = getDb();

  const res = await rebuildSocialStatsOnce(db, { write });
  console.log(
    `${write ? "WROTE" : "PREVIEW"}: ${res.owners} socialStats docs from ${res.reels} reels + ${res.follows} follows`,
  );
  if (!write) console.log("Re-run with --write to apply.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
