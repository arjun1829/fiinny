import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  startAfter,
  type QueryConstraint,
} from "firebase/firestore/lite";
import { getClientDb } from "./firebase-client-server";
import type { BrandRetailerSummary } from "../dashboard/_lib/brand-page-types";

// On-demand retailer-network fetch for /brand/[slug].
//
// Retailer data is not on the purchase path (it only powers the "Where to Find
// Us" map + list), so it is NOT fetched during the brand page's server render.
// The directory loads a bounded page at a time from GET /api/brand/retailers
// only after the visitor opens the panel — so a visitor who never opens it, or
// only views the first page, never reads the whole subcollection.

export const RETAILER_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function parseGeo(g: unknown): { latitude: number; longitude: number } | null {
  if (!g || typeof g !== "object") return null;
  const { latitude, longitude } = g as { latitude?: number; longitude?: number };
  return typeof latitude === "number" && typeof longitude === "number"
    ? { latitude, longitude }
    : null;
}

type MirrorDoc = { id: string; data: () => Record<string, unknown> };

/**
 * Enrich one mirror doc into a summary. Mirror docs usually carry geo + city
 * (fast path, zero extra reads). Only mirrors missing either fall back to a
 * retailers/{docId} or profiles/{docId} read — matching the original brand-page
 * logic exactly so the rendered output is unchanged.
 */
async function enrichMirror(
  db: ReturnType<typeof getClientDb>,
  d: MirrorDoc,
): Promise<BrandRetailerSummary> {
  const r = d.data();
  const mirrorAddr = (r.address ?? {}) as Record<string, unknown>;
  const mirrorGeo = parseGeo(r.geo);
  const shopName = String(r.shopName ?? r.ownerName ?? "");
  const ownerName = String(r.ownerName ?? "");
  const mirrorLogo = String(r.logo ?? "");

  // Fast path: mirror already has both geo and city.
  if (mirrorGeo && mirrorAddr.city) {
    return {
      phone: d.id,
      secondaryPhone: String(r.secondaryPhone ?? ""),
      shopName,
      ownerName,
      address: {
        city: String(mirrorAddr.city ?? ""),
        state: String(mirrorAddr.state ?? ""),
        line1: String(mirrorAddr.line1 ?? ""),
      },
      geo: mirrorGeo,
      logo: mirrorLogo || undefined,
    };
  }

  // Slow path: fetch the retailer's global profile to get address/geo. Try
  // retailers/{docId} first (stored as E164 "+91…" or bare 10-digit), then
  // profiles/{docId} which is always publicly readable.
  const retailerDocId = String(r.retailerDocId ?? d.id);
  const altRetailerId = retailerDocId.startsWith("+91")
    ? retailerDocId.slice(3)
    : `+91${retailerDocId}`;

  const tryFetch = async (id: string) => {
    try {
      const snap = await getDoc(doc(db, "retailers", id));
      if (snap.exists()) return snap.data() as Record<string, unknown>;
    } catch { /* fall through */ }
    return null;
  };
  const tryProfileFetch = async (id: string) => {
    try {
      const snap = await getDoc(doc(db, "profiles", id));
      if (snap.exists()) return snap.data() as Record<string, unknown>;
    } catch { /* fall through */ }
    return null;
  };

  const rd =
    (await tryFetch(retailerDocId)) ??
    (retailerDocId !== altRetailerId ? await tryFetch(altRetailerId) : null) ??
    (await tryProfileFetch(retailerDocId)) ??
    (retailerDocId !== altRetailerId ? await tryProfileFetch(altRetailerId) : null);

  if (rd) {
    const rdAddr = (rd.address ?? {}) as Record<string, unknown>;
    return {
      phone: d.id,
      secondaryPhone: String(rd.secondaryPhone ?? r.secondaryPhone ?? ""),
      shopName: shopName || String(rd.shopName ?? rd.businessName ?? rd.ownerName ?? ""),
      ownerName: ownerName || String(rd.ownerName ?? ""),
      address: {
        city: String(rdAddr.city ?? rd.city ?? mirrorAddr.city ?? ""),
        state: String(rdAddr.state ?? rd.state ?? mirrorAddr.state ?? ""),
        line1: String(rdAddr.line1 ?? mirrorAddr.line1 ?? ""),
      },
      geo: parseGeo(rd.geo) ?? mirrorGeo,
      logo: String(rd.logo ?? "") || mirrorLogo || undefined,
    };
  }

  return {
    phone: d.id,
    secondaryPhone: String(r.secondaryPhone ?? ""),
    shopName,
    ownerName,
    address: {
      city: String(mirrorAddr.city ?? ""),
      state: String(mirrorAddr.state ?? ""),
      line1: String(mirrorAddr.line1 ?? ""),
    },
    geo: mirrorGeo,
    logo: mirrorLogo || undefined,
  };
}

/** Same active-retailer eligibility rule the Retailer Network dashboard uses. */
function isActiveMirror(data: Record<string, unknown>): boolean {
  const status = String(data.status ?? "invited");
  const onboarding = String(data.onboardingStatus ?? "active");
  return status !== "revoked" && onboarding !== "removed" && onboarding !== "inactive";
}

/**
 * Fetch one bounded page of the active retailer network, ordered by document id.
 *
 * Pagination advances by the last RAW mirror doc id (eligibility is applied in
 * memory, so a page may return fewer than `limit` after filtering). `nextCursor`
 * is null once a short page signals the subcollection is exhausted.
 */
export async function fetchBrandRetailers(
  manufacturerPhone: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<{ retailers: BrandRetailerSummary[]; nextCursor: string | null }> {
  const db = getClientDb();
  const pageSize = Math.min(Math.max(1, opts.limit ?? RETAILER_PAGE_SIZE), MAX_PAGE_SIZE);

  const constraints: QueryConstraint[] = [orderBy(documentId())];
  if (opts.cursor) constraints.push(startAfter(opts.cursor));
  constraints.push(fsLimit(pageSize));

  const snap = await getDocs(
    query(
      collection(db, "manufacturers", manufacturerPhone, "retailers"),
      ...constraints,
    ),
  );

  const lastId = snap.docs.length ? snap.docs[snap.docs.length - 1].id : null;
  // A full page means more docs may follow; a short page ends pagination.
  const nextCursor = snap.docs.length === pageSize ? lastId : null;

  const activeMirrors = snap.docs.filter((d) =>
    isActiveMirror(d.data() as Record<string, unknown>),
  );
  const retailers = await Promise.all(activeMirrors.map((d) => enrichMirror(db, d)));

  return { retailers, nextCursor };
}
