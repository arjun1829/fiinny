import type { TimeSeriesPoint } from "../_data/mock";
import { HelperIcon } from "../../../components/helpers";
import { HelperTextKey } from "../../i18n/helperTexts";

type SimpleBarChartProps = {
  title: string;
  subtitle?: string;
  data: TimeSeriesPoint[];
  accentClass?: string;
  helperKey?: HelperTextKey;
  /** Formats the value in tooltips and the y-axis max (e.g. ₹ for revenue). */
  valueFormatter?: (value: number) => string;
  /** Shown instead of an all-zero chart, so an empty window reads as "no
   *  activity tracked" rather than a broken chart drawing flat bars. */
  emptyMessage?: string;
};

function defaultFormat(value: number): string {
  return Math.round(value).toLocaleString("en-IN");
}

export function SimpleBarChart({
  title,
  subtitle,
  data,
  accentClass = "bg-primary",
  helperKey,
  valueFormatter,
  emptyMessage = "No activity in this period yet.",
}: SimpleBarChartProps) {
  const points = data ?? [];
  const fmt = valueFormatter ?? defaultFormat;
  // A chart is "empty" when there is nothing to plot or every day is zero —
  // the old chart forced an 8% minimum height, so zero days drew identical
  // stub bars that looked like a rendering bug. We show an honest empty state
  // instead, and let real values own the full height.
  const max = Math.max(...points.map((d) => Number(d.value) || 0), 0);
  const hasData = points.length > 0 && max > 0;

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-on-surface">{title}</h3>
          {helperKey ? (
            <HelperIcon
              size="xs"
              variant="ghost"
              side="right"
              textKey={helperKey}
              ariaLabel={`${title} help`}
            />
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>
        ) : null}
      </div>

      {hasData ? (
        <div className="mt-6 flex gap-3">
          {/* Y-axis: just the peak and the baseline, so a bar's height has a
              reference without crowding the plot. */}
          <div className="flex h-40 flex-col justify-between py-0.5 text-right text-[10px] font-medium text-on-surface-variant sm:h-48">
            <span>{fmt(max)}</span>
            <span>0</span>
          </div>
          <div className="flex h-40 flex-1 gap-2 sm:h-48 sm:gap-3">
            {points.map((d, i) => {
              const value = Number(d.value) || 0;
              // Non-zero values keep a small floor so a tiny day is still
              // visible; zero days draw nothing (a flat baseline), which is
              // the honest picture.
              const h = value > 0 ? Math.max(Math.round((value / max) * 100), 4) : 0;
              return (
                <div
                  key={`${d.label}-${i}`}
                  // h-full so the column has a DEFINITE height (the row's
                  // h-40/h-48). Without it the column shrank to its content and
                  // the bar's `height: X%` resolved against an auto height —
                  // collapsing every bar to zero, which is why no bars showed.
                  className="group relative flex h-full flex-1 flex-col items-center"
                >
                  {/* Bar track: flex-1 gives it a definite height (row minus
                      the label), so the bar's percentage height resolves. */}
                  <div className="flex w-full flex-1 flex-col justify-end">
                    <div
                      className={`w-full rounded-t-md ${accentClass} opacity-90 transition-opacity group-hover:opacity-100`}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                  {/* Tooltip with the day and its value. */}
                  <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-on-surface px-2 py-1 text-[11px] font-semibold text-surface opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {d.label}: {fmt(value)}
                  </div>
                  <span className="mt-2 text-[10px] font-medium text-on-surface-variant sm:text-xs">
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-6 flex h-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low/40 text-center sm:h-48">
          <p className="text-sm font-semibold text-on-surface-variant">{emptyMessage}</p>
          <p className="text-xs text-on-surface-variant/70">
            Values appear here as activity is recorded.
          </p>
        </div>
      )}
    </div>
  );
}
