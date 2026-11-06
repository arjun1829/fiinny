import { NextRequest, NextResponse } from "next/server";
import { isStaffOf } from "../../../lib/shop-team-server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { getWaProvider } from "../../../lib/wa/provider";
import {
  MAX_TRACKING_SENDS,
  TRACKING_ID_TYPES,
  trackingIdTypeLabel,
  type TrackingIdType,
  type TrackingSend,
} from "../../../../types/order";

/**
 * POST /api/orders/tracking
 *
 * Saves a shipment tracking link against an order and, optionally, sends the
 * customer the approved `order_tracking_link` WhatsApp template. This is the
 * ONLY writer of the order's `tracking` field — firestore.rules forbids any
 * client write to it — so every safety rule below is enforced on the server and
 * cannot be bypassed from the browser:
 *
 *   • Only the order's own seller (or an admin) may act on it.
 *   • The tracking URL must be a valid http(s) URL.
 *   • At most MAX_TRACKING_SENDS (2) *successful* sends per order, across the
 *     initial dispatch send and any later resend. Failed sends never count.
 *   • A short-lived `sendLock` makes a double-click / retry a no-op rather than
 *     a second message, and the client `requestId` makes the whole call
 *     idempotent (replaying a request that already succeeded returns that send,
 *     it does not send again).
 *   • A WhatsApp failure returns an error but NEVER changes the order status and
 *     NEVER records a send — the dispatch the client already did stands on its
 *     own, independent of this message.
 *
 * Body: { orderId, url?, idType?, idLabel?, id?, send?, requestId }
 *   url       — tracking link to save (optional when only resending the saved one)
 *   idType    — tracking-ID identifier type key (awb/lr/consignment/…/other)
 *   idLabel   — custom label, used only when idType === "other"
 *   id        — the tracking identifier itself (trimmed; any characters allowed)
 *   send      — true to send/resend the WhatsApp message now; false to only save
 *   requestId — client-generated idempotency key (crypto.randomUUID())
 *
 * The approved `order_tracking_link` template has FOUR body variables:
 *   {{1}} customerName  {{2}} trackingUrl  {{3}} idType label  {{4}} trackingId
 * so a send requires a valid url, a non-empty id, and — when idType is "other" —
 * a non-empty custom label.
 */

const TEMPLATE = "order_tracking_link" as const;
const TEMPLATE_LANG = "hi";
// How long a sendLock is honoured before it is treated as stale (a crash mid-send
// must not block the order's tracking message forever).
const LOCK_TTL_MS = 2 * 60 * 1000;

/**
 * Whether sending the tracking template is currently allowed. The template is
 * APPROVED in Meta (verified 2026-10-13), so this defaults to enabled. Set
 * ORDER_TRACKING_LINK_ENABLED="false" to disable sends (e.g. if the template is
 * ever put back under review) — saving a link still works while disabled.
 */
function isTrackingSendEnabled(): boolean {
  return process.env.ORDER_TRACKING_LINK_ENABLED !== "false";
}

function isValidTrackingUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isKnownIdType(raw: unknown): raw is TrackingIdType {
  return typeof raw === "string" && TRACKING_ID_TYPES.some((t) => t.value === raw);
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

type AuthResult =
  | { ok: true; uid: string; isAdmin: boolean; phone: string | null; response?: undefined }
  | { ok: false; response: NextResponse };

async function authenticate(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization token" }, { status: 401 }) };
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid authorization token" }, { status: 401 }) };
  }

  const db = getAdminDb();
  const [byUid, idx] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("uidIndex").doc(uid).get(),
  ]);
  let isAdmin = byUid.exists && byUid.data()?.role === "admin";
  const phone: string | null = idx.exists ? String(idx.data()?.phone ?? "") || null : null;
  if (!isAdmin && phone) {
    const byPhone = await db.collection("users").doc(phone).get();
    isAdmin = byPhone.exists && byPhone.data()?.role === "admin";
  }
  return { ok: true, uid, isAdmin, phone };
}

function isFresh(iso: string | undefined | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t < LOCK_TTL_MS;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const db = getAdminDb();

  let body: {
    orderId?: string; url?: string; idType?: string; idLabel?: string; id?: string;
    send?: boolean; requestId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { orderId } = body;
  const requestId = (body.requestId ?? "").trim();
  const wantSend = body.send === true;
  const providedUrl = typeof body.url === "string" ? body.url.trim() : undefined;
  // Tracking-ID fields. `undefined` means "not supplied by this request" (so the
  // existing saved value is kept); a supplied value is trimmed and validated.
  const providedIdType = body.idType !== undefined
    ? (isKnownIdType(body.idType)
        ? body.idType
        : NextResponse.json({ error: "Unknown tracking ID type." }, { status: 400 }))
    : undefined;
  if (providedIdType instanceof NextResponse) return providedIdType;
  const providedCustomLabel = typeof body.idLabel === "string" ? body.idLabel.trim() : undefined;
  const providedId = typeof body.id === "string" ? body.id.trim() : undefined;

  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  if (providedUrl !== undefined && !isValidTrackingUrl(providedUrl)) {
    return NextResponse.json({ error: "Enter a valid http(s) tracking link." }, { status: 400 });
  }

  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const order = snap.data() as FirebaseFirestore.DocumentData;

  // ── Authorization: the order's own seller, or an admin ──────────────────────
  if (!auth.isAdmin) {
    const isOwner =
      (auth.phone && auth.phone === order.sellerPhone) || order.sellerId === auth.uid;
    // A shop helper with the Orders permission acts for the seller.
    if (!isOwner && !(await isStaffOf(auth.phone, order.sellerPhone, "orders"))) {
      return NextResponse.json({ error: "This is not your order." }, { status: 403 });
    }
  }

  // Tracking is only meaningful once the parcel has left the seller.
  const dispatchedStates = ["dispatched", "out_for_delivery", "delivered"];
  if (!dispatchedStates.includes(order.status)) {
    return NextResponse.json(
      { error: `Tracking links can only be added once an order is dispatched (order is "${order.status}").` },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();
  const existingTracking = (order.tracking ?? {}) as {
    url?: string;
    idType?: TrackingIdType;
    idTypeLabel?: string;
    id?: string;
    addedAt?: string;
    addedBy?: string;
    sendLock?: { requestId: string; at: string } | null;
    sends?: TrackingSend[];
  };
  // Resolve each field to the request's value when supplied, otherwise the value
  // already saved on the order (so a bare resend reuses the stored details).
  const urlToUse = providedUrl ?? existingTracking.url;
  const idTypeToUse = providedIdType ?? existingTracking.idType;
  const customLabelToUse = providedCustomLabel ?? existingTracking.idTypeLabel;
  const idToUse = providedId ?? existingTracking.id;
  const idLabelResolved = trackingIdTypeLabel(idTypeToUse, customLabelToUse);

  // ── Save-only path (no send) ────────────────────────────────────────────────
  if (!wantSend) {
    if (!isValidTrackingUrl(urlToUse)) {
      return NextResponse.json({ error: "A valid tracking link is required." }, { status: 400 });
    }
    if (idTypeToUse === "other" && providedIdType !== undefined && !customLabelToUse) {
      return NextResponse.json({ error: "Enter a label for the custom tracking ID type." }, { status: 400 });
    }
    // Persist only the identifier fields that were actually supplied — never
    // fabricate an id/type, and leave any previously-saved value untouched.
    const idFields: Record<string, unknown> = {};
    if (providedIdType !== undefined) idFields["tracking.idType"] = idTypeToUse;
    if (idTypeToUse === "other") {
      if (customLabelToUse) idFields["tracking.idTypeLabel"] = customLabelToUse;
    } else if (providedIdType !== undefined) {
      idFields["tracking.idTypeLabel"] = FieldValue.delete();
    }
    if (providedId !== undefined && providedId) idFields["tracking.id"] = providedId;
    await orderRef.update({
      "tracking.url": urlToUse,
      "tracking.addedAt": existingTracking.addedAt ?? nowIso,
      "tracking.addedBy": existingTracking.addedBy ?? auth.uid,
      "tracking.updatedAt": nowIso,
      "tracking.sends": existingTracking.sends ?? [],
      ...idFields,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const sendsUsed = (existingTracking.sends ?? []).length;
    return NextResponse.json({ ok: true, saved: true, sent: false, sendsUsed, sendsRemaining: MAX_TRACKING_SENDS - sendsUsed });
  }

  // ── Send path ───────────────────────────────────────────────────────────────
  if (!isTrackingSendEnabled()) {
    return NextResponse.json(
      { error: "Tracking messages are temporarily disabled (the WhatsApp template is under review)." },
      { status: 409 },
    );
  }
  if (!isValidTrackingUrl(urlToUse)) {
    return NextResponse.json({ error: "A valid tracking link is required before sending." }, { status: 400 });
  }
  // The 4-variable template needs an identifier type, the identifier, and (for a
  // custom type) its label. idType is guaranteed defined past this point.
  if (!idTypeToUse) {
    return NextResponse.json({ error: "A tracking ID type is required before sending." }, { status: 400 });
  }
  if (!idToUse) {
    return NextResponse.json({ error: "A tracking ID is required before sending." }, { status: 400 });
  }
  if (idTypeToUse === "other" && !customLabelToUse) {
    return NextResponse.json({ error: "Enter a label for the custom tracking ID type." }, { status: 400 });
  }
  const customerPhone = String(order.customerPhone ?? "").trim();
  if (!customerPhone) {
    return NextResponse.json({ error: "This order has no customer phone number to message." }, { status: 409 });
  }

  // Claim: atomically dedupe by requestId, enforce the send limit, and take the
  // in-flight lock. Returns a verdict the rest of the handler acts on.
  type Claim =
    | { kind: "idempotent"; send: TrackingSend }
    | { kind: "limit"; used: number }
    | { kind: "in_flight" }
    | { kind: "go"; sends: TrackingSend[] };
  const claim = await db.runTransaction<Claim>(async (txn) => {
    const fresh = await txn.get(orderRef);
    const data = fresh.data() as FirebaseFirestore.DocumentData;
    const tracking = (data.tracking ?? {}) as typeof existingTracking;
    const sends = Array.isArray(tracking.sends) ? tracking.sends : [];

    const already = sends.find((s) => s.requestId === requestId);
    if (already) return { kind: "idempotent", send: already };

    if (sends.length >= MAX_TRACKING_SENDS) return { kind: "limit", used: sends.length };

    const lock = tracking.sendLock;
    if (lock && lock.requestId !== requestId && isFresh(lock.at)) {
      return { kind: "in_flight" };
    }

    txn.update(orderRef, {
      "tracking.url": urlToUse,
      "tracking.idType": idTypeToUse,
      ...(idTypeToUse === "other"
        ? { "tracking.idTypeLabel": customLabelToUse }
        : { "tracking.idTypeLabel": FieldValue.delete() }),
      "tracking.id": idToUse,
      "tracking.addedAt": tracking.addedAt ?? nowIso,
      "tracking.addedBy": tracking.addedBy ?? auth.uid,
      "tracking.updatedAt": nowIso,
      "tracking.sends": sends,
      "tracking.sendLock": { requestId, at: nowIso },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { kind: "go", sends };
  });

  if (claim.kind === "idempotent") {
    const used = (await orderRef.get()).data()?.tracking?.sends?.length ?? 0;
    return NextResponse.json({
      ok: true, saved: true, sent: true, duplicate: true,
      metaMessageId: claim.send.metaMessageId,
      sendsUsed: used, sendsRemaining: MAX_TRACKING_SENDS - used,
    });
  }
  if (claim.kind === "limit") {
    return NextResponse.json(
      { error: `This order has already used all ${MAX_TRACKING_SENDS} tracking-message sends.`, sendsUsed: claim.used, sendsRemaining: 0 },
      { status: 409 },
    );
  }
  if (claim.kind === "in_flight") {
    return NextResponse.json(
      { error: "A tracking message is already being sent for this order. Please wait a moment." },
      { status: 409 },
    );
  }

  // Record the attempt in waNotifications (the existing notification-record
  // convention) regardless of outcome — created directly as "sent"/"failed" so
  // the sendWaNotification trigger (which only claims "pending" docs) ignores it
  // and cannot cause a second send.
  const notifRef = db.collection("waNotifications").doc();
  const customerName = String(order.customerName ?? "ग्राहक");
  // {{1}} name · {{2}} tracking URL · {{3}} ID-type label · {{4}} tracking ID.
  const components = [
    {
      type: "body",
      parameters: [
        { type: "text", text: customerName },
        { type: "text", text: urlToUse as string },
        { type: "text", text: idLabelResolved },
        { type: "text", text: idToUse as string },
      ],
    },
  ];
  const baseNotif = {
    phone: toE164(customerPhone),
    message: `📦 ${customerName} — आपका ऑर्डर डिस्पैच हो गया है। ट्रैक करें: ${urlToUse} (${idLabelResolved}: ${idToUse})`,
    template: TEMPLATE,
    payload: {
      customerName: String(order.customerName ?? ""),
      trackingUrl: urlToUse as string,
      trackingIdTypeLabel: idLabelResolved,
      trackingId: idToUse as string,
      orderId,
    },
    source: { event: "order_tracking_link", entityType: "order", entityId: orderId },
    type: "order" as const,
    templateComponents: components,
    createdAt: FieldValue.serverTimestamp(),
    maxRetries: 0,
    retryCount: 1,
  };

  let metaMessageId: string;
  try {
    const provider = getWaProvider();
    const result = await provider.sendTemplateMessage(toE164(customerPhone), TEMPLATE, TEMPLATE_LANG, components);
    metaMessageId = result.metaMessageId;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[orders/tracking] WhatsApp send failed:", detail);
    // Record the failure, release the lock, DO NOT append a send, DO NOT touch
    // the order status. The dispatch the client already performed is untouched.
    await Promise.all([
      notifRef.set({ ...baseNotif, status: "failed", metaMessageId: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: FieldValue.serverTimestamp(), lastError: detail }),
      orderRef.update({ "tracking.sendLock": null, updatedAt: FieldValue.serverTimestamp() }),
    ]);
    return NextResponse.json({ error: "WhatsApp send failed. The order stays dispatched — you can retry.", detail }, { status: 502 });
  }

  // Success: persist the notification record, then append the send + release the
  // lock in a transaction that re-checks the limit (defensive against races).
  await notifRef.set({ ...baseNotif, status: "sent", metaMessageId, sentAt: FieldValue.serverTimestamp(), deliveredAt: null, readAt: null, failedAt: null, lastError: null });

  const newSend: TrackingSend = {
    at: nowIso, url: urlToUse as string,
    idType: idTypeToUse, idTypeLabel: idLabelResolved, id: idToUse as string,
    metaMessageId, waNotificationId: notifRef.id, sentBy: auth.uid, requestId,
  };
  const used = await db.runTransaction<number>(async (txn) => {
    const fresh = await txn.get(orderRef);
    const tracking = (fresh.data()?.tracking ?? {}) as typeof existingTracking;
    const sends = Array.isArray(tracking.sends) ? [...tracking.sends] : [];
    if (!sends.find((s) => s.requestId === requestId)) sends.push(newSend);
    txn.update(orderRef, { "tracking.sends": sends, "tracking.sendLock": null, updatedAt: FieldValue.serverTimestamp() });
    return sends.length;
  });

  console.log(`[orders/tracking] sent order=${orderId} metaId=${metaMessageId} by=${auth.uid} used=${used}/${MAX_TRACKING_SENDS}`);
  return NextResponse.json({
    ok: true, saved: true, sent: true,
    metaMessageId, sendsUsed: used, sendsRemaining: Math.max(0, MAX_TRACKING_SENDS - used),
  });
}
