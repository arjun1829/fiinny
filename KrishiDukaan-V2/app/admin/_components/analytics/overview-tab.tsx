"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Store, Factory, UserRound, UserPlus, Package, ShoppingCart, IndianRupee, CreditCard } from "lucide-react";
import {
  getUserCounts,
  getPlatformCounts,
  countNewUsers,
  getGmvSum,
  type UserCounts,
  type PlatformCounts,
} from "../../_lib/analytics-queries";
import { RefreshButton } from "../refresh-button";
import { StatCard, SectionTitle, DateRangePicker, useDateRange, LoadingState, ErrorBanner, inr } from "./ui";

export function OverviewTab() {
  // Defaults to All Time: every Overview metric is an aggregation count()/sum(),
  // so All Time costs about the same handful of reads as any bounded range.
  const dr = useDateRange("all");
  const [users, setUsers] = useState<UserCounts | null>(null);
  const [platform, setPlatform] = useState<PlatformCounts | null>(null);
  const [newUsers, setNewUsers] = useState<number | null>(null);
  const [gmv, setGmv] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, p, nu, gmvSum] = await Promise.all([
        getUserCounts(),
        getPlatformCounts(),
        countNewUsers(dr.range),
        getGmvSum(dr.range),
      ]);
      setUsers(u);
      setPlatform(p);
      setNewUsers(nu);
      setGmv(gmvSum);
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dr.range]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker {...dr} allowAllTime />
        <RefreshButton savedAt={savedAt} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      </div>

      <ErrorBanner error={error} />

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div>
            <SectionTitle>Users</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 sm:gap-4">
              <StatCard icon={Users} label="Total registered users" value={users?.all ?? 0} color="bg-primary/10 text-primary" />
              <StatCard icon={Factory} label="Manufacturers" value={users?.manufacturer ?? 0} color="bg-blue-50 text-blue-600" />
              <StatCard icon={Store} label="Retailers" value={users?.retailer ?? 0} color="bg-green-50 text-green-600" />
              <StatCard icon={UserRound} label="Customers / Consumers" value={users?.customer ?? 0} sub="No seller role" color="bg-amber-50 text-amber-600" />
              <StatCard icon={UserPlus} label="New users (selected range)" value={newUsers ?? 0} color="bg-purple-50 text-purple-600" />
            </div>
          </div>

          <div>
            <SectionTitle>Platform</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 sm:gap-4">
              <StatCard icon={Package} label="Total products" value={platform?.totalProducts ?? 0} color="bg-purple-50 text-purple-600" />
              <StatCard icon={ShoppingCart} label="Total orders" value={platform?.totalOrders ?? 0} sub="All time" color="bg-orange-50 text-orange-600" />
              <StatCard icon={IndianRupee} label="GMV (selected range)" value={inr(gmv ?? 0)} sub="Value of orders placed" color="bg-green-50 text-green-600" />
              <StatCard icon={CreditCard} label="Active subscriptions" value={platform?.activeSubscriptions ?? 0} color="bg-blue-50 text-blue-600" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
