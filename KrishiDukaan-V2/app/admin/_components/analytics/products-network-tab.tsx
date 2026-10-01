"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, PackagePlus, Eye, MousePointer, Phone, Navigation, Network, Store, Factory, Armchair } from "lucide-react";
import {
  getUserCounts,
  getProductMetrics,
  getNetworkMetrics,
  getSeatMetrics,
  type ProductMetrics,
  type NetworkMetrics,
  type SeatMetrics,
} from "../../_lib/analytics-queries";
import { RefreshButton } from "../refresh-button";
import {
  StatCard,
  SectionTitle,
  Panel,
  DateRangePicker,
  useDateRange,
  LoadingState,
  ErrorBanner,
  TimeSeriesLineChart,
} from "./ui";

export function ProductsNetworkTab() {
  const dr = useDateRange("30d");
  const [products, setProducts] = useState<ProductMetrics | null>(null);
  const [network, setNetwork] = useState<NetworkMetrics | null>(null);
  const [seats, setSeats] = useState<SeatMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pm, counts, sm] = await Promise.all([
        getProductMetrics(dr.range),
        getUserCounts(),
        getSeatMetrics(),
      ]);
      setProducts(pm);
      setSeats(sm);
      setNetwork(await getNetworkMetrics(counts));
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
        <DateRangePicker {...dr} />
        <RefreshButton savedAt={savedAt} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      </div>

      <ErrorBanner error={error} />

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div>
            <SectionTitle>Products</SectionTitle>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 sm:gap-4">
              <StatCard icon={Package} label="Total products" value={products?.totalProducts ?? 0} sub="All time" color="bg-purple-50 text-purple-600" />
              <StatCard icon={PackagePlus} label="Added (selected range)" value={products?.addedInRange ?? 0} color="bg-green-50 text-green-600" />
            </div>
            <Panel title="Products added over time">
              <TimeSeriesLineChart
                data={(products?.perDay ?? []) as any}
                series={[{ key: "added", label: "Products added", color: "#a855f7" }]}
              />
            </Panel>
          </div>

          <div>
            <SectionTitle>Product engagement (all time)</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-4">
              <StatCard icon={Eye} label="Impressions" value={(products?.impressions ?? 0).toLocaleString("en-IN")} color="bg-blue-50 text-blue-600" />
              <StatCard icon={MousePointer} label="Clicks" value={(products?.clicks ?? 0).toLocaleString("en-IN")} color="bg-purple-50 text-purple-600" />
              <StatCard icon={Phone} label="Calls" value={(products?.calls ?? 0).toLocaleString("en-IN")} color="bg-green-50 text-green-600" />
              <StatCard icon={Navigation} label="Direction requests" value={(products?.directionRequests ?? 0).toLocaleString("en-IN")} color="bg-orange-50 text-orange-600" />
            </div>
          </div>

          <div>
            <SectionTitle>Manufacturer → retailer network</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 sm:gap-4">
              <StatCard icon={Network} label="Network links" value={network?.totalLinks ?? 0} sub="All invites + active" color="bg-primary/10 text-primary" />
              <StatCard icon={Network} label="Active links" value={network?.activeLinks ?? 0} sub="Claimed & active" color="bg-green-50 text-green-600" />
              <StatCard icon={Factory} label="Manufacturers" value={network?.activeManufacturers ?? 0} color="bg-blue-50 text-blue-600" />
              <StatCard icon={Store} label="Retailers" value={network?.activeRetailers ?? 0} color="bg-green-50 text-green-600" />
            </div>
          </div>

          <div>
            <SectionTitle>Seats</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 sm:gap-4">
              <StatCard icon={Armchair} label="Seats purchased" value={seats?.seatsPurchased ?? 0} sub="Sum of totalSeats" color="bg-blue-50 text-blue-600" />
              <StatCard icon={Armchair} label="Seats used" value={seats?.seatsUsed ?? 0} sub="Active assignments" color="bg-green-50 text-green-600" />
              <StatCard icon={Armchair} label="Vacant seats" value={seats?.seatsVacant ?? 0} sub="Purchased − used" color="bg-amber-50 text-amber-600" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
