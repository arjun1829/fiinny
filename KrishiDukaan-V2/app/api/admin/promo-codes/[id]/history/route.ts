/**
 * Read-only change history for a single promo code.
 *
 * Additive endpoint — reads only `adminLogs`, which the existing promo
 * create/update/delete routes already write (`admin_promo_*` with before/after,
 * performedBy, createdAt, targetId = the code). No schema change is needed: the
 * audit trail already exists, this endpoint just surfaces it.
 *
 * For a code that predates any edit through the API there may be no update
 * entries — in that case only the create entry (or nothing, for codes added by
 * hand in the console) is returned. We never fabricate history.
 */
import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../../lib/firebase-admin";
import { requireAdmin } from "../../../../../lib/admin-auth";

interface Ctx {
  params: Promise<{ id: string }>;
}

const PROMO_ACTIONS = new Set([
  "admin_promo_create",
  "admin_promo_update",
  "admin_promo_delete",
]);

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  const t = v as { toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  return null;
}

export async function GET(request: Request, { params }: Ctx) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const { id } = await params;
    const adminDb = getAdminDb();

    // targetId is the code — single-field equality, auto-indexed. Filter the
    // action prefix and sort in memory so no composite index is required.
    const snap = await adminDb
      .collection("adminLogs")
      .where("targetId", "==", id)
      .get();

    const entries = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          action: String(x.action ?? ""),
          performedBy: x.performedBy != null ? String(x.performedBy) : null,
          before: (x.before ?? null) as Record<string, unknown> | null,
          after: (x.after ?? null) as Record<string, unknown> | null,
          createdAt: toIso(x.createdAt),
        };
      })
      .filter((e) => PROMO_ACTIONS.has(e.action))
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    // The current promo doc carries the authoritative created/updated metadata,
    // useful even when only a create log (or no log) exists.
    const docSnap = await adminDb.collection("promoCodes").doc(id).get();
    const doc = docSnap.exists ? docSnap.data() ?? {} : {};
    const meta = {
      createdBy: doc.createdBy != null ? String(doc.createdBy) : null,
      createdAt: toIso(doc.createdAt),
      updatedBy: doc.updatedBy != null ? String(doc.updatedBy) : null,
      updatedAt: toIso(doc.updatedAt),
    };

    return NextResponse.json({ code: id, meta, entries });
  } catch (e) {
    console.error("[api/admin/promo-codes/:id/history GET]", e);
    return NextResponse.json(
      { error: "Failed to load promo history." },
      { status: 500 },
    );
  }
}
