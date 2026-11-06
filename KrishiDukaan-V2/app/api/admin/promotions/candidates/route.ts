import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { requireAdmin } from "../../../../lib/admin-auth";
import {
  classifyRecipient,
  matchesEligibility,
  parseEligibility,
  type CandidateRecipient,
  type ClassificationSignals,
  type PromotionTargetRole,
  type RecipientStatus,
} from "../../../../lib/promotions";

export const dynamic = "force-dynamic";

// ─── GET /api/admin/promotions/candidates ──────────────────────────────────
//
// Returns retailers/manufacturers classified by their AUTHORITATIVE subscription
// state so the Promotions recipient table can filter by eligibility. Rather than
// run one query per user, the three source collections are bulk-read once and
// collapsed into per-user signals (see app/lib/promotions.ts classifyRecipient).
//
// Query params: role (all|retailer|manufacturer), eligibility
// (all|paid|none|promotional|expired), search (business name or phone).
export async function GET(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const url = new URL(request.url);
    const roleFilter = (url.searchParams.get("role") ?? "all") as PromotionTargetRole;
    const eligibility = parseEligibility(url.searchParams.get("eligibility"));
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();

    const db = getAdminDb();
    const now = Date.now();

    // ── Bulk-read the authoritative sources in parallel ──────────────────────
    const [retailerSnap, manufacturerSnap, subsSnap, mfrLinkSnap, seatSnap] = await Promise.all([
      db.collection("users").where("role", "==", "retailer").get(),
      db.collection("users").where("role", "==", "manufacturer").get(),
      db.collection("subscriptions").get(),
      db.collection("manufacturerRetailers").where("status", "==", "active").get(),
      db.collection("retailerSeatListings").where("listingType", "==", "assigned").where("status", "==", "active").get(),
    ]);

    // Per-identity subscription signals, keyed by BOTH ownerPhone and ownerId
    // (legacy uid-keyed subs exist alongside phone-keyed ones).
    type SubSignal = { activePaid: boolean; activePromo: boolean; expired: boolean };
    const subByKey = new Map<string, SubSignal>();
    const bump = (key: string | undefined, patch: Partial<SubSignal>) => {
      if (!key) return;
      const cur = subByKey.get(key) ?? { activePaid: false, activePromo: false, expired: false };
      subByKey.set(key, {
        activePaid: cur.activePaid || !!patch.activePaid,
        activePromo: cur.activePromo || !!patch.activePromo,
        expired: cur.expired || !!patch.expired,
      });
    };
    subsSnap.forEach((d) => {
      const data = d.data();
      const status = String(data.subscriptionStatus ?? "");
      const expiryMs = data.expiryDate?.toMillis?.() ?? 0;
      const isPromo = data.isPromotional === true;
      const isActive = status === "active" && expiryMs > now;
      const ownerPhone = data.ownerPhone ? String(data.ownerPhone) : undefined;
      const ownerId = data.ownerId ? String(data.ownerId) : undefined;
      if (isActive) {
        bump(ownerPhone, isPromo ? { activePromo: true } : { activePaid: true });
        bump(ownerId, isPromo ? { activePromo: true } : { activePaid: true });
      } else if (status === "expired" || status === "cancelled" || (status === "active" && expiryMs <= now)) {
        bump(ownerPhone, { expired: true });
        bump(ownerId, { expired: true });
      }
    });

    // Manufacturer-provided access (retailers only): active link OR assigned,
    // non-expired seat listing. Keyed by retailer phone and uid.
    const mfrAccessKeys = new Set<string>();
    mfrLinkSnap.forEach((d) => {
      const data = d.data();
      if (data.retailerPhone) mfrAccessKeys.add(String(data.retailerPhone));
      if (data.retailerId) mfrAccessKeys.add(String(data.retailerId));
    });
    seatSnap.forEach((d) => {
      const data = d.data();
      const expiresMs = data.expiresAt?.toMillis?.() ?? 0;
      if (expiresMs <= now) return;
      if (data.retailerPhone) mfrAccessKeys.add(String(data.retailerPhone));
      if (data.retailerId) mfrAccessKeys.add(String(data.retailerId));
      if (data.retailerDocId) mfrAccessKeys.add(String(data.retailerDocId));
    });

    const buildSignals = (phone: string, uid: string | null, role: string): ClassificationSignals => {
      const a = subByKey.get(phone);
      const b = uid ? subByKey.get(uid) : undefined;
      const mfrAccess =
        role === "retailer" && (mfrAccessKeys.has(phone) || (!!uid && mfrAccessKeys.has(uid)));
      return {
        activePaidSub: !!(a?.activePaid || b?.activePaid),
        activePromoSub: !!(a?.activePromo || b?.activePromo),
        manufacturerAccess: mfrAccess,
        hasExpiredSub: !!(a?.expired || b?.expired),
      };
    };

    const includeRole = (role: string) => roleFilter === "all" || role === roleFilter;

    const out: CandidateRecipient[] = [];
    const collect = (snap: FirebaseFirestore.QuerySnapshot, role: "retailer" | "manufacturer") => {
      if (!includeRole(role)) return;
      snap.forEach((d) => {
        const data = d.data();
        const phone = d.id;
        const uid = data.uid ? String(data.uid) : null;
        const businessName = String(
          data.businessName || data.shopName || data.name || data.ownerName || phone,
        );
        const status: RecipientStatus = classifyRecipient(buildSignals(phone, uid, role));
        if (!matchesEligibility(status, eligibility)) return;
        if (search) {
          const hay = `${businessName} ${phone}`.toLowerCase();
          if (!hay.includes(search)) return;
        }
        out.push({ phone, uid, businessName, role, status });
      });
    };
    collect(retailerSnap, "retailer");
    collect(manufacturerSnap, "manufacturer");

    out.sort((a, b) => a.businessName.localeCompare(b.businessName));

    return NextResponse.json({ recipients: out, count: out.length });
  } catch (e) {
    console.error("[api/admin/promotions/candidates GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load recipients." },
      { status: 500 },
    );
  }
}
