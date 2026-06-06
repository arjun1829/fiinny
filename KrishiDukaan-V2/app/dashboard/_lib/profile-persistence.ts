import { doc, GeoPoint, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { generateSlug } from "./brand-page-types";

export type DashboardProfileRole = "retailer" | "manufacturer";

export type ProfileFormValues = {
  businessName: string;
  ownerName: string;
  phone: string;
  secondaryPhone: string;
  email: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  website: string;
  logoUrl: string;
  bannerUrl: string;
  gstin: string;
};

export type RetailerProfileExtras = {
  createdAt: unknown;
  onboardingType: string | null;
  manufacturerId: string | null;
  active: boolean;
  subscriptionStatus: string;
};

export type LoadedProfileState = {
  form: ProfileFormValues;
  geo: GeoPoint | null;
  retailerExtras: RetailerProfileExtras | null;
  manufacturerCreatedAt: unknown | null;
};

/** Validates the Indian 15-character GSTIN format. */
export function isValidGstinFormat(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    gstin.trim().toUpperCase(),
  );
}

// Resolve Firebase Auth UID → normalized phone via uidIndex.
// Returns null if the index entry doesn't exist yet.
async function phoneFromUid(uid: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, "uidIndex", uid));
    if (!snap.exists()) return null;
    return String(snap.data().phone ?? "") || null;
  } catch {
    return null;
  }
}

async function retailerDocIdFromUid(uid: string): Promise<string | null> {
  const phone = await phoneFromUid(uid);
  const targets = phone ? [doc(db, "users", phone), doc(db, "users", uid)] : [doc(db, "users", uid)];

  for (const target of targets) {
    try {
      const snap = await getDoc(target);
      if (!snap.exists()) continue;
      const retailerDocId = String(snap.data()?.retailerDocId ?? "").trim();
      if (retailerDocId) return retailerDocId;
    } catch {
      // ignore and try the next target
    }
  }

  return null;
}

export async function fetchDashboardUserRole(uid: string): Promise<DashboardProfileRole | null> {
  // New schema: users/{phone}
  const phone = await phoneFromUid(uid);
  if (phone) {
    try {
      const snap = await getDoc(doc(db, "users", phone));
      if (snap.exists()) {
        const role = String(snap.data()?.role ?? "");
        if (role === "manufacturer" || role === "retailer") return role as DashboardProfileRole;
      }
    } catch { /* fall through */ }
  }
  return null;
}

function parseGeo(data: Record<string, unknown>): GeoPoint | null {
  const g = data.geo;
  if (g instanceof GeoPoint) return g;
  const loc = data.location as { latitude?: number; longitude?: number } | undefined;
  if (loc && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
    return new GeoPoint(loc.latitude, loc.longitude);
  }
  return null;
}

function addressFromDoc(data: Record<string, unknown>) {
  const a = data.address as Record<string, unknown> | undefined;
  return {
    line1: String(a?.line1 ?? ""),
    city:  String(a?.city  ?? ""),
    state: String(a?.state ?? ""),
    pincode: String(a?.pincode ?? ""),
  };
}

/** Resolves the Firestore document ID for a manufacturer — phone (new) or uid (legacy). */
export async function resolveManufacturerDocId(uid: string): Promise<string> {
  const phone = await phoneFromUid(uid);
  return phone || uid;
}

export async function loadProfileState(
  uid: string,
  role: DashboardProfileRole,
  authEmail: string | null,
): Promise<LoadedProfileState> {
  const col = role === "manufacturer" ? "manufacturers" : "retailers";

  // For manufacturers: try phone-keyed doc first (new schema), fall back to uid-keyed (legacy)
  let snap;
  if (role === "manufacturer") {
    const phone = await phoneFromUid(uid);
    snap = phone ? await getDoc(doc(db, col, phone)) : null;
    if (!snap?.exists()) {
      snap = await getDoc(doc(db, col, uid));
    }
  } else {
    snap = await getDoc(doc(db, col, uid));
  }

  // Base empty form — try to pre-populate name/phone from users/{phone}
  let prefillName = "";
  let prefillPhone = "";
  const phone = await phoneFromUid(uid);
  if (phone) {
    try {
      const userSnap = await getDoc(doc(db, "users", phone));
      if (userSnap.exists()) {
        prefillName  = String(userSnap.data()?.name  ?? "");
        prefillPhone = String(userSnap.data()?.phone ?? "");
      }
    } catch { /* ignore */ }
  }

  const emptyForm: ProfileFormValues = {
    businessName: "",
    ownerName: prefillName,
    phone: prefillPhone,
    secondaryPhone: "",
    email: authEmail || "",
    line1: "", city: "", state: "", pincode: "",
    website: "", logoUrl: "", bannerUrl: "",
    gstin: "",
  };

  if (!snap.exists()) {
    return {
      form: emptyForm,
      geo: null,
      retailerExtras: role === "retailer" ? defaultRetailerExtras() : null,
      manufacturerCreatedAt: null,
    };
  }

  const data = snap.data() as Record<string, unknown>;
  const addr = addressFromDoc(data);

  if (role === "manufacturer") {
    return {
      form: {
        businessName: String(data.businessName ?? data.shopName ?? ""),
        ownerName:    String(data.ownerName ?? prefillName ?? ""),
        phone:        String(data.phone ?? prefillPhone ?? ""),
        secondaryPhone: String(data.secondaryPhone ?? ""),
        email:        String(data.email ?? authEmail ?? ""),
        line1: addr.line1,
        city:  addr.city,
        state: addr.state,
        pincode: addr.pincode,
        website:   String(data.website ?? ""),
        logoUrl:   String(data.logo ?? ""),
        bannerUrl: String(data.banner ?? ""),
        gstin: String(data.gstin ?? ""),
      },
      geo: parseGeo(data),
      retailerExtras: null,
      manufacturerCreatedAt: data.createdAt ?? null,
    };
  }

  return {
    form: {
      businessName: String(data.shopName ?? data.businessName ?? ""),
      ownerName:    String(data.ownerName ?? prefillName ?? ""),
      phone:        String(data.phone ?? prefillPhone ?? ""),
      secondaryPhone: String(data.secondaryPhone ?? ""),
      email:        String(data.email ?? authEmail ?? ""),
      line1: addr.line1,
      city:  addr.city,
      state: addr.state,
      pincode: addr.pincode,
      website:   String(data.website ?? ""),
      logoUrl:   String(data.logo ?? ""),
      bannerUrl: String(data.banner ?? ""),
      gstin: String(data.gstin ?? ""),
    },
    geo: parseGeo(data),
    retailerExtras: {
      createdAt:      data.createdAt ?? null,
      onboardingType: data.onboardingType != null ? String(data.onboardingType) : null,
      manufacturerId: data.manufacturerId != null ? String(data.manufacturerId) : null,
      active:         typeof data.active === "boolean" ? data.active : true,
      subscriptionStatus: String(data.subscriptionStatus ?? "free"),
    },
    manufacturerCreatedAt: null,
  };
}

function defaultRetailerExtras(): RetailerProfileExtras {
  return {
    createdAt: null,
    onboardingType: null,
    manufacturerId: null,
    active: true,
    subscriptionStatus: "free",
  };
}

export async function saveManufacturerProfile(
  uid: string,
  form: ProfileFormValues,
  geo: GeoPoint,
  existingCreatedAt: unknown | null,
): Promise<void> {
  const trimmedEmail   = form.email.trim();
  const trimmedPhone   = form.phone.trim();
  const phone          = await phoneFromUid(uid);
  const manufacturerDocId = phone || uid;

  // Read existing doc to check for slug (only generate once — slugs must be stable)
  const existingSnap  = await getDoc(doc(db, "manufacturers", manufacturerDocId));
  const existingSlug  = existingSnap.exists() ? String(existingSnap.data().slug ?? "") : "";
  const slug          = existingSlug || generateSlug(form.businessName.trim(), trimmedPhone || phone || uid);

  const addressPayload = {
    line1:   form.line1.trim(),
    city:    form.city.trim(),
    state:   form.state.trim(),
    pincode: form.pincode.trim(),
  };

  const gstNumber      = form.gstin.trim() || null;
  const gstRegistered  = isValidGstinFormat(gstNumber ?? "");

  // 1. Write full profile to the role-specific collection (source of operational truth).
  await setDoc(
    doc(db, "manufacturers", manufacturerDocId),
    {
      uid,
      manufacturerId: uid,
      businessName:   form.businessName.trim(),
      ownerName:      form.ownerName.trim(),
      phone:          trimmedPhone || phone || "",
      secondaryPhone: form.secondaryPhone.trim(),
      email:          trimmedEmail,
      website:        form.website.trim(),
      logo:           form.logoUrl.trim(),
      banner:         form.bannerUrl.trim(),
      gstin:          gstNumber,
      gstRegistered,
      geo,
      address:        addressPayload,
      slug,
      createdAt: existingCreatedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // 2. Mirror the full public snapshot to profiles/{phone}.
  //    This is the unified read source for product pages, store cards, and
  //    any consumer that needs display info without knowing the role.
  const profileDocId = phone || uid;
  await setDoc(
    doc(db, "profiles", profileDocId),
    {
      phone:          trimmedPhone || phone || "",
      role:           "manufacturer",
      // Dual-name fields so reads work regardless of which key they expect
      businessName:   form.businessName.trim(),
      shopName:       form.businessName.trim(),
      ownerName:      form.ownerName.trim(),
      secondaryPhone: form.secondaryPhone.trim() || null,
      email:          trimmedEmail || null,
      website:        form.website.trim() || null,
      logo:           form.logoUrl.trim() || null,
      banner:         form.bannerUrl.trim() || null,
      gstin:          gstNumber,
      gstRegistered,
      address:        addressPayload,
      city:           form.city.trim(),
      state:          form.state.trim(),
      geo,
      updatedAt:      serverTimestamp(),
    },
    { merge: true },
  );

  // 3. Sync the minimum fields needed by the dashboard layout's profile-completeness
  //    check to users/{phone} — that check reads businessName + phone + city.
  const userTarget = phone ? doc(db, "users", phone) : doc(db, "users", uid);
  await setDoc(
    userTarget,
    {
      businessName: form.businessName.trim(),
      city:         form.city.trim(),
      ...(trimmedEmail ? { email: trimmedEmail } : {}),
      updatedAt:    serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveRetailerProfile(
  uid: string,
  form: ProfileFormValues,
  geo: GeoPoint,
  extras: RetailerProfileExtras,
): Promise<void> {
  const trimmedEmail = form.email.trim();
  const trimmedPhone = form.phone.trim();

  // Resolve both the UID-indexed phone and the legacy retailerDocId
  const rPhone       = await phoneFromUid(uid);
  const retailerDocId = await retailerDocIdFromUid(uid);
  const retailerRef  = doc(db, "retailers", retailerDocId || uid);

  const addressPayload = {
    line1:   form.line1.trim(),
    city:    form.city.trim(),
    state:   form.state.trim(),
    pincode: form.pincode.trim(),
  };

  const gstNumber     = form.gstin.trim() || null;
  const gstRegistered = isValidGstinFormat(gstNumber ?? "");

  // 1. Write full profile to retailers/{docId} (source of operational truth).
  await setDoc(
    retailerRef,
    {
      userId:    uid,
      retailerId: uid,
      role:      "retailer",
      shopName:  form.businessName.trim(),
      ownerName: form.ownerName.trim(),
      email:     trimmedEmail,
      phone:     trimmedPhone,
      secondaryPhone: form.secondaryPhone.trim(),
      website:   form.website.trim(),
      logo:      form.logoUrl.trim(),
      banner:    form.bannerUrl.trim(),
      gstin:     gstNumber,
      gstRegistered,
      address:   addressPayload,
      geo,
      onboardingType:     extras.onboardingType || "dashboard",
      manufacturerId:     extras.manufacturerId || null,
      createdAt:          extras.createdAt || serverTimestamp(),
      updatedAt:          serverTimestamp(),
      active:             true,
      subscriptionStatus: extras.subscriptionStatus,
    },
    { merge: true },
  );

  // 2. Mirror the full public snapshot to profiles/{phone}.
  //    Product pages and the retailer public profile section read from this.
  const profileDocId = rPhone || retailerDocId || uid;
  await setDoc(
    doc(db, "profiles", profileDocId),
    {
      phone:          trimmedPhone || rPhone || "",
      role:           "retailer",
      // Dual-name fields so reads work regardless of which key they expect
      businessName:   form.businessName.trim(),
      shopName:       form.businessName.trim(),
      ownerName:      form.ownerName.trim(),
      secondaryPhone: form.secondaryPhone.trim() || null,
      email:          trimmedEmail || null,
      website:        form.website.trim() || null,
      logo:           form.logoUrl.trim() || null,
      banner:         form.bannerUrl.trim() || null,
      gstin:          gstNumber,
      gstRegistered,
      address:        addressPayload,
      city:           form.city.trim(),
      state:          form.state.trim(),
      geo,
      updatedAt:      serverTimestamp(),
    },
    { merge: true },
  );

  // 3. Sync the minimum fields needed by the dashboard layout's profile-completeness check.
  const rTarget = rPhone ? doc(db, "users", rPhone) : doc(db, "users", uid);
  await setDoc(
    rTarget,
    {
      businessName: form.businessName.trim(),
      city:         form.city.trim(),
      ...(trimmedEmail ? { email: trimmedEmail } : {}),
      updatedAt:    serverTimestamp(),
    },
    { merge: true },
  );
}

// ─── GST + Online Delivery atomic writes ──────────────────────────────────────

/**
 * Validates GST, then atomically saves the GST number and enables online delivery
 * across all three relevant Firestore collections.
 */
export async function enableOnlineDeliveryWithGst(
  uid: string,
  role: "retailer" | "manufacturer",
  gstin: string,
): Promise<void> {
  const gstNumber = gstin.trim().toUpperCase();
  const gstRegistered = isValidGstinFormat(gstNumber);
  const phone = await phoneFromUid(uid);
  const now = serverTimestamp();
  const payload = { gstin: gstNumber, gstRegistered, onlineDelivery: true, updatedAt: now };

  if (role === "manufacturer") {
    const docId = phone || uid;
    await setDoc(doc(db, "manufacturers", docId), payload, { merge: true });
  } else {
    const rDocId = await retailerDocIdFromUid(uid);
    await setDoc(doc(db, "retailers", rDocId || phone || uid), payload, { merge: true });
  }

  const profileDocId = phone || uid;
  await setDoc(doc(db, "profiles", profileDocId), payload, { merge: true });

  const userTarget = phone ? doc(db, "users", phone) : doc(db, "users", uid);
  await setDoc(userTarget, payload, { merge: true });
}

/**
 * Immediately disables online delivery across all three Firestore collections
 * (role collection, profiles mirror, and users doc). Mirrors the same writes
 * that enableOnlineDeliveryWithGst makes, but sets onlineDelivery: false.
 */
export async function disableOnlineDelivery(
  uid: string,
  role: "retailer" | "manufacturer",
): Promise<void> {
  const phone = await phoneFromUid(uid);
  const now = serverTimestamp();
  const payload = { onlineDelivery: false, updatedAt: now };

  if (role === "manufacturer") {
    const docId = phone || uid;
    await setDoc(doc(db, "manufacturers", docId), payload, { merge: true });
  } else {
    const rDocId = await retailerDocIdFromUid(uid);
    await setDoc(doc(db, "retailers", rDocId || phone || uid), payload, { merge: true });
  }

  const profileDocId = phone || uid;
  await setDoc(doc(db, "profiles", profileDocId), payload, { merge: true });

  const userTarget = phone ? doc(db, "users", phone) : doc(db, "users", uid);
  await setDoc(userTarget, payload, { merge: true });
}

/**
 * Updates the GST number on an account where Online Delivery is already enabled.
 * GST cannot be cleared (set to empty) while delivery is active — callers must
 * validate that the supplied gstin is non-empty and valid before calling.
 */
export async function updateGstNumber(
  uid: string,
  role: "retailer" | "manufacturer",
  gstin: string,
): Promise<void> {
  const gstNumber = gstin.trim().toUpperCase() || null;
  const gstRegistered = gstNumber ? isValidGstinFormat(gstNumber) : false;
  const phone = await phoneFromUid(uid);
  const now = serverTimestamp();
  const payload = { gstin: gstNumber, gstRegistered, updatedAt: now };

  if (role === "manufacturer") {
    const docId = phone || uid;
    await setDoc(doc(db, "manufacturers", docId), payload, { merge: true });
  } else {
    const rDocId = await retailerDocIdFromUid(uid);
    await setDoc(doc(db, "retailers", rDocId || phone || uid), payload, { merge: true });
  }

  const profileDocId = phone || uid;
  await setDoc(doc(db, "profiles", profileDocId), payload, { merge: true });

  const userTarget = phone ? doc(db, "users", phone) : doc(db, "users", uid);
  await setDoc(userTarget, payload, { merge: true });
}
