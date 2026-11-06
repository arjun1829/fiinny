/**
 * Prepares old WhatsApp docs for the paged admin inbox, once. Run after
 * deploying the functions (whose webhook now writes the same fields), before
 * deploying the website whose inbox reads them. Safe to re-run: it only fills
 * fields that are missing or older than the messages show.
 *
 * The inbox lists waConversations where hasIncoming == true, newest
 * lastMessageAt first, and loads waIncomingMessages where phone == <open
 * conversation> ordered by timestamp. Firestore leaves a doc out of a query
 * when the filtered or ordered field is missing, so this fills:
 *   waIncomingMessages: phone (from waId), timestamp, receivedAt
 *   waConversations:    one doc per phone with incoming messages, with
 *                       hasIncoming, lastIncomingAt, lastIncomingText,
 *                       lastMessageAt, status
 *
 *   gcloud auth application-default login
 *   cd functions
 *   npx tsx scripts/backfill-wa-inbox.ts --project krishidukan-e8315           # preview
 *   npx tsx scripts/backfill-wa-inbox.ts --project krishidukan-e8315 --write   # apply
 */
import type * as admin from "firebase-admin";

const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
const project = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
const write = args.includes("--write");

if (!project) {
  console.error("Usage: npx tsx scripts/backfill-wa-inbox.ts --project <project-id> [--write]");
  process.exit(1);
}
process.env.FIREBASE_PROJECT_ID = project;

const PAGE = 500;
const BATCH = 400;

type Ts = admin.firestore.Timestamp;
type Latest = { ms: number; ts: Ts; text: string };

function isTs(v: unknown): v is Ts {
  return !!v && typeof (v as Ts).toMillis === "function";
}

async function main(): Promise<void> {
  // Imported after FIREBASE_PROJECT_ID is set: getDb() reads it on first use.
  const { getDb } = await import("../src/wa/firebase");
  const firebaseAdmin = (await import("firebase-admin")).default;
  const db = getDb();
  const Timestamp = firebaseAdmin.firestore.Timestamp;

  const pending: Array<{ ref: admin.firestore.DocumentReference; data: Record<string, unknown>; merge: boolean }> = [];
  const report = {
    incomingScanned: 0,
    incomingPhoneSet: 0,
    incomingTimestampSet: 0,
    incomingReceivedAtSet: 0,
    incomingNoPhone: 0,
    conversationsScanned: 0,
    conversationsCreated: 0,
    conversationsUpdated: 0,
  };

  async function flush(force = false): Promise<void> {
    while (pending.length >= BATCH || (force && pending.length > 0)) {
      const chunk = pending.splice(0, BATCH);
      if (!write) continue;
      const batch = db.batch();
      for (const w of chunk) batch.set(w.ref, w.data, { merge: w.merge });
      await batch.commit();
    }
  }

  // 1. Incoming messages: fill missing fields, find each phone's latest message.
  const latestByPhone = new Map<string, Latest>();
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection("waIncomingMessages").orderBy("__name__").limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      report.incomingScanned++;
      const data = d.data();
      const patch: Record<string, unknown> = {};
      const phone = String(data.phone || data.waId || "");
      if (!data.phone && phone) {
        patch.phone = phone;
        report.incomingPhoneSet++;
      }
      let ts: Ts | null = isTs(data.timestamp) ? data.timestamp : null;
      if (!ts) {
        const metaSecs = Number(data.rawPayload?.timestamp);
        ts = isTs(data.receivedAt)
          ? data.receivedAt
          : Number.isFinite(metaSecs) && metaSecs > 0
            ? Timestamp.fromMillis(metaSecs * 1000)
            : d.createTime;
        patch.timestamp = ts;
        report.incomingTimestampSet++;
      }
      if (!isTs(data.receivedAt)) {
        patch.receivedAt = ts;
        report.incomingReceivedAtSet++;
      }
      if (Object.keys(patch).length > 0) pending.push({ ref: d.ref, data: patch, merge: true });

      if (!phone) {
        report.incomingNoPhone++;
        continue;
      }
      const ms = ts.toMillis();
      const cur = latestByPhone.get(phone);
      if (!cur || ms > cur.ms) {
        const text = data.messageText ??
          (data.mediaId || data.rawPayload?.image || data.rawPayload?.video || data.rawPayload?.document
            ? `[${String(data.messageType ?? "media")}]`
            : "");
        latestByPhone.set(phone, { ms, ts, text: String(text) });
      }
    }
    await flush();
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }

  // 2. Conversations: every phone with incoming messages, plus existing docs.
  const seen = new Set<string>();
  last = undefined;
  for (;;) {
    let q = db.collection("waConversations").orderBy("__name__").limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      report.conversationsScanned++;
      seen.add(d.id);
      const data = d.data();
      const latest = latestByPhone.get(d.id);
      const patch: Record<string, unknown> = {};
      if (!data.phone) patch.phone = d.id;
      if (!data.status) patch.status = "open";

      let lastIncomingAt: Ts | null = isTs(data.lastIncomingAt) ? data.lastIncomingAt : null;
      if (latest) {
        if (data.hasIncoming !== true) patch.hasIncoming = true;
        if (!lastIncomingAt || lastIncomingAt.toMillis() < latest.ms) {
          lastIncomingAt = latest.ts;
          patch.lastIncomingAt = latest.ts;
          patch.lastIncomingText = latest.text;
        } else if (typeof data.lastIncomingText !== "string") {
          patch.lastIncomingText = latest.text;
        }
      }
      const lastOutgoingAt: Ts | null = isTs(data.lastOutgoingAt) ? data.lastOutgoingAt : null;
      const activityMs = Math.max(lastIncomingAt?.toMillis() ?? 0, lastOutgoingAt?.toMillis() ?? 0);
      const current: Ts | null = isTs(data.lastMessageAt) ? data.lastMessageAt : null;
      if (!current || current.toMillis() < activityMs) {
        patch.lastMessageAt = activityMs > 0
          ? Timestamp.fromMillis(activityMs)
          : (isTs(data.updatedAt) ? data.updatedAt : d.createTime);
      }

      if (Object.keys(patch).length > 0) {
        pending.push({ ref: d.ref, data: patch, merge: true });
        report.conversationsUpdated++;
      }
    }
    await flush();
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }

  for (const [phone, latest] of Array.from(latestByPhone)) {
    if (seen.has(phone)) continue;
    pending.push({
      ref: db.collection("waConversations").doc(phone),
      data: {
        phone,
        status: "open",
        hasIncoming: true,
        lastIncomingAt: latest.ts,
        lastIncomingText: latest.text,
        lastMessageAt: latest.ts,
      },
      // merge: a webhook may create the doc while this runs.
      merge: true,
    });
    report.conversationsCreated++;
  }
  await flush(true);

  console.log(`${write ? "Applied" : "Preview (dry run)"} for project ${project}:`);
  console.table(report);
  if (!write) console.log("Re-run with --write to apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
