"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Box, Layers, CreditCard, ShieldCheck, TrendingUp, Store, AlertTriangle } from "lucide-react";
import { fetchAllUsers, fetchAllProductsForAdmin, fetchHubs } from "../firebase";

function StatCard({ label, value, icon: Icon, color, onClick }: { label: string; value: string | number; icon: any; color: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-3 sm:p-5 flex items-center gap-3 sm:gap-4 ${onClick ? 'hover:bg-surface-container-low cursor-pointer transition-colors' : ''} disabled:cursor-default`}
    >
      <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-4 w-4 sm:h-6 sm:w-6" />
      </div>
      <div className="text-left">
        <p className="text-lg sm:text-2xl font-black text-on-surface">{value}</p>
        <p className="text-[10px] sm:text-xs font-semibold text-on-surface-variant">{label}</p>
      </div>
    </button>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState({
    total: 0, retailers: 0, manufacturers: 0, admins: 0,
    paid: 0, products: 0, hubs: 0,
  });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchAllUsers(), fetchAllProductsForAdmin(), fetchHubs()])
      .then(([users, products, hubs]) => {
        const retailers = users.filter(u => u.role === "retailer").length;
        const manufacturers = users.filter(u => u.role === "manufacturer").length;
        const admins = users.filter(u => u.role === "admin").length;
        const paid = users.filter(u => u.isPaid).length;

        // Filter out copies and group by name (same as Products tab)
        const COPY_SOURCES = new Set(["admin_assigned", "retailer_inventory_copy", "manufacturer_assigned"]);
        const catalogProducts = products.filter(p => !COPY_SOURCES.has((p as any).source));
        const uniqueNames = new Set(catalogProducts.map(p => p.name.toLowerCase().trim()));

        setStats({ total: users.length, retailers, manufacturers, admins, paid, products: uniqueNames.size, hubs: hubs.length });
        setRecentUsers([...users].sort((a, b) => {
          const aT = a.createdAt?.seconds || 0;
          const bT = b.createdAt?.seconds || 0;
          return bT - aT;
        }).slice(0, 8));
      })
      .catch(err => {
        console.error("Failed to load admin overview data:", err);
        setError("Failed to load dashboard statistics from Firebase. Please check your connection.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      admin: "bg-red-100 text-red-700",
      manufacturer: "bg-blue-100 text-blue-700",
      retailer: "bg-green-100 text-green-700",
      customer: "bg-gray-100 text-gray-600",
    };
    return map[role] || map.customer;
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 sm:gap-3 mb-1">
          <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <h1 className="text-lg sm:text-2xl font-black text-on-surface">Admin Overview</h1>
        </div>
        <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9">Platform snapshot — live from Firestore.</p>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <StatCard 
          label="Total Users" 
          value={stats.total} 
          icon={Users} 
          color="bg-primary/10 text-primary"
          onClick={() => router.push('/admin/users')}
        />
        <StatCard 
          label="Retailers" 
          value={stats.retailers} 
          icon={Store} 
          color="bg-green-100 text-green-700"
          onClick={() => router.push('/admin/users')}
        />
        <StatCard 
          label="Manufacturers" 
          value={stats.manufacturers} 
          icon={TrendingUp} 
          color="bg-blue-100 text-blue-700"
          onClick={() => router.push('/admin/users')}
        />
        <StatCard 
          label="Paid Subscribers" 
          value={stats.paid} 
          icon={CreditCard} 
          color="bg-harvest/10 text-harvest"
          onClick={() => router.push('/admin/subscriptions')}
        />
        <StatCard 
          label="Total Products" 
          value={stats.products} 
          icon={Box} 
          color="bg-secondary/10 text-secondary"
          onClick={() => router.push('/admin/products')}
        />
        <StatCard 
          label="Hubs" 
          value={stats.hubs} 
          icon={Layers} 
          color="bg-purple-100 text-purple-700"
          onClick={() => router.push('/admin/hubs')}
        />
        <StatCard label="Admins" value={stats.admins} icon={ShieldCheck} color="bg-red-100 text-red-700" />
      </div>

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-outline-variant/20 flex items-center justify-between">
          <h2 className="text-sm font-bold text-on-surface">Recent Users</h2>
          <a href="/admin/users" className="text-xs font-bold text-primary hover:underline">View all →</a>
        </div>
        {/* Mobile: card layout, Desktop: table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-low">
                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Name / Email</th>
                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Role</th>
                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Paid</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => (
                <tr key={u.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-on-surface">{u.name || "—"}</p>
                    <p className="text-xs text-on-surface-variant">{u.email || u.id}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${roleBadge(u.role)}`}>{u.role || "customer"}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold ${u.isPaid ? "text-green-600" : "text-on-surface-variant"}`}>{u.isPaid ? "Yes" : "No"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-outline-variant/10">
          {recentUsers.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{u.name || "—"}</p>
                <p className="text-[11px] text-on-surface-variant truncate">{u.email || u.id}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${roleBadge(u.role)}`}>{u.role || "customer"}</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${u.isPaid ? "bg-green-500" : "bg-gray-300"}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
