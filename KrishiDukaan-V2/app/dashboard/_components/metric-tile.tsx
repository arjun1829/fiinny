import { HelperIcon } from "../../../components/helpers";
import { HelperTextKey } from "../../i18n/helperTexts";

type MetricTileProps = {
  label: string;
  value: string;
  hint?: string;
  helperKey?: HelperTextKey;
};

export function MetricTile({ label, value, hint, helperKey }: MetricTileProps) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-on-surface-variant">{label}</p>
        {helperKey ? (
          <HelperIcon
            size="xs"
            variant="ghost"
            side="bottom"
            textKey={helperKey}
            ariaLabel={`${label} help`}
          />
        ) : null}
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-on-surface md:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}
