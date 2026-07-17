"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, limit, where } from "firebase/firestore";
import { db } from "../../firebase";
import { Users, Eye, MousePointer, Navigation, TrendingUp, Store, Package, BarChart3, AlertTriangle } from "lucide-react";

type DayVisit = { date: string; total: number };
type PlatformStats = {
  totalVisits: number;
  visitsLast7: number;
  totalImpressions: number;
  totalClicks: number;
  totalDirections: number;
  totalRetailers: number;
  totalManufacturers: number;
  totalProducts: number;
  totalUsers: number;
};

function Bar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[10px] font-bold text-on-surface-variant">{value}</span>
      <div className="w-full bg-surface-container-high rounded-full overflow-hidden" style={{ height: 80 }}>
        <div
          className={`w-full rounded-full transition-all duration-500 ${color}`}
          style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
        />
      </div>
      <span className="text-[9px] text-on-surface-variant font-medium">{label}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient sm:gap-4 sm:p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-black text-on-surface sm:text-2xl">{value}</p>
        <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
        {sub && <p className="text-[10px] text-outline mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [visits, setVisits] = useState<DayVisit[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Fetch last 14 days of site visits
        let visitDays: DayVisit[] = [];
        try {
          const visitsSnap = await getDocs(
            query(collection(db, "siteVisits"), orderBy("date", "desc"), limit(14))
          );
          visitDays = visitsSnap.docs
            .map((d) => ({ date: d.data().date as string, total: Number(d.data().total || 0) }))
            .reverse();
          setVisits(visitDays);
        } catch (err: any) {
          console.error("Failed to load siteVisits:", err);
          setError((prev) => (prev ? prev + "\n" : "") + `Site Visits: ${err.message || err}`);
        }

        // Aggregate product-level events across ALL products
        let totalImpressions = 0, totalClicks = 0, totalDirections = 0, totalProducts = 0;
        try {
          const productsSnap = await getDocs(collection(db, "products"));
          productsSnap.docs.forEach((d) => {
            const data = d.data();
            if (data.source === "retailer_inventory_copy" || data.source === "manufacturer_assigned") return;
            totalImpressions += Number(data.impressions || 0);
            totalClicks += Number(data.clicks || 0);
            totalDirections += Number(data.directionRequests || 0);
            totalProducts++;
          });
        } catch (err: any) {
          console.error("Failed to load products stats:", err);
          setError((prev) => (prev ? prev + "\n" : "") + `Product Catalog: ${err.message || err}`);
        }

        // Count users, retailers, manufacturers
        let totalUsers = 0, totalRetailers = 0, totalManufacturers = 0;
        try {
          const [usersSnap, retailersSnap, mfrSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(query(collection(db, "users"), where("role", "==", "retailer"))),
            getDocs(query(collection(db, "users"), where("role", "==", "manufacturer"))),
          ]);
          totalUsers = usersSnap.size;
          totalRetailers = retailersSnap.size;
          totalManufacturers = mfrSnap.size;
        } catch (err: any) {
          console.error("Failed to load user stats:", err);
          setError((prev) => (prev ? prev + "\n" : "") + `Platform Users: ${err.message || err}`);
        }

        const totalVisits = visitDays.reduce((s, d) => s + d.total, 0);
        const last7 = visitDays.slice(-7).reduce((s, d) => s + d.total, 0);

        setStats({
          totalVisits,
          visitsLast7: last7,
          totalImpressions,
          totalClicks,
          totalDirections,
          totalRetailers,
          totalManufacturers,
          totalProducts,
          totalUsers,
        });
      } catch (e: any) {
        console.error(e);
        setError((prev) => (prev ? prev + "\n" : "") + `General: ${e.message || e}`);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-on-surface-variant">
        <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
        Loading analytics…
      </div>
    );
  }

  const maxVisits = Math.max(...visits.map((v) => v.total), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-black text-on-surface sm:text-2xl">Site Analytics</h1>
        <p className="mt-1 text-xs text-on-surface-variant sm:text-sm">Platform-wide traffic and engagement overview</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-2xl text-sm flex items-start gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="whitespace-pre-line">
            <p className="font-bold">Database load warning/error:</p>
            <p className="text-xs text-red-700/90 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Top stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 sm:gap-4">
        <StatCard icon={Eye} label="Total Page Visits" value={stats?.totalVisits ?? 0}
          sub="All time tracked" color="bg-blue-50 text-blue-600" />
        <StatCard icon={TrendingUp} label="Visits (Last 7 days)" value={stats?.visitsLast7 ?? 0}
          sub="Rolling week" color="bg-green-50 text-green-600" />
        <StatCard icon={MousePointer} label="Product Views" value={stats?.totalImpressions ?? 0}
          sub="Impressions on market" color="bg-purple-50 text-purple-600" />
        <StatCard icon={Navigation} label="Direction Requests" value={stats?.totalDirections ?? 0}
          sub="Get Directions clicks" color="bg-orange-50 text-orange-600" />
      </div>

      {/* Visit chart */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient sm:p-6">
        <div className="mb-4 flex items-center gap-2 sm:mb-6">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-on-surface">Daily Site Visits</h2>
          <span className="ml-auto text-[10px] text-on-surface-variant font-medium">Last {visits.length} days</span>
        </div>
        {visits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
            <BarChart3 className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm font-semibold">No visit data yet</p>
            <p className="text-xs mt-1">Visits will appear here after users open the site</p>
          </div>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="flex h-32 min-w-[520px] items-end gap-2">
              {visits.map((v) => {
                const shortDate = v.date.slice(5); // MM-DD
                return (
                  <Bar key={v.date} value={v.total} max={maxVisits}
                    label={shortDate} color="bg-primary" />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Platform metrics */}
      <div>
        <h2 className="text-sm font-black uppercase tracking-widest text-on-surface-variant mb-4">Platform Metrics</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 sm:gap-4">
          <StatCard icon={Users} label="Total Users" value={stats?.totalUsers ?? 0}
            sub="Registered accounts" color="bg-primary/10 text-primary" />
          <StatCard icon={Store} label="Retailers" value={stats?.totalRetailers ?? 0}
            sub="Active retailer accounts" color="bg-green-50 text-green-600" />
          <StatCard icon={TrendingUp} label="Manufacturers" value={stats?.totalManufacturers ?? 0}
            sub="Manufacturer accounts" color="bg-blue-50 text-blue-600" />
          <StatCard icon={Package} label="Listed Products" value={stats?.totalProducts ?? 0}
            sub="On marketplace" color="bg-purple-50 text-purple-600" />
          <StatCard icon={MousePointer} label="Product Clicks" value={stats?.totalClicks ?? 0}
            sub="Total product card clicks" color="bg-orange-50 text-orange-600" />
          <StatCard icon={Navigation} label="Direction Requests" value={stats?.totalDirections ?? 0}
            sub="Store directions clicked" color="bg-red-50 text-red-500" />
        </div>
      </div>

      <p className="text-[10px] text-outline">
        Visit tracking started from when this feature was deployed. Historical data before deployment is not available.
        For deeper analytics, open{" "}
        <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer"
          className="text-primary underline underline-offset-2">
          Google Analytics (G-7MEFGCD4EX)
        </a>.
      </p>
    </div>
  );
}
