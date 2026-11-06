import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAdmin } from "../../../lib/admin-auth";
import {
  addMonths,
  isInvalidMarketingTemplate,
  normalizeMarketingTemplate,
  parseEligibility,
  PROMOTIONS_COLLECTION,
  RECIPIENTS_SUBCOLLECTION,
  SUBSCRIPTIONS_COLLECTION,
  validateDuration,
  validateSeats,
  type EligibilityFilter,
  type PromotionSummary,
  type PromotionTargetRole,
} from "../../../lib/promotions";

export const dynamic = "force-dynamic";

/** Normalizes a stored eligibility value (array now, or legacy string) to an array. */
function toEligibilityArray(raw: unknown): EligibilityFilter[] {
  if (Array.isArray(raw)) return parseEligibility(raw.join(","));
  if (typeof raw === "string") return parseEligibility(raw);
  return ["all"];
}

function toIso(ts: unknown): string | null {
  const v = ts as { toDate?: () => Date } | undefined;
  return v?.toDate ? v.toDate().toISOString() : null;
}

/** Derived display status for a promotion from its window. */
function promotionStatus(startMs: number, endMs: number | null, now: number): PromotionSummary["status"] {
  if (startMs > now) return "scheduled";
  if (endMs != null && endMs < now) return "ended";
  return "active";
}

// ─── GET /api/admin/promotions ──────────────────────────────────────────────
// Lists promotion definitions (newest first) for the history table.
export async function GET(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const db = getAdminDb();
    const snap = await db.collection(PROMOTIONS_COLLECTION).orderBy("createdAt", "desc").get();
    const now = Date.now();
    const promotions: PromotionSummary[] = snap.docs.map((d) => {
      const data = d.data();
      const startMs = data.startDate?.toMillis?.() ?? 0;
      const endMs = data.endDate?.toMillis?.() ?? null;
      return {
        id: d.id,
        name: String(data.name ?? ""),
        targetRole: (data.targetRole ?? "all") as PromotionTargetRole,
        eligibility: toEligibilityArray(data.eligibility),
        seatsPerRecipient: Number(data.seatsPerRecipient) || 0,
        durationMonths: Number(data.durationMonths) || 0,
        startDate: toIso(data.startDate) ?? "",
        endDate: toIso(data.endDate),
        notes: data.notes ? String(data.notes) : null,
        recipientCount: Number(data.recipientCount) || 0,
        status: promotionStatus(startMs, endMs, now),
        createdBy: String(data.createdBy ?? ""),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });
    return NextResponse.json({ promotions });
  } catch (e) {
    console.error("[api/admin/promotions GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load promotions." },
      { status: 500 },
    );
  }
}

// ─── POST /api/admin/promotions ─────────────────────────────────────────────
//
// Creates a promotion and grants promotional seats to every selected recipient.
// Each grant is a `subscriptions` doc (isPromotional + promotionId) so it reuses
// all existing access/seat/expiry infrastructure; the daily expireSubscriptions
// CF handles both future-dated activation and expiry. The promotion definition
// + a `recipients/{userPhone}` subcollection record the history.
//
// Retry-safe: an optional `clientRequestId` dedupes a re-sent request; within a
// promotion, recipients are keyed by phone so the same user is never granted
// twice. Nothing here overwrites an existing paid or manufacturer-assigned
// entitlement — grants are always new documents.
export async function POST(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const body = await request.json();
    const {
      name, targetRole, eligibility, seatsPerRecipient, durationMonths,
      startDate: startRaw, endDate: endRaw, notes, recipients, clientRequestId,
      marketingTemplate: marketingRaw,
    } = body as {
      name?: string; targetRole?: PromotionTargetRole; eligibility?: EligibilityFilter[] | string;
      seatsPerRecipient?: number; durationMonths?: number; startDate?: string;
      endDate?: string | null; notes?: string; clientRequestId?: string;
      recipients?: Array<{ phone?: string; role?: string }>;
      marketingTemplate?: string | null;
    };

    // Optional marketing template. Reject an unknown non-empty value rather than
    // silently dropping it; null = no marketing message (default behaviour).
    if (isInvalidMarketingTemplate(marketingRaw)) {
      return NextResponse.json({ error: "Unknown marketing template." }, { status: 400 });
    }
    const marketingTemplate = normalizeMarketingTemplate(marketingRaw);

    const promoName = String(name ?? "").trim();
    if (!promoName) return NextResponse.json({ error: "Promotion name is required." }, { status: 400 });

    const role: PromotionTargetRole =
      targetRole === "retailer" || targetRole === "manufacturer" ? targetRole : "all";
    const eligibilityList = toEligibilityArray(eligibility);

    const seatsCheck = validateSeats(seatsPerRecipient);
    if (seatsCheck.error) return NextResponse.json({ error: seatsCheck.error }, { status: 400 });
    const durationCheck = validateDuration(durationMonths);
    if (durationCheck.error) return NextResponse.json({ error: durationCheck.error }, { status: 400 });
    const seats = seatsCheck.value;
    const months = durationCheck.value;

    const startDate = startRaw ? new Date(startRaw) : new Date();
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
    }
    let endDate: Date | null = null;
    if (endRaw) {
      endDate = new Date(endRaw);
      if (isNaN(endDate.getTime())) return NextResponse.json({ error: "Invalid end date." }, { status: 400 });
      if (endDate <= startDate) {
        return NextResponse.json({ error: "Promotion end date must be after the start date." }, { status: 400 });
      }
    }

    const recipientList = Array.isArray(recipients) ? recipients : [];
    const phones = Array.from(
      new Set(recipientList.map((r) => String(r?.phone ?? "").trim()).filter(Boolean)),
    );
    if (phones.length === 0) {
      return NextResponse.json({ error: "Select at least one recipient." }, { status: 400 });
    }

    const db = getAdminDb();

    // Idempotent re-send guard: if a promotion with this clientRequestId already
    // exists, return it instead of granting again.
    if (clientRequestId) {
      const existing = await db
        .collection(PROMOTIONS_COLLECTION)
        .where("clientRequestId", "==", String(clientRequestId))
        .limit(1)
        .get();
      if (!existing.empty) {
        const d = existing.docs[0];
        return NextResponse.json({ success: true, id: d.id, recipientCount: Number(d.data().recipientCount) || 0, deduped: true });
      }
    }

    // Validate recipients exist and match the target role (authoritative read).
    const userRefs = phones.map((p) => db.collection("users").doc(p));
    const userSnaps = await db.getAll(...userRefs);
    const valid: Array<{
      phone: string; uid: string | null; role: "retailer" | "manufacturer"; businessName: string;
    }> = [];
    for (const snap of userSnaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      const r = data.role;
      if (r !== "retailer" && r !== "manufacturer") continue;
      if (role !== "all" && r !== role) continue;
      const businessName = String(
        data.businessName || data.shopName || data.name || data.ownerName || snap.id,
      );
      valid.push({ phone: snap.id, uid: data.uid ? String(data.uid) : null, role: r, businessName });
    }
    if (valid.length === 0) {
      return NextResponse.json({ error: "No valid recipients (none exist or match the target role)." }, { status: 400 });
    }

    const now = FieldValue.serverTimestamp();
    const nowMs = Date.now();
    const isScheduled = startDate.getTime() > nowMs;
    const expiryDate = addMonths(startDate, months);

    // Create the promotion definition first.
    const promoRef = db.collection(PROMOTIONS_COLLECTION).doc();
    await promoRef.set({
      name: promoName,
      targetRole: role,
      eligibility: eligibilityList,
      seatsPerRecipient: seats,
      durationMonths: months,
      startDate: Timestamp.fromDate(startDate),
      endDate: endDate ? Timestamp.fromDate(endDate) : null,
      notes: notes ? String(notes).trim() : null,
      marketingTemplate,
      recipientCount: valid.length,
      clientRequestId: clientRequestId ? String(clientRequestId) : null,
      createdBy: caller.uid,
      createdAt: now,
      updatedAt: now,
    });

    // Grant per-recipient in chunked batches (3 writes each: subscription +
    // recipient record + user access flag; well under the 500/batch cap).
    const CHUNK = 150;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const slice = valid.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const r of slice) {
        const subRef = db.collection(SUBSCRIPTIONS_COLLECTION).doc();
        batch.set(subRef, {
          ownerId: r.uid || r.phone,
          ownerPhone: r.phone,
          ownerType: r.role,
          planId: null,
          planName: promoName,
          isCustom: true,
          isPromotional: true,
          promotionId: promoRef.id,
          basePlanPrice: 0,
          seatsPurchased: seats,
          durationMonths: months,
          amountPaid: 0,
          currency: "INR",
          razorpayOrderId: null,
          razorpayPaymentId: null,
          subscriptionStatus: isScheduled ? "scheduled" : "active",
          features: [],
          limits: {},
          notes: notes ? String(notes).trim() : null,
          createdBy: caller.uid,
          activatedByAdmin: true,
          startDate: Timestamp.fromDate(startDate),
          expiryDate: Timestamp.fromDate(expiryDate),
          createdAt: now,
          updatedAt: now,
        });

        // History record — keyed by phone so a retry can't double-insert.
        // Also the trigger source for the free_seats_assigned WhatsApp: the
        // notifyOnPromotionSeatAssigned Cloud Function fires on this doc's
        // creation, so businessName is stored here for the template's {{1}}.
        const recRef = promoRef.collection(RECIPIENTS_SUBCOLLECTION).doc(r.phone);
        batch.set(recRef, {
          userPhone: r.phone,
          userId: r.uid,
          role: r.role,
          businessName: r.businessName,
          seatsGranted: seats,
          // Optional marketing template to send to this recipient (before the
          // free_seats_assigned confirmation). Stored here so the
          // notifyOnPromotionSeatAssigned Cloud Function has it per-recipient.
          marketingTemplate,
          startDate: Timestamp.fromDate(startDate),
          expiryDate: Timestamp.fromDate(expiryDate),
          status: isScheduled ? "scheduled" : "active",
          subscriptionId: subRef.id,
          createdAt: now,
          updatedAt: now,
        });

        // Unlock access immediately only when the promotion starts now. A
        // future-dated grant is promoted (and isPaid flipped) by the same daily
        // expireSubscriptions CF that handles scheduled admin subscriptions.
        // We only ever ADD seats / set isPaid:true — never clear an existing
        // paid or manufacturer-assigned entitlement.
        if (!isScheduled) {
          const userRef = db.collection("users").doc(r.phone);
          batch.set(
            userRef,
            {
              isPaid: true,
              subscriptionStatus: "paid",
              totalSeats: FieldValue.increment(seats),
              updatedAt: now,
            },
            { merge: true },
          );
        }
      }
      await batch.commit();
    }

    // The free_seats_assigned WhatsApp is sent by the notifyOnPromotionSeatAssigned
    // Cloud Function, which triggers on each recipient doc's creation above — so
    // it fires automatically after a successful assignment, needs no frontend
    // env flag, and is retry/duplicate-safe in the function itself.

    await db.collection("adminLogs").doc().set({
      action: "admin_promotion_create",
      performedBy: caller.uid,
      targetId: promoRef.id,
      after: {
        name: promoName, targetRole: role, seatsPerRecipient: seats,
        durationMonths: months, recipientCount: valid.length, isScheduled,
      },
      createdAt: now,
    });

    return NextResponse.json({ success: true, id: promoRef.id, recipientCount: valid.length });
  } catch (e) {
    console.error("[api/admin/promotions POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create promotion." },
      { status: 500 },
    );
  }
}
