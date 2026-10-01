import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/admin-auth";
import { getAdminDb } from "../../../lib/firebase-admin";
import { getWaProvider } from "../../../lib/wa/provider";
import { FieldValue } from "firebase-admin/firestore";

const TEMPLATE_NAME = "payment_failed_app_update";
const TEMPLATE_LANG = "mr";

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

function isValidIndianPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  // Accept 10-digit, 12-digit with 91 prefix
  return /^(91\d{10}|\d{10})$/.test(digits);
}

async function lookupName(db: FirebaseFirestore.Firestore, phone: string): Promise<string> {
  const tenDigit = phone.replace(/^91/, "");
  const candidates = Array.from(new Set([phone, tenDigit]));

  for (const p of candidates) {
    for (const col of ["users", "retailers", "manufacturers"]) {
      const snap = await db.collection(col).doc(p).get();
      if (!snap.exists) continue;
      const d = snap.data() as Record<string, unknown>;
      const name =
        String(d.ownerName ?? d.name ?? d.businessName ?? d.shopName ?? "").trim();
      if (name) return name;
    }
  }
  return "";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const caller = await requireAdmin(req);
  if (caller instanceof NextResponse) return caller;

  let body: { phones: string[] };
  try {
    body = (await req.json()) as { phones: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { phones } = body;
  if (!Array.isArray(phones) || phones.length === 0) {
    return NextResponse.json({ error: "phones array is required" }, { status: 400 });
  }
  if (phones.length > 100) {
    return NextResponse.json({ error: "Maximum 100 numbers per request" }, { status: 400 });
  }

  const db = getAdminDb();
  const provider = getWaProvider();
  const now = FieldValue.serverTimestamp();

  const results = await Promise.allSettled(
    phones.map(async (raw) => {
      const normalized = toE164(raw);

      if (!isValidIndianPhone(raw)) {
        return { phone: raw, normalized, ok: false, error: "Invalid phone number" };
      }

      try {
        const recipientName = (await lookupName(db, normalized)) || "User";
        const components = [
          {
            type: "body",
            parameters: [{ type: "text", text: recipientName }],
          },
        ];
        const result = await provider.sendTemplateMessage(normalized, TEMPLATE_NAME, TEMPLATE_LANG, components);

        // Record in waConversations so the WA inbox shows outgoing templates
        await db
          .collection("waConversations")
          .doc(normalized)
          .collection("messages")
          .doc(result.metaMessageId)
          .set({
            direction: "outgoing",
            text: null,
            messageType: "template",
            templateName: TEMPLATE_NAME,
            timestamp: now,
            messageId: result.metaMessageId,
            status: "sent",
            sentBy: caller.uid,
          });

        await db
          .collection("waConversations")
          .doc(normalized)
          .set(
            {
              phone: normalized,
              lastOutgoingAt: now,
              lastOutgoingText: `[Template: ${TEMPLATE_NAME}]`,
              status: "open",
              updatedAt: now,
            },
            { merge: true }
          );

        console.log(`[WA PaymentFailed] sent to=${normalized} metaId=${result.metaMessageId} adminUid=${caller.uid}`);
        return { phone: raw, normalized, ok: true, metaMessageId: result.metaMessageId };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[WA PaymentFailed] failed to=${normalized}:`, error);
        return { phone: raw, normalized, ok: false, error };
      }
    })
  );

  const output = results.map((r) =>
    r.status === "fulfilled" ? r.value : { phone: "", normalized: "", ok: false, error: String(r.reason) }
  );

  return NextResponse.json({ results: output });
}
