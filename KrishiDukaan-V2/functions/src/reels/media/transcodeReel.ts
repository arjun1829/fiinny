import { onObjectFinalized } from "firebase-functions/v2/storage";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { unlink, stat } from "fs/promises";
import ffmpegPath from "ffmpeg-static";

/**
 * Re-encodes uploaded reels for fast playback.
 *
 * Solves three problems measured on the live feed (9s to first frame on wifi,
 * 14s on cellular):
 *
 *  1. **moov atom placement.** Without `+faststart` the MP4 index sits at the
 *     end of the file, so a player must download essentially the whole thing
 *     before it can render frame one. This is why the delay scaled with
 *     bandwidth rather than latency — it was bytes, not round-trips.
 *  2. **Oversized files.** Web uploads bypass client-side compression entirely
 *     (`if (!kIsWeb)` in ReelUploadScreen), so a phone-shot 1080p clip landed in
 *     Storage untouched at 75–150MB.
 *  3. **Missing posters.** Web uploads generate no thumbnail, so those reels
 *     render as black in the feed while buffering.
 *
 * Output targets ~1.2Mbps at 720p, which puts a 60s reel near 9MB against the
 * ~25MB we inferred from the live timings.
 */

// Tuning surface. Every one of these trades quality against both playback
// latency and Storage egress cost — change deliberately.
const MAX_DURATION_SEC = 90;
const MAX_WIDTH = 720;
const MAX_HEIGHT = 1280;
const CRF = 26; // 18=near-lossless, 28=visibly soft. 26 is a good phone-screen balance.
const MAX_BITRATE = "1500k";
const AUDIO_BITRATE = "96k";

/** Marker written into object metadata so output never re-triggers the function. */
const PROCESSED_MARKER = "reelOptimized";

const SOURCE_NAME = "video.mp4";
const OUTPUT_NAME = "video_optimized.mp4";
const THUMB_NAME = "thumb.jpg";

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stderr = "";
    proc.stderr.on("data", (c) => {
      stderr += c.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${bin} exited ${code}: ${stderr.slice(-1500)}`)),
    );
  });
}

/**
 * Builds the tokenised download URL format the clients already store in
 * `reels/{id}.videoUrl`, so nothing downstream has to learn a second URL shape.
 */
function downloadUrl(bucket: string, objectPath: string, token: string): string {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/` +
    `${encodeURIComponent(objectPath)}?alt=media&token=${token}`
  );
}

export const transcodeReel = onObjectFinalized(
  {
    // Transcoding is memory- and CPU-bound; the default 256MiB/60s cannot
    // complete a 90s 1080p encode.
    memory: "2GiB",
    cpu: 2,
    timeoutSeconds: 540,
    // Concurrency 1: ffmpeg saturates the allocated CPU, so stacking requests on
    // one instance makes every encode slower rather than increasing throughput.
    concurrency: 1,
  },
  async (event) => {
    const filePath = event.data.name;
    const bucketName = event.data.bucket;
    const contentType = event.data.contentType ?? "";

    if (!filePath) return;

    // ── Re-trigger guards ────────────────────────────────────────────────
    //
    // This function writes back into the same bucket that triggers it. Without
    // these three guards it would recurse on its own output — an unbounded
    // billing loop, not merely a bug. Do not remove any of them.
    const parts = filePath.split("/");
    if (parts.length !== 3 || parts[0] !== "reels") return;
    if (parts[2] !== SOURCE_NAME) return; // ignores our own video_optimized.mp4 + thumb.jpg
    if (event.data.metadata?.[PROCESSED_MARKER] === "true") return;
    if (!contentType.startsWith("video/")) return;

    const reelId = parts[1];
    const bucket = admin.storage().bucket(bucketName);
    const db = admin.firestore();

    const localIn = join(tmpdir(), `${reelId}-in.mp4`);
    const localOut = join(tmpdir(), `${reelId}-out.mp4`);
    const localThumb = join(tmpdir(), `${reelId}-thumb.jpg`);
    const cleanup = [localIn, localOut, localThumb];

    if (!ffmpegPath) {
      logger.error("ffmpeg-static resolved no binary; skipping", { reelId });
      return;
    }

    try {
      await bucket.file(filePath).download({ destination: localIn });
      const sizeBefore = (await stat(localIn)).size;

      // scale: fit inside the box preserving aspect (works for portrait and
      // landscape), then force even dimensions — libx264 rejects odd ones.
      await run(ffmpegPath, [
        "-i", localIn,
        "-t", String(MAX_DURATION_SEC),
        "-vf",
        `scale=${MAX_WIDTH}:${MAX_HEIGHT}:force_original_aspect_ratio=decrease,` +
          "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", String(CRF),
        "-maxrate", MAX_BITRATE,
        "-bufsize", "3000k",
        "-c:a", "aac",
        "-b:a", AUDIO_BITRATE,
        "-movflags", "+faststart", // the actual fix for time-to-first-frame
        "-y", localOut,
      ]);

      const sizeAfter = (await stat(localOut)).size;
      const videoToken = randomUUID();
      const outPath = `reels/${reelId}/${OUTPUT_NAME}`;

      await bucket.upload(localOut, {
        destination: outPath,
        metadata: {
          contentType: "video/mp4",
          // Long cache: reel bytes are immutable once written, and this is what
          // lets a CDN serve repeat views without hitting Storage egress.
          cacheControl: "public, max-age=31536000, immutable",
          metadata: {
            [PROCESSED_MARKER]: "true",
            firebaseStorageDownloadTokens: videoToken,
          },
        },
      });

      const update: Record<string, unknown> = {
        videoUrl: downloadUrl(bucketName, outPath, videoToken),
        optimizedAt: admin.firestore.FieldValue.serverTimestamp(),
        durationSec: MAX_DURATION_SEC,
      };

      // ── Poster frame, only if the client did not supply one ──────────────
      // Mobile uploads already ship a thumbnail; web uploads never do.
      const reelRef = db.collection("reels").doc(reelId);
      const existing = await reelRef.get();
      const hasThumb = Boolean(existing.data()?.thumbnailUrl);

      if (!hasThumb) {
        try {
          await run(ffmpegPath, [
            "-i", localOut,
            "-ss", "00:00:01",
            "-vframes", "1",
            "-vf", `scale=${MAX_WIDTH}:-2`,
            "-q:v", "5",
            "-y", localThumb,
          ]);
          const thumbToken = randomUUID();
          const thumbPath = `reels/${reelId}/${THUMB_NAME}`;
          await bucket.upload(localThumb, {
            destination: thumbPath,
            metadata: {
              contentType: "image/jpeg",
              cacheControl: "public, max-age=31536000, immutable",
              metadata: {
                [PROCESSED_MARKER]: "true",
                firebaseStorageDownloadTokens: thumbToken,
              },
            },
          });
          update.thumbnailUrl = downloadUrl(bucketName, thumbPath, thumbToken);
        } catch (err) {
          // A missing poster degrades the feed but must never fail the reel.
          logger.warn("thumbnail generation failed", { reelId, err });
        }
      }

      await reelRef.update(update);

      // Drop the oversized original — keeping both doubles Storage cost for no
      // benefit, since videoUrl now points at the optimized object.
      await bucket.file(filePath).delete().catch((err) => {
        logger.warn("could not delete source", { reelId, err });
      });

      logger.info("reel optimized", {
        reelId,
        sizeBefore,
        sizeAfter,
        saved: `${(100 - (sizeAfter / sizeBefore) * 100).toFixed(1)}%`,
      });
    } catch (err) {
      // Leave the original in place on failure: the reel still plays slowly,
      // which is strictly better than a reel that does not play at all.
      logger.error("transcode failed", { reelId, err });
    } finally {
      await Promise.all(cleanup.map((f) => unlink(f).catch(() => undefined)));
    }
  },
);
