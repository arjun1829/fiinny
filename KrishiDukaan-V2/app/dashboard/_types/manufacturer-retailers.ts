import type { Timestamp } from "firebase/firestore";

export type ManufacturerRetailerStatus = "invited" | "active" | "revoked";
export type RetailerOnboardingStatus = "pending" | "active" | "removed" | "inactive";

/** Document in `manufacturerRetailers` — `id` is the Firestore document ID. */
export interface ManufacturerRetailerDoc {
  id: string;
  manufacturerId: string;
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
  /** Set to true when manufacturer has manually deactivated this retailer (reversible). */
  manuallyDeactivated?: boolean;
}

export interface ManufacturerRetailerRow extends ManufacturerRetailerDoc {
  addedAtLabel: string;
}
