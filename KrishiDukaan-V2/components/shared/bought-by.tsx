"use client";

import { useEffect, useState } from "react";
import { fetchBuyStats, type BuyStats } from "../../app/lib/buy-stats";
import { useI18n } from "../../app/i18n/I18nContext";

// Same order on web and app (bought_by.dart), indexed by the stored colour.
const COLOURS = ["#2e7d32", "#f57c00", "#1565c0", "#6a1b9a", "#00838f", "#ad1457"];

/**
 * Social proof under a product's name: overlapping initials of recent buyers
 * and "300+ people bought this in the last 2 months". Renders nothing until
 * the stats arrive, and nothing at all for products with too few buyers —
 * so it never shifts the page for most products or shows "1 person bought".
 */
export function BoughtBy({ productId, className = "" }: { productId: string; className?: string }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<BuyStats | null>(null);

  useEffect(() => {
    let alive = true;
    setStats(null);
    if (productId) void fetchBuyStats(productId).then((s) => alive && setStats(s));
    return () => {
      alive = false;
    };
  }, [productId]);

  if (!stats?.show) return null;
  const { label, days } = stats.show;
  const period = days <= 30 ? t("boughtPeriod30") : days <= 60 ? t("boughtPeriod60") : t("boughtPeriod90");

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {stats.recent.length > 0 && (
        <div className="flex -space-x-2" aria-hidden>
          {stats.recent.map((r, idx) => (
            <span
              key={idx}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-black text-white shadow-sm"
              style={{ background: COLOURS[r.c % COLOURS.length], zIndex: stats.recent.length - idx }}
            >
              {r.i || "•"}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-on-surface-variant">
        <span className="font-black text-on-surface">{t("boughtByCount", { count: label })}</span>{" "}
        {t("boughtByPeriod", { period })}
      </p>
    </div>
  );
}
