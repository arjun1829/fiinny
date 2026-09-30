import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { requireSection } from "../../../../lib/admin-auth";
import {
  REFERRAL_OWNER_TYPES,
  loadReferralStats,
  mapReferralCode,
  normalizeReferralCode,
} from "../../../../lib/referrals";

type Ctx = { params: Promise<{ code: string }> };

const refFor = (code: string) => getAdminDb().collection("referralCodes").doc(code);

/** GET — one code with full stats (funnel, 30-day series, follow-up leads). */
export async function GET(request: Request, ctx: Ctx) {
  const caller = await requireSection(request, "referrals");
  if (caller instanceof NextResponse) return caller;
  const code = normalizeReferralCode((await ctx.params).code);
  const snap = await refFor(code).get();
  if (!snap.exists) return NextResponse.json({ error: "Code not found." }, { status: 404 });
  const stats = await loadReferralStats(code);
  return NextResponse.json(
    { ...mapReferralCode(code, snap.data() ?? {}), stats },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * PATCH — edit owner / type / note, or pause (active: false) and resume.
 * The code string itself is the document id and cannot be renamed: links
 * already shared would silently stop crediting anyone.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const caller = await requireSection(request, "referrals");
  if (caller instanceof NextResponse) return caller;
  const code = normalizeReferralCode((await ctx.params).code);
  const ref = refFor(code);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Code not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (body.ownerName !== undefined) {
    const name = String(body.ownerName ?? "").trim();
    if (!name) return NextResponse.json({ error: "Owner name cannot be empty." }, { status: 400 });
    patch.ownerName = name;
  }
  if (body.ownerType !== undefined) {
    if (!(REFERRAL_OWNER_TYPES as string[]).includes(body.ownerType)) {
      return NextResponse.json({ error: "Unknown owner type." }, { status: 400 });
    }
    patch.ownerType = body.ownerType;
  }
  if (body.ownerUid !== undefined) patch.ownerUid = body.ownerUid ? String(body.ownerUid).trim() : null;
  if (body.note !== undefined) patch.note = String(body.note ?? "").trim().slice(0, 500);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const now = FieldValue.serverTimestamp();
  const db = getAdminDb();
  const batch = db.batch();
  batch.update(ref, { ...patch, updatedAt: now, updatedBy: caller.uid });
  batch.set(db.collection("adminLogs").doc(), {
    action: "referral_code_update",
    performedBy: caller.uid,
    targetId: `referralCodes/${code}`,
    before: Object.fromEntries(Object.keys(patch).map((k) => [k, snap.data()?.[k] ?? null])),
    after: patch,
    createdAt: now,
  });
  await batch.commit();
  return NextResponse.json({ success: true });
}

/**
 * DELETE — only for a code nobody has paid through yet (a typo, a test). A
 * code with purchases is paused instead, so its history keeps its owner.
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const caller = await requireSection(request, "referrals");
  if (caller instanceof NextResponse) return caller;
  const code = normalizeReferralCode((await ctx.params).code);
  const ref = refFor(code);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Code not found." }, { status: 404 });

  const db = getAdminDb();
  const used = await db.collection("paymentAttempts").where("referralCode", "==", code).limit(1).get();
  if (!used.empty) {
    return NextResponse.json(
      { error: "This code has payment history, so it can't be deleted. Pause it instead." },
      { status: 409 },
    );
  }
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.delete(ref);
  batch.set(db.collection("adminLogs").doc(), {
    action: "referral_code_delete",
    performedBy: caller.uid,
    targetId: `referralCodes/${code}`,
    before: { ...snap.data(), createdAt: null, updatedAt: null },
    after: null,
    createdAt: now,
  });
  await batch.commit();
  return NextResponse.json({ success: true });
}
