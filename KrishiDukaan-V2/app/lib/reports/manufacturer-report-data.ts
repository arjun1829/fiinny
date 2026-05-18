import { getAdminDb } from "../firebase-admin";
import type { Timestamp } from "firebase-admin/firestore";

export type RetailerSummary = {
  shopName: string;
  ownerName: string;
  retailerEmail: string;
  status: string;
  addedAt: Date | null;
  productsAssigned: number;
};

export type ManufacturerReportData = {
  manufacturerId: string;
  manufacturerName: string;
  manufacturerEmail: string;
  totalRetailers: number;
  activeRetailers: number;
  totalAssignments: number;
  activeAssignments: number;
  seatsPurchased: number;
  seatsUsed: number;
  subscriptionExpiry: Date | null;
  subscriptionStatus: string;
  newRetailersThisWeek: number;
  newAssignmentsThisWeek: number;
  retailers: RetailerSummary[];
  reportGeneratedAt: Date;
};

function toDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null;
  return typeof ts.toDate === "function" ? ts.toDate() : null;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function fetchManufacturerReportData(
  manufacturerId: string,
): Promise<ManufacturerReportData | null> {
  const [profileSnap, retailersSnap, subsSnap, seatListingsSnap] = await Promise.all([
    getAdminDb().collection("users").doc(manufacturerId).get(),
    getAdminDb()
      .collection("manufacturerRetailers")
      .where("manufacturerId", "==", manufacturerId)
      .get(),
    getAdminDb()
      .collection("subscriptions")
      .where("ownerId", "==", manufacturerId)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get(),
    getAdminDb()
      .collection("retailerSeatListings")
      .where("ownerId", "==", manufacturerId)
      .get(),
  ]);

  if (!profileSnap.exists) return null;

  const profile = profileSnap.data() as Record<string, unknown>;
  const manufacturerName = String(profile.shopName || profile.ownerName || profile.name || "Manufacturer");
  const manufacturerEmail = String(profile.email ?? "");

  if (!manufacturerEmail) return null;

  const now = Date.now();
  const weekAgo = now - ONE_WEEK_MS;

  // Retailers
  const retailerDocs = retailersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
  const activeRetailerDocIds = new Set(
    retailerDocs
      .filter((r) => r.status !== "revoked" && r.onboardingStatus !== "removed")
      .map((r) => String(r.retailerDocId ?? "")),
  );

  const newRetailersThisWeek = retailerDocs.filter((r) => {
    const addedAt = toDate(r.addedAt as Timestamp);
    return addedAt && addedAt.getTime() >= weekAgo;
  }).length;

  // Seat listings (product assignments)
  const seatDocs = seatListingsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
  const activeSeats = seatDocs.filter((s) => {
    if (s.status !== "active") return false;
    const exp = toDate(s.expiresAt as Timestamp);
    return !exp || exp.getTime() > now;
  });
  const newAssignmentsThisWeek = seatDocs.filter((s) => {
    const at = toDate(s.assignedAt as Timestamp);
    return at && at.getTime() >= weekAgo;
  }).length;

  // Subscriptions
  const activeSub = subsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>))
    .find((s) => {
      if (s.subscriptionStatus !== "active") return false;
      const expiry = toDate(s.expiryDate as Timestamp);
      return expiry && expiry.getTime() > now;
    });

  const seatsPurchased = subsSnap.docs.reduce(
    (sum, d) => sum + (Number((d.data() as Record<string, unknown>).seatsPurchased) || 0),
    0,
  );

  // Assignments per retailerDocId (for retailer table)
  const assignmentsByRetailer = new Map<string, number>();
  for (const seat of activeSeats) {
    const rid = String(seat.retailerDocId ?? "");
    if (rid) assignmentsByRetailer.set(rid, (assignmentsByRetailer.get(rid) ?? 0) + 1);
  }

  const retailers: RetailerSummary[] = retailerDocs
    .filter((r) => r.status !== "revoked" && r.onboardingStatus !== "removed")
    .slice(0, 20) // cap at 20 rows in email
    .map((r) => ({
      shopName: String(r.shopName ?? ""),
      ownerName: String(r.ownerName ?? ""),
      retailerEmail: String(r.retailerEmail ?? ""),
      status: String(r.status ?? "invited"),
      addedAt: toDate(r.addedAt as Timestamp),
      productsAssigned: assignmentsByRetailer.get(String(r.retailerDocId ?? "")) ?? 0,
    }));

  return {
    manufacturerId,
    manufacturerName,
    manufacturerEmail,
    totalRetailers: retailerDocs.length,
    activeRetailers: activeRetailerDocIds.size,
    totalAssignments: seatDocs.length,
    activeAssignments: activeSeats.length,
    seatsPurchased,
    seatsUsed: activeSeats.length,
    subscriptionExpiry: activeSub ? toDate(activeSub.expiryDate as Timestamp) : null,
    subscriptionStatus: activeSub ? "active" : "no active subscription",
    newRetailersThisWeek,
    newAssignmentsThisWeek,
    retailers,
    reportGeneratedAt: new Date(),
  };
}

export async function fetchAllManufacturerIds(): Promise<string[]> {
  const snap = await getAdminDb()
    .collection("users")
    .where("role", "==", "manufacturer")
    .get();
  return snap.docs.map((d) => d.id);
}

export async function recordReportSent(manufacturerId: string, sentBy: "cron" | "admin"): Promise<void> {
  await getAdminDb().collection("reportLogs").doc(manufacturerId).set(
    {
      manufacturerId,
      lastSentAt: new Date(),
      lastSentBy: sentBy,
      totalSentCount: (await getAdminDb().collection("reportLogs").doc(manufacturerId).get()).data()?.totalSentCount + 1 || 1,
    },
    { merge: true },
  );
}

export async function fetchLastReportSentAt(
  manufacturerIds: string[],
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (manufacturerIds.length === 0) return map;
  const snaps = await Promise.all(
    manufacturerIds.map((id) => getAdminDb().collection("reportLogs").doc(id).get()),
  );
  for (const snap of snaps) {
    if (snap.exists) {
      const data = snap.data() as Record<string, unknown>;
      const ts = data.lastSentAt;
      if (ts instanceof Date) map.set(snap.id, ts);
      else if (ts && typeof (ts as any).toDate === "function") map.set(snap.id, (ts as Timestamp).toDate());
    }
  }
  return map;
}
