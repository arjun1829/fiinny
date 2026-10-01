/**
 * Toggle / edit / delete a single promo code. See ../route.ts for why this
 * collection is now the source of truth for checkout discounts.
 */
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { requireAdmin } from "../../../../lib/admin-auth";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Ctx) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const update: Record<string, unknown> = {};

    if (body.discountPercent !== undefined) {
      const pct = Number(body.discountPercent);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return NextResponse.json(
          { error: "Discount must be between 1 and 100 percent." },
          { status: 400 },
        );
      }
      update.discountPercent = pct;
    }
    if (body.active !== undefined) update.active = Boolean(body.active);
    if (body.note !== undefined) update.note = String(body.note ?? "").trim();

    if (body.applicablePlans !== undefined) {
      if (Array.isArray(body.applicablePlans) && body.applicablePlans.length > 0) {
        const plans = (body.applicablePlans as unknown[])
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0);
        update.applicablePlans = plans.length ? plans : FieldValue.delete();
      } else {
        update.applicablePlans = FieldValue.delete();
      }
    }

    if ("minSeats" in body) {
      if (body.minSeats != null && body.minSeats !== "") {
        const n = Number(body.minSeats);
        if (!Number.isInteger(n) || n <= 0) {
          return NextResponse.json({ error: "Minimum seats must be a positive whole number." }, { status: 400 });
        }
        update.minSeats = n;
      } else {
        update.minSeats = FieldValue.delete();
      }
    }

    if ("maxSeats" in body) {
      if (body.maxSeats != null && body.maxSeats !== "") {
        const n = Number(body.maxSeats);
        if (!Number.isInteger(n) || n <= 0) {
          return NextResponse.json({ error: "Maximum seats must be a positive whole number." }, { status: 400 });
        }
        update.maxSeats = n;
      } else {
        update.maxSeats = FieldValue.delete();
      }
    }

    if ("startDate" in body) {
      const v = body.startDate;
      if (typeof v === "string" && v.trim() && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
        update.startDate = v.trim();
      } else {
        update.startDate = FieldValue.delete();
      }
    }

    if ("endDate" in body) {
      const v = body.endDate;
      if (typeof v === "string" && v.trim() && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
        update.endDate = v.trim();
      } else {
        update.endDate = FieldValue.delete();
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const docRef = adminDb.collection("promoCodes").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Promo code not found." }, { status: 404 });
    }

    const now = FieldValue.serverTimestamp();

    // FieldValue.delete() is a Firestore write sentinel — valid in the document
    // being modified but not as a stored value in adminLogs. Replace sentinels
    // with null so the audit record is plain serialisable data.
    const logAfter = Object.fromEntries(
      Object.entries(update).map(([k, v]) =>
        [k, v instanceof FieldValue ? null : v],
      ),
    );

    const batch = adminDb.batch();
    batch.set(docRef, { ...update, updatedBy: caller.uid, updatedAt: now }, { merge: true });
    batch.set(adminDb.collection("adminLogs").doc(), {
      action: "admin_promo_update",
      performedBy: caller.uid,
      targetId: id,
      before: snap.data() ?? null,
      after: logAfter,
      createdAt: now,
    });
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/admin/promo-codes PATCH]", e);
    return NextResponse.json({ error: "Failed to update promo code." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const { id } = await params;
    const adminDb = getAdminDb();
    const docRef = adminDb.collection("promoCodes").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Promo code not found." }, { status: 404 });
    }

    const now = FieldValue.serverTimestamp();
    const batch = adminDb.batch();
    batch.delete(docRef);
    batch.set(adminDb.collection("adminLogs").doc(), {
      action: "admin_promo_delete",
      performedBy: caller.uid,
      targetId: id,
      before: snap.data() ?? null,
      createdAt: now,
    });
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/admin/promo-codes DELETE]", e);
    return NextResponse.json({ error: "Failed to delete promo code." }, { status: 500 });
  }
}
