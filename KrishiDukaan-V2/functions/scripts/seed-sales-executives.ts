/**
 * One-time migration: grant the `salesExecutive` role to every existing field-team
 * account, so tightening the Firestore rules (which now gate the shared `dealers`
 * master + sales writes on isSalesExec()) does NOT lock out current sales execs.
 *
 * Why this is needed:
 *   The sales portal (/sales) previously required only "any authenticated user."
 *   There was no provisioning path that stamped role:'salesExecutive' onto a user
 *   doc, so existing execs have no role (or no users doc at all). This script
 *   derives the real execs from their activity and back-fills the role.
 *
 * Who is treated as a real exec (union of):
 *   - daySessions.salesExecutiveId
 *   - dealerVisits.salesExecutiveId
 *   - dealers.createdBy
 *   Anyone with this activity is definitionally a real exec, so seeding them is
 *   correct and cannot lock out a legitimate user.
 *
 * Per exec (uid):
 *   - If users/{uid}.role is already 'admin' or 'salesExecutive' → leave untouched
 *     (never downgrade an admin).
 *   - Otherwise merge { uid, role:'salesExecutive', email, name, ... } into
 *     users/{uid} (email/name enriched from Firebase Auth when available).
 *
 * Usage (run from KrishiDukaan-V2/functions):
 *   # Auth: either `gcloud auth application-default login`, or set
 *   #   GOOGLE_APPLICATION_CREDENTIALS to a service-account key JSON for
 *   #   krishidukan-e8315.
 *   DRY_RUN=true  npx ts-node scripts/seed-sales-executives.ts   # preview only
 *   npx ts-node scripts/seed-sales-executives.ts                 # apply
 *
 * MUST be run BEFORE deploying the tightened firestore.rules.
 */

import "dotenv/config";
import * as admin from "firebase-admin";
import { getDb } from "../src/wa/firebase";

const DRY_RUN = process.env.DRY_RUN === "true";

function log(msg: string) { console.log(msg); }

async function collectExecUids(db: admin.firestore.Firestore): Promise<Set<string>> {
  const uids = new Set<string>();

  const sources: Array<{ collection: string; field: string }> = [
    { collection: "daySessions",  field: "salesExecutiveId" },
    { collection: "dealerVisits",  field: "salesExecutiveId" },
    { collection: "dealers",       field: "createdBy" },
  ];

  for (const { collection, field } of sources) {
    const snap = await db.collection(collection).get();
    let count = 0;
    for (const doc of snap.docs) {
      const uid = doc.get(field);
      if (typeof uid === "string" && uid.trim()) { uids.add(uid.trim()); count++; }
    }
    log(`  • ${collection}: scanned ${snap.size} docs, found ${count} ${field} refs`);
  }

  return uids;
}

async function main() {
  const db = getDb();
  const auth = admin.auth();

  log(`\n=== Seed salesExecutive role  ${DRY_RUN ? "(DRY-RUN — no writes)" : "(APPLYING)"} ===\n`);

  const uids = await collectExecUids(db);
  log(`\nDistinct exec UIDs discovered: ${uids.size}\n`);

  let granted = 0, skippedAdmin = 0, alreadyExec = 0, failed = 0;

  for (const uid of uids) {
    try {
      const ref = db.collection("users").doc(uid);
      const existing = await ref.get();
      const role = existing.exists ? existing.get("role") : undefined;

      if (role === "admin") {
        log(`  [skip]   ${uid} — already admin (not downgrading)`);
        skippedAdmin++;
        continue;
      }
      if (role === "salesExecutive") {
        log(`  [ok]     ${uid} — already salesExecutive`);
        alreadyExec++;
        continue;
      }

      // Enrich from Firebase Auth when possible (email-based execs).
      let email = "";
      let name  = existing.exists ? String(existing.get("name") ?? "") : "";
      try {
        const authUser = await auth.getUser(uid);
        email = authUser.email ?? "";
        name  = name || authUser.displayName || "";
      } catch {
        // Auth user may not exist (phone-only) — role still applies via users/{uid}.
      }

      if (DRY_RUN) {
        log(`  [would]  ${uid} — set role=salesExecutive${email ? ` (${email})` : ""}`);
        granted++;
        continue;
      }

      await ref.set(
        {
          uid,
          role: "salesExecutive",
          ...(email ? { email } : {}),
          ...(name ? { name } : {}),
          seededBy: "seed-sales-executives",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );
      log(`  [grant]  ${uid} — role=salesExecutive${email ? ` (${email})` : ""}`);
      granted++;
    } catch (e) {
      log(`  [FAIL]   ${uid} — ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  log(`\n=== Summary ===`);
  log(`  granted/would-grant : ${granted}`);
  log(`  already salesExec   : ${alreadyExec}`);
  log(`  skipped (admin)     : ${skippedAdmin}`);
  log(`  failed              : ${failed}`);
  log(DRY_RUN ? `\nDRY-RUN complete — re-run without DRY_RUN=true to apply.\n` : `\nDone.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
