import {
  collection,
  doc,
  getDocs,
  GeoPoint,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import type {
  ManufacturerRetailerDoc,
  ManufacturerRetailerRow,
  ManufacturerRetailerStatus,
  RetailerOnboardingStatus,
} from "../_types/manufacturer-retailers";

const COLLECTION = "manufacturerRetailers";

function timestampLabel(value: unknown): string {
  if (value == null) return "—";
  const t = value as Timestamp;
  if (typeof t?.toDate === "function") {
    return t.toDate().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
  return "—";
}

function parseStatus(value: unknown): ManufacturerRetailerStatus {
  if (value === "active" || value === "revoked" || value === "invited") return value;
  return "invited";
}

function parseOnboardingStatus(value: unknown): RetailerOnboardingStatus {
  if (value === "active") return "active";
  if (value === "removed") return "removed";
  if (value === "inactive") return "inactive";
  return "pending";
}

function mapDoc(id: string, data: Record<string, unknown>): ManufacturerRetailerDoc {
  return {
    id,
    manufacturerId: String(data.manufacturerId ?? ""),
    retailerDocId: String(data.retailerDocId ?? ""),
    retailerId: String(data.retailerId ?? ""),
    shopName: String(data.shopName ?? ""),
    ownerName: String(data.ownerName ?? ""),
    retailerEmail: String(data.retailerEmail ?? ""),
    retailerPhone: String(data.retailerPhone ?? ""),
    inviteCode: String(data.inviteCode ?? ""),
    status: parseStatus(data.status),
    claimable: typeof data.claimable === "boolean" ? data.claimable : undefined,
    onboardingStatus: parseOnboardingStatus(data.onboardingStatus),
    assignedSeat: data.assignedSeat === true,
    seatAssignedAt: (data.seatAssignedAt as Timestamp) ?? null,
    createdBy: String(data.createdBy ?? ""),
    addedAt: (data.addedAt as Timestamp) ?? null,
    manuallyDeactivated: data.manuallyDeactivated === true,
  };
}

// ─── Invite code generation ───────────────────────────────────────────────────

const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomInviteCode(length = 10): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += INVITE_CHARS[bytes[i]! % INVITE_CHARS.length];
  }
  return out;
}

async function isInviteCodeTaken(code: string): Promise<boolean> {
  const q = query(collection(db, COLLECTION), where("inviteCode", "==", code), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function generateUniqueInviteCode(maxAttempts = 8): Promise<string> {
  for (let a = 0; a < maxAttempts; a++) {
    const code = randomInviteCode(10);
    const taken = await isInviteCodeTaken(code);
    if (!taken) return code;
  }
  throw new Error("Could not generate a unique invite code. Try again.");
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function fetchManufacturerRetailers(
  manufacturerId: string,
): Promise<ManufacturerRetailerRow[]> {
  const q = query(collection(db, COLLECTION), where("manufacturerId", "==", manufacturerId));
  const snap = await getDocs(q);
  const rows: ManufacturerRetailerRow[] = snap.docs.map((d) => {
    const docData = mapDoc(d.id, d.data() as Record<string, unknown>);
    return { ...docData, addedAtLabel: timestampLabel(docData.addedAt) };
  });
  rows.sort((a, b) => {
    const ta = a.addedAt?.toMillis?.() ?? 0;
    const tb = b.addedAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
  return rows;
}

// ─── Write ────────────────────────────────────────────────────────────────────

export type NetworkRetailerAddress = {
  line1: string;
  city: string;
  state: string;
  pincode: string;
};

export type CreateNetworkRetailerInput = {
  manufacturerId: string;
  shopName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: NetworkRetailerAddress;
  geo: GeoPoint | null;
};

/**
 * Atomically pre-creates a retailer entity in `retailers`, a linked invite row
 * in `manufacturerRetailers`, and a seat consumption record in
 * `retailerSeatListings`. The seat listing is the single source of truth for
 * active seat usage.
 */
export async function createNetworkRetailer(
  input: CreateNetworkRetailerInput,
): Promise<{ retailerDocId: string; inviteCode: string }> {
  const inviteCode = await generateUniqueInviteCode();
  const batch = writeBatch(db);
  const now = serverTimestamp();

  // Pre-create retailer entity (no auth UID yet)
  const retailerRef = doc(collection(db, "retailers"));
  const retailerPayload: Record<string, unknown> = {
    role: "retailer",
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    address: {
      line1: input.address.line1.trim(),
      city: input.address.city.trim(),
      state: input.address.state.trim(),
      pincode: input.address.pincode.trim(),
    },
    manufacturerId: input.manufacturerId,
    onboardingType: "manufacturer-network",
    assignedSeat: true,
    seatAssignedAt: now,
    onboardingStatus: "active",
    createdBy: input.manufacturerId,
    active: false,
    subscriptionStatus: "free",
    createdAt: now,
    updatedAt: now,
  };
  if (input.geo) retailerPayload.geo = input.geo;
  batch.set(retailerRef, retailerPayload);

  // Invite row — links manufacturer to the pre-created retailer
  const inviteRef = doc(collection(db, COLLECTION));
  batch.set(inviteRef, {
    id: inviteRef.id,
    manufacturerId: input.manufacturerId,
    retailerDocId: retailerRef.id,
    retailerId: "",
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    retailerEmail: input.email.trim().toLowerCase(),
    retailerPhone: input.phone.trim(),
    inviteCode,
    status: "invited",
    claimable: true,
    onboardingStatus: "active",
    assignedSeat: true,
    seatAssignedAt: now,
    createdBy: input.manufacturerId,
    addedAt: now,
  });

  await batch.commit();
  return { retailerDocId: retailerRef.id, inviteCode };
}

/**
 * Soft-removes a retailer from the manufacturer's network.
 * - Revokes the invite row (status: "revoked").
 * - Releases the seat listing (status: "released") — immediately frees the seat.
 * - Marks the pre-created retailers doc as inactive.
 */
/**
 * Soft-removes a retailer from the manufacturer's network.
 *
 * Atomically:
 *   1. Marks the `manufacturerRetailers` link as "revoked" (status + onboardingStatus).
 *   2. Releases all active assigned seat listings for this retailer (status → "released").
 *   3. Deactivates the corresponding retailer product copies (isActive → false).
 *
 * Does NOT write to `retailers/` — the manufacturer has no permission to modify
 * another user's retailer profile document.
 */
export async function removeNetworkRetailer(
  inviteDocId: string,
  retailerDocId: string,
  manufacturerId: string,
): Promise<void> {
  const now = serverTimestamp();

  // Fetch all active assigned listings for this retailer under this manufacturer
  const listingsSnap = await getDocs(
    query(
      collection(db, "retailerSeatListings"),
      where("ownerId", "==", manufacturerId),
      where("retailerDocId", "==", retailerDocId),
      where("listingType", "==", "assigned"),
      where("status", "==", "active"),
    ),
  );

  const batch = writeBatch(db);

  // 1. Mark the network link as revoked
  batch.update(doc(db, COLLECTION, inviteDocId), {
    status: "revoked",
    claimable: false,
    assignedSeat: false,
    onboardingStatus: "removed",
    removedAt: now,
  });

  // 2. Release each active listing + deactivate the product copy
  listingsSnap.docs.forEach((listingDoc) => {
    batch.update(listingDoc.ref, {
      status: "released",
      releasedAt: now,
    });

    const productId = String(listingDoc.data().productId ?? "");
    if (productId) {
      batch.update(doc(db, "products", productId), {
        isActive: false,
        updatedAt: now,
      });
    }
  });

  await batch.commit();
}

/**
 * Manually deactivates a retailer WITHOUT permanently revoking them.
 *
 * Atomically:
 *   1. Releases all active assigned seat listings for this retailer.
 *   2. Deactivates the corresponding retailer product copies (isActive → false).
 *   3. Marks the `manufacturerRetailers` link as "inactive" (reversible).
 *
 * The retailer document itself is NOT modified — the manufacturer lacks
 * permission to write to another user's retailer profile.
 */
export async function deactivateNetworkRetailer(
  inviteDocId: string,
  retailerDocId: string,
  manufacturerId: string,
): Promise<void> {
  const now = serverTimestamp();

  const listingsSnap = await getDocs(
    query(
      collection(db, "retailerSeatListings"),
      where("ownerId", "==", manufacturerId),
      where("retailerDocId", "==", retailerDocId),
      where("listingType", "==", "assigned"),
      where("status", "==", "active"),
    ),
  );

  const batch = writeBatch(db);

  // Mark the network link as manually inactive (reversible — not "revoked")
  batch.update(doc(db, COLLECTION, inviteDocId), {
    onboardingStatus: "inactive",
    assignedSeat: false,
    manuallyDeactivated: true,
    deactivatedAt: now,
  });

  // Release each active listing and deactivate the product copy
  listingsSnap.docs.forEach((listingDoc) => {
    batch.update(listingDoc.ref, {
      status: "released",
      releasedAt: now,
    });

    const productId = String(listingDoc.data().productId ?? "");
    if (productId) {
      batch.update(doc(db, "products", productId), {
        isActive: false,
        updatedAt: now,
      });
    }
  });

  await batch.commit();
}

/**
 * Resets a manually-deactivated retailer back to "active" onboarding status.
 * Called after the manufacturer assigns at least one product to re-activate.
 */
export async function reactivateNetworkRetailer(inviteDocId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, inviteDocId), {
    onboardingStatus: "active",
    assignedSeat: true,
    manuallyDeactivated: false,
    reactivatedAt: serverTimestamp(),
  });
}

/** @deprecated Use createNetworkRetailer instead. Kept for backward-compat. */
export type CreateManufacturerRetailerInviteInput = {
  manufacturerId: string;
  retailerEmail: string;
  retailerPhone: string;
};

/** @deprecated Use createNetworkRetailer instead. */
export async function createManufacturerRetailerInvite(
  input: CreateManufacturerRetailerInviteInput,
): Promise<{ docId: string; inviteCode: string }> {
  const inviteCode = await generateUniqueInviteCode();
  const ref = doc(collection(db, COLLECTION));
  const now = serverTimestamp();

  await setDoc(ref, {
    id: ref.id,
    manufacturerId: input.manufacturerId,
    retailerDocId: "",
    retailerId: "",
    shopName: "",
    ownerName: "",
    retailerEmail: input.retailerEmail.trim().toLowerCase(),
    retailerPhone: input.retailerPhone.trim(),
    inviteCode,
    status: "invited",
    claimable: true,
    onboardingStatus: "pending",
    assignedSeat: false,
    createdBy: input.manufacturerId,
    addedAt: now,
  });

  return { docId: ref.id, inviteCode };
}
