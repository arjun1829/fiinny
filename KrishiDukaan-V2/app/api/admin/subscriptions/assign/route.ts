import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { requireAdmin } from "../../../../lib/admin-auth";
import { PLAN_FEATURE_CATALOG } from "../../../../admin/_lib/plan-features";

const VALID_FEATURE_KEYS = new Set(PLAN_FEATURE_CATALOG.map((f) => f.key));

// ─── POST /api/admin/subscriptions/assign ──────────────────────────────────
//
// The "custom subscription" flow: assigns a subscription (optionally based
// on an existing Plan, always overridable) to a specific retailer/
// manufacturer. Direct grant only — no payment is collected here, matching
// the one existing admin-grant precedent (adminManualActivate in
// app/firebase.ts). Writes users/{phone} + subscriptions/{new} +
// payments/{new} + adminLogs atomically in a single transaction (the
// existing client-side adminManualActivate does the same three writes
// sequentially, non-transactionally).
export async function POST(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const body = await request.json();
    const {
      targetPhone, planId, seats, price, durationMonths,
      startDate: startDateRaw, features, limits, notes,
    } = body as {
      targetPhone?: string; planId?: string | null; seats?: number; price?: number;
      durationMonths?: number; startDate?: string; features?: string[];
      limits?: Record<string, number>; notes?: string;
    };

    const phone = String(targetPhone ?? "").trim();
    if (!phone) return NextResponse.json({ error: "Target user is required." }, { status: 400 });

    const seatsNum = Number(seats);
    if (!Number.isInteger(seatsNum) || seatsNum <= 0) {
      return NextResponse.json({ error: "Seats must be a positive integer." }, { status: 400 });
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return NextResponse.json({ error: "Price must be a non-negative number." }, { status: 400 });
    }
    if (Math.round(priceNum * 100) !== priceNum * 100) {
      return NextResponse.json({ error: "Price cannot have more than 2 decimal places." }, { status: 400 });
    }
    const durationNum = Number(durationMonths);
    if (!Number.isInteger(durationNum) || durationNum <= 0) {
      return NextResponse.json({ error: "Duration (months) must be a positive integer." }, { status: 400 });
    }

    const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
    }
    const expiryDate = new Date(startDate);
    expiryDate.setMonth(expiryDate.getMonth() + durationNum);
    if (expiryDate <= startDate) {
      return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });
    }

    const featureKeys = Array.isArray(features) ? features.map(String) : [];
    for (const f of featureKeys) {
      if (!VALID_FEATURE_KEYS.has(f as any)) {
        return NextResponse.json({ error: `Unknown feature key: ${f}` }, { status: 400 });
      }
    }

    const adminDb = getAdminDb();
    const userRef = adminDb.collection("users").doc(phone);

    const result = await adminDb.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) return { status: 404 as const, error: "Target user not found." };
      const userData = userSnap.data()!;
      const role = userData.role;
      if (role !== "retailer" && role !== "manufacturer") {
        return { status: 400 as const, error: "Target user must be a retailer or manufacturer." };
      }

      let basePlanPrice: number | null = null;
      let planName = "Custom";
      if (planId) {
        const planSnap = await tx.get(adminDb.collection("plans").doc(planId));
        if (!planSnap.exists) return { status: 404 as const, error: "Selected plan not found." };
        const plan = planSnap.data()!;
        basePlanPrice = Number(plan.price) || 0;
        planName = String(plan.name ?? "Custom");
      }

      const now = FieldValue.serverTimestamp();
      const isScheduled = startDate.getTime() > Date.now();
      const authUid = String(userData.uid ?? "");
      const currentSeats = Number(userData.totalSeats) || 0;

      const subRef = adminDb.collection("subscriptions").doc();
      tx.set(subRef, {
        ownerId: authUid || phone,
        ownerPhone: phone,
        ownerType: role,
        planId: planId || null,
        planName,
        isCustom: true,
        // Genuine admin-assigned subscription, not a promotional grant — the
        // admin status filters query isPromotional === false.
        isPromotional: false,
        basePlanPrice,
        seatsPurchased: seatsNum,
        durationMonths: durationNum,
        amountPaid: priceNum,
        currency: "INR",
        razorpayOrderId: null,
        razorpayPaymentId: null,
        subscriptionStatus: isScheduled ? "scheduled" : "active",
        features: featureKeys,
        limits: (limits && typeof limits === "object") ? limits : {},
        notes: notes ? String(notes).trim() : null,
        createdBy: caller.uid,
        activatedByAdmin: true,
        startDate: Timestamp.fromDate(startDate),
        expiryDate: Timestamp.fromDate(expiryDate),
        createdAt: now,
        updatedAt: now,
      });

      const paymentRef = adminDb.collection("payments").doc();
      tx.set(paymentRef, {
        userId: authUid || phone,
        userPhone: phone,
        amount: priceNum,
        seatCount: seatsNum,
        durationMonths: durationNum,
        currency: "INR",
        razorpayOrderId: null,
        razorpayPaymentId: null,
        timestamp: now,
        status: "admin_granted",
      });

      // Only unlock access immediately if the subscription starts now — a
      // future-dated subscription is promoted to active (and isPaid flipped)
      // by the same daily expireSubscriptions Cloud Function that already
      // handles expiry (functions/src/index.ts).
      if (!isScheduled) {
        tx.set(userRef, {
          isPaid: true,
          subscriptionStatus: "paid",
          totalSeats: currentSeats + seatsNum,
          updatedAt: now,
        }, { merge: true });
      }

      tx.set(adminDb.collection("adminLogs").doc(), {
        action: "admin_subscription_assign",
        performedBy: caller.uid,
        targetId: subRef.id,
        after: {
          ownerPhone: phone, planId: planId || null, seats: seatsNum,
          price: priceNum, durationMonths: durationNum, isScheduled,
        },
        createdAt: now,
      });

      return { status: 200 as const, id: subRef.id };
    });

    if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, id: result.id });
  } catch (e) {
    console.error("[api/admin/subscriptions/assign POST]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to assign subscription." }, { status: 500 });
  }
}
