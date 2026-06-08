import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../firebase";

const COLLECTION = "manufacturerRetailers";

export type SignupInviteDetails = {
  found: boolean;
  claimable: boolean;
  inviteCode: string;
  status: string;
  retailerEmail: string;
  retailerPhone: string;
  retailerId: string;
  manufacturerId: string;
  manufacturerName: string | null;
};

// Resolve manufacturer's display name for the signup banner.
// This runs for unauthenticated users so we must only read publicly-accessible collections.
// - manufacturers/{phone}  → allow read: if true  (new-schema)
// - manufacturers/{uid}    → allow read: if true  (legacy-schema)
// - users/{phone or uid}   → allow read: if isAuthed()  ← blocked for unauth users
async function resolveManufacturerName(
  manufacturerId: string,
  manufacturerPhone: string | null,
): Promise<string | null> {
  // Try phone-keyed manufacturers doc first (most common for new-schema accounts)
  if (manufacturerPhone) {
    try {
      const snap = await getDoc(doc(db, "manufacturers", manufacturerPhone));
      if (snap.exists()) {
        const d = snap.data() as Record<string, unknown>;
        const name = String(d.businessName ?? d.ownerName ?? "");
        if (name) return name;
      }
    } catch { /* ignore */ }
  }

  // Try uid-keyed manufacturers doc (legacy accounts)
  try {
    const snap = await getDoc(doc(db, "manufacturers", manufacturerId));
    if (snap.exists()) {
      const d = snap.data() as Record<string, unknown>;
      const name = String(d.businessName ?? d.ownerName ?? "");
      if (name) return name;
    }
  } catch { /* ignore */ }

  return null;
}

export async function fetchInviteDetailsForSignup(
  inviteCode: string,
): Promise<SignupInviteDetails | null> {
  const code = inviteCode.trim();
  if (!code) return null;

  // NOTE: the manufacturerRetailers Firestore rule uses `allow list: if true` so that
  // unauthenticated new retailers can look up their invite code before creating an account.
  const q = query(collection(db, COLLECTION), where("inviteCode", "==", code), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) {
    return {
      found: false,
      claimable: false,
      inviteCode: code,
      status: "",
      retailerEmail: "",
      retailerPhone: "",
      retailerId: "",
      manufacturerId: "",
      manufacturerName: null,
    };
  }

  const d = snap.docs[0]!;
  const data = d.data() as Record<string, unknown>;
  const status = String(data.status ?? "");
  const claimable = status === "invited" && data.claimable === true;
  const manufacturerId = String(data.manufacturerId ?? "");
  const manufacturerPhone = data.manufacturerPhone ? String(data.manufacturerPhone) : null;
  const retailerEmail = String(data.retailerEmail ?? "");
  const retailerPhone = String(data.retailerPhone ?? "");
  const retailerId = String(data.retailerId ?? "");

  const manufacturerName = manufacturerId
    ? await resolveManufacturerName(manufacturerId, manufacturerPhone)
    : null;

  return {
    found: true,
    claimable,
    inviteCode: String(data.inviteCode ?? code),
    status,
    retailerEmail,
    retailerPhone,
    retailerId,
    manufacturerId,
    manufacturerName,
  };
}
