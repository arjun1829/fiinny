import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { randomUUID } from "crypto";
import { downloadUrl, OUTPUT_NAME, repointReposts, SOURCE_NAME } from "./transcodeReel";

/**
 * Compresses old reels automatically, a few at a time, until none are left.
 *
 * Reels uploaded before transcodeReel shipped (and every web upload before
 * then) still play their raw originals: 75–150 MB 1080p files that make the
 * feed slow to start. backfillReelTranscodes could fix them but nothing ever
 * called it. This runs on its own:
 *
 *  - A reel whose raw `video.mp4` is still in Storage and has no optimized
 *    file is "nudged" (the file is copied onto itself), which re-runs
 *    transcodeReel exactly as for a new upload. NUDGES_PER_RUN per run, so a
 *    backlog drains over a few hours without a burst of 2 GiB encoders.
 *  - A reel whose optimized file exists but whose doc still points at the raw
 *    original (the encode finished before the app saved the reel) is linked to
 *    the optimized file directly: no second encode.
 *  - A reel that fails MAX_NUDGES times is left alone and logged, so a broken
 *    file cannot burn encodes forever.
 *
 * Once everything is compressed a run lists Storage, finds nothing, and ends.
 */

const NUDGES_PER_RUN = 4;
const MAX_NUDGES = 3;
/** Wait this long before nudging the same reel again (its encode may still be running). */
const RETRY_AFTER_MS = 2 * 60 * 60 * 1000;
const STATE = "reelCompression";
/** A raw file younger than this belongs to an upload transcodeReel is still encoding. */
const FRESH_UPLOAD_MS = 60 * 60 * 1000;

export type CompressPlan = { link: string[]; nudge: string[]; gaveUp: string[]; waiting: number };

/** What to do with each raw reel file. Pure, for tests. */
export function planCompression(
  sources: { reelId: string; hasOptimized: boolean; docExists: boolean; docUrl: string; ageMs: number }[],
  state: Map<string, { nudges: number; lastNudgeAt: number }>,
  now: number,
  perRun = NUDGES_PER_RUN,
): CompressPlan {
  const plan: CompressPlan = { link: [], nudge: [], gaveUp: [], waiting: 0 };
  for (const s of sources) {
    if (!s.docExists) continue; // deleted reel: nothing plays it
    if (s.hasOptimized) {
      if (!s.docUrl.includes(encodeURIComponent(`/${OUTPUT_NAME}`)) && !s.docUrl.includes(OUTPUT_NAME)) plan.link.push(s.reelId);
      continue;
    }
    if (s.ageMs < FRESH_UPLOAD_MS) {
      plan.waiting++; // a new upload: its own encode is running
      continue;
    }
    const st = state.get(s.reelId);
    if (st && st.nudges >= MAX_NUDGES) {
      plan.gaveUp.push(s.reelId);
      continue;
    }
    if (st && now - st.lastNudgeAt < RETRY_AFTER_MS) {
      plan.waiting++;
      continue;
    }
    if (plan.nudge.length < perRun) plan.nudge.push(s.reelId);
    else plan.waiting++;
  }
  return plan;
}

export const compressOldReels = onSchedule(
  { schedule: "every 30 minutes", timeZone: "Asia/Kolkata", memory: "512MiB", timeoutSeconds: 300 },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const now = Date.now();

    const [files] = await bucket.getFiles({ prefix: "reels/" });
    const names = new Set(files.map((f) => f.name));
    const raws = files.filter((f) => {
      const p = f.name.split("/");
      return p.length === 3 && p[2] === SOURCE_NAME;
    });
    if (!raws.length) return;
    const rawIds = raws.map((f) => f.name.split("/")[1]!);

    const getAll = async (paths: string[]) => {
      const out: admin.firestore.DocumentSnapshot[] = [];
      for (let i = 0; i < paths.length; i += 300) out.push(...(await db.getAll(...paths.slice(i, i + 300).map((p) => db.doc(p)))));
      return out;
    };
    const docs = await getAll(rawIds.map((id) => `reels/${id}`));
    const states = await getAll(rawIds.map((id) => `${STATE}/${id}`));
    const state = new Map(
      states.filter((s) => s.exists).map((s) => [s.id, { nudges: Number(s.get("nudges") ?? 0), lastNudgeAt: Number(s.get("lastNudgeAt") ?? 0) }]),
    );
    const plan = planCompression(
      rawIds.map((id, i) => ({
        reelId: id,
        hasOptimized: names.has(`reels/${id}/${OUTPUT_NAME}`),
        docExists: docs[i]!.exists,
        docUrl: String(docs[i]!.get("videoUrl") ?? ""),
        ageMs: now - (Date.parse(String(raws[i]!.metadata.updated ?? "")) || 0),
      })),
      state,
      now,
    );

    // Already encoded, never linked: point the reel at the optimized file.
    for (const reelId of plan.link) {
      try {
        const file = bucket.file(`reels/${reelId}/${OUTPUT_NAME}`);
        const [meta] = await file.getMetadata();
        let token = String(meta.metadata?.firebaseStorageDownloadTokens ?? "").split(",")[0];
        if (!token) {
          token = randomUUID();
          await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
        }
        const ref = db.doc(`reels/${reelId}`);
        const oldUrl = String((await ref.get()).get("videoUrl") ?? "");
        const url = downloadUrl(bucket.name, file.name, token);
        await ref.update({ videoUrl: url, optimizedAt: admin.firestore.FieldValue.serverTimestamp() });
        await repointReposts(db, reelId, oldUrl, url);
        await bucket.file(`reels/${reelId}/${SOURCE_NAME}`).delete().catch(() => undefined);
        logger.info("[compress-old-reels] linked existing optimized file", { reelId });
      } catch (err) {
        logger.error("[compress-old-reels] link failed", { reelId, error: String(err) });
      }
    }

    // Raw only: re-run transcodeReel on it.
    for (const reelId of plan.nudge) {
      try {
        const file = bucket.file(`reels/${reelId}/${SOURCE_NAME}`);
        await file.copy(file);
        await db.doc(`${STATE}/${reelId}`).set(
          { nudges: admin.firestore.FieldValue.increment(1), lastNudgeAt: now },
          { merge: true },
        );
      } catch (err) {
        logger.error("[compress-old-reels] nudge failed", { reelId, error: String(err) });
      }
    }

    if (plan.gaveUp.length) logger.warn("[compress-old-reels] could not compress", { reels: plan.gaveUp });
    logger.info("[compress-old-reels] run", { linked: plan.link.length, nudged: plan.nudge.length, waiting: plan.waiting, gaveUp: plan.gaveUp.length });
  },
);
