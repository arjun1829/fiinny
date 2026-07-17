'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchRetailerProducts, fetchManufacturerProducts } from "../firebase";
import { MapPin, Pencil, ExternalLink } from "lucide-react";
import { useEffectiveUser } from "./_context/effective-user-context";
import { PageHeader } from "./_components/page-header";
import { StatCard } from "./_components/stat-card";
import { QuickActions } from "./_components/quick-actions";
import { RecentReviews } from "./_components/recent-reviews";
import { DashboardInventoryHealth } from "./_components/dashboard-inventory-health";
import { fetchRetailerAnalytics } from "./_lib/analytics-firestore";
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

        const analytics = await fetchRetailerAnalytics(uid);

        const productCount = products.length;
        const inStock = products.filter(p => p.stock !== 'Out of Stock' && p.stock !== '0').length;
        const lowStock = products.filter(p => p.stock === 'Low Stock').length;
        const outOfStock = productCount - inStock;
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
          score: productCount > 0 ? Math.round((inStock / productCount) * 100) : 100,
          label: productCount > 0 ? (inStock / productCount > 0.8 ? t('healthyLabel') : t('attentionNeeded')) : t('noDataLabel'),
        });

        setReviews([]);
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
