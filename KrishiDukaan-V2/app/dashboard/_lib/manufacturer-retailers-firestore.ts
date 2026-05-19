import {
  collection,
  doc,
  getDoc,
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
  return "pending";
}

function mapDoc(id: string, data: Record<string, unknown>): ManufacturerRetailerDoc {
  const rawAddr = data.address as Record<string, unknown> | null | undefined;
  const rawGeo  = data.geo as { latitude?: number; longitude?: number } | null | undefined;
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
    address: rawAddr
      ? {
          line1:   String(rawAddr.line1   ?? ""),
          city:    String(rawAddr.city    ?? ""),
          state:   String(rawAddr.state   ?? ""),
          pincode: String(rawAddr.pincode ?? ""),
        }
      : null,
    geo: rawGeo && typeof rawGeo.latitude === "number" && typeof rawGeo.longitude === "number"
      ? { latitude: rawGeo.latitude, longitude: rawGeo.longitude }
      : null,
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
  const invitePayload: Record<string, unknown> = {
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
    address: {
      line1:   input.address.line1.trim(),
      city:    input.address.city.trim(),
      state:   input.address.state.trim(),
      pincode: input.address.pincode.trim(),
    },
  };
  if (input.geo) invitePayload.geo = input.geo;
  batch.set(inviteRef, invitePayload);

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
 * Revokes the invite row and marks the retailers doc as inactive.
 * Product assignment seats are released separately via removeProductAssignment.
 */
export async function removeNetworkRetailer(
  inviteDocId: string,
  retailerDocId: string,
): Promise<void> {
  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.update(doc(db, COLLECTION, inviteDocId), {
    status: "revoked",
    claimable: false,
    assignedSeat: false,
    onboardingStatus: "removed",
    removedAt: now,
  });

  if (retailerDocId) {
    batch.update(doc(db, "retailers", retailerDocId), {
      active: false,
      onboardingStatus: "removed",
      assignedSeat: false,
      seatReleasedAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();
}

export type UpdateNetworkRetailerPatch = {
  shopName: string;
  ownerName: string;
  phone: string;
  email: string;
  address?: { line1: string; city: string; state: string; pincode: string };
  geo?: GeoPoint | null;
};

/**
 * Update editable fields of a retailer.
 * Only writes to `manufacturerRetailers` (the manufacturer's own collection)
 * to avoid Firestore permission errors on the shared `retailers` collection.
 */
export async function updateNetworkRetailer(
  inviteDocId: string,
  _retailerDocId: string,
  patch: UpdateNetworkRetailerPatch,
): Promise<void> {
  const update: Record<string, unknown> = {
    shopName:      patch.shopName.trim(),
    ownerName:     patch.ownerName.trim(),
    retailerPhone: patch.phone.trim(),
    retailerEmail: patch.email.trim().toLowerCase(),
    updatedAt:     serverTimestamp(),
  };
  if (patch.address) update.address = patch.address;
  if (patch.geo !== undefined) update.geo = patch.geo;
  await updateDoc(doc(db, COLLECTION, inviteDocId), update);
}

export type AssignedProductRow = {
  listingId: string;
  productId: string;
  productName: string;
  category: string;
  unit: string;
  price: number;
  image: string;
  status: "active" | "released" | "expired";
  assignedAt: Date | null;
  expiresAt: Date | null;
};

/** Fetch all products assigned by a manufacturer to a specific retailer (by retailerDocId). */
export async function fetchRetailerAssignedProducts(
  manufacturerId: string,
  retailerDocId: string,
): Promise<AssignedProductRow[]> {
  const q = query(
    collection(db, "retailerSeatListings"),
    where("ownerId",       "==", manufacturerId),
    where("retailerDocId", "==", retailerDocId),
    where("listingType",   "==", "assigned"),
  );
  const snap = await getDocs(q);
  const rows: AssignedProductRow[] = [];
  await Promise.all(snap.docs.map(async (d) => {
    const r    = d.data() as any;
    const status: "active" | "released" | "expired" =
      r.status === "released" ? "released" : r.status === "expired" ? "expired" : "active";
    let productName = "—", category = "—", unit = "—", price = 0, image = "";
    try {
      const pSnap = await getDoc(doc(db, "products", String(r.productId ?? "")));
      if (pSnap.exists()) {
        const p = pSnap.data() as any;
        productName = String(p.name ?? "—");
        category    = String(p.category ?? "—");
        unit        = String(p.unit ?? "—");
        price       = Number(p.price ?? 0);
        image       = String(p.image ?? "");
      }
    } catch { /* skip */ }
    rows.push({
      listingId:   d.id,
      productId:   String(r.productId ?? ""),
      productName, category, unit, price, image,
      status,
      assignedAt:  r.assignedAt?.toDate?.() ?? null,
      expiresAt:   r.expiresAt?.toDate?.()  ?? null,
    });
  }));
  return rows.sort((a, b) => (b.assignedAt?.getTime() ?? 0) - (a.assignedAt?.getTime() ?? 0));
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
