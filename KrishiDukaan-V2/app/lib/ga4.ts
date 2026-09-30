import { BetaAnalyticsDataClient } from "@google-analytics/data";

/**
 * Server-side Google Analytics 4 (GA4) Data API client.
 *
 * This is the AUTHORITATIVE source for user-engagement metrics (DAU / MAU /
 * DAU-MAU, active-users-over-time, platform and device breakdowns) shown on the
 * Admin Analytics → Engagement tab.
 *
 * Definitions used throughout (GA4 semantics — do NOT conflate these):
 *   - DAU            : unique `activeUsers` during a single day, per GA4.
 *   - MAU            : unique `activeUsers` over a rolling 30-day window, per GA4.
 *                      A user active on many days counts ONCE — this is why MAU
 *                      is a single report with NO date dimension, never a sum of
 *                      daily numbers.
 *   - Platform       : Web / Android / iOS (GA4 `platform` dimension — the app
 *                      surface). NOT the same as device category.
 *   - Device category: desktop / mobile / tablet (GA4 `deviceCategory`). The
 *                      SAME user can appear under several device categories, so
 *                      these are shown as a breakdown only and are NEVER summed
 *                      to derive DAU/MAU.
 *
 * Credentials are resolved server-side only, reusing the project's existing
 * Firebase Admin service-account convention (FIREBASE_CLIENT_EMAIL /
 * FIREBASE_PRIVATE_KEY) and falling back to Application Default Credentials on
 * Google infrastructure (App Hosting / Cloud Run). The GA4 numeric property id
 * comes from GA4_PROPERTY_ID. No credential or private key is ever exposed to
 * the browser — this module must only be imported from server code.
 */

/** Thrown when GA4_PROPERTY_ID (or credentials) are not configured for this env. */
export class Ga4NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Ga4NotConfiguredError";
  }
}

/** Returns the configured numeric GA4 property id, or null when unconfigured. */
export function getGa4PropertyId(): string | null {
  const raw = (process.env.GA4_PROPERTY_ID ?? "").trim();
  if (!raw) return null;
  // Accept either a bare numeric id ("123456789") or the full resource name
  // ("properties/123456789"); normalize to the bare numeric id.
  return raw.replace(/^properties\//, "");
}

export function isGa4Configured(): boolean {
  return getGa4PropertyId() !== null;
}

let _client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient {
  if (_client) return _client;

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "krishidukan-e8315";

  // Use the explicit service-account key when present (local dev + prod secrets);
  // otherwise fall back to ADC, which App Hosting / Cloud Run inject via the
  // runtime service account. Either identity must be granted at least "Viewer"
  // on the GA4 property for runReport to succeed.
  if (clientEmail && privateKey) {
    _client = new BetaAnalyticsDataClient({
      projectId,
      credentials: { client_email: clientEmail, private_key: privateKey },
    });
  } else {
    _client = new BetaAnalyticsDataClient();
  }
  return _client;
}

/** A single YYYY-MM-DD day (GA4 interprets it in the property's own timezone). */
export type Ga4DateRange = { startDate: string; endDate: string };

export type ActiveUsersDayPoint = { date: string; activeUsers: number };
export type Ga4Breakdown = { key: string; label: string; activeUsers: number };

export type EngagementReport = {
  /** Unique active users on the selected (end) day. */
  dau: number;
  /** Unique active users over the rolling 30-day window ending on the selected day. */
  mau: number;
  /** DAU/MAU × 100, or null when MAU is 0 (never Infinity/NaN). */
  dauMauRatio: number | null;
  /** Active users per day across the selected range (one point per day). */
  activeUsersOverTime: ActiveUsersDayPoint[];
  /** Web / Android / iOS breakdown over the selected range (breakdown only). */
  platform: Ga4Breakdown[];
  /** desktop / mobile / tablet breakdown over the selected range (breakdown only). */
  device: Ga4Breakdown[];
  /** The concrete GA4 date windows used, for display/debug. */
  windows: { day: string; mau: Ga4DateRange; range: Ga4DateRange };
};

function propertyResource(): string {
  const id = getGa4PropertyId();
  if (!id) {
    throw new Ga4NotConfiguredError(
      "GA4_PROPERTY_ID is not set. Google Analytics is not configured for this environment.",
    );
  }
  return `properties/${id}`;
}

/** Formats a JS Date as a GA4 YYYY-MM-DD key using local calendar fields. */
export function ga4DayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Subtracts (n-1) days from a YYYY-MM-DD key, returning a YYYY-MM-DD key. */
function minusDays(dayKey: string, n: number): string {
  const t = Date.parse(`${dayKey}T00:00:00Z`);
  const d = new Date(t - n * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Normalizes GA4's `platform` dimension values to the three surfaces we present.
 * GA4 reports platform as "web" | "Android" | "iOS" (casing varies); anything
 * else (e.g. very old data) is passed through under its raw label so nothing is
 * silently dropped.
 */
function platformLabel(raw: string): { key: string; label: string } {
  const v = raw.trim().toLowerCase();
  if (v === "web") return { key: "web", label: "Web" };
  if (v === "android") return { key: "android", label: "Android" };
  if (v === "ios") return { key: "ios", label: "iOS" };
  return { key: v || "unknown", label: raw || "Unknown" };
}

function deviceLabel(raw: string): { key: string; label: string } {
  const v = raw.trim().toLowerCase();
  if (v === "desktop") return { key: "desktop", label: "Desktop" };
  if (v === "mobile") return { key: "mobile", label: "Mobile" };
  if (v === "tablet") return { key: "tablet", label: "Tablet" };
  return { key: v || "unknown", label: raw || "Unknown" };
}

/**
 * Runs all GA4 reports needed by the Engagement tab for a [from, to] window.
 *
 * `from`/`to` are YYYY-MM-DD day keys. GA4 interprets these in the PROPERTY's
 * timezone, which is authoritative for the analytics day boundary — we pass day
 * keys rather than timestamps precisely so we do not impose the server/browser
 * timezone on the GA4 boundary.
 */
export async function getEngagementReport(from: string, to: string): Promise<EngagementReport> {
  const property = propertyResource();
  const client = getClient();

  const rangeAll: Ga4DateRange = { startDate: from, endDate: to };
  // MAU: rolling 30-day window ending on the selected (to) day, inclusive.
  const mauRange: Ga4DateRange = { startDate: minusDays(to, 29), endDate: to };
  // DAU headline: the selected day only.
  const dayRange: Ga4DateRange = { startDate: to, endDate: to };

  const metric = { name: "activeUsers" };

  const [trendResp, mauResp, dauResp, platformResp, deviceResp] = await Promise.all([
    // Active users over time (one row per day).
    client.runReport({
      property,
      dateRanges: [rangeAll],
      dimensions: [{ name: "date" }],
      metrics: [metric],
      orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
      keepEmptyRows: true,
    }),
    // MAU: single unique count over the 30-day window (NO date dimension → not a sum).
    client.runReport({
      property,
      dateRanges: [mauRange],
      metrics: [metric],
    }),
    // DAU: single unique count for the selected day.
    client.runReport({
      property,
      dateRanges: [dayRange],
      metrics: [metric],
    }),
    // Platform breakdown (Web / Android / iOS) over the selected range.
    client.runReport({
      property,
      dateRanges: [rangeAll],
      dimensions: [{ name: "platform" }],
      metrics: [metric],
    }),
    // Device category breakdown (desktop / mobile / tablet) over the selected range.
    client.runReport({
      property,
      dateRanges: [rangeAll],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [metric],
    }),
  ]);

  // ── Active users over time ──────────────────────────────────────────────────
  const activeUsersOverTime: ActiveUsersDayPoint[] = (trendResp[0].rows ?? []).map((row) => {
    // GA4 returns the `date` dimension as YYYYMMDD.
    const raw = row.dimensionValues?.[0]?.value ?? "";
    const date =
      raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    const activeUsers = Number(row.metricValues?.[0]?.value ?? 0) || 0;
    return { date, activeUsers };
  });

  const mau = Number(mauResp[0].rows?.[0]?.metricValues?.[0]?.value ?? 0) || 0;
  const dau = Number(dauResp[0].rows?.[0]?.metricValues?.[0]?.value ?? 0) || 0;
  const dauMauRatio = mau > 0 ? (dau / mau) * 100 : null;

  const platform: Ga4Breakdown[] = (platformResp[0].rows ?? []).map((row) => {
    const { key, label } = platformLabel(row.dimensionValues?.[0]?.value ?? "");
    return { key, label, activeUsers: Number(row.metricValues?.[0]?.value ?? 0) || 0 };
  });

  const device: Ga4Breakdown[] = (deviceResp[0].rows ?? []).map((row) => {
    const { key, label } = deviceLabel(row.dimensionValues?.[0]?.value ?? "");
    return { key, label, activeUsers: Number(row.metricValues?.[0]?.value ?? 0) || 0 };
  });

  return {
    dau,
    mau,
    dauMauRatio,
    activeUsersOverTime,
    platform,
    device,
    windows: { day: to, mau: mauRange, range: rangeAll },
  };
}
