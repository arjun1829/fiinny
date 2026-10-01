// Display formatters. Pure, UI-agnostic.
import type { MetricKind } from './demographics';

const intFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Integer with Indian thousands grouping, e.g. 12,34,567. */
export function formatInt(n: number): string {
  return Number.isFinite(n) ? intFmt.format(Math.round(n)) : '—';
}

/** Two-decimal number, e.g. 1.23. */
export function formatDecimal(n: number): string {
  return Number.isFinite(n) ? decFmt.format(n) : '—';
}

/** A 0..1 rate rendered as a percentage, e.g. 0.4523 -> "45.23%". */
export function formatPercent(rate: number): string {
  return Number.isFinite(rate) ? `${(rate * 100).toFixed(2)}%` : '—';
}

/** Seconds rendered compactly, e.g. 83 -> "1m 23s", 3725 -> "1h 2m". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format a metric value according to its kind. */
export function formatMetric(kind: MetricKind, value: number): string {
  switch (kind) {
    case 'count':
      return formatInt(value);
    case 'rate':
      return formatPercent(value);
    case 'duration':
      return formatDuration(value);
    case 'decimal':
      return formatDecimal(value);
  }
}
