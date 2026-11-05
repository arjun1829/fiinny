import type { Timestamp } from "firebase/firestore";
import type { WeightSlab } from "../../utils/delivery";

export type { WeightSlab };

export type CoverageType = "pan_india" | "states";

export interface DeliverySettings {
  sellerPhone: string;
  onlineDeliveryEnabled: boolean;
  coverageType: CoverageType;
  states: string[];
  /**
   * Slab set used for `states` coverage, and the legacy/fallback set for
   * pan-India sellers who have not configured separate in/out-of-state slabs.
   */
  weightSlabs: WeightSlab[];
  /** Pan-India only: slabs for deliveries within the seller's own state. */
  inStateSlabs: WeightSlab[];
  /** Pan-India only: slabs for deliveries outside the seller's state. */
  outStateSlabs: WeightSlab[];
  /**
   * Seller's own state, denormalized from their profile at save time so the
   * within/outside decision needs no second Firestore read at checkout.
   */
  sellerState: string;
  updatedAt?: Timestamp | null;
}

/**
 * First-time defaults, auto-applied when a seller enables Online Delivery and
 * has no saved configuration yet. Coverage defaults to pan-India.
 *
 * The slab boundaries are chosen for the half-open `[minKg, maxKg)` matching in
 * app/utils/delivery.ts: a weight at exactly 1 kg or 5 kg lands in the UPPER
 * slab, so each order weight matches exactly one slab — no overlap, no gap.
 * The final slab is open-ended (chargeFromSlabs returns the last slab's charge
 * for any weight at or above its minKg); the within-state top slab therefore
 * means "5 kg and above → ₹250", the large maxKg is just the open-ended marker.
 */
export const DEFAULT_IN_STATE_SLABS: WeightSlab[] = [
  { minKg: 0, maxKg: 1, charge: 70 },
  { minKg: 1, maxKg: 5, charge: 150 },
  { minKg: 5, maxKg: 1000, charge: 250 },
];

export const DEFAULT_OUT_STATE_SLABS: WeightSlab[] = [
  { minKg: 0, maxKg: 1, charge: 70 },
  { minKg: 1, maxKg: 5, charge: 150 },
  { minKg: 5, maxKg: 10, charge: 300 },
];

export const INDIAN_STATES: string[] = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  // Union Territories
  "Andaman & Nicobar Islands",
  "Chandigarh",
  "Dadra & Nagar Haveli and Daman & Diu",
  "Delhi",
  "Jammu & Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];
