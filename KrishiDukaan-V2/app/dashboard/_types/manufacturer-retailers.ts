import type { Timestamp } from "firebase/firestore";

export type ManufacturerRetailerStatus = "invited" | "active" | "revoked";
export type RetailerOnboardingStatus = "pending" | "active" | "removed" | "inactive";

export interface RetailerAddress {
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

/** Document in `manufacturerRetailers` — `id` is the Firestore document ID. */
export interface ManufacturerRetailerDoc {
  id: string;
  manufacturerId: string;
  /** Normalized E164 phone of the manufacturer. Populated on all new docs. */
  manufacturerPhone?: string;
  /** Pre-created `retailers/{docId}` written by the manufacturer before signup. */
  retailerDocId: string;
  /** Firebase Auth UID — populated when the retailer claims the invite. */
  retailerId: string;
  shopName: string;
  ownerName: string;
  retailerEmail: string;
  retailerPhone: string;
  inviteCode: string;
  status: ManufacturerRetailerStatus;
  claimable?: boolean;
  onboardingStatus: RetailerOnboardingStatus;
  assignedSeat: boolean;
  seatAssignedAt?: Timestamp | null;
  createdBy: string;
  addedAt?: Timestamp | null;
  address?: RetailerAddress | null;
  geo?: { latitude: number; longitude: number } | null;
  /** Set to true when manufacturer manually deactivates this retailer (reversible, not a full revoke). */
  manuallyDeactivated?: boolean;
  /** Human-readable code e.g. RTL-1001 assigned at creation time. */
  retailerCode?: string;
}

export interface ManufacturerRetailerRow extends ManufacturerRetailerDoc {
  addedAtLabel: string;
}
