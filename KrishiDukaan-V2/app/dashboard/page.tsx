'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchRetailerProducts, fetchManufacturerProducts } from "../firebase";
import { MapPin, Pencil, ExternalLink } from "lucide-react";
import { useEffectiveUser } from "./_context/effective-user-context";
import { PageHeader } from "./_components/page-header";
import { StatCard } from "./_components/stat-card";
import { QuickActions } from "./_components/quick-actions";
import { OpenBillingCard } from "./_components/open-billing-card";
import { RecentReviews } from "./_components/recent-reviews";
import { DashboardInventoryHealth } from "./_components/dashboard-inventory-health";
import { fetchRetailerAnalytics } from "./_lib/analytics-firestore";
import { fetchRecentOwnerReviews } from "./_lib/reviews-firestore";
import type { StatMetric, ReviewItem, InventoryProduct } from "./_data/mock";
import { useI18n } from "../i18n/I18nContext";

type ProfileSummary = {
  businessName: string;
  ownerName: string;
  city: string;
  state: string;
  role: string;
  productCount: number;
  slug?: string;
  logo?: string;
};

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export default function DashboardPage() {
  const { t } = useI18n();
  const { uid: effectiveUid, profile: effectiveProfile } = useEffectiveUser();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatMetric[]>([]);
  const [inventoryHealth, setInventoryHealth] = useState<any>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null);

  useEffect(() => {
    console.debug('[DashboardPage] effect — effectiveUid:', effectiveUid, '| effectiveProfile:', effectiveProfile?.role ?? null);
    if (!effectiveUid || !effectiveProfile) {
      console.debug('[DashboardPage] skipping — uid or profile is null/empty');
      return;
    }
    const profile = effectiveProfile;
    const uid = effectiveUid;

    (async () => {
      try {
        // Profile summary card
        let slug = "";
        let logo = "";
        let businessName = "";
        let ownerName = (profile as any).ownerName || profile.name || "";
        let city = (profile as any).city || "";
        let state = (profile as any).state || "";

        if (profile.role === "manufacturer") {
          try {
            const { resolveManufacturerDocId } = await import("./_lib/profile-persistence");
            const { fetchManufacturerProfile, fetchBrandPageCustomization } = await import("./_lib/brand-page-firestore");
            const phone = await resolveManufacturerDocId(uid);
            const [mfrDoc, custom] = await Promise.all([
              fetchManufacturerProfile(phone),
              fetchBrandPageCustomization(phone),
            ]);
            if (mfrDoc) {
              slug = String(mfrDoc.slug ?? "");
              businessName = String(mfrDoc.businessName ?? "");
              ownerName = String(mfrDoc.ownerName ?? ownerName);
              const addr = (mfrDoc.address ?? {}) as Record<string, unknown>;
              city = String(addr.city ?? city);
              state = String(addr.state ?? state);
            }
            if (custom) logo = String(custom.logo ?? "");
          } catch (e) {
            console.error("Error loading brand details in dashboard:", e);
          }
        } else if (profile.role === "retailer") {
          try {
            const { getDoc, doc } = await import("firebase/firestore");
            const { db } = await import("../firebase");
            const phone = (profile as any).phone || "";
            const retailerDocId = (profile as any).retailerDocId || phone;
            if (retailerDocId) {
              const snap = await getDoc(doc(db, "retailers", retailerDocId));
              if (snap.exists()) {
                const r = snap.data() as Record<string, unknown>;
                businessName = String(r.shopName ?? r.businessName ?? "");
                ownerName = String(r.ownerName ?? ownerName);
                const addr = (r.address ?? {}) as Record<string, unknown>;
                city = String(addr.city ?? city);
                state = String(addr.state ?? state);
              }
            }
          } catch (e) {
            console.error("Error loading retailer details in dashboard:", e);
          }
        }

        setProfileSummary({
          businessName,
          ownerName,
          city,
          state,
          role: profile.role || "",
          productCount: (profile as any).productCount || 0,
          slug,
          logo,
        });

        let products: any[] = [];
        if (profile.role === 'retailer') {
          products = await fetchRetailerProducts(uid);
        } else if (profile.role === 'manufacturer') {
          products = await fetchManufacturerProducts(uid);
        }

        // `profile` is REQUIRED, not optional in practice: fetchRetailerAnalytics
        // builds its phoneCandidates set entirely from profile.phone, and with
        // it omitted that set is empty — so the product scan queried
        // retailerPhone == <uid>, matched nothing, and Total Views /
        // Interactions / Directions all read 0 for every phone-keyed seller.
        // The Analytics page has always passed it (analytics/page.tsx); only
        // this Overview call omitted it, which is why the two pages disagreed.
        // Reuses the products just loaded instead of reading them again.
        const analytics = await fetchRetailerAnalytics(uid, profile, "week", undefined, products as any[]);

        const productCount = products.length;

        // Inventory Health used to be computed from the `stock` STRING label
        // ('Out of Stock' / 'Low Stock'), which had two problems: it ignored
        // the numeric `stockQuantity` most docs actually carry, and a
        // 'Low Stock' product satisfied the inStock predicate too — so it was
        // counted in BOTH inStock and lowStock, and outOfStock (derived by
        // subtraction) came out wrong as a result.
        //
        // This mirrors ListingModel._parseStock + InventoryHealthCard on
        // mobile exactly, so both platforms bucket identically: three
        // mutually-exclusive buckets that sum to the product count.
        const stockQtyOf = (p: any): number => {
          const qty = p.stockQuantity;
          if (typeof qty === 'number' && qty > 0) return Math.trunc(qty);
          const stock = p.stock;
          if (typeof stock === 'number') return stock > 0 ? Math.trunc(stock) : 0;
          // Web writes stock: "In Stock" — treat as 1 so it reads as in-stock.
          if (typeof stock === 'string' && stock.length > 0) {
            return stock.toLowerCase().startsWith('out') ? 0 : 1;
          }
          // No stock field: active products are assumed available.
          return p.isActive !== false ? 1 : 0;
        };

        // qty === 1 is also the placeholder for docs that only store stock as
        // an "In Stock" string — counted as in-stock, not low, same as mobile.
        const lowStock = products.filter(p => {
          const q = stockQtyOf(p);
          return q >= 2 && q <= 5;
        }).length;
        const outOfStock = products.filter(p => stockQtyOf(p) <= 0).length;
        const inStock = productCount - lowStock - outOfStock;
        const totalDirections = analytics.directionRequests.reduce((sum, d) => sum + d.value, 0);

        setStats([
          { id: "views", label: t('totalViews'), value: analytics.totalImpressions.toLocaleString(), change: "+0.0%", trend: "neutral" },
          { id: "calls", label: t('interactionsLabel'), value: analytics.totalClicks.toLocaleString(), change: "+0.0%", trend: "neutral" },
          { id: "directions", label: t('directionsLabel'), value: totalDirections.toLocaleString(), change: "0.0%", trend: "neutral" },
          { id: "products", label: t('productsListedLabel'), value: productCount.toString(), change: "0", trend: "neutral" },
        ]);

        setInventoryHealth({
          inStock,
          lowStock,
          outOfStock,
          // Mobile's InventoryHealthCard scores (inStock + lowStock) / total —
          // a low-stock product is still sellable, so excluding it here made
          // web's score read lower than the app's for the same catalogue.
          score: productCount > 0
            ? Math.round(((inStock + lowStock) / productCount) * 100)
            : 100,
          label: productCount > 0
            ? ((inStock + lowStock) / productCount >= 0.8 ? t('healthyLabel') : t('attentionNeeded'))
            : t('noDataLabel'),
        });

        // The 5 newest store reviews (not every review the seller has).
        const ownerReviews = await fetchRecentOwnerReviews(uid, 5);
        setReviews(
          ownerReviews.map<ReviewItem>((r) => ({
            id: r.id,
            author: r.authorName,
            rating: r.rating,
            excerpt: r.comment,
            date: r.createdAt ? r.createdAt.toLocaleDateString() : "",
            // mapReview already labels store reviews "Store Review".
            product: r.productName,
          })),
        );
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [effectiveUid, effectiveProfile]);

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      {/* Profile summary card */}
      {profileSummary && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-3 shadow-ambient sm:mb-6 sm:gap-4 sm:px-5 sm:py-4">
          <div className="h-11 w-11 shrink-0 rounded-full bg-white border border-outline-variant/30 flex items-center justify-center shadow overflow-hidden sm:h-14 sm:w-14">
            {profileSummary.logo ? (
              <img src={profileSummary.logo} alt="Logo" className="w-full h-full object-contain p-1" />
            ) : (
              <div className="w-full h-full bg-primary flex items-center justify-center">
                <span className="text-base font-bold text-white sm:text-lg">
                  {initials(profileSummary.businessName || profileSummary.ownerName || "?")}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-on-surface truncate sm:text-base">{profileSummary.businessName || "—"}</p>
            {profileSummary.ownerName && <p className="text-xs text-on-surface-variant sm:text-sm">{profileSummary.ownerName}</p>}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              {(profileSummary.city || profileSummary.state) && (
                <div className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
                  <MapPin className="h-3 w-3" />
                  {[profileSummary.city, profileSummary.state].filter(Boolean).join(", ")}
                </div>
              )}
              {profileSummary.role === "manufacturer" && profileSummary.slug && (
                <>
                  <span className="text-on-surface-variant/30 text-xs hidden sm:inline">·</span>
                  <a href={`/brand/${profileSummary.slug}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" /> View Brand Page
                  </a>
                </>
              )}
            </div>
          </div>
          <Link href="/dashboard/profile"
            className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-outline-variant/40 bg-white px-2.5 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors sm:gap-1.5 sm:px-3">
            <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('editProfileBtn')}</span><span className="sm:hidden">Edit</span>
          </Link>
        </div>
      )}

      {/* Quick Actions — above metrics on mobile */}
      <div className="mb-4">
        <QuickActions />
      </div>

      {/* Billing/ERP launcher — subscribed retailers only. Manufacturers keep the
          KrishiDukan-only plan and have no tenant provisioned in the ERP. */}
      {profileSummary.role === "retailer" && effectiveProfile?.isPaid && (
        <div className="mb-4">
          <OpenBillingCard />
        </div>
      )}

      <PageHeader
        title={t('overviewTitle')}
        description={t('overviewDesc')}
        helperKey="dashOverview"
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((m) => {
          const helperKey =
            m.id === "views"
              ? ("dashMetricViews" as const)
              : m.id === "calls"
                ? ("dashMetricInteractions" as const)
                : m.id === "directions"
                  ? ("dashMetricDirections" as const)
                  : m.id === "products"
                    ? ("dashMetricProductsListed" as const)
                    : undefined;
          return <StatCard key={m.id} metric={m} helperKey={helperKey} />;
        })}
      </section>

      <div className="mt-4 sm:mt-6">
        <DashboardInventoryHealth data={inventoryHealth} />
      </div>

      <div className="mt-4 sm:mt-6">
        <RecentReviews reviews={reviews} />
      </div>
    </>
  );
}
