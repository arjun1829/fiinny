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
