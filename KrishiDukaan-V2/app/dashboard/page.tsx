'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { auth, getUserProfile, fetchRetailerProducts, fetchManufacturerProducts } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { MapPin, Pencil } from "lucide-react";
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
};

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export default function DashboardPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatMetric[]>([]);
  const [inventoryHealth, setInventoryHealth] = useState<any>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const profile = await getUserProfile(user.uid);

          // Profile summary card
          if (profile) {
            setProfileSummary({
              businessName: (profile as any).businessName || (profile as any).shopName || profile.name || "",
              ownerName: (profile as any).ownerName || profile.name || "",
              city: (profile as any).city || "",
              state: (profile as any).state || "",
              role: profile.role || "",
              productCount: (profile as any).productCount || 0,
            });
          }
          if (profile) {
            let products: any[] = [];
            if (profile.role === 'retailer') {
              products = await fetchRetailerProducts(user.uid);
            } else if (profile.role === 'manufacturer') {
              products = await fetchManufacturerProducts(user.uid);
            }

            const analytics = await fetchRetailerAnalytics(user.uid);

            // Calculate stats from real data
            const productCount = products.length;
            const inStock = products.filter(p => p.stock !== 'Out of Stock' && p.stock !== '0').length;
            const lowStock = products.filter(p => p.stock === 'Low Stock').length;
            const outOfStock = productCount - inStock;

            setStats([
              { id: "views", label: t('totalViews'), value: analytics.totalImpressions.toLocaleString(), change: "+0.0%", trend: "neutral" },
              { id: "calls", label: t('interactionsLabel'), value: analytics.totalClicks.toLocaleString(), change: "+0.0%", trend: "neutral" },
              { id: "directions", label: t('directionsLabel'), value: "0", change: "0.0%", trend: "neutral" },
              { id: "products", label: t('productsListedLabel'), value: productCount.toString(), change: "0", trend: "neutral" },
            ]);

            setInventoryHealth({
              inStock,
              lowStock,
              outOfStock,
              score: productCount > 0 ? Math.round((inStock / productCount) * 100) : 100,
              label: productCount > 0 ? (inStock / productCount > 0.8 ? t('healthyLabel') : t('attentionNeeded')) : t('noDataLabel'),
            });

            // Mock reviews for now as we don't have a reviews collection yet
            setReviews([
              {
                id: "r1",
                author: "Priya S.",
                rating: 5,
                excerpt: "Fresh stock and fair prices. Will visit again.",
                date: "2026-05-10",
                product: products[0]?.name || "Organic Seeds",
              },
            ]);
          }
        } catch (error) {
          console.error("Error fetching dashboard data:", error);
        } finally {
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

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
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-4 shadow-ambient">
          <div className="h-14 w-14 shrink-0 rounded-full bg-primary flex items-center justify-center shadow">
            <span className="text-lg font-bold text-white">
              {initials(profileSummary.businessName || profileSummary.ownerName || "?")}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-on-surface truncate">{profileSummary.businessName || "—"}</p>
            {profileSummary.ownerName && <p className="text-sm text-on-surface-variant">{profileSummary.ownerName}</p>}
            {(profileSummary.city || profileSummary.state) && (
              <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-on-surface-variant">
                <MapPin className="h-3 w-3" />
                {[profileSummary.city, profileSummary.state].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
          <Link href="/dashboard/profile"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors">
            <Pencil className="h-3.5 w-3.5" /> {t('editProfileBtn')}
          </Link>
        </div>
      )}

      <PageHeader
        title={t('overviewTitle')}
        description={t('overviewDesc')}
        helperKey="dashOverview"
      />

      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <DashboardInventoryHealth data={inventoryHealth} />
        <QuickActions />
      </div>

      <div className="mt-6">
        <RecentReviews reviews={reviews} />
      </div>
    </>
  );
}
