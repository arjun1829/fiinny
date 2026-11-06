/**
 * Shared types + authoritative subscription-classification logic for the admin
 * Promotions feature (manually granting promotional subscription seats).
 *
 * A promotion grants seats DIRECTLY — no checkout. Each per-recipient grant is
 * stored as a normal `subscriptions` document flagged `isPromotional: true` +
 * `promotionId`, so it plugs into every existing access/seat/expiry path
 * (dashboard paywall `isPaid`, seat math in subscriptions-firestore.ts, and the
 * daily `expireSubscriptions` Cloud Function). The promotion DEFINITION and
 * per-recipient HISTORY live in `promotions/{id}` + a `recipients` subcollection.
 *
 * Classification here is the single rule the recipient filters use. It is NOT
 * `isPaid` alone — a retailer with zero purchased seats but an active
 * manufacturer-assigned entitlement has access and must never read as "none".
 */

export const PROMOTIONS_COLLECTION = "promotions";
export const RECIPIENTS_SUBCOLLECTION = "recipients";
export const SUBSCRIPTIONS_COLLECTION = "subscriptions";

// ─── Target role / eligibility filter ────────────────────────────────────────

export type PromotionTargetRole = "all" | "retailer" | "manufacturer";

/**
 * Recipient subscription classification, in priority order. A user matches
 * exactly one. `manufacturer` = access granted purely through a manufacturer
 * link/assigned seat (no own subscription) — it is deliberately distinct from
 * `none` so a mfr-covered retailer is never offered as "unsubscribed".
 */
export type RecipientStatus =
  | "paid"         // own or admin-granted active subscription (not promotional)
  | "promotional"  // active subscription flagged isPromotional
  | "manufacturer" // active manufacturer link / assigned seat, no own subscription
  | "expired"      // had a subscription, all expired, no other access
  | "none";        // no access of any kind

/** Filters offered in the recipient table. "none" is surfaced as "Not Paid". */
export type EligibilityFilter = "all" | "paid" | "none" | "promotional" | "expired";

export const ELIGIBILITY_OPTIONS: { value: EligibilityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "none", label: "Not Paid" },
  { value: "promotional", label: "Promotional" },
  { value: "expired", label: "Expired" },
];

export const ROLE_OPTIONS: { value: PromotionTargetRole; label: string }[] = [
  { value: "all", label: "All" },
  { value: "retailer", label: "Retailer" },
  { value: "manufacturer", label: "Manufacturer" },
];

export const STATUS_LABEL: Record<RecipientStatus, string> = {
  paid: "Paid",
  promotional: "Promotional",
  manufacturer: "Mfr-assigned",
  expired: "Expired",
  none: "Not Paid",
};

// ─── Classification ──────────────────────────────────────────────────────────

/**
 * Signals gathered (per user) from the authoritative collections. See
 * classifyRecipient for how they resolve to a single status.
 */
export interface ClassificationSignals {
  /** An active, non-expired subscription that is NOT promotional (own or admin-granted). */
  activePaidSub: boolean;
  /** An active, non-expired subscription flagged isPromotional. */
  activePromoSub: boolean;
  /** Active manufacturer link (manufacturerRetailers) OR assigned seat listing, not expired. */
  manufacturerAccess: boolean;
  /** Any subscription that exists but is expired/cancelled. */
  hasExpiredSub: boolean;
}

/**
 * Collapses the signals to one status. Priority: a real paid subscription wins,
 * then a promotional one, then manufacturer-provided access, then expired
 * history, then nothing. This priority is what makes the "Not Paid" filter
 * exclude manufacturer-covered retailers (requirement: never misclassify them).
 */
export function classifyRecipient(s: ClassificationSignals): RecipientStatus {
  if (s.activePaidSub) return "paid";
  if (s.activePromoSub) return "promotional";
  if (s.manufacturerAccess) return "manufacturer";
  if (s.hasExpiredSub) return "expired";
  return "none";
}

/**
 * Does a recipient with this status match the chosen eligibility filters?
 * The filter is multi-select: any match passes. An empty list or one that
 * includes "all" matches everyone. `none` is the "Not Paid" bucket and
 * intentionally excludes `manufacturer`.
 */
export function matchesEligibility(status: RecipientStatus, filters: EligibilityFilter[]): boolean {
  if (!filters.length || filters.includes("all")) return true;
  return filters.includes(status as EligibilityFilter);
}

/** Parse a comma-separated eligibility query param into a validated filter list. */
export function parseEligibility(raw: string | null | undefined): EligibilityFilter[] {
  if (!raw) return ["all"];
  const valid = new Set(ELIGIBILITY_OPTIONS.map((o) => o.value));
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is EligibilityFilter => valid.has(s as EligibilityFilter));
  return list.length ? list : ["all"];
}

// ─── Optional WhatsApp marketing template ────────────────────────────────────
//
// A promotion may OPTIONALLY attach a marketing WhatsApp template that is sent to
// each recipient (before the free_seats_assigned confirmation) by the
// notifyOnPromotionSeatAssigned Cloud Function. These ids must exist in the
// WhatsApp template resolver (functions/src/wa/templateResolver.ts) — this is NOT
// a parallel messaging system, just a selectable template for the existing queue.
//
// Per the LIVE Meta template definitions (verified 2026-10-10), both options are
// Hindi Marketing templates with a static IMAGE header and a body that has
// EXACTLY ONE variable: {{1}} = business name. The offer quantity (10 free /
// 40 paid) is hard-coded in the approved copy, NOT a parameter. `offerQuantity`
// below is informational only (shown in the preview); it is never sent as a
// template parameter.

export type MarketingTemplateId = "navratri_offer_free" | "navratri_offer_paid";

export interface MarketingTemplateOption {
  id: MarketingTemplateId;
  label: string;
  language: string;   // BCP-47, as registered in Meta
  hasImageHeader: boolean;
  /** Quantity baked into the approved copy (display only — not a parameter). */
  offerQuantity: number;
  /** Human preview of the body — {{1}} is the only variable (business name). */
  previewBody: (businessName: string) => string;
}

export const MARKETING_TEMPLATES: MarketingTemplateOption[] = [
  {
    id: "navratri_offer_free",
    label: "Navratri Offer — Free (Marketing · Hindi)",
    language: "hi",
    hasImageHeader: true,
    offerQuantity: 10,
    previewBody: (b) =>
      `🪔 नवरात्रि और दिवाली स्पेशल ऑफर!\n\nनमस्ते ${b || "व्यापारी"} 🙏\nKrishiDukan पर 10 अतिरिक्त प्रॉडक्ट्स लिस्ट करें बिल्कुल FREE!`,
  },
  {
    id: "navratri_offer_paid",
    label: "Navratri Offer — Paid (Marketing · Hindi)",
    language: "hi",
    hasImageHeader: true,
    offerQuantity: 40,
    previewBody: (b) =>
      `🪔 नवरात्रि और दिवाली स्पेशल ऑफर!\n\nनमस्ते ${b || "व्यापारी"} 🙏\nKrishiDukan पर 40 अतिरिक्त प्रॉडक्ट्स लिस्ट करें — 1 महीने के लिए बिल्कुल मुफ्त!`,
  },
];

const MARKETING_TEMPLATE_IDS = new Set<string>(MARKETING_TEMPLATES.map((t) => t.id));

/** Validates/normalizes an incoming marketing template id; null when absent/invalid-when-optional. */
export function normalizeMarketingTemplate(raw: unknown): MarketingTemplateId | null {
  if (raw == null || raw === "") return null;
  const v = String(raw);
  return MARKETING_TEMPLATE_IDS.has(v) ? (v as MarketingTemplateId) : null;
}

/** True only for a non-empty value that is NOT a known marketing template. */
export function isInvalidMarketingTemplate(raw: unknown): boolean {
  return raw != null && raw !== "" && !MARKETING_TEMPLATE_IDS.has(String(raw));
}

// ─── Validation (shared by server + client) ──────────────────────────────────

export const MAX_SEATS_PER_RECIPIENT = 1000;
export const MAX_DURATION_MONTHS = 120;

/** Returns `{ value, error }`: error is a message string, or null when valid. */
export function validateSeats(seats: unknown): { value: number; error: string | null } {
  const n = Number(seats);
  if (!Number.isInteger(n) || n <= 0) return { value: 0, error: "Seats per recipient must be a positive integer." };
  if (n > MAX_SEATS_PER_RECIPIENT) return { value: 0, error: `Seats per recipient cannot exceed ${MAX_SEATS_PER_RECIPIENT}.` };
  return { value: n, error: null };
}

export function validateDuration(months: unknown): { value: number; error: string | null } {
  const n = Number(months);
  if (!Number.isInteger(n) || n <= 0) return { value: 0, error: "Duration (months) must be a positive integer." };
  if (n > MAX_DURATION_MONTHS) return { value: 0, error: `Duration cannot exceed ${MAX_DURATION_MONTHS} months.` };
  return { value: n, error: null };
}

/** Adds `months` calendar months to a date (matches the assign-route convention). */
export function addMonths(start: Date, months: number): Date {
  const d = new Date(start);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ─── Wire shapes (API ⇄ UI) ───────────────────────────────────────────────────

export interface CandidateRecipient {
  /** users/{phone} doc id (E164). */
  phone: string;
  uid: string | null;
  businessName: string;
  role: "retailer" | "manufacturer";
  status: RecipientStatus;
}

export type RecipientAssignmentStatus = "active" | "scheduled" | "expired" | "revoked";

export interface PromotionRecipientRecord {
  /** = users/{phone} doc id. */
  userPhone: string;
  userId: string | null;
  role: "retailer" | "manufacturer";
  seatsGranted: number;
  startDate: string;   // ISO
  expiryDate: string;  // ISO
  status: RecipientAssignmentStatus;
  subscriptionId: string | null;
}

export interface PromotionSummary {
  id: string;
  name: string;
  targetRole: PromotionTargetRole;
  eligibility: EligibilityFilter[];
  seatsPerRecipient: number;
  durationMonths: number;
  startDate: string;        // ISO
  endDate: string | null;   // ISO (optional promotion end date)
  notes: string | null;
  recipientCount: number;
  status: "scheduled" | "active" | "ended";
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}
