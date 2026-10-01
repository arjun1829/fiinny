import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";

const db = (): admin.firestore.Firestore => admin.firestore();

/**
 * Server-side activity aggregation.
 *
 * The ONLY thing a client writes is an idempotent per-user-per-day "presence"
 * doc at `activeUsers/{date}/presence/{userId}` (throttled to ~1/user/day by the
 * client). This function turns that raw signal into the pre-aggregated summary
 * documents the Admin Analytics page reads:
 *
 *   - `activeUsers/{date}`      — DAU count + role split + new/returning split
 *   - `mau/{YYYY-MM}`           — monthly UNIQUE active users (+ role split)
 *   - `retention/{cohortDay}`   — 7-day / 30-day return counts per registration cohort
 *
 * Why this is exactly-once and dedupe-safe: it is an `onDocumentCreated`
 * trigger. The presence doc ID is the user's stable phone, so a user activating
 * twice in one day is an idempotent overwrite that does NOT re-fire create —
 * therefore the DAU counter is incremented at most once per (day, user). The
 * monthly and cohort counters guard against re-counting across days with a
 * transactional "first-seen" marker.
 */

type RoleBucket = "retailer" | "manufacturer" | "customer";
type DeviceBucket = "web" | "mobile" | "tablet";

function roleBucket(role: unknown): RoleBucket {
  if (role === "retailer") return "retailer";
  if (role === "manufacturer") return "manufacturer";
  // consumer / customer / missing all fold into "customer", matching the
  // admin analytics role classification (ROLE_BUCKET in analytics-queries.ts).
  return "customer";
}

function deviceBucket(platform: unknown): DeviceBucket {
  if (platform === "mobile") return "mobile";
  if (platform === "tablet") return "tablet";
  // 'web', missing, or any other value → desktop/web
  return "web";
}

/** Whole-day difference between two YYYY-MM-DD keys (later - earlier). */
function dayDiff(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

export const onActiveUserPresence = onDocumentCreated(
  "activeUsers/{date}/presence/{userId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { date, userId } = event.params as { date: string; userId: string };
    const data = snap.data() as Record<string, unknown>;
    const bucket = roleBucket(data.role);
    const device = deviceBucket(data.platform);
    const registeredDayKey = String(data.registeredDayKey ?? "");

    const inc = admin.firestore.FieldValue.increment(1);
    const now = admin.firestore.FieldValue.serverTimestamp();

    // ── 1. DAU summary ───────────────────────────────────────────────────────
    // Fires exactly once per (date, user) — safe to increment unconditionally.
    // new vs returning is decided purely from the registration day carried on
    // the presence doc, so it needs no extra read.
    const isNewActive = registeredDayKey !== "" && registeredDayKey === date;
    try {
      await db()
        .collection("activeUsers")
        .doc(date)
        .set(
          {
            date,
            count: inc,
            [bucket]: inc,
            [device]: inc,
            newActive: isNewActive ? inc : admin.firestore.FieldValue.increment(0),
            returning: !isNewActive ? inc : admin.firestore.FieldValue.increment(0),
            updatedAt: now,
          },
          { merge: true },
        );
    } catch (e) {
      logger.error("[activity] DAU summary update failed", { date, userId, e });
    }

    // ── 2. MAU (monthly unique) ──────────────────────────────────────────────
    // A user active on several days in a month must count ONCE. A transactional
    // first-seen marker under mau/{month}/presence/{userId} guarantees the
    // monthly summary is incremented only the first day the user is active.
    const month = date.slice(0, 7); // YYYY-MM
    const mauSummaryRef = db().collection("mau").doc(month);
    const mauMarkerRef = mauSummaryRef.collection("presence").doc(userId);
    try {
      await db().runTransaction(async (tx) => {
        const marker = await tx.get(mauMarkerRef);
        if (marker.exists) return;
        tx.set(mauMarkerRef, { at: now, role: data.role ?? null });
        tx.set(
          mauSummaryRef,
          { month, count: inc, [bucket]: inc, updatedAt: now },
          { merge: true },
        );
      });
    } catch (e) {
      logger.error("[activity] MAU update failed", { month, userId, e });
    }

    // ── 3. Retention (7-day / 30-day) ────────────────────────────────────────
    // Cohort = the user's registration day. "Returned" = active on a LATER day
    // within the window. Same transactional first-seen guard so a user is
    // counted once per window per cohort, regardless of how many days they
    // return on.
    if (registeredDayKey) {
      const diff = dayDiff(registeredDayKey, date);
      if (!Number.isNaN(diff) && diff >= 1) {
        const windows: Array<{ max: number; field: "returned7" | "returned30"; sub: string }> = [
          { max: 7, field: "returned7", sub: "r7" },
          { max: 30, field: "returned30", sub: "r30" },
        ];
        const cohortRef = db().collection("retention").doc(registeredDayKey);
        for (const w of windows) {
          if (diff > w.max) continue;
          const markerRef = cohortRef.collection(w.sub).doc(userId);
          try {
            await db().runTransaction(async (tx) => {
              const marker = await tx.get(markerRef);
              if (marker.exists) return;
              tx.set(markerRef, { at: now });
              tx.set(
                cohortRef,
                { cohort: registeredDayKey, [w.field]: inc, updatedAt: now },
                { merge: true },
              );
            });
          } catch (e) {
            logger.error("[activity] retention update failed", {
              cohort: registeredDayKey,
              window: w.field,
              userId,
              e,
            });
          }
        }
      }
    }
  },
);
