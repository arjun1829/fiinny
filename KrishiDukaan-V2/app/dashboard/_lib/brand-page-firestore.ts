import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";

// Re-export shared types and pure helpers so they can be imported from one place
export type {
  BrandPageCustomization,
  ManufacturerBrandData,
  BrandProductSummary,
} from "./brand-page-types";
export { assembleBrandData, generateSlug } from "./brand-page-types";

import type { BrandPageCustomization } from "./brand-page-types";

// ─── Read functions ───────────────────────────────────────────────────────────

/** Fetch optional customization from brandPages/{phone}. Returns null if no doc exists. */
export async function fetchBrandPageCustomization(
  manufacturerPhone: string,
): Promise<Partial<BrandPageCustomization> | null> {
  try {
    const snap = await getDoc(doc(db, "brandPages", manufacturerPhone));
    if (!snap.exists()) return null;
    return snap.data() as Partial<BrandPageCustomization>;
  } catch {
    return null;
  }
}

/** Fetch active products for a manufacturer (by uid / manufacturerId). */
export async function fetchBrandProducts(
  manufacturerUid: string,
): Promise<{ id: string; name: string; category: string; price: number; image: string }[]> {
  const snap = await getDocs(
    query(
      collection(db, "products"),
      where("manufacturerId", "==", manufacturerUid),
      where("isActive", "==", true),
    ),
  );
  return snap.docs.map((d) => {
    const r = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      name: String(r.name ?? ""),
      category: String(r.category ?? ""),
      price: Number(r.price ?? 0),
      image: String(r.image ?? ""),
    };
  });
}

/** Count active retailers in manufacturers/{phone}/retailers subcollection. */
export async function fetchRetailerCount(manufacturerPhone: string): Promise<number> {
  try {
    const snap = await getCountFromServer(
      collection(db, "manufacturers", manufacturerPhone, "retailers"),
    );
    return snap.data().count;
  } catch {
    return 0;
  }
}

/** Resolve a slug to a manufacturer phone by querying manufacturers where slug == slug. */
export async function resolveSlugToPhone(slug: string): Promise<string | null> {
  try {
    const snap = await getDocs(
      query(collection(db, "manufacturers"), where("slug", "==", slug)),
    );
    if (snap.empty) return null;
    return snap.docs[0].id;
  } catch {
    return null;
  }
}

/** Fetch a manufacturer's full profile doc. Returns null if not found. */
export async function fetchManufacturerProfile(
  manufacturerPhone: string,
): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getDoc(doc(db, "manufacturers", manufacturerPhone));
    if (!snap.exists()) return null;
    return snap.data() as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Write functions ──────────────────────────────────────────────────────────

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [
        k,
        v !== null && typeof v === "object" && !Array.isArray(v)
          ? stripUndefined(v as Record<string, unknown>)
          : v,
      ]),
  );
}

/** Upsert optional customization in brandPages/{phone}. */
export async function saveBrandPageCustomization(
  manufacturerPhone: string,
  data: Partial<Omit<BrandPageCustomization, "createdAt" | "updatedAt">>,
): Promise<void> {
  const ref = doc(db, "brandPages", manufacturerPhone);
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      ...stripUndefined(data as Record<string, unknown>),
      updatedAt: serverTimestamp(),
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  );
}
