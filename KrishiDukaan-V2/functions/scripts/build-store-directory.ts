/**
 * Builds storeDirectory/* once. Run after deploying the store directory
 * functions, before deploying the website and app that read it. Afterwards
 * the rebuildStoreDirectoryIfDirty job keeps it current.
 *
 *   gcloud auth application-default login
 *   cd functions
 *   npx tsx scripts/build-store-directory.ts --project krishidukan-e8315           # preview
 *   npx tsx scripts/build-store-directory.ts --project krishidukan-e8315 --write   # apply
 */
const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
const project = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
const write = args.includes("--write");

if (!project) {
  console.error("Usage: npx tsx scripts/build-store-directory.ts --project <project-id> [--write]");
  process.exit(1);
}
process.env.FIREBASE_PROJECT_ID = project;

async function main(): Promise<void> {
  // Imported after FIREBASE_PROJECT_ID is set: getDb() reads it on first use.
  const { getDb } = await import("../src/wa/firebase");
  const { rebuildStoreDirectory } = await import("../src/stores/directory");
  getDb();

  console.log(`${write ? "Writing" : "Previewing (dry run)"} the store directory for project ${project}...`);
  const report = await rebuildStoreDirectory({ dryRun: !write });
  console.table(report);
  if (!write) console.log("Re-run with --write to apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// A module, not a global script: keeps its names out of other scripts.
export {};
