import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { firstPhone, displayName } from "../notify";
import { queueWaNotification } from "../wa-notify";

const db = (): admin.firestore.Firestore => admin.firestore();

/** Marathi Utility template approved in Meta for the accept-pending reminder. */
const TEMPLATE = "order_accept_pending" as const;

/** The only status in which an online delivery order still awaits accept/reject. */
const PENDING_STATUS = "placed";

/** 24-hour eligibility threshold. */
const DEFAULT_MIN_PENDING_HOURS = 24;

const MS_PER_HOUR = 60 * 60 * 1000;

/** Reads a Firestore Timestamp-ish field as epoch millis, or null when absent. */
function toMillis(v: unknown): number | null {
  if (v instanceof admin.firestore.Timestamp) return v.toMillis();
  // Defensive: some legacy docs may carry an ISO string or a Date.
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

/**
 * True when a 24-hour accept-pending reminder has ALREADY been queued/sent for
 * this order. Reuses the existing waNotifications fields — no extra schema:
 *   source.entityId == orderId  (single-field, auto-indexed)  AND
 *   template        == order_accept_pending  (filtered in memory)
 * Any lifecycle state counts (pending/sending/sent/…): once queued we must not
 * queue it again on the next daily run.
 */
async function alreadyReminded(orderId: string): Promise<boolean> {
  const snap = await db()
    .collection("waNotifications")
    .where("source.entityId", "==", orderId)
    .get();
  return snap.docs.some((d) => d.data()?.template === TEMPLATE);
}

/** Resolves the seller's WhatsApp phone the same way notifySellerOnOrder does. */
async function resolveSellerPhone(
  d: Record<string, unknown>,
): Promise<string> {
  const direct = firstPhone(d.sellerPhone, d.sellerId, d.storePhone);
  if (direct) return direct;

  const sellerId = String(d.sellerId ?? "").trim();
  if (!sellerId) return "";

  // Legacy orders keyed only by UID — resolve via uidIndex → manufacturers/users.
  try {
    const idx = await db().collection("uidIndex").doc(sellerId).get();
    const viaIdx = firstPhone(idx.data()?.phone);
    if (viaIdx) return viaIdx;
  } catch {
    /* fall through */
  }
  for (const col of ["manufacturers", "users"]) {
    try {
      const s = await db().collection(col).doc(sellerId).get();
      const p = firstPhone(s.data()?.phone, s.data()?.ownerPhone, s.data()?.whatsapp);
      if (p) return p;
    } catch {
      /* keep trying */
    }
  }
  return "";
}

/** First item's display name, with a "+N more" suffix when the order has several. */
function productSummary(d: Record<string, unknown>): string {
  const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
  const first = items.length ? String(items[0].name ?? items[0].productName ?? "").trim() : "";
  if (!first) return "तुमची ऑर्डर"; // "your order"
  return items.length > 1 ? `${first} +${items.length - 1} more` : first;
}

export interface RunOptions {
  /** Hours an order must have been pending before it becomes eligible. */
  minPendingHours?: number;
  /** Restrict the run to a single order (test/dev). */
  onlyOrderId?: string;
  /** Detect + report eligible orders without queueing anything. */
  dryRun?: boolean;
}

export interface RunResult {
  scanned: number;
  eligible: number;
  queued: number;
  skipped: Array<{ orderId: string; reason: string }>;
  queuedOrders: Array<{
    orderId: string;
    sellerPhone: string;
    retailerName: string;
    productName: string;
    pendingDays: number;
    dryRun: boolean;
  }>;
}

/**
 * Scans online delivery orders still awaiting accept/reject and queues one
 * Marathi `order_accept_pending` WhatsApp reminder per order that has been
 * pending ≥ minPendingHours and has not already been reminded.
 *
 * Shared by the daily scheduler and the on-demand test endpoint. Only WRITES to
 * waNotifications via queueWaNotification — the existing sendWaNotification
 * trigger does the actual Cloud API send, so no WA secrets are needed here.
 */
export async function runOrderAcceptPendingReminders(
  opts: RunOptions = {},
): Promise<RunResult> {
  const minHours = opts.minPendingHours ?? DEFAULT_MIN_PENDING_HOURS;
  const now = Date.now();

  const result: RunResult = {
    scanned: 0,
    eligible: 0,
    queued: 0,
    skipped: [],
    queuedOrders: [],
  };

  // Candidate set: a single order (test) or every order still in "placed".
  // `status == "placed"` is a single-field equality → auto-indexed, no composite
  // index needed. Elapsed time is computed in memory.
  let docs: admin.firestore.QueryDocumentSnapshot[] | admin.firestore.DocumentSnapshot[];
  if (opts.onlyOrderId) {
    const s = await db().collection("orders").doc(opts.onlyOrderId).get();
    docs = s.exists ? [s] : [];
  } else {
    const snap = await db()
      .collection("orders")
      .where("status", "==", PENDING_STATUS)
      .get();
    docs = snap.docs;
  }

  for (const doc of docs) {
    result.scanned++;
    const orderId = doc.id;
    const d = doc.data() as Record<string, unknown>;

    // Re-check the CURRENT status — for onlyOrderId this is the only status
    // gate; for the scheduled query it re-confirms the snapshot.
    if (String(d.status ?? "") !== PENDING_STATUS) {
      result.skipped.push({ orderId, reason: `status is "${d.status}" — not pending` });
      continue;
    }

    const createdMs = toMillis(d.createdAt);
    if (createdMs == null) {
      result.skipped.push({ orderId, reason: "no usable createdAt" });
      continue;
    }

    const pendingHours = (now - createdMs) / MS_PER_HOUR;
    if (pendingHours < minHours) {
      result.skipped.push({
        orderId,
        reason: `pending ${pendingHours.toFixed(1)}h < ${minHours}h`,
      });
      continue;
    }
    result.eligible++;

    if (await alreadyReminded(orderId)) {
      result.skipped.push({ orderId, reason: "already reminded (idempotent)" });
      continue;
    }

    const sellerPhone = await resolveSellerPhone(d);
    if (!sellerPhone) {
      result.skipped.push({ orderId, reason: "seller phone unresolved" });
      logger.warn("[orderAcceptPending] skipping — no seller phone", {
        orderId, sellerId: d.sellerId ?? null,
      });
      continue;
    }

    // {{1}}: retailer's BUSINESS name, falling back to their real (owner) name.
    // sellerName on the order is the shop/business name; displayName() then
    // prefers businessName → shopName → name → ownerName. Never the customer.
    const retailerName =
      String(d.sellerName ?? "").trim() ||
      (await displayName(sellerPhone, "")) ||
      "व्यापारी";
    const productName = productSummary(d);
    const pendingDays = Math.floor(pendingHours / 24);

    result.queuedOrders.push({
      orderId, sellerPhone, retailerName, productName, pendingDays, dryRun: !!opts.dryRun,
    });

    if (opts.dryRun) {
      logger.info("[orderAcceptPending] DRY RUN — would queue", {
        orderId, sellerPhone, retailerName, productName, pendingDays,
      });
      continue;
    }

    const docId = await queueWaNotification(
      sellerPhone,
      `⏳ ${pendingDays} दिवसांपासून एक ऑर्डर स्वीकारायची बाकी आहे. कृपया ऑर्डर पहा.`,
      {
        template: TEMPLATE,
        type: "order",
        payload: {
          retailerName,
          productName,
          pendingDays: String(pendingDays),
        },
        // entityId == orderId is what alreadyReminded() keys idempotency on.
        source: { event: "order_accept_pending", entityType: "order", entityId: orderId },
      },
    );

    if (docId) {
      result.queued++;
      logger.info("[orderAcceptPending] queued reminder", {
        orderId, sellerPhone, pendingDays, docId,
      });
    } else {
      result.skipped.push({ orderId, reason: "queueWaNotification returned null" });
    }
  }

  logger.info("[orderAcceptPending] run complete", {
    scanned: result.scanned,
    eligible: result.eligible,
    queued: result.queued,
    minHours,
    dryRun: !!opts.dryRun,
    onlyOrderId: opts.onlyOrderId ?? null,
  });
  return result;
}

/**
 * Daily at 5:30 PM IST: remind sellers of online delivery orders that have been
 * awaiting accept/reject for ≥24h and have not already been reminded.
 */
export const remindPendingOrderAcceptance = onSchedule(
  { schedule: "30 17 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 540 },
  async () => {
    await runOrderAcceptPendingReminders();
  },
);

/**
 * On-demand test endpoint so the flow can be verified without waiting 24h.
 *
 *   GET /testOrderAcceptPendingReminder
 *     ?minHours=0            lower the eligibility threshold (default 24)
 *     &orderId=<id>          target a single order instead of scanning all "placed"
 *     &dryRun=true           detect + report only, DO NOT queue/send (this is the default)
 *     &dryRun=false          actually queue → existing sender sends it
 *
 * SAFE BY DEFAULT: with no ?dryRun it runs as a dry run and sends nothing.
 * Idempotency still applies when dryRun=false, so re-hitting the endpoint for an
 * already-reminded order will NOT send a duplicate.
 */
export const testOrderAcceptPendingReminder = onRequest(async (req, res) => {
  const minHoursRaw = req.query.minHours;
  const minPendingHours =
    minHoursRaw !== undefined ? Number(minHoursRaw) : DEFAULT_MIN_PENDING_HOURS;
  if (Number.isNaN(minPendingHours) || minPendingHours < 0) {
    res.status(400).json({ error: "minHours must be a non-negative number" });
    return;
  }

  const onlyOrderId = req.query.orderId ? String(req.query.orderId).trim() : undefined;
  // Default to a dry run — only an explicit dryRun=false actually queues/sends.
  const dryRun = String(req.query.dryRun ?? "true").toLowerCase() !== "false";

  try {
    const result = await runOrderAcceptPendingReminders({ minPendingHours, onlyOrderId, dryRun });
    res.status(200).json({ ok: true, minPendingHours, onlyOrderId: onlyOrderId ?? null, dryRun, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[testOrderAcceptPendingReminder] failed", { error: msg });
    res.status(500).json({ ok: false, error: msg });
  }
});
