import type { TimeSeriesPoint } from "../_data/mock";
import { HelperIcon } from "../../../components/helpers";
import { HelperTextKey } from "../../i18n/helperTexts";

type SimpleBarChartProps = {
  title: string;
  subtitle?: string;
  data: TimeSeriesPoint[];
  accentClass?: string;
  helperKey?: HelperTextKey;
};

export function SimpleBarChart({
  title,
  subtitle,
  data,
  accentClass = "bg-primary",
  helperKey,
}: SimpleBarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

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
      <div className="mt-6 flex h-40 items-end gap-2 sm:h-48 sm:gap-3">
        {data.map((d) => {
          const h = Math.round((d.value / max) * 100);
          return (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-full w-full flex-col justify-end">
                <div
                  className={`w-full rounded-t-md ${accentClass} opacity-90 transition-opacity hover:opacity-100`}
                  style={{ height: `${Math.max(h, 8)}%` }}
                  title={`${d.label}: ${d.value}`}
                />
              </div>
              <span className="text-[10px] font-medium text-on-surface-variant sm:text-xs">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
