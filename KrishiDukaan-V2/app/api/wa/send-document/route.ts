import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const GRAPH_API_VERSION = "v20.0";
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

// Allowed MIME types (WhatsApp document types)
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

function isTeamWithWhatsappAccess(data: Record<string, unknown> | undefined): boolean {
  if (!data || data.role !== "team") return false;
  const sections = data.adminSections;
  return Array.isArray(sections) && sections.includes("whatsapp");
}

async function verifyAdminUser(idToken: string): Promise<string | null> {
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const db = getAdminDb();

    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data() as Record<string, unknown> | undefined;
    if (userSnap.exists && (userData?.role === "admin" || isTeamWithWhatsappAccess(userData))) {
      return uid;
    }

    const idxSnap = await db.collection("uidIndex").doc(uid).get();
    if (idxSnap.exists) {
      const phone = String(idxSnap.data()?.phone ?? "").trim();
      if (phone) {
        const phoneSnap = await db.collection("users").doc(phone).get();
        const phoneData = phoneSnap.data() as Record<string, unknown> | undefined;
        if (phoneSnap.exists && (phoneData?.role === "admin" || isTeamWithWhatsappAccess(phoneData))) {
          return uid;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUid = await verifyAdminUser(authHeader.slice(7));
  if (!adminUid) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const accessToken = process.env.WA_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    return NextResponse.json({ error: "WhatsApp credentials not configured" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const phone = String(formData.get("phone") ?? "").trim();
  const file = formData.get("file");
  const caption = String(formData.get("caption") ?? "").trim();

  if (!phone) return NextResponse.json({ error: "phone is required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });

  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `File too large — maximum ${MAX_FILE_BYTES / 1024 / 1024} MB` }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported file type "${mimeType}". Supported: PDF, Word, Excel, PowerPoint, TXT, CSV.` },
      { status: 400 }
    );
  }

  const fileName = file.name;
  const fileSize = file.size;
  const to = toE164(phone);

  // ── Step 1: Upload media to Meta ─────────────────────────────────────────────
  let mediaId: string;
  try {
    const uploadForm = new FormData();
    uploadForm.append("messaging_product", "whatsapp");
    uploadForm.append("type", mimeType);
    uploadForm.append("file", new Blob([await file.arrayBuffer()], { type: mimeType }), fileName);

    const uploadRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: uploadForm,
      }
    );

    const uploadRaw = await uploadRes.text();
    console.log(`[WA Doc] Media upload ${uploadRes.status}:`, uploadRaw.slice(0, 200));

    if (!uploadRes.ok) {
      return NextResponse.json(
        { error: "Media upload to WhatsApp failed", detail: uploadRaw.slice(0, 300) },
        { status: 502 }
      );
    }

    const uploadData = JSON.parse(uploadRaw) as { id: string };
    mediaId = uploadData.id;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[WA Doc] Media upload threw:", detail);
    return NextResponse.json({ error: "Media upload failed", detail }, { status: 502 });
  }

  // ── Step 2: Send document message via Cloud API ───────────────────────────────
  let metaMessageId: string;
  try {
    const msgBody: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "document",
      document: {
        id: mediaId,
        filename: fileName,
        ...(caption ? { caption } : {}),
      },
    };

    console.log("[WA Doc] Sending document:", JSON.stringify(msgBody, null, 2));

    const sendRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(msgBody),
      }
    );

    const sendRaw = await sendRes.text();
    console.log(`[WA Doc] Send ${sendRes.status}:`, sendRaw.slice(0, 300));

    if (!sendRes.ok) {
      return NextResponse.json(
        { error: "Document send failed", detail: sendRaw.slice(0, 300) },
        { status: 502 }
      );
    }

    const sendData = JSON.parse(sendRaw) as { messages: Array<{ id: string }> };
    metaMessageId = sendData.messages[0]!.id;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[WA Doc] Send threw:", detail);
    return NextResponse.json({ error: "Document send failed", detail }, { status: 502 });
  }

  // ── Step 3: Persist to waConversations ───────────────────────────────────────
  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  await db
    .collection("waConversations")
    .doc(to)
    .collection("messages")
    .doc(metaMessageId)
    .set({
      direction: "outgoing",
      messageType: "document",
      text: caption || null,
      fileName,
      mimeType,
      fileSize,
      mediaId,
      messageId: metaMessageId,
      timestamp: now,
      status: "sent",
      sentBy: adminUid,
    });

  await db
    .collection("waConversations")
    .doc(to)
    .set(
      {
        phone: to,
        lastOutgoingAt: now,
        lastMessageAt: now, // the admin inbox's sort field
        lastOutgoingText: `📎 ${fileName}`,
        status: "open",
        updatedAt: now,
      },
      { merge: true }
    );

  console.log(`[WA Doc] to=${to} file="${fileName}" mediaId=${mediaId} metaId=${metaMessageId} adminUid=${adminUid}`);

  return NextResponse.json({ ok: true, metaMessageId, mediaId, fileName, mimeType });
}
