import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { requireAdmin } from "../../../../lib/admin-auth";
import {
  parseEligibility,
  PROMOTIONS_COLLECTION,
  RECIPIENTS_SUBCOLLECTION,
  type EligibilityFilter,
  type PromotionRecipientRecord,
  type PromotionSummary,
  type PromotionTargetRole,
  type RecipientAssignmentStatus,
} from "../../../../lib/promotions";

/** Normalizes a stored eligibility value (array now, or legacy string) to an array. */
function toEligibilityArray(raw: unknown): EligibilityFilter[] {
  if (Array.isArray(raw)) return parseEligibility(raw.join(","));
  if (typeof raw === "string") return parseEligibility(raw);
  return ["all"];
}

export const dynamic = "force-dynamic";

function toIso(ts: unknown): string | null {
  const v = ts as { toDate?: () => Date } | undefined;
  return v?.toDate ? v.toDate().toISOString() : null;
}

// ─── GET /api/admin/promotions/[id] ─────────────────────────────────────────
// Returns one promotion plus its per-recipient assignment records. Each
// recipient's displayed status reflects live expiry: a record stored "active"
// whose expiry has passed reads "expired" even before the daily CF rewrites it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await params;

  try {
    const db = getAdminDb();
    const promoRef = db.collection(PROMOTIONS_COLLECTION).doc(id);
    const [promoSnap, recSnap] = await Promise.all([
      promoRef.get(),
      promoRef.collection(RECIPIENTS_SUBCOLLECTION).get(),
    ]);
    if (!promoSnap.exists) {
      return NextResponse.json({ error: "Promotion not found." }, { status: 404 });
    }
    const data = promoSnap.data()!;
    const now = Date.now();
    const startMs = data.startDate?.toMillis?.() ?? 0;
    const endMs = data.endDate?.toMillis?.() ?? null;

    const promotion: PromotionSummary = {
      id: promoSnap.id,
      name: String(data.name ?? ""),
      targetRole: (data.targetRole ?? "all") as PromotionTargetRole,
      eligibility: toEligibilityArray(data.eligibility),
      seatsPerRecipient: Number(data.seatsPerRecipient) || 0,
      durationMonths: Number(data.durationMonths) || 0,
      startDate: toIso(data.startDate) ?? "",
      endDate: toIso(data.endDate),
      notes: data.notes ? String(data.notes) : null,
      recipientCount: Number(data.recipientCount) || 0,
      status: startMs > now ? "scheduled" : endMs != null && endMs < now ? "ended" : "active",
      createdBy: String(data.createdBy ?? ""),
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    };

    const recipients: PromotionRecipientRecord[] = recSnap.docs.map((d) => {
      const r = d.data();
      const stored = String(r.status ?? "active") as RecipientAssignmentStatus;
      const expiryMs = r.expiryDate?.toMillis?.() ?? 0;
      const startRecMs = r.startDate?.toMillis?.() ?? 0;
      // Live-derive display status from the window unless explicitly revoked.
      let status: RecipientAssignmentStatus = stored;
      if (stored !== "revoked") {
        if (startRecMs > now) status = "scheduled";
        else if (expiryMs <= now) status = "expired";
        else status = "active";
      }
      return {
        userPhone: String(r.userPhone ?? d.id),
        userId: r.userId ? String(r.userId) : null,
        role: r.role === "manufacturer" ? "manufacturer" : "retailer",
        seatsGranted: Number(r.seatsGranted) || 0,
        startDate: toIso(r.startDate) ?? "",
        expiryDate: toIso(r.expiryDate) ?? "",
        status,
        subscriptionId: r.subscriptionId ? String(r.subscriptionId) : null,
      };
    });
    recipients.sort((a, b) => a.userPhone.localeCompare(b.userPhone));

    return NextResponse.json({ promotion, recipients });
  } catch (e) {
    console.error("[api/admin/promotions/[id] GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load promotion." },
      { status: 500 },
    );
  }
}
