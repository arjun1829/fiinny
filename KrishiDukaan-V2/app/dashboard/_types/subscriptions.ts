import type { Timestamp } from "firebase/firestore";

export type SubscriptionOwnerType = "manufacturer" | "retailer";
export type SubscriptionStatus = "active" | "expired" | "cancelled";
export type SeatListingStatus = "active" | "released" | "expired";

/**
 * "own"      = the owner created their own product (retailer or manufacturer).
 * "assigned" = a manufacturer assigned their product to a linked retailer.
 *              The manufacturer's subscription pays for the seat.
 */
export type SeatListingType = "own" | "assigned";

export interface Subscription {
  id: string;
  ownerId: string;
  ownerType: SubscriptionOwnerType;
  planName: string;
  seatsPurchased: number;
  startDate: Timestamp;
  expiryDate: Timestamp;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  subscriptionStatus: SubscriptionStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Single source of truth for active seat consumption.
 * One record = one active product listing = one consumed seat.
 *
 * Seat count formula:
 *   purchased (active subscriptions) − active+non-expired listings = available
 */
export interface RetailerSeatListing {
  id: string;

  /** uid of whoever's subscription is paying for this seat */
  ownerId: string;
  ownerType: SubscriptionOwnerType;

  /** Set when a manufacturer is involved (own OR assigned) */
  manufacturerId: string | null;
  /** Set when the listing covers a retailer slot (assigned listings) */
  retailerDocId: string | null;
  /** Retailer's Firebase Auth uid — empty string until they sign up */
  retailerId: string | null;

  /** The product doc this listing covers (retailer copy ID for assigned listings) */
  productId: string;
  /**
   * For assigned listings: the manufacturer's original product doc ID.
   * Used for duplicate-assignment checks and pre-selecting in the assign modal.
   */
  manufacturerProductId: string | null;

  listingType: SeatListingType;
  status: SeatListingStatus;

  assignedAt: Timestamp;
  expiresAt: Timestamp; // mirrors linked subscription's expiryDate
  releasedAt: Timestamp | null;
}

export interface SeatStats {
  totalPurchased: number; // seats from active subscriptions
  activeUsed: number;     // active + non-expired listings where ownerId = user
  available: number;      // totalPurchased − activeUsed, >= 0
  expiringSoon: number;   // subscriptions expiring within 5 days
}
