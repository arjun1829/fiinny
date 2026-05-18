"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { CreditCard, RefreshCw } from "lucide-react";
import { auth, getUserProfile } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import {
  computeSeatStats,
  fetchSeatListingsForOwner,
  fetchSeatListingsForRetailer,
  fetchSubscriptions,
  formatSubscriptionDate,
  isExpiringSoon,
  isListingActive,
  isSubscriptionActive,
} from "../_lib/subscriptions-firestore";
import type { RetailerSeatListing, SeatStats, Subscription } from "../_types/subscriptions";
import { HelperIcon, HelperTooltip } from "../../../components/helpers";
import { HelperTextKey } from "../../i18n/helperTexts";

type Role = "manufacturer" | "retailer";
type AccessState = "checking" | "ready" | "denied";

function SeatStatTile({
  label,
  value,
  sub,
  highlight,
  helperKey,
}: {
  label: string;
  value: number | string;
  sub?: string;
  highlight?: "primary" | "harvest";
  helperKey?: HelperTextKey;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-on-surface-variant">{label}</p>
        {helperKey ? (
          <HelperIcon
            size="xs"
            variant="ghost"
            side="bottom"
            textKey={helperKey}
            ariaLabel={`${label} help`}
          />
        ) : null}
      </div>
      <p
        className={[
          "mt-2 text-3xl font-bold tabular-nums",
          highlight === "primary"
            ? "text-primary"
            : highlight === "harvest"
              ? "text-harvest"
              : "text-on-surface",
        ].join(" ")}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-on-surface-variant">{sub}</p> : null}
    </div>
  );
}

function SubStatusBadge({ sub }: { sub: Subscription }) {
  if (!isSubscriptionActive(sub)) {
    return (
      <span className="inline-flex items-center rounded-full bg-on-surface/10 px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
        Expired
      </span>
    );
  }
  if (isExpiringSoon(sub, 30)) {
    return (
      <span className="inline-flex items-center rounded-full bg-harvest/15 px-2.5 py-0.5 text-xs font-semibold text-harvest">
        Expiring soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
      Active
    </span>
  );
}

function ListingBadge({ listing }: { listing: RetailerSeatListing }) {
  const active = isListingActive(listing);
  if (active) {
    return (
      <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
        Active
      </span>
    );
  }
  if (listing.status === "released") {
    return (
      <span className="inline-flex items-center rounded-full bg-on-surface/10 px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
        Released
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-harvest/15 px-2.5 py-0.5 text-xs font-semibold text-harvest">
      Expired
    </span>
  );
}

function ListingTypeBadge({ type }: { type: RetailerSeatListing["listingType"] }) {
  return type === "assigned" ? (
    <span className="inline-flex items-center rounded-full bg-on-surface/8 px-2 py-0.5 text-xs font-medium text-on-surface-variant">
      Assigned to retailer
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-on-surface/8 px-2 py-0.5 text-xs font-medium text-on-surface-variant">
      Own product
    </span>
  );
}

export default function SubscriptionPage() {
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>("checking");
  const [uid, setUid] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("retailer");

  const [subs, setSubs] = useState<Subscription[]>([]);
  // Listings owned by this user (their subscription pays)
  const [ownListings, setOwnListings] = useState<RetailerSeatListing[]>([]);
  // Listings assigned TO this retailer by manufacturers (informational only)
  const [assignedToMe, setAssignedToMe] = useState<RetailerSeatListing[]>([]);
  const [stats, setStats] = useState<SeatStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (userId: string, userRole: Role) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch subscriptions + own listings (ownerId = userId) for everyone
      const [subsData, ownData] = await Promise.all([
        fetchSubscriptions(userId),
        fetchSeatListingsForOwner(userId),
      ]);
      setSubs(subsData);
      setOwnListings(ownData);
      setStats(computeSeatStats(subsData, ownData));

      // Retailers also see what manufacturers have assigned to them
      if (userRole === "retailer") {
        const assigned = await fetchSeatListingsForRetailer(userId);
        setAssignedToMe(assigned);
      } else {
        setAssignedToMe([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load subscription data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAccess("denied");
        router.replace("/");
        return;
      }
      try {
        const profile = await getUserProfile(user.uid);
        const userRole: Role =
          profile?.role === "manufacturer" ? "manufacturer" : "retailer";
        setUid(user.uid);
        setRole(userRole);
        setAccess("ready");
        await loadAll(user.uid, userRole);
      } catch {
        setAccess("denied");
        router.replace("/dashboard");
      }
    });
    return () => unsub();
  }, [router, loadAll]);

  if (access === "checking") {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-on-surface-variant">Loading…</p>
      </div>
    );
  }

  if (access === "denied" || !uid) return null;

  const isManufacturer = role === "manufacturer";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Subscription"
          description="1 seat = 1 active product listing. Seats are consumed when you create a product or assign one to a retailer."
          helperKey="dashSubscription"
        />
        <HelperTooltip side="bottom" textKey="dashBuySeats">
          <a
            href="/dashboard/upgrade"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 transition-all shrink-0"
          >
            <CreditCard className="h-4 w-4" />
            Buy seats
          </a>
        </HelperTooltip>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Seat stats (seats = own listings only — their subscription pays) ── */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SeatStatTile
              label="Seats purchased"
              value={stats?.totalPurchased ?? 0}
              sub="From active subscriptions"
              helperKey="dashSeatsPurchased"
            />
            <SeatStatTile
              label="Seats used"
              value={stats?.activeUsed ?? 0}
              highlight="primary"
              sub="Active product listings"
              helperKey="dashSeatsUsed"
            />
            <SeatStatTile
              label="Available"
              value={stats?.available ?? 0}
              highlight={
                (stats?.available ?? 0) === 0 && (stats?.totalPurchased ?? 0) > 0
                  ? "harvest"
                  : undefined
              }
              sub="Ready to use"
              helperKey="dashSeatsAvailable"
            />
            <SeatStatTile
              label="Expiring soon"
              value={stats?.expiringSoon ?? 0}
              highlight={(stats?.expiringSoon ?? 0) > 0 ? "harvest" : undefined}
              sub="Subscriptions in 30 days"
              helperKey="dashSeatsExpiring"
            />
          </div>

          {/* ── Subscription history ── */}
          <section aria-label="Subscription history" className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-on-surface inline-flex items-center gap-1.5">
                Subscription history
                <HelperIcon
                  size="xs"
                  variant="ghost"
                  side="right"
                  textKey="dashSubHistory"
                  ariaLabel="Subscription history help"
                />
              </h2>
              <button
                type="button"
                onClick={() => uid && loadAll(uid, role)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>

            {subs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-10 text-center">
                <p className="text-base font-semibold text-on-surface">No subscriptions yet</p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Purchase seats to start listing products.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Plan</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Seats</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Start</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Expires</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Payment ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {subs.map((sub) => (
                        <tr key={sub.id} className="hover:bg-surface-container/50">
                          <td className="px-4 py-3 font-medium text-on-surface">{sub.planName}</td>
                          <td className="px-4 py-3 tabular-nums font-semibold text-on-surface">
                            {sub.seatsPurchased}
                          </td>
                          <td className="px-4 py-3">
                            <SubStatusBadge sub={sub} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                            {sub.startDate ? formatSubscriptionDate(sub.startDate) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                            {sub.expiryDate ? formatSubscriptionDate(sub.expiryDate) : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">
                            {sub.razorpayPaymentId ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ── Active seat listings (own) ── */}
          <section aria-label="Your seat listings" className="mb-8">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-on-surface inline-flex items-center gap-1.5">
                Active listings
                <HelperIcon
                  size="xs"
                  variant="ghost"
                  side="right"
                  textKey="dashActiveListings"
                  ariaLabel="Active listings help"
                />
              </h2>
              <p className="text-sm text-on-surface-variant">
                Each row consumes one seat from your subscription.
                {isManufacturer
                  ? " Includes your own products and products you've assigned to retailers."
                  : " Your own products that consume your subscription seats."}
              </p>
            </div>

            {ownListings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-10 text-center">
                <p className="text-base font-semibold text-on-surface">No listings yet</p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {isManufacturer
                    ? "Create products or assign products to retailers to consume seats."
                    : "Add products to your inventory to consume seats."}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Type</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Assigned</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Expires</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {ownListings.map((listing) => (
                        <tr
                          key={listing.id}
                          className={
                            !isListingActive(listing)
                              ? "opacity-50 hover:bg-surface-container/50"
                              : "hover:bg-surface-container/50"
                          }
                        >
                          <td className="px-4 py-3">
                            <ListingTypeBadge type={listing.listingType} />
                          </td>
                          <td className="px-4 py-3">
                            <ListingBadge listing={listing} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                            {listing.assignedAt
                              ? listing.assignedAt
                                  .toDate()
                                  .toLocaleDateString(undefined, { dateStyle: "medium" })
                              : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                            {listing.expiresAt
                              ? listing.expiresAt
                                  .toDate()
                                  .toLocaleDateString(undefined, { dateStyle: "medium" })
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ── Products assigned to this retailer by manufacturers ── */}
          {!isManufacturer && assignedToMe.length > 0 ? (
            <section aria-label="Products assigned by manufacturers">
              <div className="mb-3">
                <h2 className="text-base font-semibold text-on-surface">
                  Assigned by manufacturers
                </h2>
                <p className="text-sm text-on-surface-variant">
                  Manufacturers have placed these products in your store. They consume the
                  manufacturer&apos;s seats, not yours. Manage stock in Inventory.
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Assigned</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Expires</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {assignedToMe.map((listing) => (
                        <tr
                          key={listing.id}
                          className={
                            !isListingActive(listing)
                              ? "opacity-50 hover:bg-surface-container/50"
                              : "hover:bg-surface-container/50"
                          }
                        >
                          <td className="px-4 py-3">
                            <ListingBadge listing={listing} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                            {listing.assignedAt
                              ? listing.assignedAt
                                  .toDate()
                                  .toLocaleDateString(undefined, { dateStyle: "medium" })
                              : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                            {listing.expiresAt
                              ? listing.expiresAt
                                  .toDate()
                                  .toLocaleDateString(undefined, { dateStyle: "medium" })
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
