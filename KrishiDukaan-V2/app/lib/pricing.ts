/**
 * Self-serve subscription pricing — the single source of truth.
 *
 * WHY THIS EXISTS
 * ---------------
 * The per-listing price used to be hardcoded in four places that nothing kept
 * in sync:
 *
 *   api/payment/create-order/route.ts  PRICE_PER_SEAT   ← what the seller is CHARGED
 *   views/SubscriptionView.tsx         DURATION_OPTIONS ← what the seller SEES
 *   app/sell/page.tsx                  PLANS            ← the public marketing page
 *   plans/ collection (admin UI)       ← admin-assigned subscriptions only
 *
 * Editing the price in the admin Plans tab changed none of the first three, and
 * missing one of them meant either charging more than was displayed (a billing
 * complaint) or less (lost revenue). All three now read `settings/pricing`
 * through this module.
 *
 * NOT the same thing as the `plans` collection. A `plans` doc is an
 * admin-assigned bundle (a price for N seats). This is the public self-serve
 * ladder: a price PER listing for each duration. Different shape, different
 * consumer — kept separate so changing one cannot silently alter the other.
 *
 * FALLBACK IS DELIBERATE. Every reader falls back to DEFAULT_DURATIONS when the
 * document is missing or malformed. A payment must never fail because a
 * settings doc was deleted, and the defaults below are the prices that were
 * hardcoded before this module existed — so a total read failure behaves
 * exactly like the old code did.
 */

/** Firestore path holding the live pricing ladder. */
export const PRICING_DOC_PATH = { collection: "settings", doc: "pricing" } as const;

export interface DurationPrice {
  /**
   * Stable identifier, unique across the ladder. Optional: rows without one are
   * keyed by their period, which is how the ladder worked when a period could
   * only mean one price.
   *
   * It exists because a bundle and a per-listing rate can share a period — a
   * Rs 144/listing year and a Rs 4,999-for-50-listings year are different
   * products sold for the same twelve months. Keying on `months` alone forced
   * one of them out of the ladder.
   */
  id?: string;
  /** Billing period in months. Also the key the checkout sends up. */
  months: number;
  /** Rupees per listing (per "seat") for the WHOLE period, not per month. */
  pricePerSeat: number;
  /** Optional marketing badge, e.g. "Save 14%". Display only. */
  badge?: string;
  /**
   * Flat rupee price for the WHOLE period, independent of how many listings the
   * seller selects. When present it overrides pricePerSeat entirely.
   *
   * A bundle ("Rs 4,999 for 50 listings") is not expressible as a per-listing
   * price: multiplying it by the seat count would charge 50x the intended
   * amount. So flat plans are their own shape, and every amount in the system
   * goes through computeAmount() rather than doing the multiplication inline.
   */
  flatPrice?: number;
  /**
   * Listings a flat plan includes. Seats beyond this are clamped, never billed
   * as extra — an upsell is a separate plan, not a silent overage charge.
   * Meaningless (and rejected) without flatPrice.
   */
  includedListings?: number;
  /**
   * Account roles allowed to buy this plan. Absent or empty means everyone.
   *
   * A retailer bundle priced for a shop with a handful of listings is not the
   * same product as a manufacturer contract, and without this a manufacturer
   * could buy the cheap plan instead of the one their volume warrants. The
   * check that matters is the server-side one in create-order — this field only
   * declares the rule; the client filtering it drives is a courtesy.
   */
  roles?: string[];
  /**
   * Which of the two plan families the checkout shows this row under.
   *
   *   standard — a packaged plan: a fixed price for a fixed number of listings
   *              (flatPrice + includedListings are REQUIRED). The seller picks a
   *              period, never a quantity.
   *   custom   — the original self-serve ladder: a price per listing, seller
   *              picks how many. Also any legacy bundle row with no tier.
   *
   * Absent means custom, so every ladder saved before tiers existed keeps
   * behaving exactly as it did. See tierOf().
   */
  tier?: PlanTier;
  /**
   * Optional "was" price in rupees, shown struck through next to the real
   * price (e.g. Standard Yearly: ~~14,400~~ 11,000). DISPLAY ONLY — nothing is
   * ever charged from it; computeAmount() never reads it.
   */
  compareAtPrice?: number;
}

/** The two plan families on the subscription page (Standard / Custom toggle). */
export type PlanTier = "standard" | "custom";

/** Tier of a ladder row. Rows saved before tiers existed are custom. */
export function tierOf(d: DurationPrice): PlanTier {
  return d.tier === "standard" ? "standard" : "custom";
}

/** The ladder rows shown under one tier of the toggle, in period order. */
export function plansForTier(durations: DurationPrice[], tier: PlanTier): DurationPrice[] {
  return durations.filter((d) => tierOf(d) === tier);
}

/**
 * Plan name stored on the subscription record ("Standard" / "Custom").
 * Snapshotted at purchase, so a later edit or delete of the ladder row never
 * changes what an old subscription says it was.
 */
export function planNameFor(d: DurationPrice): string {
  return tierOf(d) === "standard" ? "Standard" : "Custom";
}

/**
 * The prices that were hardcoded before this module. Changing these changes the
 * fallback only — the live prices come from Firestore.
 */
export const DEFAULT_DURATIONS: DurationPrice[] = [
  // Standard — packaged 100-listing plans (the toggle's default tab).
  // pricePerSeat is only the per-listing equivalent, kept so every row stays a
  // valid ladder entry; the flat price is what is charged.
  {
    id: "standard-monthly",
    tier: "standard",
    months: 1,
    pricePerSeat: 21,
    flatPrice: 2100,
    includedListings: 100,
  },
  {
    id: "standard-yearly",
    tier: "standard",
    months: 12,
    pricePerSeat: 110,
    flatPrice: 11000,
    includedListings: 100,
    compareAtPrice: 14400,
    badge: "Save 24%",
  },
  // Custom — price per listing; the seller picks the quantity.
  { months: 1, pricePerSeat: 21 },
  { months: 3, pricePerSeat: 54, badge: "Save 14%" },
  { months: 6, pricePerSeat: 90, badge: "Save 29%" },
  { months: 12, pricePerSeat: 144, badge: "Best Value" },
];

/**
 * Validate a raw Firestore value into a usable ladder.
 * Returns null (never a partial ladder) so callers fall back cleanly.
 */
export function parseDurations(raw: unknown): DurationPrice[] | null {
  const list = (raw as { durations?: unknown })?.durations ?? raw;
  if (!Array.isArray(list) || list.length === 0) return null;

  const out: DurationPrice[] = [];
  for (const item of list) {
    const rawId = (item as DurationPrice)?.id;
    const id =
      typeof rawId === "string" && rawId.trim() ? rawId.trim() : undefined;
    const months = Number((item as DurationPrice)?.months);
    const price = Number((item as DurationPrice)?.pricePerSeat);
    // Money must be a whole, non-negative number of rupees: Razorpay is charged
    // in paise via `price * 100`, and a fractional rupee here would round badly.
    if (!Number.isInteger(months) || months <= 0) return null;
    if (!Number.isInteger(price) || price < 0) return null;
    const badge = (item as DurationPrice)?.badge;

    // Flat plans are optional, but a half-specified one is a data error: a
    // flatPrice with no listing cap would grant unlimited listings for a flat
    // fee, which is exactly how a retailer plan cannibalises an enterprise one.
    const rawFlat = (item as DurationPrice)?.flatPrice;
    const rawIncl = (item as DurationPrice)?.includedListings;
    const hasFlat = rawFlat !== undefined && rawFlat !== null;
    const hasIncl = rawIncl !== undefined && rawIncl !== null;
    if (hasFlat !== hasIncl) return null;
    let flat: number | undefined;
    let incl: number | undefined;
    if (hasFlat) {
      flat = Number(rawFlat);
      incl = Number(rawIncl);
      if (!Number.isInteger(flat) || flat < 0) return null;
      if (!Number.isInteger(incl) || incl <= 0) return null;
    }

    const rawRoles = (item as DurationPrice)?.roles;
    let roles: string[] | undefined;
    if (rawRoles !== undefined && rawRoles !== null) {
      if (!Array.isArray(rawRoles)) return null;
      const cleaned = rawRoles
        .map((r) => String(r ?? "").trim().toLowerCase())
        .filter((r) => r.length > 0);
      // An empty restriction list would mean "nobody can buy this", which is
      // never what an admin means — treat it as unrestricted.
      roles = cleaned.length ? Array.from(new Set(cleaned)) : undefined;
    }

    // Tier: absent = custom. An unknown value is a data error, not "custom" —
    // saving a typo must fail loudly rather than move a plan between tabs.
    const rawTier = (item as DurationPrice)?.tier as unknown;
    let tier: PlanTier | undefined;
    if (rawTier !== undefined && rawTier !== null && rawTier !== "") {
      if (rawTier !== "standard" && rawTier !== "custom") return null;
      tier = rawTier;
    }
    // A Standard plan IS a fixed price for a fixed number of listings; without
    // both it would silently fall back to per-listing billing.
    if (tier === "standard" && flat === undefined) return null;

    const rawCompare = (item as DurationPrice)?.compareAtPrice as unknown;
    let compareAtPrice: number | undefined;
    if (rawCompare !== undefined && rawCompare !== null && rawCompare !== "") {
      compareAtPrice = Number(rawCompare);
      if (!Number.isInteger(compareAtPrice) || compareAtPrice <= 0) return null;
    }

    out.push({
      ...(id ? { id } : {}),
      ...(tier === "standard" ? { tier } : {}),
      months,
      pricePerSeat: price,
      ...(compareAtPrice !== undefined ? { compareAtPrice } : {}),
      ...(roles ? { roles } : {}),
      ...(typeof badge === "string" && badge.trim() ? { badge: badge.trim() } : {}),
      ...(flat !== undefined ? { flatPrice: flat, includedListings: incl } : {}),
    });
  }

  // Duplicate keys would make the charged price depend on array order.
  const seen = new Set<string>();
  for (const d of out) {
    const k = planKey(d);
    if (seen.has(k)) return null;
    seen.add(k);
  }

  return out.sort((a, b) => a.months - b.months);
}

/** The ladder-unique key for a plan: its id, or its period when it has none. */
export function planKey(d: DurationPrice): string {
  return d.id ?? String(d.months);
}

/**
 * Resolve what the client asked for to a plan on the ladder.
 *
 * Prefers an explicit key so a bundle and a per-listing rate sharing a period
 * stay distinguishable; falls back to matching on period for older clients
 * (including the mobile app) that only ever send `durationMonths`.
 */
export function planFor(
  durations: DurationPrice[],
  key: string | number | undefined | null,
): DurationPrice | null {
  const k = String(key ?? "").trim();
  if (k) {
    const byKey = durations.find((d) => planKey(d) === k);
    if (byKey) return byKey;
  }
  const months = Number(key);
  if (Number.isFinite(months)) {
    // Period match must never silently pick a bundle: a client that only knows
    // about per-listing pricing would show one price and be charged another.
    // Nor a Standard plan, for the same reason.
    const byMonths = durations.find(
      (d) => d.months === months && !isFlatPlan(d) && tierOf(d) === "custom",
    );
    if (byMonths) return byMonths;
  }
  return null;
}

/** Look up the price for a period. Returns null when the period isn't offered. */
export function priceFor(
  durations: DurationPrice[],
  months: number,
): number | null {
  return (
    durations.find((d) => d.months === months && tierOf(d) === "custom")
      ?.pricePerSeat ?? null
  );
}

/** Per-month equivalent, for display only ("₹12/month" on a yearly plan). */
export function perMonthLabel(d: DurationPrice): string {
  return `₹${Math.round(d.pricePerSeat / d.months)}/month`;
}

// ─── Seat quantity rule ─────────────────────────────────────────────────────

/** Seats are sold in blocks of this size, and this is also the minimum buy. */
export const SEAT_STEP = 10;

/** One-tap seat quantities offered next to the input. */
export const SEAT_PRESETS = [10, 100, 500] as const;

/**
 * Snap a requested seat count to the sale rule: at least [SEAT_STEP], and
 * always a whole multiple of it.
 *
 * Rounds UP rather than to nearest, so a seller who needs 15 listing slots
 * gets 20 and never silently ends up with fewer slots than they asked for.
 *
 * The purchase UIs (mobile subscription screen, web SubscriptionView) and
 * /api/payment/create-order all run requests through this, so the seat count
 * the seller sees priced is exactly the one the server charges for — a client
 * that skipped the rule can't be billed on a different number than it showed.
 */
export function normalizeSeatCount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= SEAT_STEP) return SEAT_STEP;
  return Math.ceil(n / SEAT_STEP) * SEAT_STEP;
}

// ─── Promo codes ────────────────────────────────────────────────────────────

export interface PromoCode {
  /** Uppercased code as typed by the seller. */
  code: string;
  /** Percentage off the order subtotal, 1–100. */
  discountPercent: number;
  active: boolean;
  /**
   * Billing-period months this code applies to (e.g. [12] = yearly only).
   * Absent or empty means the code is valid for every plan.
   */
  applicablePlans?: number[];
  /** Minimum normalised seat count required. Absent = no minimum. */
  minSeats?: number;
  /** Maximum normalised seat count allowed. Absent = no maximum. */
  maxSeats?: number;
  /** ISO date YYYY-MM-DD; code is not valid before this date. Absent = immediate. */
  startDate?: string;
  /** ISO date YYYY-MM-DD; code expires after this date. Absent = never expires. */
  endDate?: string;
}

/**
 * Validate a promoCodes/ document.
 *
 * The field is `discountPercent` — matching what SubscriptionView already reads.
 * Anything outside 1–100 is rejected rather than clamped: a 0% or 150% code is a
 * data error, and silently "fixing" it would charge an amount nobody intended.
 * New optional fields (applicablePlans, minSeats, maxSeats, startDate, endDate) are
 * parsed when present; absent fields leave the code unrestricted on that dimension
 * so existing documents without these fields continue to work unchanged.
 */
export function parsePromo(raw: unknown): PromoCode | null {
  const d = raw as Record<string, unknown> | null | undefined;
  if (!d) return null;
  const code = String(d.code ?? "").trim().toUpperCase();
  const discountPercent = Number(d.discountPercent);
  if (!code) return null;
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
    return null;
  }

  let applicablePlans: number[] | undefined;
  if (Array.isArray(d.applicablePlans) && d.applicablePlans.length > 0) {
    const plans = (d.applicablePlans as unknown[])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    if (plans.length > 0) applicablePlans = plans;
  }

  let minSeats: number | undefined;
  if (d.minSeats != null) {
    const n = Number(d.minSeats);
    if (Number.isInteger(n) && n > 0) minSeats = n;
  }

  let maxSeats: number | undefined;
  if (d.maxSeats != null) {
    const n = Number(d.maxSeats);
    if (Number.isInteger(n) && n > 0) maxSeats = n;
  }

  const isoDate = (v: unknown): string | undefined =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

  return {
    code,
    discountPercent,
    active: d.active !== false,
    ...(applicablePlans ? { applicablePlans } : {}),
    ...(minSeats !== undefined ? { minSeats } : {}),
    ...(maxSeats !== undefined ? { maxSeats } : {}),
    ...(isoDate(d.startDate) ? { startDate: isoDate(d.startDate) } : {}),
    ...(isoDate(d.endDate) ? { endDate: isoDate(d.endDate) } : {}),
  };
}

/** Human label for a billing period, used in promo eligibility messages. */
export function planLabel(months: number): string {
  return months === 12 ? "Yearly" : months === 1 ? "Monthly" : `${months} Month`;
}

/** The purchase a promo code is being checked against. */
export interface PromoContext {
  /** Billing period of the selected plan, in months. */
  months: number;
  /** Normalised seat count the seller is buying. */
  seatCount: number;
}

/**
 * Result of checking a promo against a purchase. A flat shape (rather than a
 * discriminated union) on purpose: this project builds with `strict: false`, so
 * boolean-discriminant narrowing does not work — `error` present means it does
 * not apply, `error` absent means the discount is live.
 */
export interface PromoEvaluation {
  /** Percentage off, or 0 when the code does not apply. */
  discountPercent: number;
  /** Uppercased code when it applies; absent otherwise. */
  code?: string;
  /** Seller-facing reason the code does not apply; absent when it does. */
  error?: string;
}

/**
 * THE single source of truth for whether a promo code applies to a purchase.
 *
 * Both the checkout UI (SubscriptionView) and the server (create-order) call
 * this against the same promoCodes/ document, so the discount a seller is shown
 * and the discount the server actually grants are computed by identical rules
 * and messages — they cannot drift, and a rule added here takes effect in both
 * places at once. The server remains the final authority: the client's result
 * only improves UX; create-order re-runs this before charging.
 *
 * `raw` is a promoCodes/ document as stored (the caller has already resolved the
 * code to a document; a missing code is the caller's own "not found" case).
 * Returns the discount to apply when every condition passes, or a single
 * seller-facing reason for the first condition that fails.
 */
export function evaluatePromo(raw: unknown, ctx: PromoContext): PromoEvaluation {
  const promo = parsePromo(raw);
  if (!promo) return { discountPercent: 0, error: "Invalid or expired promo code." };

  if (!promo.active) {
    return { discountPercent: 0, error: "This promo code has been deactivated." };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (promo.startDate && today < promo.startDate) {
    return { discountPercent: 0, error: "This promo code is not yet active." };
  }
  if (promo.endDate && today > promo.endDate) {
    return { discountPercent: 0, error: "This promo code has expired." };
  }

  if (promo.applicablePlans?.length && !promo.applicablePlans.includes(ctx.months)) {
    const names = promo.applicablePlans.map(planLabel).join(", ");
    return { discountPercent: 0, error: `This promo code is only valid for: ${names}.` };
  }

  if (promo.minSeats !== undefined && ctx.seatCount < promo.minSeats) {
    return {
      discountPercent: 0,
      error: `This promo code requires a minimum of ${promo.minSeats} seats.`,
    };
  }
  if (promo.maxSeats !== undefined && ctx.seatCount > promo.maxSeats) {
    return {
      discountPercent: 0,
      error: `This promo code is only valid for up to ${promo.maxSeats} seats.`,
    };
  }

  return { discountPercent: promo.discountPercent, code: promo.code };
}

/**
 * THE single place a rupee amount is derived from a plan and a seat count.
 *
 * Everything that needs to know what something costs — checkout, the seller UI,
 * the admin activation path, the record written after payment — calls this. The
 * old code multiplied seats by a price inline in five places against three
 * different hardcoded tables, so the amount charged and the amount recorded
 * could differ (and did: purchases at unlisted durations recorded Rs 21).
 */
export function computeAmount(d: DurationPrice, seats: number): number {
  if (typeof d.flatPrice === "number") return d.flatPrice;
  return billableSeats(d, seats) * d.pricePerSeat;
}

/**
 * Seats actually granted for a plan. Flat plans cap at their included listings;
 * per-listing plans grant what was asked for.
 */
export function billableSeats(d: DurationPrice, seats: number): number {
  const n = Math.max(1, Math.floor(Number(seats)) || 1);
  // A Standard plan is one fixed pack: it always grants its full listing
  // count, whatever quantity the client happened to send.
  if (tierOf(d) === "standard" && typeof d.includedListings === "number") {
    return d.includedListings;
  }
  if (typeof d.flatPrice === "number" && typeof d.includedListings === "number") {
    return Math.min(n, d.includedListings);
  }
  return n;
}

/**
 * Whether an account role may buy a plan.
 *
 * An unknown role (no signed-in user, or a role the ladder does not mention) is
 * allowed only on unrestricted plans — a restricted plan fails closed rather
 * than falling back to "probably fine".
 */
export function isPlanAllowed(d: DurationPrice, role: string | null | undefined): boolean {
  if (!d.roles?.length) return true;
  const r = String(role ?? "").trim().toLowerCase();
  return r.length > 0 && d.roles.includes(r);
}

/** The subset of the ladder a given role may buy. */
export function plansForRole(
  durations: DurationPrice[],
  role: string | null | undefined,
): DurationPrice[] {
  return durations.filter((d) => isPlanAllowed(d, role));
}

/** True when the plan is a fixed-price bundle rather than a per-listing rate. */
export function isFlatPlan(d: DurationPrice): boolean {
  return typeof d.flatPrice === "number";
}

/** Apply a percentage discount to a rupee subtotal. */
export function applyDiscount(subtotal: number, discountPercent: number): number {
  const discounted = Math.ceil(subtotal * (1 - discountPercent / 100));
  return Math.max(0, discounted);
}

/**
 * The plan name to SHOW for a subscription record.
 *
 * Before Standard plans existed, every self-serve checkout (web and app) saved
 * `planName: "Standard"` even though each one was a per-listing purchase — i.e.
 * what is now called Custom. Records written since carry `planTier`, so only a
 * record WITHOUT planTier that says "Standard" is that legacy mislabel.
 * Admin-assigned names ("Admin Assigned", named plans) pass through unchanged.
 */
export function subscriptionPlanLabel(sub: {
  planName?: unknown;
  planTier?: unknown;
  isCustom?: unknown;
}): string {
  const name = typeof sub.planName === "string" ? sub.planName.trim() : "";
  if (sub.planTier === "standard") return name || "Standard";
  if (sub.planTier === "custom" || sub.isCustom === true) return name || "Custom";
  if (!name || name === "Standard") return "Custom";
  return name;
}
