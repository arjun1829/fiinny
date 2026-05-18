'use client';

import { useEffect, useState } from "react";
import { auth, getUserProfile, fetchRetailerProducts, fetchManufacturerProducts } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { PageHeader } from "./_components/page-header";
import { StatCard } from "./_components/stat-card";
import { QuickActions } from "./_components/quick-actions";
import { RecentReviews } from "./_components/recent-reviews";
import { DashboardInventoryHealth } from "./_components/dashboard-inventory-health";
import { fetchRetailerAnalytics } from "./_lib/analytics-firestore";
import type { StatMetric, ReviewItem, InventoryProduct } from "./_data/mock";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatMetric[]>([]);
  const [inventoryHealth, setInventoryHealth] = useState<any>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const profile = await getUserProfile(user.uid);
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
              { id: "views", label: "Total Views", value: analytics.totalImpressions.toLocaleString(), change: "+0.0%", trend: "neutral" },
              { id: "calls", label: "Interactions", value: analytics.totalClicks.toLocaleString(), change: "+0.0%", trend: "neutral" },
              { id: "directions", label: "Directions", value: "0", change: "0.0%", trend: "neutral" },
              { id: "products", label: "Products Listed", value: productCount.toString(), change: "0", trend: "neutral" },
            ]);

            setInventoryHealth({
              inStock,
              lowStock,
              outOfStock,
              score: productCount > 0 ? Math.round((inStock / productCount) * 100) : 100,
              label: productCount > 0 ? (inStock / productCount > 0.8 ? "Healthy" : "Attention needed") : "No data",
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
      <PageHeader
        title="Overview"
        description="Performance snapshot for your storefront and operations."
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
