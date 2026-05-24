// Client-side report data builder — uses the Firebase client SDK (requires auth context).
// Called from the admin page so the admin's credentials satisfy Firestore rules.
import {
  fetchManufacturerRetailers,
} from "../../dashboard/_lib/manufacturer-retailers-firestore";
import {
  fetchSubscriptions,
  fetchSeatListingsForOwner,
  isListingActive,
  isSubscriptionActive,
  getTotalPurchasedSeats,
} from "../../dashboard/_lib/subscriptions-firestore";
import type { ManufacturerReportData, RetailerSummary } from "./manufacturer-report-data";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function buildReportDataClientSide(
  manufacturerId: string,
  profile: { shopName?: string; ownerName?: string; name?: string; email?: string },
): Promise<ManufacturerReportData | null> {
  const manufacturerEmail = profile.email?.trim() ?? "";
  if (!manufacturerEmail) return null;

  const manufacturerName =
    (profile.shopName || profile.ownerName || profile.name || "Manufacturer").trim();

  const [retailers, subs, seatListings] = await Promise.all([
    fetchManufacturerRetailers(manufacturerId),
    fetchSubscriptions(manufacturerId),
    fetchSeatListingsForOwner(manufacturerId),
  ]);

  const now = Date.now();
  const weekAgo = now - ONE_WEEK_MS;

  const activeRetailers = retailers.filter(
    (r) => r.status !== "revoked" && r.onboardingStatus !== "removed",
  );

  const newRetailersThisWeek = retailers.filter((r) => {
    const ms = r.addedAt?.toMillis?.();
    return ms && ms >= weekAgo;
  }).length;

  const activeSeats = seatListings.filter(isListingActive);
  const newAssignmentsThisWeek = seatListings.filter((s) => {
    const ms = s.assignedAt?.toMillis?.();
    return ms && ms >= weekAgo;
  }).length;

  const activeSub = subs.find(isSubscriptionActive);
  const seatsPurchased = getTotalPurchasedSeats(subs);

  const assignmentsByRetailer = new Map<string, number>();
  for (const seat of activeSeats) {
    const rid = seat.retailerDocId ?? "";
    if (rid) assignmentsByRetailer.set(rid, (assignmentsByRetailer.get(rid) ?? 0) + 1);
  }

  const retailerRows: RetailerSummary[] = activeRetailers.slice(0, 20).map((r) => ({
    shopName: r.shopName ?? "",
    ownerName: r.ownerName ?? "",
    retailerEmail: r.retailerEmail ?? "",
    status: r.status,
    addedAt: r.addedAt?.toDate?.() ?? null,
    productsAssigned: assignmentsByRetailer.get(r.retailerDocId) ?? 0,
  }));

  return {
    manufacturerId,
    manufacturerName,
    manufacturerEmail,
    totalRetailers: retailers.length,
    activeRetailers: activeRetailers.length,
    totalAssignments: seatListings.length,
    activeAssignments: activeSeats.length,
    seatsPurchased,
    seatsUsed: activeSeats.length,
    subscriptionExpiry: activeSub?.expiryDate?.toDate?.() ?? null,
    subscriptionStatus: activeSub ? "active" : "no active subscription",
    newRetailersThisWeek,
    newAssignmentsThisWeek,
    retailers: retailerRows,
    reportGeneratedAt: new Date(),
  };
}
