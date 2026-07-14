import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminDb } from "../../../lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// ── HMAC verification ────────────────────────────────────────────────────────

function verifyHmac(rawBody: Buffer, sigHeader: string | null): boolean {
  const appSecret = process.env.WA_APP_SECRET;
  if (!appSecret) return true; // dev: no secret configured
  if (!sigHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  try {
    const a = Buffer.from(sigHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Status update ─────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<string, number> = {
  pending: 0, sending: 1, sent: 2, delivered: 3, read: 4,
};

function toTs(epochString: string): Timestamp {
  const ms = parseInt(epochString, 10) * 1000;
  return Timestamp.fromMillis(isNaN(ms) ? Date.now() : ms);
}

async function applyStatusUpdate(status: {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string; message: string; error_data?: { details: string } }[];
}): Promise<void> {
  const db = getAdminDb();
  const snap = await db
    .collection("waNotifications")
    .where("metaMessageId", "==", status.id)
    .limit(1)
    .get();

  if (snap.empty) {
    console.warn(`[Webhook] No doc for metaMessageId=${status.id} status=${status.status}`);
    return;
  }

  const docSnap = snap.docs[0]!;
  const current = docSnap.data() as Record<string, unknown>;
  const currentOrder = STATUS_ORDER[String(current.status ?? "")] ?? 0;
  const serverTs = FieldValue.serverTimestamp();
  const eventTs = toTs(status.timestamp);

  let update: Record<string, unknown> | null = null;

  switch (status.status) {
    case "sent":
      if (currentOrder < STATUS_ORDER.sent) {
        update = { status: "sent", sentAt: eventTs, updatedAt: serverTs };
      } else if (!current.sentAt) {
        update = { sentAt: eventTs, updatedAt: serverTs };
      }
      break;

    case "delivered":
      if (current.status === "delivered" && current.deliveredAt) break;
      if (currentOrder > STATUS_ORDER.delivered) {
        if (!current.deliveredAt) update = { deliveredAt: eventTs, updatedAt: serverTs };
      } else {
        update = { status: "delivered", deliveredAt: eventTs, updatedAt: serverTs };
      }
      break;

    case "read":
      if (current.status === "read" && current.readAt) break;
      update = { status: "read", readAt: eventTs, updatedAt: serverTs };
      break;

    case "failed": {
      const firstError = status.errors?.[0];
      const lastError = firstError
        ? `[${firstError.code}] ${firstError.title}: ${firstError.message}` +
          (firstError.error_data ? ` — ${firstError.error_data.details}` : "")
        : "Unknown failure reported by Meta";
      update = { status: "failed", failedAt: eventTs, lastError, updatedAt: serverTs };
      break;
    }
  }

  if (update) {
    await docSnap.ref.update(update);
    console.log(`[Webhook] ${docSnap.id} → ${status.status} (metaId=${status.id})`);
  }
}

// ── Incoming message ──────────────────────────────────────────────────────────

async function saveIncomingMessage(
  msg: Record<string, unknown>,
  contacts: { wa_id: string; profile?: { name: string } }[]
): Promise<void> {
  const db = getAdminDb();
  const waId = String(msg.from ?? "");
  const sender = contacts.find((c) => c.wa_id === waId);

  const text =
    (msg.text as Record<string, string> | undefined)?.body ??
    (msg.image as Record<string, string> | undefined)?.caption ??
    (msg.video as Record<string, string> | undefined)?.caption ??
    (msg.document as Record<string, string> | undefined)?.caption ??
    (msg.button as Record<string, string> | undefined)?.text ??
    null;

  await db
    .collection("waIncomingMessages")
    .doc(String(msg.id ?? ""))
    .set(
      {
        phone: waId,
        waId: sender?.wa_id ?? waId,
        messageId: msg.id,
        messageType: msg.type,
        messageText: text,
        timestamp: Timestamp.fromMillis(parseInt(String(msg.timestamp ?? "0"), 10) * 1000),
        receivedAt: FieldValue.serverTimestamp(),
        rawPayload: msg,
      },
      { merge: false }
    );
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[Webhook] WA_WEBHOOK_VERIFY_TOKEN is not set");
    return new NextResponse("Server error", { status: 500 });
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[Webhook] Hub verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn(`[Webhook] Hub verification failed — token="${token}"`);
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = Buffer.from(await req.arrayBuffer());
  const sigHeader = req.headers.get("x-hub-signature-256");

  if (!verifyHmac(rawBody, sigHeader)) {
    console.warn("[Webhook] Rejected POST — HMAC mismatch");
    return new NextResponse("Forbidden", { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
  } catch {
    return new NextResponse("OK", { status: 200 });
  }

  if (payload.object !== "whatsapp_business_account") {
    return new NextResponse("OK", { status: 200 });
  }

  const entries = Array.isArray(payload.entry)
    ? (payload.entry as Record<string, unknown>[])
    : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes)
      ? (entry.changes as Record<string, unknown>[])
      : [];

    for (const change of changes) {
      if (change.field !== "messages") continue;
      const value = change.value as Record<string, unknown>;
      const contacts = Array.isArray(value.contacts)
        ? (value.contacts as { wa_id: string; profile?: { name: string } }[])
        : [];

      for (const status of (Array.isArray(value.statuses) ? value.statuses : []) as Record<string, unknown>[]) {
        try {
          await applyStatusUpdate(status as Parameters<typeof applyStatusUpdate>[0]);
        } catch (err) {
          console.error(`[Webhook] Status update error:`, err instanceof Error ? err.message : err);
        }
      }

      for (const msg of (Array.isArray(value.messages) ? value.messages : []) as Record<string, unknown>[]) {
        try {
          await saveIncomingMessage(msg, contacts);
        } catch (err) {
          console.error(`[Webhook] Incoming message error:`, err instanceof Error ? err.message : err);
        }
      }
    }
  }

  return new NextResponse("OK", { status: 200 });
}
