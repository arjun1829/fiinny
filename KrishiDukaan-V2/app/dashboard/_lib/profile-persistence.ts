import { doc, GeoPoint, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { generateSlug } from "./brand-page-types";

export type DashboardProfileRole = "retailer" | "manufacturer";

export type ProfileFormValues = {
  businessName: string;
  ownerName: string;
  phone: string;
  email: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
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
    email: authEmail || "",
    line1: "", city: "", state: "", pincode: "",
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
        email:        String(data.email ?? authEmail ?? ""),
        line1: addr.line1,
        city:  addr.city,
        state: addr.state,
        pincode: addr.pincode,
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
      email:        String(data.email ?? authEmail ?? ""),
      line1: addr.line1,
      city:  addr.city,
      state: addr.state,
      pincode: addr.pincode,
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
  const trimmedEmail = form.email.trim();
  const phone = await phoneFromUid(uid);
  // Phone is the canonical doc ID so profile and subcollections share the same parent doc
  const manufacturerDocId = phone || uid;

  // Read existing doc to check for slug (only generate once — slugs must be stable)
  const existingSnap = await getDoc(doc(db, "manufacturers", manufacturerDocId));
  const existingSlug = existingSnap.exists() ? String(existingSnap.data().slug ?? "") : "";
  const slug = existingSlug || generateSlug(form.businessName.trim(), form.phone.trim() || phone || uid);

  await setDoc(
    doc(db, "manufacturers", manufacturerDocId),
    {
      uid,
      manufacturerId: uid,
      businessName: form.businessName.trim(),
      ownerName:    form.ownerName.trim(),
      phone:        form.phone.trim() || phone || "",
      email:        trimmedEmail,
      geo,
      address: {
        line1:   form.line1.trim(),
        city:    form.city.trim(),
        state:   form.state.trim(),
        pincode: form.pincode.trim(),
      },
      slug,
      createdAt: existingCreatedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // Sync email to users/{phone} so notifications work
  if (trimmedEmail) {
    const target = phone ? doc(db, "users", phone) : doc(db, "users", uid);
    await setDoc(target, { email: trimmedEmail, updatedAt: serverTimestamp() }, { merge: true });
  }
}

export async function saveRetailerProfile(
  uid: string,
  form: ProfileFormValues,
  geo: GeoPoint,
  extras: RetailerProfileExtras,
): Promise<void> {
  const trimmedEmail = form.email.trim();
  const retailerDocId = await retailerDocIdFromUid(uid);
  const retailerRef = doc(db, "retailers", retailerDocId || uid);

  await setDoc(
    retailerRef,
    {
      userId: uid,
      retailerId: uid,
      role: "retailer",
      shopName:  form.businessName.trim(),
      ownerName: form.ownerName.trim(),
      email:     trimmedEmail,
      phone:     form.phone.trim(),
      address: {
        line1:   form.line1.trim(),
        city:    form.city.trim(),
        state:   form.state.trim(),
        pincode: form.pincode.trim(),
      },
      geo,
      onboardingType:  extras.onboardingType || "dashboard",
      manufacturerId:  extras.manufacturerId || null,
      createdAt:       extras.createdAt || serverTimestamp(),
      updatedAt:       serverTimestamp(),
      active:          true,
      subscriptionStatus: extras.subscriptionStatus,
    },
    { merge: true },
  );

  // Sync email to users/{phone} so notifications work
  if (trimmedEmail) {
    const phone = await phoneFromUid(uid);
    const target = phone ? doc(db, "users", phone) : doc(db, "users", uid);
    await setDoc(target, { email: trimmedEmail, updatedAt: serverTimestamp() }, { merge: true });
  }
}
