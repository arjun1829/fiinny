"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { StatMetric } from "../_data/mock";
import { cn } from "../_lib/cn";
import { HelperIcon } from "../../../components/helpers";
import { HelperTextKey } from "../../i18n/helperTexts";
import { useI18n } from "../../i18n/I18nContext";

type StatCardProps = {
  metric: StatMetric;
  helperKey?: HelperTextKey;
};

export function StatCard({ metric, helperKey }: StatCardProps) {
  const { t } = useI18n();
  const TrendIcon =
    metric.trend === "up"
      ? TrendingUp
      : metric.trend === "down"
        ? TrendingDown
        : Minus;

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-3 shadow-ambient sm:p-4 md:p-5">
      <div className="flex items-center gap-1">
        <p className="text-xs font-medium text-on-surface-variant sm:text-sm">{metric.label}</p>
        {helperKey ? (
          <HelperIcon
            size="xs"
            variant="ghost"
            side="bottom"
            textKey={helperKey}
            ariaLabel={`${metric.label} help`}
          />
        ) : null}
      </div>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-on-surface sm:mt-2 sm:text-2xl md:text-3xl">
        {metric.value}
      </p>
      {metric.change ? (
        <p
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-medium",
            metric.trend === "up" && "text-primary",
            metric.trend === "down" && "text-harvest",
            metric.trend === "neutral" && "text-on-surface-variant",
          )}
        >
          <TrendIcon className="h-3.5 w-3.5" />
          {metric.change} <span className="font-normal text-on-surface-variant">{t('vsLastWeek')}</span>
        </p>
      ) : null}
    </div>
  );
}
