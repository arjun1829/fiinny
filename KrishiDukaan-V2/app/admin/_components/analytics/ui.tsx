"use client";

/**
 * Shared presentational primitives for the Phase-1 analytics tabs. Kept
 * deliberately close to the existing admin visual language (rounded-2xl cards,
 * surface-container tokens, the hand-rolled bar chart from the old analytics
 * page) so the new dashboard reads as part of the same panel.
 */

import { useMemo, useRef, useState } from "react";
import type { DateRange } from "../../_lib/analytics-queries";

// ─── Cards ──────────────────────────────────────────────────────────────────

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon?: any;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient sm:gap-4 sm:p-5">
      {Icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color ?? "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xl font-black text-on-surface sm:text-2xl">{value}</p>
        <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
        {sub && <p className="mt-0.5 text-[10px] text-outline">{sub}</p>}
      </div>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-on-surface-variant">{children}</h2>
  );
}

export function Panel({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient sm:p-6">
      {(title || right) && (
        <div className="mb-4 flex items-center gap-2 sm:mb-6">
          {title && <h2 className="text-sm font-bold text-on-surface">{title}</h2>}
          {right && <span className="ml-auto">{right}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export const inr = (n: number) =>
  "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");

export const pct = (n: number) => `${(Number(n || 0) * 100).toFixed(1)}%`;

// ─── Charts (hand-rolled SVG line chart, no chart lib — matches the panel) ─────

export type ChartSeries = { key: string; label: string; color: string; className?: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 Feb" for a day bucket, "Feb '24" for a month bucket. */
function formatBucketLabel(key: string, granularity: "day" | "month"): string {
  if (granularity === "month") {
    const [y, m] = key.split("-");
    return `${MONTHS[Number(m) - 1] ?? "?"} '${y.slice(2)}`;
  }
  const [, m, d] = key.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? "?"}`;
}

/** Compact Indian-notation axis numbers: 1.2k, 3.4L, 2.1Cr. */
function compactNum(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

/**
 * Buckets daily data into months once a range is long enough that per-day points
 * become unreadable (> ~2 months). Sums each series within the bucket.
 */
function bucketForDisplay(
  data: Array<{ date: string; [k: string]: any }>,
  series: ChartSeries[],
): { points: Array<{ date: string; [k: string]: any }>; granularity: "day" | "month" } {
  if (data.length <= 62) {
    return { points: data, granularity: "day" };
  }
  const byMonth = new Map<string, Record<string, number>>();
  for (const d of data) {
    const monthKey = d.date.slice(0, 7); // YYYY-MM
    const acc = byMonth.get(monthKey) ?? {};
    for (const s of series) acc[s.key] = (acc[s.key] ?? 0) + Number(d[s.key] || 0);
    byMonth.set(monthKey, acc);
  }
  const points = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sums]) => ({ date, ...sums }));
  return { points, granularity: "month" };
}

/**
 * Multi-series time-series LINE chart. The x-axis is the date/time bucket (the
 * real reason dates were "missing" before: the old bar chart only ever put the
 * date in a hover tooltip and never rendered an axis). Lines live in an SVG that
 * stretches to the container width (`preserveAspectRatio="none"` + non-scaling
 * strokes); every text label / dot / tooltip is an HTML overlay positioned by
 * percentage-x and pixel-y, so nothing distorts when the chart is stretched.
 */
export function TimeSeriesLineChart({
  data,
  series,
  height = 200,
  valueFormat = (n: number) => n.toLocaleString("en-IN"),
}: {
  data: Array<{ date: string; [k: string]: any }>;
  series: ChartSeries[];
  height?: number;
  valueFormat?: (n: number) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { points, granularity } = useMemo(() => bucketForDisplay(data, series), [data, series]);

  const max = useMemo(() => {
    let m = 0;
    for (const p of points) for (const s of series) m = Math.max(m, Number(p[s.key] || 0));
    return m;
  }, [points, series]);

  const hasData = max > 0 && points.length > 0;
  if (!hasData) {
    return <EmptyState message="No activity in this range yet." />;
  }

  // SVG user-space (width is virtual; height maps 1:1 to px so overlays align).
  const W = 800;
  const H = height;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const n = points.length;
  const plotTop = padT;
  const plotBottom = H - padB;
  const plotH = plotBottom - plotTop;

  const xFor = (i: number) => (n > 1 ? padL + (i / (n - 1)) * (W - padL - padR) : padL + (W - padL - padR) / 2);
  const xFrac = (i: number) => (xFor(i) / W) * 100;
  const yFor = (v: number) => plotTop + (1 - (max > 0 ? v / max : 0)) * plotH;

  const gridVals = [0, max / 2, max];
  const tickStep = Math.max(1, Math.ceil(n / 7));
  const tickIdx = points.map((_, i) => i).filter((i) => i % tickStep === 0 || i === n - 1);

  const onMove = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const startFrac = padL / W;
    const endFrac = (W - padR) / W;
    const t = (frac - startFrac) / (endFrac - startFrac);
    setHover(Math.max(0, Math.min(n - 1, Math.round(t * (n - 1)))));
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height: H }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
        {/* horizontal gridlines */}
        {gridVals.map((v, i) => (
          <line
            key={i}
            x1={padL}
            x2={W - padR}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke="currentColor"
            strokeWidth={1}
            className="text-outline-variant/30"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* hover guide */}
        {hover != null && (
          <line
            x1={xFor(hover)}
            x2={xFor(hover)}
            y1={plotTop}
            y2={plotBottom}
            stroke="currentColor"
            strokeWidth={1}
            className="text-on-surface-variant/40"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* series lines */}
        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            points={points.map((p, i) => `${xFor(i)},${yFor(Number(p[s.key] || 0))}`).join(" ")}
          />
        ))}
      </svg>

      {/* Y-axis labels */}
      {gridVals.map((v, i) => (
        <span
          key={i}
          className="pointer-events-none absolute left-0 -translate-y-1/2 text-[10px] font-medium text-on-surface-variant"
          style={{ top: yFor(v) }}
        >
          {compactNum(v)}
        </span>
      ))}

      {/* X-axis date labels */}
      {tickIdx.map((i) => (
        <span
          key={i}
          className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-on-surface-variant"
          style={{ left: `${xFrac(i)}%`, top: plotBottom + 6 }}
        >
          {formatBucketLabel(points[i].date, granularity)}
        </span>
      ))}

      {/* hover dots */}
      {hover != null &&
        series.map((s) => (
          <span
            key={s.key}
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface"
            style={{ left: `${xFrac(hover)}%`, top: yFor(Number(points[hover][s.key] || 0)), backgroundColor: s.color }}
          />
        ))}

      {/* tooltip */}
      {hover != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-on-surface px-2 py-1 text-[10px] font-semibold text-surface shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, xFrac(hover)))}%`, top: 0 }}
        >
          <div className="font-bold">{formatBucketLabel(points[hover].date, granularity)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}: {valueFormat(Number(points[hover][s.key] || 0))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// ─── States ─────────────────────────────────────────────────────────────────

export function LoadingState({ label = "Loading analytics…" }: { label?: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-on-surface-variant">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
      <p className="text-sm font-semibold">{message}</p>
    </div>
  );
}

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
      <div className="whitespace-pre-line">
        <p className="font-bold">Could not load some analytics:</p>
        <p className="mt-0.5 text-xs text-red-700/90">{error}</p>
      </div>
    </div>
  );
}

// ─── Date range control ───────────────────────────────────────────────────────

export type RangePreset = "7d" | "30d" | "90d" | "mtd" | "all" | "custom";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Resolves a preset to a concrete, day-aligned [from, to]. */
export function rangeForPreset(preset: RangePreset, custom?: { from: string; to: string }): DateRange {
  const now = new Date();
  const to = endOfDay(now);
  if (preset === "custom" && custom?.from && custom?.to) {
    return { from: startOfDay(new Date(custom.from)), to: endOfDay(new Date(custom.to)) };
  }
  if (preset === "all") {
    // Epoch → now. Only ever used by aggregation count()/sum() metrics, never by
    // a per-doc range read, so the unbounded window stays cheap.
    return { from: new Date(0), to };
  }
  if (preset === "mtd") {
    return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  }
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const from = startOfDay(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  return { from, to };
}

const PRESET_LABELS: Record<Exclude<RangePreset, "custom" | "all">, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  mtd: "Month to date",
};

/**
 * Small self-contained range picker. Bounded on purpose — there is no "all time"
 * option because every range-scoped metric reads the documents inside the window,
 * and an unbounded window would reintroduce the whole-collection scans this
 * dashboard is designed to avoid.
 */
export function useDateRange(initial: RangePreset = "30d") {
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const range = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);
  return { preset, setPreset, custom, setCustom, range };
}

export function DateRangePicker({
  preset,
  setPreset,
  custom,
  setCustom,
  allowAllTime = false,
}: ReturnType<typeof useDateRange> & { allowAllTime?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowAllTime && (
        <button
          type="button"
          onClick={() => setPreset("all")}
          className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
            preset === "all"
              ? "border-primary bg-primary/10 text-primary"
              : "border-outline-variant/40 bg-surface-container-low text-on-surface hover:bg-surface-container"
          }`}
        >
          All time
        </button>
      )}
      {(Object.keys(PRESET_LABELS) as (keyof typeof PRESET_LABELS)[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPreset(p)}
          className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
            preset === p
              ? "border-primary bg-primary/10 text-primary"
              : "border-outline-variant/40 bg-surface-container-low text-on-surface hover:bg-surface-container"
          }`}
        >
          {PRESET_LABELS[p]}
        </button>
      ))}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={custom.from}
          max={custom.to || undefined}
          onChange={(e) => {
            setCustom({ ...custom, from: e.target.value });
            if (e.target.value && custom.to) setPreset("custom");
          }}
          className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 text-xs text-on-surface"
        />
        <span className="text-xs text-on-surface-variant">→</span>
        <input
          type="date"
          value={custom.to}
          min={custom.from || undefined}
          onChange={(e) => {
            setCustom({ ...custom, to: e.target.value });
            if (custom.from && e.target.value) setPreset("custom");
          }}
          className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 text-xs text-on-surface"
        />
      </div>
    </div>
  );
}
