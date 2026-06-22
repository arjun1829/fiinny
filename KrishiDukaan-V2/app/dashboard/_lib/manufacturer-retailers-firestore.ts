import {
  arrayRemove,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
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

// ─── Phone resolution ─────────────────────────────────────────────────────────

/**
 * Resolves a user's normalized E164 phone from uidIndex.
 * Falls back to users/{uid}.phone and manufacturers/{uid}.phone for legacy accounts.
 * Returns null only when the phone cannot be determined from any source.
 */
async function resolvePhone(uid: string): Promise<string | null> {
  // Primary: uidIndex (written at every phone-OTP signup)
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", uid));
    if (idxSnap.exists()) {
      const phone = String(idxSnap.data().phone ?? "").trim();
      if (phone) return phone;
    }
  } catch { /* fall through */ }

  // Fallback 1: users/{uid}.phone (legacy + email-based accounts)
  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      const phone = String(userSnap.data().phone ?? "").trim();
      if (phone) return toE164India(phone);
    }
  } catch { /* fall through */ }

  // Fallback 2: manufacturers/{uid}.phone (legacy manufacturer profile)
  try {
    const mfgSnap = await getDoc(doc(db, "manufacturers", uid));
    if (mfgSnap.exists()) {
      const phone = String(mfgSnap.data().phone ?? "").trim();
      if (phone) return toE164India(phone);
    }
  } catch { /* fall through */ }

  console.warn(`[resolvePhone] Could not resolve phone for uid: ${uid}. Mirror writes will be skipped.`);
  return null;
}

// ─── Subcollection mirror sync ────────────────────────────────────────────────

/**
 * Writes/merges a mirror doc at manufacturers/{mPhone}/retailers/{rPhone}.
 * Awaited directly — failures are logged, not swallowed silently.
 */
export async function syncRetailerMirror(
  manufacturerPhone: string,
  retailerPhone: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await setDoc(
      doc(db, `manufacturers/${manufacturerPhone}/retailers/${retailerPhone}`),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.error(
      `[syncRetailerMirror] FAILED manufacturers/${manufacturerPhone}/retailers/${retailerPhone}:`,
      e,
    );
  }
}

/**
 * Reads manufacturerPhone + retailerPhone from an invite doc by its ID.
 * Used by status-change operations that only receive the invite doc ID.
 */
async function phonesFromInvite(
  inviteDocId: string,
): Promise<{ manufacturerPhone: string | null; retailerPhone: string | null }> {
  try {
    const snap = await getDocFromServer(doc(db, COLLECTION, inviteDocId));
    if (!snap.exists()) return { manufacturerPhone: null, retailerPhone: null };
    const d = snap.data() as Record<string, unknown>;
    return {
      manufacturerPhone: d.manufacturerPhone ? String(d.manufacturerPhone) : null,
      retailerPhone: d.retailerPhone ? String(d.retailerPhone) : null,
    };
  } catch {
    return { manufacturerPhone: null, retailerPhone: null };
  }
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
  // Dual query: legacy manufacturerId (UID) + manufacturerPhone (E164).
  // If the id is already an E164 phone (admin-created users with uid:null), use it
  // directly; otherwise resolve via uidIndex.
  let manufacturerPhone: string | null = manufacturerId.startsWith('+') ? manufacturerId : null;
  if (!manufacturerPhone) {
    try {
      const idxSnap = await getDoc(doc(db, "uidIndex", manufacturerId));
      if (idxSnap.exists()) manufacturerPhone = String(idxSnap.data().phone ?? "") || null;
    } catch { /* ignore */ }
  }

  // Use getDocsFromServer to bypass the SDK's local query cache.
  // After a write (updateNetworkRetailer) the document is updated on the server,
  // but getDocs can still return a cached query result that predates the write.
  // getDocsFromServer forces a fresh network read so edits are always visible.
  const queries = [
    getDocsFromServer(query(collection(db, COLLECTION), where("manufacturerId", "==", manufacturerId))),
  ];
  // Always add the manufacturerPhone query when a phone is known — even when
  // phone == manufacturerId (admin view with phone-as-uid) — because the two
  // queries target different fields and deduplication handles overlaps.
  if (manufacturerPhone) {
    queries.push(getDocsFromServer(query(collection(db, COLLECTION), where("manufacturerPhone", "==", manufacturerPhone))));
  }

  const snaps = await Promise.all(queries);
  const seen = new Set<string>();
  const rows: ManufacturerRetailerRow[] = [];
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        const docData = mapDoc(d.id, d.data() as Record<string, unknown>);
        // Fully removed retailers must not appear anywhere in the dashboard.
        if (docData.status === "revoked" || docData.onboardingStatus === "removed") return;
        rows.push({ ...docData, addedAtLabel: timestampLabel(docData.addedAt) });
      }
    });
  });

  // For rows missing address/geo or names, supplement from the retailer's own profile doc.
  // `manufacturerRetailers` is the source of truth for names — the retailer's profile
  // is only consulted as a fallback when the invite doc has no value (e.g. linked accounts).
  // Manufacturer can't write to `retailers/` directly (Firestore rules), so we never override
  // a name that already exists in `manufacturerRetailers` with one from `retailers/`.
  const needsSupplement = rows.filter(
    (r) => r.retailerDocId && (!r.address?.line1 || !r.address?.city || !r.shopName || !r.ownerName),
  );
  if (needsSupplement.length > 0) {
    await Promise.all(
      needsSupplement.map(async (row) => {
        try {
          const rSnap = await getDoc(doc(db, "retailers", row.retailerDocId));
          if (!rSnap.exists()) return;
          const rd = rSnap.data() as Record<string, unknown>;
          // Only fill names when the invite doc has none — manufacturerRetailers wins
          if (!row.shopName && rd.shopName) row.shopName = String(rd.shopName);
          if (!row.ownerName && rd.ownerName) row.ownerName = String(rd.ownerName);
          // Fill address/geo when missing
          const rawAddr = rd.address as Record<string, unknown> | null | undefined;
          const rawGeo  = rd.geo as { latitude?: number; longitude?: number } | null | undefined;
          if (!row.address?.city && (rawAddr?.city || rawAddr?.line1)) {
            row.address = {
              line1:   String(rawAddr.line1   ?? ""),
              city:    String(rawAddr.city    ?? ""),
              state:   String(rawAddr.state   ?? ""),
              pincode: String(rawAddr.pincode ?? ""),
            };
          }
          if (!row.geo && rawGeo && typeof rawGeo.latitude === "number" && typeof rawGeo.longitude === "number") {
            row.geo = { latitude: rawGeo.latitude, longitude: rawGeo.longitude };
          }
        } catch { /* ignore */ }
      }),
    );
  }

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
  email?: string;
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
  const manufacturerPhone = await resolvePhone(input.manufacturerId);

  // Pre-create retailer entity keyed by normalized phone (idempotent)
  const retailerRef = doc(db, "retailers", normalizedPhone);
  const retailerPayload: Record<string, unknown> = {
    role: "retailer",
    phone: normalizedPhone,
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    email: input.email?.trim().toLowerCase() ?? "",
    address: {
      line1: input.address.line1.trim(),
      city: input.address.city.trim(),
      state: input.address.state.trim(),
      pincode: input.address.pincode.trim(),
    },
    manufacturerId: input.manufacturerId,
    manufacturerPhone: manufacturerPhone ?? null,
    onboardingType: "manufacturer-network",
    assignedSeat: false,
    seatAssignedAt: null,
    onboardingStatus: "pending",
    createdBy: input.manufacturerId,
    active: false,
    subscriptionStatus: "free",
    createdAt: now,
    updatedAt: now,
  };
  if (input.geo) retailerPayload.geo = input.geo;
  batch.set(retailerRef, retailerPayload, { merge: true });

  // Invite row — retailerDocId is now the normalized phone (stable, deterministic)
  const inviteRef = doc(collection(db, COLLECTION));
  const invitePayload: Record<string, unknown> = {
    id: inviteRef.id,
    manufacturerId: input.manufacturerId,
    manufacturerPhone: manufacturerPhone ?? null,
    retailerDocId: normalizedPhone,
    retailerId: "",
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    retailerEmail: input.email?.trim().toLowerCase() ?? "",
    retailerPhone: normalizedPhone,
    inviteCode,
    status: "invited",
    claimable: true,
    onboardingStatus: "pending",
    assignedSeat: false,
    seatAssignedAt: null,
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

  // Subcollection mirror — include address + geo so the Company Page fast-path
  // (mirrorGeo && mirrorAddr.city) fires without needing a secondary retailers/ read.
  if (manufacturerPhone) {
    const mirrorPayload: Record<string, unknown> = {
      retailerDocId: normalizedPhone,
      retailerPhone: normalizedPhone,
      manufacturerPhone,
      shopName: input.shopName.trim(),
      ownerName: input.ownerName.trim(),
      inviteCode,
      status: "invited",
      onboardingStatus: "pending",
      addedAt: serverTimestamp(),
      address: {
        line1:   input.address.line1.trim(),
        city:    input.address.city.trim(),
        state:   input.address.state.trim(),
        pincode: input.address.pincode.trim(),
      },
    };
    if (input.geo) mirrorPayload.geo = input.geo;
    await syncRetailerMirror(manufacturerPhone, normalizedPhone, mirrorPayload);
  } else {
    console.error(
      "[createNetworkRetailer] Cannot write subcollection mirror: manufacturer has no resolvable phone. uid:",
      input.manufacturerId,
    );
  }

  return { retailerDocId: normalizedPhone, inviteCode };
}

/**
 * Fully removes a retailer from the manufacturer's network.
 * Atomically:
 *   1. Revokes the invite link doc.
 *   2. Releases all active assigned seat listings → frees seats immediately.
 *   3. Deactivates the retailer's product copies so they vanish from the marketplace.
 * Then, fire-and-forget:
 *   4. Strips the retailer's store entry from every affected manufacturer product's
 *      availability array — cleaning up market visibility completely.
 *
 * The global `retailers` / `users` docs are NOT modified so the retailer account
 * remains intact and can join another network or be re-invited.
 */
export async function removeNetworkRetailer(
  inviteDocId: string,
  retailerDocId: string,
  manufacturerId: string,
): Promise<void> {
  const now = serverTimestamp();

  // 1. Fetch all active assigned seat listings for this retailer
  const listingsSnap = await getDocs(
    query(
      collection(db, "retailerSeatListings"),
      where("ownerId",      "==", manufacturerId),
      where("retailerDocId","==", retailerDocId),
      where("listingType",  "==", "assigned"),
      where("status",       "==", "active"),
    ),
  );

  const batch = writeBatch(db);

  // 2. Revoke the invite link
  batch.update(doc(db, COLLECTION, inviteDocId), {
    status: "revoked",
    claimable: false,
    assignedSeat: false,
    onboardingStatus: "removed",
    removedAt: now,
  });

  // Mark the global retailers/ doc as removed so fetchStores() excludes this store
  if (retailerDocId) {
    batch.update(doc(db, "retailers", retailerDocId), {
      active: false,
      assignedSeat: false,
      onboardingStatus: "removed",
      updatedAt: now,
    });
  }

  // 3. Release seat listings + deactivate product copies
  const mfrProductIds: string[] = [];
  listingsSnap.docs.forEach((listingDoc) => {
    batch.update(listingDoc.ref, { status: "released", releasedAt: now });
    const productId    = String(listingDoc.data().productId           ?? "");
    const mfrProductId = String(listingDoc.data().manufacturerProductId ?? "");
    if (productId)    batch.update(doc(db, "products", productId), { isActive: false, updatedAt: now });
    if (mfrProductId) mfrProductIds.push(mfrProductId);
  });

  await batch.commit();

  // 4. Strip availability entries fire-and-forget — reads are needed so can't batch
  if (mfrProductIds.length > 0) {
    (async () => {
      for (const mfrProductId of mfrProductIds) {
        try {
          const snap = await getDoc(doc(db, "products", mfrProductId));
          if (!snap.exists()) continue;
          const avArr = (snap.data() as Record<string, unknown>).availability;
          if (!Array.isArray(avArr)) continue;
          // Match by storeId (UID) OR storePhone (E164) — retailerDocId is the normalized phone
          const entry = avArr.find((e: Record<string, unknown>) =>
            e.storeId === retailerDocId || e.storePhone === retailerDocId,
          );
          if (entry) await updateDoc(doc(db, "products", mfrProductId), { availability: arrayRemove(entry) });
        } catch { /* non-critical */ }
      }
    })();
  }

  // 5. Sync mirror
  const { manufacturerPhone, retailerPhone } = await phonesFromInvite(inviteDocId);
  if (manufacturerPhone && retailerPhone) {
    await syncRetailerMirror(manufacturerPhone, retailerPhone, {
      status: "revoked",
      onboardingStatus: "removed",
      assignedSeat: false,
    });
  }
}

/**
 * Manually deactivates a retailer WITHOUT permanently revoking them (reversible).
 *
 * Atomically:
 *   1. Marks the `manufacturerRetailers` link as onboardingStatus: "inactive".
 *   2. Releases all active assigned seat listings → frees seats immediately.
 *   3. Deactivates retailer product copies (isActive → false).
 * Then fire-and-forget:
 *   4. Strips the retailer's entry from every affected manufacturer product's
 *      availability[] so they disappear from store search and the product detail page.
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

  // Mark the global retailers/ doc as inactive so fetchStores() excludes this store
  if (retailerDocId) {
    batch.update(doc(db, "retailers", retailerDocId), {
      active: false,
      assignedSeat: false,
      updatedAt: now,
    });
  }

  const mfrProductIds: string[] = [];
  listingsSnap.docs.forEach((listingDoc) => {
    batch.update(listingDoc.ref, { status: "released", releasedAt: now });
    const productId    = String(listingDoc.data().productId           ?? "");
    const mfrProductId = String(listingDoc.data().manufacturerProductId ?? "");
    if (productId)    batch.update(doc(db, "products", productId), { isActive: false, updatedAt: now });
    if (mfrProductId) mfrProductIds.push(mfrProductId);
  });

  await batch.commit();

  // 4. Strip availability entries from manufacturer products — fire-and-forget
  if (mfrProductIds.length > 0) {
    (async () => {
      for (const mfrProductId of mfrProductIds) {
        try {
          const snap = await getDoc(doc(db, "products", mfrProductId));
          if (!snap.exists()) continue;
          const avArr = (snap.data() as Record<string, unknown>).availability;
          if (!Array.isArray(avArr)) continue;
          // Match by storeId (UID) OR storePhone (E164) — both are stored as retailerDocId
          const entry = avArr.find((e: Record<string, unknown>) =>
            e.storeId === retailerDocId || e.storePhone === retailerDocId,
          );
          if (entry) await updateDoc(doc(db, "products", mfrProductId), { availability: arrayRemove(entry) });
        } catch { /* non-critical */ }
      }
    })();
  }

  // 5. Sync mirror
  const { manufacturerPhone: mPhone, retailerPhone: rPhone } = await phonesFromInvite(inviteDocId);
  if (mPhone && rPhone) {
    await syncRetailerMirror(mPhone, rPhone, {
      onboardingStatus: "inactive",
      assignedSeat: false,
      manuallyDeactivated: true,
    });
  }
}

/**
 * Resets a manually-deactivated retailer back to active onboarding status.
 *
 * NOTE: This does NOT reassign a seat — the seat was released on deactivation and
 * must be re-consumed when the manufacturer assigns a product to this retailer again.
 * assignedSeat stays false until activateRetailerOnProductAssignment is called.
 */
export async function reactivateNetworkRetailer(inviteDocId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, inviteDocId), {
    onboardingStatus: "active",
    manuallyDeactivated: false,
    reactivatedAt: serverTimestamp(),
    // assignedSeat is intentionally NOT set here — the seat is only (re-)consumed
    // when the manufacturer assigns at least one product via the assign-product flow.
  });

  // Sync mirror
  const { manufacturerPhone, retailerPhone } = await phonesFromInvite(inviteDocId);
  if (manufacturerPhone && retailerPhone) {
    await syncRetailerMirror(manufacturerPhone, retailerPhone, {
      onboardingStatus: "active",
      manuallyDeactivated: false,
    });
  }
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
  retailerDocId: string,
  patch: UpdateNetworkRetailerPatch,
): Promise<void> {
  const now = serverTimestamp();

  // 1. Update the manufacturer-specific invite/listing doc
  const inviteUpdate: Record<string, unknown> = {
    shopName:      patch.shopName.trim(),
    ownerName:     patch.ownerName.trim(),
    retailerPhone: toE164India(patch.phone),
    retailerEmail: patch.email.trim().toLowerCase(),
    updatedAt:     now,
  };
  if (patch.address) inviteUpdate.address = patch.address;
  if (patch.geo !== undefined) inviteUpdate.geo = patch.geo;
  await updateDoc(doc(db, COLLECTION, inviteDocId), inviteUpdate);

  // 2. Update the GLOBAL retailer document — the source of truth for name, address,
  //    and all public-facing retailer information across the entire app.
  //    Phone is excluded: it is the document key and cannot change.
  if (retailerDocId) {
    const globalUpdate: Record<string, unknown> = {
      shopName:  patch.shopName.trim(),
      ownerName: patch.ownerName.trim(),
      email:     patch.email.trim().toLowerCase(),
      updatedAt: now,
    };
    if (patch.address) {
      globalUpdate.address = patch.address;
      globalUpdate.city    = patch.address.city.trim();
      globalUpdate.state   = patch.address.state.trim();
    }
    if (patch.geo !== undefined) globalUpdate.geo = patch.geo;
    await setDoc(doc(db, "retailers", retailerDocId), globalUpdate, { merge: true });
  }

  // 3. Sync the manufacturer subcollection mirror
  const { manufacturerPhone, retailerPhone } = await phonesFromInvite(inviteDocId);
  if (manufacturerPhone && retailerPhone) {
    const mirrorUpdate: Record<string, unknown> = {
      shopName:      patch.shopName.trim(),
      ownerName:     patch.ownerName.trim(),
      retailerPhone: toE164India(patch.phone),
    };
    if (patch.address) mirrorUpdate.address = patch.address;
    if (patch.geo !== undefined) mirrorUpdate.geo = patch.geo;
    await syncRetailerMirror(manufacturerPhone, retailerPhone, mirrorUpdate);
  }
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
}): Promise<{ inviteDocId: string; retailerDocId: string }> {
  if (!input.manufacturerId) {
    console.error("Missing manufacturerId for linking");
    throw new Error("Your session ID is missing. Please refresh and try again.");
  }
  if (!input.retailerUid) {
    console.error("Missing retailerUid for linking", input);
    throw new Error("The selected retailer's unique ID is missing. Please contact support.");
  }

  // Resolve retailer's normalized phone — used as both retailerDocId and retailers/ doc key
  let retailerPhone = toE164India(input.phone);
  if (!retailerPhone || retailerPhone === input.phone) {
    // Phone may not be normalized yet; try uidIndex as the authoritative source
    try {
      const rIdxSnap = await getDoc(doc(db, "uidIndex", input.retailerUid));
      if (rIdxSnap.exists()) retailerPhone = String(rIdxSnap.data().phone ?? "") || retailerPhone;
    } catch { /* ignore */ }
  }
  if (!retailerPhone) throw new Error("Could not resolve retailer phone. Please provide a valid phone number.");

  const retailerDocId = retailerPhone; // phone IS the stable document identifier

  // Check for existing relationship by phone (deterministic, not UID)
  const q = query(
    collection(db, COLLECTION),
    where("manufacturerId", "==", input.manufacturerId),
    where("retailerPhone", "==", retailerPhone),
    where("status", "in", ["active", "invited"])
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    throw new Error("This retailer is already in your network.");
  }

  // Fetch the retailer's existing profile to copy address/geo
  let retailerAddress: Record<string, unknown> | null = null;
  let retailerGeo: { latitude: number; longitude: number } | null = null;
  try {
    const rSnap = await getDoc(doc(db, "retailers", input.retailerUid));
    if (rSnap.exists()) {
      const rd = rSnap.data() as Record<string, unknown>;
      const rawAddr = rd.address as Record<string, unknown> | null | undefined;
      const rawGeo  = rd.geo as { latitude?: number; longitude?: number } | null | undefined;
      if (rawAddr) retailerAddress = rawAddr;
      if (rawGeo && typeof rawGeo.latitude === "number" && typeof rawGeo.longitude === "number") {
        retailerGeo = { latitude: rawGeo.latitude, longitude: rawGeo.longitude };
      }
    }
  } catch { /* ignore */ }

  const inviteCode = await generateUniqueInviteCode();
  const now = serverTimestamp();
  const ref = doc(collection(db, COLLECTION));
  const linkPayload: Record<string, unknown> = {
    id: ref.id,
    manufacturerId: input.manufacturerId,
    retailerDocId,
    retailerId: input.retailerUid,
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    retailerEmail: input.email?.trim().toLowerCase() ?? "",
    retailerPhone,
    inviteCode,
    status: "active",
    claimable: false,
    onboardingStatus: "active",
    assignedSeat: false,
    createdBy: input.manufacturerId,
    addedAt: now,
  };
  if (retailerAddress) linkPayload.address = retailerAddress;
  if (retailerGeo) linkPayload.geo = retailerGeo;
  await setDoc(ref, linkPayload);

  // Resolve manufacturer phone for subcollection mirror
  const mfrPhone = await resolvePhone(input.manufacturerId);

  // manufacturers/{mPhone}/retailers/{rPhone} mirror
  if (mfrPhone) {
    await syncRetailerMirror(mfrPhone, retailerPhone, {
      retailerDocId,
      retailerPhone,
      manufacturerPhone: mfrPhone,
      retailerId: input.retailerUid,
      shopName: input.shopName.trim(),
      ownerName: input.ownerName.trim(),
      status: "active",
      onboardingStatus: "active",
      addedAt: serverTimestamp(),
    });
  } else {
    console.error(
      "[linkExistingRetailerToNetwork] Cannot write subcollection mirror: manufacturer has no resolvable phone. uid:",
      input.manufacturerId,
    );
  }

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

  return { inviteDocId: ref.id, retailerDocId };
}

/**
 * Called after a product is successfully assigned to a retailer.
 * Flips onboardingStatus → "active" and sets assignedSeat: true on the
 * manufacturerRetailers link doc (and its mirror) if it was "pending".
 * No-ops if already active or doc not found. Always resolves (never throws).
 */
export async function activateRetailerOnProductAssignment(
  manufacturerId: string,
  retailerDocId: string,
  manufacturerPhone: string | null,
  retailerPhone: string | null,
): Promise<void> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where("manufacturerId", "==", manufacturerId),
      where("retailerDocId", "==", retailerDocId),
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const now = serverTimestamp();
    await Promise.all(
      snap.docs
        .filter((d) => {
          const s = d.data().status;
          return s !== "revoked";
        })
        .map((d) =>
          updateDoc(d.ref, {
            assignedSeat: true,
            seatAssignedAt: now,
            updatedAt: now,
          }),
        ),
    );

    if (manufacturerPhone && retailerPhone) {
      await syncRetailerMirror(manufacturerPhone, retailerPhone, {
        assignedSeat: true,
        seatAssignedAt: now,
      });
    }

    // Update the global retailers/ doc so fetchStores() shows this store.
    // retailerPhone is the normalized E164 phone which is the retailers/ doc ID.
    if (retailerPhone) {
      try {
        await updateDoc(doc(db, "retailers", retailerPhone), {
          active: true,
          assignedSeat: true,
          seatAssignedAt: now,
          updatedAt: now,
        });
      } catch { /* non-critical — doc may not exist yet for pending retailers */ }
    }
  } catch (e) {
    console.warn("[activateRetailerOnProductAssignment] Failed (non-critical):", e);
  }
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

// ─── Bulk Operations ───────────────────────────────────────────────────────────

const BULK_BATCH_SIZE = 400; // well below Firestore's 500-write limit

/**
 * Atomically deactivates multiple retailers in the manufacturer's network.
 * For each retailer: marks the invite link as inactive, releases active seat
 * listings, deactivates product copies, and strips availability entries.
 * Mirrors are synced fire-and-forget.
 */
export async function bulkDeactivateNetworkRetailers(
  items: { inviteDocId: string; retailerDocId: string }[],
  manufacturerId: string,
): Promise<void> {
  if (items.length === 0) return;
  const now = serverTimestamp();

  // Fetch active seat listings for all retailers in parallel
  const listingsPerRetailer = await Promise.all(
    items.map(({ retailerDocId }) =>
      getDocs(
        query(
          collection(db, "retailerSeatListings"),
          where("ownerId",      "==", manufacturerId),
          where("retailerDocId","==", retailerDocId),
          where("listingType",  "==", "assigned"),
          where("status",       "==", "active"),
        ),
      ),
    ),
  );

  // Collect all write operations + track mfrProductIds per retailer for availability cleanup
  type Op = { ref: ReturnType<typeof doc>; data: Record<string, unknown> };
  const ops: Op[] = [];
  const availabilityCleanup: { retailerDocId: string; mfrProductIds: string[] }[] = [];

  items.forEach(({ inviteDocId, retailerDocId }, i) => {
    ops.push({
      ref: doc(db, COLLECTION, inviteDocId),
      data: { onboardingStatus: "inactive", assignedSeat: false, manuallyDeactivated: true, deactivatedAt: now },
    });
    // Sync global retailers/ doc so fetchStores() excludes this store immediately
    if (retailerDocId) {
      ops.push({
        ref: doc(db, "retailers", retailerDocId),
        data: { active: false, assignedSeat: false, updatedAt: now },
      });
    }
    const mfrProductIds: string[] = [];
    listingsPerRetailer[i].docs.forEach((listingDoc) => {
      ops.push({ ref: listingDoc.ref, data: { status: "released", releasedAt: now } });
      const productId    = String(listingDoc.data().productId           ?? "");
      const mfrProductId = String(listingDoc.data().manufacturerProductId ?? "");
      if (productId)    ops.push({ ref: doc(db, "products", productId), data: { isActive: false, updatedAt: now } });
      if (mfrProductId) mfrProductIds.push(mfrProductId);
    });
    availabilityCleanup.push({ retailerDocId, mfrProductIds });
  });

  // Execute in batches
  for (let i = 0; i < ops.length; i += BULK_BATCH_SIZE) {
    const batch = writeBatch(db);
    ops.slice(i, i + BULK_BATCH_SIZE).forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }

  // Strip availability entries + sync mirrors — fire-and-forget
  (async () => {
    for (const { retailerDocId, mfrProductIds } of availabilityCleanup) {
      for (const mfrProductId of mfrProductIds) {
        try {
          const snap = await getDoc(doc(db, "products", mfrProductId));
          if (!snap.exists()) continue;
          const avArr = (snap.data() as Record<string, unknown>).availability;
          if (!Array.isArray(avArr)) continue;
          const entry = avArr.find((e: Record<string, unknown>) =>
            e.storeId === retailerDocId || e.storePhone === retailerDocId,
          );
          if (entry) await updateDoc(doc(db, "products", mfrProductId), { availability: arrayRemove(entry) });
        } catch { /* non-critical */ }
      }
    }
  })();

  items.forEach(async ({ inviteDocId }) => {
    try {
      const { manufacturerPhone, retailerPhone } = await phonesFromInvite(inviteDocId);
      if (manufacturerPhone && retailerPhone) {
        await syncRetailerMirror(manufacturerPhone, retailerPhone, {
          onboardingStatus: "inactive",
          assignedSeat: false,
          manuallyDeactivated: true,
        });
      }
    } catch { /* non-critical */ }
  });
}

/**
 * Fully removes multiple retailers from the manufacturer's network in bulk.
 * Applies the same cleanup as removeNetworkRetailer for every selected retailer:
 * revokes invite links, releases seat listings, deactivates product copies,
 * and strips availability array entries fire-and-forget.
 */
export async function bulkRemoveNetworkRetailers(
  items: { inviteDocId: string; retailerDocId: string }[],
  manufacturerId: string,
): Promise<void> {
  if (items.length === 0) return;
  const now = serverTimestamp();

  // 1. Fetch active seat listings for all retailers in parallel
  const listingsPerRetailer = await Promise.all(
    items.map(({ retailerDocId }) =>
      getDocs(
        query(
          collection(db, "retailerSeatListings"),
          where("ownerId",      "==", manufacturerId),
          where("retailerDocId","==", retailerDocId),
          where("listingType",  "==", "assigned"),
          where("status",       "==", "active"),
        ),
      ),
    ),
  );

  // 2. Collect all write ops
  type Op = { ref: ReturnType<typeof doc>; data: Record<string, unknown> };
  const ops: Op[] = [];
  const mfrProductIdsByRetailer: { retailerDocId: string; mfrProductIds: string[] }[] = [];

  items.forEach(({ inviteDocId, retailerDocId }, i) => {
    ops.push({
      ref: doc(db, COLLECTION, inviteDocId),
      data: { status: "revoked", claimable: false, assignedSeat: false, onboardingStatus: "removed", removedAt: now },
    });
    // Sync global retailers/ doc so fetchStores() excludes this store immediately
    if (retailerDocId) {
      ops.push({
        ref: doc(db, "retailers", retailerDocId),
        data: { active: false, assignedSeat: false, onboardingStatus: "removed", updatedAt: now },
      });
    }
    const mfrProductIds: string[] = [];
    listingsPerRetailer[i].docs.forEach((listingDoc) => {
      ops.push({ ref: listingDoc.ref, data: { status: "released", releasedAt: now } });
      const productId    = String(listingDoc.data().productId           ?? "");
      const mfrProductId = String(listingDoc.data().manufacturerProductId ?? "");
      if (productId)    ops.push({ ref: doc(db, "products", productId), data: { isActive: false, updatedAt: now } });
      if (mfrProductId) mfrProductIds.push(mfrProductId);
    });
    mfrProductIdsByRetailer.push({ retailerDocId, mfrProductIds });
  });

  // 3. Commit in batches
  for (let i = 0; i < ops.length; i += BULK_BATCH_SIZE) {
    const batch = writeBatch(db);
    ops.slice(i, i + BULK_BATCH_SIZE).forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }

  // 4. Strip availability arrays + sync mirrors, fire-and-forget
  (async () => {
    for (const { retailerDocId, mfrProductIds } of mfrProductIdsByRetailer) {
      for (const mfrProductId of mfrProductIds) {
        try {
          const snap = await getDoc(doc(db, "products", mfrProductId));
          if (!snap.exists()) continue;
          const avArr = (snap.data() as Record<string, unknown>).availability;
          if (!Array.isArray(avArr)) continue;
          // Match by storeId (UID) OR storePhone (E164) — retailerDocId is the normalized phone
          const entry = avArr.find((e: Record<string, unknown>) =>
            e.storeId === retailerDocId || e.storePhone === retailerDocId,
          );
          if (entry) await updateDoc(doc(db, "products", mfrProductId), { availability: arrayRemove(entry) });
        } catch { /* non-critical */ }
      }
    }
  })();

  items.forEach(async ({ inviteDocId }) => {
    try {
      const { manufacturerPhone, retailerPhone } = await phonesFromInvite(inviteDocId);
      if (manufacturerPhone && retailerPhone) {
        await syncRetailerMirror(manufacturerPhone, retailerPhone, {
          status: "revoked",
          onboardingStatus: "removed",
          assignedSeat: false,
        });
      }
    } catch { /* non-critical */ }
  });
}
