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
  if (value === "inactive") return "inactive";
  return "pending";
}

function mapDoc(id: string, data: Record<string, unknown>): ManufacturerRetailerDoc {
  const rawAddr = data.address as Record<string, unknown> | null | undefined;
  const rawGeo  = data.geo as { latitude?: number; longitude?: number } | null | undefined;
  return {
    id,
    manufacturerId: String(data.manufacturerId ?? ""),
    manufacturerPhone: data.manufacturerPhone ? String(data.manufacturerPhone) : undefined,
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
    manuallyDeactivated: data.manuallyDeactivated === true,
    retailerCode: data.retailerCode ? String(data.retailerCode) : undefined,
  };
}

// ─── Phone normalization ──────────────────────────────────────────────────────

function toE164India(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return phone.trim();
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
  // Dual query: legacy manufacturerId (UID) + manufacturerPhone (E164)
  let manufacturerPhone: string | null = null;
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", manufacturerId));
    if (idxSnap.exists()) manufacturerPhone = String(idxSnap.data().phone ?? "") || null;
  } catch { /* ignore */ }

  const queries = [
    getDocs(query(collection(db, COLLECTION), where("manufacturerId", "==", manufacturerId))),
  ];
  if (manufacturerPhone && manufacturerPhone !== manufacturerId) {
    queries.push(getDocs(query(collection(db, COLLECTION), where("manufacturerPhone", "==", manufacturerPhone))));
  }

  const snaps = await Promise.all(queries);
  const seen = new Set<string>();
  const rows: ManufacturerRetailerRow[] = [];
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        const docData = mapDoc(d.id, d.data() as Record<string, unknown>);
        rows.push({ ...docData, addedAtLabel: timestampLabel(docData.addedAt) });
      }
    });
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

  const normalizedPhone = toE164India(input.phone);

  // Resolve manufacturer's phone for dual-field writes and subcollection mirror
  let manufacturerPhone: string | null = null;
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", input.manufacturerId));
    if (idxSnap.exists()) manufacturerPhone = String(idxSnap.data().phone ?? "") || null;
  } catch { /* ignore */ }

  // Pre-create retailer entity (no auth UID yet)
  const retailerRef = doc(collection(db, "retailers"));
  const retailerPayload: Record<string, unknown> = {
    role: "retailer",
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    phone: normalizedPhone,
    email: input.email.trim().toLowerCase(),
    address: {
      line1: input.address.line1.trim(),
      city: input.address.city.trim(),
      state: input.address.state.trim(),
      pincode: input.address.pincode.trim(),
    },
    manufacturerId: input.manufacturerId,
    manufacturerPhone: manufacturerPhone ?? null,
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
    manufacturerPhone: manufacturerPhone ?? null,
    retailerDocId: retailerRef.id,
    retailerId: "",
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    retailerEmail: input.email.trim().toLowerCase(),
    retailerPhone: normalizedPhone,
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

  // Phase 4A: Subcollection mirror — fire-and-forget (non-critical)
  // manufacturers/{manufacturerPhone}/retailers/{normalizedPhone}
  if (manufacturerPhone) {
    setDoc(
      doc(db, `manufacturers/${manufacturerPhone}/retailers/${normalizedPhone}`),
      {
        retailerDocId: retailerRef.id,
        retailerPhone: normalizedPhone,
        shopName: input.shopName.trim(),
        ownerName: input.ownerName.trim(),
        inviteCode,
        status: "invited",
        onboardingStatus: "active",
        addedAt: serverTimestamp(),
      },
    ).catch((e) => console.warn("[createNetworkRetailer] Subcollection mirror failed:", e));
  }

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
  const now = serverTimestamp();

  // ONLY update the link document.
  // We do NOT modify the global "retailers" or "users" document so the retailer 
  // remains intact and can be invited again or interact with other manufacturers.
  await updateDoc(doc(db, COLLECTION, inviteDocId), {
    status: "revoked",
    claimable: false,
    assignedSeat: false,
    onboardingStatus: "removed",
    removedAt: now,
  });
}

/**
 * Manually deactivates a retailer WITHOUT permanently revoking them (reversible).
 *
 * Atomically:
 *   1. Releases all active assigned seat listings for this retailer.
 *   2. Deactivates the corresponding retailer product copies (isActive → false).
 *   3. Marks the `manufacturerRetailers` link as onboardingStatus: "inactive".
 *
 * The retailers doc is NOT modified — manufacturer lacks write permission on it.
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

  batch.update(doc(db, COLLECTION, inviteDocId), {
    onboardingStatus: "inactive",
    assignedSeat: false,
    manuallyDeactivated: true,
    deactivatedAt: now,
  });

  listingsSnap.docs.forEach((listingDoc) => {
    batch.update(listingDoc.ref, { status: "released", releasedAt: now });
    const productId = String(listingDoc.data().productId ?? "");
    if (productId) {
      batch.update(doc(db, "products", productId), { isActive: false, updatedAt: now });
    }
  });

  await batch.commit();
}

/**
 * Resets a manually-deactivated retailer back to active onboarding status.
 * Called automatically after the manufacturer assigns at least one product to re-activate.
 */
export async function reactivateNetworkRetailer(inviteDocId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, inviteDocId), {
    onboardingStatus: "active",
    assignedSeat: true,
    manuallyDeactivated: false,
    reactivatedAt: serverTimestamp(),
  });
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
    retailerPhone: toE164India(patch.phone),
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

/**
 * Links an already-registered retailer (Firebase Auth user) to this manufacturer's network.
 * No invite code needed — the retailer already has an account.
 * Creates a `manufacturerRetailers` doc with status='active' and retailerId pre-filled.
 */
export async function linkExistingRetailerToNetwork(input: {
  manufacturerId: string;
  manufacturerName: string;
  retailerUid: string;
  shopName: string;
  ownerName: string;
  email: string;
  phone: string;
}): Promise<{ inviteDocId: string }> {
  if (!input.manufacturerId) {
    console.error("Missing manufacturerId for linking");
    throw new Error("Your session ID is missing. Please refresh and try again.");
  }
  if (!input.retailerUid) {
    console.error("Missing retailerUid for linking", input);
    throw new Error("The selected retailer's unique ID is missing. Please contact support.");
  }

  // Check for existing relationship
  const q = query(
    collection(db, COLLECTION),
    where("manufacturerId", "==", input.manufacturerId),
    where("retailerDocId", "==", input.retailerUid),
    where("status", "in", ["active", "invited"])
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    throw new Error("This retailer is already in your network.");
  }

  const inviteCode = await generateUniqueInviteCode();
  const now = serverTimestamp();
  const ref = doc(collection(db, COLLECTION));
  await setDoc(ref, {
    id: ref.id,
    manufacturerId: input.manufacturerId,
    retailerDocId: input.retailerUid,
    retailerId: input.retailerUid,
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    retailerEmail: input.email.trim().toLowerCase(),
    retailerPhone: toE164India(input.phone),
    inviteCode,
    status: "active",
    claimable: false,
    onboardingStatus: "active",
    assignedSeat: false,
    createdBy: input.manufacturerId,
    addedAt: now,
  });

  // Trigger notification email (fire-and-forget)
  // input.email may be stale/placeholder; fetch fresh from users doc
  (async () => {
    let emailToNotify = input.email.trim().toLowerCase();
    if (!emailToNotify || emailToNotify.includes("@krishidukan.local")) {
      try {
        const idxSnap = await getDoc(doc(db, "uidIndex", input.retailerUid));
        const phone = idxSnap.exists() ? (idxSnap.data().phone as string) : null;
        const snap = phone
          ? await getDoc(doc(db, "users", phone))
          : await getDoc(doc(db, "users", input.retailerUid));
        if (snap.exists()) {
          const fresh = (snap.data()?.email ?? "").trim().toLowerCase();
          if (fresh && !fresh.includes("@krishidukan.local")) emailToNotify = fresh;
        }
      } catch { /* ignore */ }
    }
    if (!emailToNotify) return;
    fetch("/api/email/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        retailerEmail: emailToNotify,
        shopName: input.shopName.trim(),
        inviteCode: "",
        manufacturerName: input.manufacturerName,
      }),
    }).catch(() => {});
  })();

  return { inviteDocId: ref.id };
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
