import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getWaProvider } from "../../../lib/wa/provider";

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

/** Returns true for a role='team' doc granted the "whatsapp" admin section. */
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

    // Primary: users/{uid} — this is where promoteToAdmin writes.
    // Also accepts "team" accounts with the whatsapp section granted, so a
    // limited-access team member can reply from the WA inbox.
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data() as Record<string, unknown> | undefined;
    if (userSnap.exists && (userData?.role === "admin" || isTeamWithWhatsappAccess(userData))) {
      return uid;
    }

    // Fallback: phone-keyed users (uidIndex → phone → users/{phone})
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
  } catch (err) {
    console.error("[WA Send] verifyAdminUser failed:", err instanceof Error ? err.message : String(err));
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

  let body: { phone: string; text: string };
  try {
    body = (await req.json()) as { phone: string; text: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { phone, text } = body;
  if (!phone?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "phone and text are required" }, { status: 400 });
  }

  const to = toE164(phone);

  let metaMessageId: string;
  try {
    const provider = getWaProvider();
    const result = await provider.sendTextMessage(to, text.trim());
    metaMessageId = result.metaMessageId;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[WA Send] provider error:", detail);
    return NextResponse.json({ error: "WhatsApp send failed", detail }, { status: 502 });
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Save outgoing message to waConversations/{phone}/messages
  await db
    .collection("waConversations")
    .doc(to)
    .collection("messages")
    .doc(metaMessageId)
    .set({
      direction: "outgoing",
      text: text.trim(),
      messageType: "text",
      timestamp: now,
      messageId: metaMessageId,
      status: "sent",
      sentBy: adminUid,
    });

  // Update conversation metadata (merge so existing incoming fields survive)
  await db
    .collection("waConversations")
    .doc(to)
    .set(
      {
        phone: to,
        lastOutgoingAt: now,
        lastMessageAt: now, // the admin inbox's sort field
        lastOutgoingText: text.trim(),
        status: "open",
        updatedAt: now,
      },
      { merge: true }
    );

  console.log(`[WA Send] to=${to} metaId=${metaMessageId} adminUid=${adminUid}`);

  return NextResponse.json({ ok: true, metaMessageId });
}
