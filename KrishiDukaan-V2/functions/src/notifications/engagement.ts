import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { notify, displayName } from "../notify";

const db = (): admin.firestore.Firestore => admin.firestore();

/** Engagement kinds that land in the buffer. */
export type EngagementKind = "like" | "comment" | "follow" | "repost";

/**
 * Below this many events in a flush window a seller gets one notification per
 * event (the old behaviour); at or above it they get a single grouped one.
 * Three is the smallest count where "X, Y and 1 other" reads better than three
 * separate pushes.
 */
const GROUP_MIN = 3;

/** How many actor names are spelled out before the "and N others" tail. */
const NAMES_SHOWN = 2;

/** Flushed buffer docs are kept this long — the yearly digest reads them. */
const RETENTION_DAYS = 400;

/**
 * Records one engagement event for later grouping.
 *
 * Nothing is pushed here. `flushEngagementNotifications` drains the buffer
 * hourly and decides between individual and grouped notifications, which is
 * what keeps a reel that suddenly gets 200 likes from producing 200 pushes.
 *
 * Comments are the exception: they are notified immediately by their own
 * trigger and recorded here with `instantSent: true` purely so the grouped
 * summary can still say "…liked and commented on your content". The flush
 * never re-notifies those.
 */
export async function recordEngagement(params: {
  ownerPhone: string;
  actorPhone: string;
  actorName: string;
  kind: EngagementKind;
  reelId?: string;
  instantSent?: boolean;
}): Promise<void> {
  const ownerPhone = params.ownerPhone.trim();
  const actorPhone = params.actorPhone.trim();
  // Self-engagement is never worth a notification.
  if (!ownerPhone || !actorPhone || ownerPhone === actorPhone) return;

  try {
    await db().collection("engagement_buffer").add({
      ownerPhone,
      actorPhone,
      actorName: params.actorName || "Someone",
      kind: params.kind,
      reelId: params.reelId ?? null,
      instantSent: params.instantSent === true,
      flushed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error("[recordEngagement] buffer write failed", err);
  }
}

/**
 * Someone reposted a reel → notify whoever made the original.
 *
 * Reposts are `reels` docs carrying `originalReelId`; `repostReel` in the
 * mobile ReelsRepository always resolves that back to the *root* original, so
 * the person notified is the true creator even on a repost of a repost.
 */
export const notifyOwnerOnReelRepost = onDocumentCreated(
  { document: "reels/{reelId}", region: "asia-south1" },
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;

    const originalReelId = String(d.originalReelId ?? "").trim();
    if (!originalReelId) return; // an ordinary reel, not a repost

    const ownerPhone = String(
      d.originalShopOwnerId ?? d.originalOwnerPhone ?? ""
    ).trim();
    const reposterPhone = String(d.shopOwnerId ?? "").trim();
    if (!ownerPhone || !reposterPhone) return;

    const reposterName =
      String(d.shopName ?? "").trim() ||
      (await displayName(reposterPhone, "Someone"));

    // Deep-link to the repost itself so the creator sees it in context.
    await recordEngagement({
      ownerPhone,
      actorPhone: reposterPhone,
      actorName: reposterName,
      kind: "repost",
      reelId: event.params.reelId,
    });
  }
);

/** Past-tense verb used in a grouped summary. */
const VERBS: Record<EngagementKind, string> = {
  like: "liked",
  comment: "commented on",
  follow: "followed",
  repost: "reposted",
};

/** "a", "a and b", "a, b and c" — never a trailing comma. */
function joinPhrase(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

interface BufferedEvent {
  actorPhone: string;
  actorName: string;
  kind: EngagementKind;
  reelId: string | null;
  instantSent: boolean;
  at: admin.firestore.Timestamp | null;
}

/**
 * Builds the grouped body, e.g.
 *   "Rahul, Priya and 24 others liked and commented on your content"
 * Actors are counted distinctly — one person liking six reels is one name.
 */
export function summariseEngagement(events: BufferedEvent[]): string {
  const namesByActor = new Map<string, string>();
  for (const e of events) {
    if (!namesByActor.has(e.actorPhone)) {
      namesByActor.set(e.actorPhone, e.actorName);
    }
  }
  const names = Array.from(namesByActor.values());
  const shown = names.slice(0, NAMES_SHOWN);
  const others = names.length - shown.length;

  const actorPhrase =
    others > 0
      ? `${shown.join(", ")} and ${others} ${others === 1 ? "other" : "others"}`
      : joinPhrase(shown);

  // Verbs in a stable, readable order rather than first-seen order.
  const order: EngagementKind[] = ["like", "comment", "follow", "repost"];
  const kinds = order.filter((k) => events.some((e) => e.kind === k));
  const verbPhrase = joinPhrase(kinds.map((k) => VERBS[k]));

  // "followed" takes no object — "followed your content" is wrong.
  const onlyFollows = kinds.length === 1 && kinds[0] === "follow";
  const object = onlyFollows ? "you" : "your content";

  return `${actorPhrase} ${verbPhrase} ${object}`;
}

/** The individual notification an ungrouped event would have produced. */
function individualCopy(e: BufferedEvent): { type: string; title: string; body: string } {
  switch (e.kind) {
    case "like":
      return {
        type: "reel_like",
        title: "New like on your reel ❤️",
        body: `${e.actorName} liked your reel`,
      };
    case "follow":
      return {
        type: "reel_follow",
        title: "New follower 🎉",
        body: `${e.actorName} started following your shop`,
      };
    case "repost":
      return {
        type: "reel_repost",
        title: "Your reel was reposted 🔁",
        body: `${e.actorName} reposted your reel`,
      };
    case "comment":
      return {
        type: "reel_comment",
        title: "New comment 💬",
        body: `${e.actorName} commented on your reel`,
      };
  }
}

/**
 * Drains `engagement_buffer` once an hour.
 *
 * Per recipient: fewer than GROUP_MIN events go out individually, more than
 * that collapse into one `engagement_group` notification backed by an
 * `engagement_groups/{id}` doc the app opens to list who did what.
 */
export const flushEngagementNotifications = onSchedule(
  { schedule: "every 60 minutes", timeZone: "Asia/Kolkata" },
  async () => {
    // Single equality filter — no composite index needed. The cap bounds one
    // run; anything left over is picked up by the next hourly run.
    const snap = await db()
      .collection("engagement_buffer")
      .where("flushed", "==", false)
      .limit(2000)
      .get();

    if (snap.empty) {
      logger.info("[flushEngagement] nothing buffered");
      return;
    }

    const byOwner = new Map<string, { ids: string[]; events: BufferedEvent[] }>();
    for (const doc of snap.docs) {
      const d = doc.data();
      const owner = String(d.ownerPhone ?? "");
      if (!owner) continue;
      const entry = byOwner.get(owner) ?? { ids: [], events: [] };
      entry.ids.push(doc.id);
      entry.events.push({
        actorPhone: String(d.actorPhone ?? ""),
        actorName: String(d.actorName ?? "Someone"),
        kind: String(d.kind ?? "like") as EngagementKind,
        reelId: (d.reelId as string | null) ?? null,
        instantSent: d.instantSent === true,
        at: (d.createdAt as admin.firestore.Timestamp | undefined) ?? null,
      });
      byOwner.set(owner, entry);
    }

    for (const [ownerPhone, { ids, events }] of byOwner) {
      try {
        if (events.length >= GROUP_MIN) {
          const groupRef = await db().collection("engagement_groups").add({
            ownerPhone,
            // Denormalised so the app renders the list from one read.
            events: events.map((e) => ({
              actorPhone: e.actorPhone,
              actorName: e.actorName,
              kind: e.kind,
              reelId: e.reelId,
              at: e.at,
            })),
            eventCount: events.length,
            actorCount: new Set(events.map((e) => e.actorPhone)).size,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await notify(
            ownerPhone,
            "engagement_group",
            `${events.length} new interactions 🎉`,
            summariseEngagement(events),
            { groupId: groupRef.id }
          );
        } else {
          for (const e of events) {
            if (e.instantSent) continue; // comment already pushed on write
            const copy = individualCopy(e);
            await notify(ownerPhone, copy.type, copy.title, copy.body, {
              ...(e.reelId ? { reelId: e.reelId } : {}),
              ...(e.kind === "follow" ? { followerPhone: e.actorPhone } : {}),
            });
          }
        }
      } catch (err) {
        logger.error(`[flushEngagement] failed for ${ownerPhone}`, err);
        continue; // leave this owner's docs unflushed; next run retries
      }

      // Mark flushed in chunks — Firestore batches cap at 500 writes.
      for (let i = 0; i < ids.length; i += 400) {
        const batch = db().batch();
        for (const id of ids.slice(i, i + 400)) {
          batch.update(db().collection("engagement_buffer").doc(id), {
            flushed: true,
            flushedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    }

    logger.info(
      `[flushEngagement] ${snap.size} events across ${byOwner.size} recipients`
    );
  }
);

/**
 * Trims the buffer. Flushed events are retained past the yearly digest window
 * (the digest counts engagement out of this collection) and dropped after.
 */
export const pruneEngagementBuffer = onSchedule(
  { schedule: "every 24 hours", timeZone: "Asia/Kolkata" },
  async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    const snap = await db()
      .collection("engagement_buffer")
      .where("createdAt", "<", cutoff)
      .limit(500)
      .get();
    if (snap.empty) return;

    const batch = db().batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    logger.info(`[pruneEngagementBuffer] deleted ${snap.size}`);
  }
);
