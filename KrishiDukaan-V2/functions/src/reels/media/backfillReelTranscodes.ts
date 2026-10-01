/**
 * Re-runs the reel optimizer over reels that predate it.
 *
 * WHY THIS EXISTS
 * ---------------
 * transcodeReel is a Storage trigger: it fires when a reel is uploaded and has
 * never touched anything uploaded before it shipped. Those reels are still the
 * raw originals — 75–150MB 1080p clips with the moov atom at the end of the
 * file — and most of them have no poster frame. Google Search Console reports
 * them as "Video not processed" and "No thumbnail URL provided", and they are
 * also the slowest videos in the feed for real users.
 *
 * HOW IT WORKS: A NUDGE, NOT A SECOND ENCODER
 * -------------------------------------------
 * This function does NOT re-implement the encode. Copying a Storage object onto
 * itself writes a new generation, which emits the same OBJECT_FINALIZE event an
 * upload does, so transcodeReel picks it up and does the work exactly as it
 * would for a fresh upload. A second copy of that ffmpeg pipeline would be a
 * second thing to keep in step with the first, and the two would drift.
 *
 * HOW AN UNPROCESSED REEL IS IDENTIFIED
 * -------------------------------------
 * transcodeReel deletes the source once it has written video_optimized.mp4, so
 * the mere existence of reels/{id}/video.mp4 means that reel was never
 * processed. No marker field, no migration flag, and nothing to keep in sync:
 * the storage layout already answers the question.
 *
 * SAFETY
 * ------
 * - Admin only, and dryRun is the DEFAULT. Call it once to see the list, then
 *   again with dryRun:false to act on it.
 * - Hard batch ceiling. Every nudge starts a 2 CPU / 2GiB encode that can run
 *   for minutes, and Cloud Functions will happily scale out to run hundreds at
 *   once — which is a large bill arriving as a surprise. Small batches, run
 *   repeatedly, keep the cost observable.
 * - Idempotent. A reel whose optimized file already exists is skipped, so a
 *   repeated run cannot re-encode what is already done.
 */
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

const SOURCE_NAME = "video.mp4";
const OUTPUT_NAME = "video_optimized.mp4";

/**
 * Most reels this can nudge in one call, and the default when none is asked
 * for. Deliberately small: the point is a job someone watches, not one that
 * empties the backlog in a single unattended run.
 */
const MAX_BATCH = 50;
const DEFAULT_BATCH = 10;

/** Mirrors the isAdmin() rule: an admin doc sits at users/{uid} or users/{phone}. */
export async function callerIsAdmin(uid: string, tokenPhone?: string): Promise<boolean> {
  const db = admin.firestore();

  const direct = await db.doc(`users/${uid}`).get();
  if (direct.exists && String(direct.data()?.role ?? "") === "admin") return true;

  const digits = String(tokenPhone ?? "").replace(/\D/g, "");
  if (!digits) return false;

  for (const key of [`+${digits}`, digits]) {
    const snap = await db.doc(`users/${key}`).get();
    if (snap.exists && String(snap.data()?.role ?? "") === "admin") return true;
  }
  return false;
}

interface BackfillReport {
  dryRun: boolean;
  /** Reels still holding an un-transcoded source. */
  pending: number;
  /** Reels nudged on this run (0 when dryRun). */
  nudged: string[];
  /** Sources left behind by a transcode whose cleanup failed — already optimized. */
  orphanedSources: string[];
  /** Storage folders whose reel document is gone. Nothing to do but tidy up. */
  missingDocs: string[];
  /**
   * Reels with no poster that this cannot fix: their source is already gone, so
   * there is nothing left to generate a frame from. These need a poster from
   * the optimized file, which is a separate job.
   */
  posterlessWithoutSource: string[];
  remainingAfterThisRun: number;
}

export const backfillReelTranscodes = onCall(
  {
    // No encoding happens here — it only lists and copies — but listing a large
    // bucket and stat-ing each candidate is not instant.
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async (request): Promise<BackfillReport> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
    if (!(await callerIsAdmin(uid, request.auth?.token?.phone_number as string))) {
      throw new HttpsError("permission-denied", "Admins only.");
    }

    const dryRun = request.data?.dryRun !== false;
    const requested = Number(request.data?.limit ?? DEFAULT_BATCH);
    const limit = Math.min(
      Math.max(Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_BATCH, 1),
      MAX_BATCH,
    );

    const db = admin.firestore();
    const bucket = request.data?.bucket
      ? admin.storage().bucket(String(request.data.bucket))
      : admin.storage().bucket();

    const [files] = await bucket.getFiles({ prefix: "reels/" });

    // reels/{reelId}/video.mp4 — exactly three segments, and the last is the
    // source name. Anything else is an output, a poster, or not ours.
    const sources = files.filter((f) => {
      const parts = f.name.split("/");
      return parts.length === 3 && parts[2] === SOURCE_NAME;
    });

    const pending: string[] = [];
    const orphanedSources: string[] = [];
    const missingDocs: string[] = [];

    for (const file of sources) {
      const reelId = file.name.split("/")[1]!;

      const [optimized] = await bucket.file(`reels/${reelId}/${OUTPUT_NAME}`).exists();
      if (optimized) {
        // Transcoded, but the source delete failed afterwards. Re-nudging would
        // burn an encode to produce a file that already exists.
        orphanedSources.push(reelId);
        continue;
      }

      const doc = await db.doc(`reels/${reelId}`).get();
      if (!doc.exists) {
        missingDocs.push(reelId);
        continue;
      }

      pending.push(reelId);
    }

    // Reels with no poster whose source is already gone. A nudge cannot help
    // them — there is nothing left to take a frame from — so they are reported
    // rather than silently counted as done.
    const posterlessWithoutSource: string[] = [];
    const withSource = new Set([...pending, ...orphanedSources]);
    const reelDocs = await db.collection("reels").select("thumbnailUrl").get();
    for (const d of reelDocs.docs) {
      const thumb = d.data()?.thumbnailUrl;
      if (!thumb && !withSource.has(d.id)) posterlessWithoutSource.push(d.id);
    }

    const batch = pending.slice(0, limit);
    const nudged: string[] = [];

    if (!dryRun) {
      for (const reelId of batch) {
        const path = `reels/${reelId}/${SOURCE_NAME}`;
        try {
          // Copy onto itself: a new generation, therefore a new finalize event,
          // therefore transcodeReel runs exactly as it does for an upload.
          const file = bucket.file(path);
          await file.copy(file);
          nudged.push(reelId);
          logger.info("[backfill-reels] nudged", { reelId });
        } catch (err) {
          // One unreadable object must not end the run — the rest of the batch
          // is still worth processing, and the reel stays pending for next time.
          logger.error("[backfill-reels] nudge failed", {
            reelId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const report: BackfillReport = {
      dryRun,
      pending: pending.length,
      nudged,
      orphanedSources,
      missingDocs,
      posterlessWithoutSource,
      remainingAfterThisRun: pending.length - nudged.length,
    };

    logger.info("[backfill-reels] run complete", {
      dryRun,
      pending: report.pending,
      nudged: nudged.length,
      remaining: report.remainingAfterThisRun,
    });

    return report;
  },
);
