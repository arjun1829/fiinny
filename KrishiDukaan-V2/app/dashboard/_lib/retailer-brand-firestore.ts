import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../../firebase";
import { compressImage, imageUploadMetadata } from "../../utils/compressImage";
import {
  parseRetailerBrand,
  parseRetailerProfile,
  serializeRetailerBrand,
  type RetailerBrandPage,
  type RetailerBrandProfile,
} from "../../lib/retailer-brand";
import { sharePhone } from "../../lib/share-links";

/** The retailer's E164 phone — the brand page's doc id — from uidIndex. */
export async function resolveRetailerPhone(uid: string, profilePhone?: unknown): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, "uidIndex", uid));
    const phone = sharePhone(String(snap.data()?.phone ?? ""));
    if (phone) return phone;
  } catch {
    /* fall back to the profile's own phone */
  }
  return sharePhone(String(profilePhone ?? ""));
}

/** Owner read: the rules let the owner (and admins) read a hidden page too. */
export async function fetchRetailerBrand(phone: string): Promise<{ brand: RetailerBrandPage; exists: boolean }> {
  const snap = await getDoc(doc(db, "retailerBrandPages", phone));
  return { brand: parseRetailerBrand(snap.data()), exists: snap.exists() };
}

/** Name, logo, banner, address — owned by the Profile screen, shown read-only here. */
export async function fetchRetailerBrandProfile(phone: string): Promise<RetailerBrandProfile> {
  const [profileSnap, retailerSnap] = await Promise.all([
    getDoc(doc(db, "profiles", phone)).catch(() => null),
    getDoc(doc(db, "retailers", phone)).catch(() => null),
  ]);
  return parseRetailerProfile(phone, {
    ...(retailerSnap?.data() ?? {}),
    ...Object.fromEntries(
      Object.entries(profileSnap?.data() ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ""),
    ),
  });
}

export async function saveRetailerBrand(phone: string, brand: RetailerBrandPage, isNew: boolean): Promise<void> {
  await setDoc(
    doc(db, "retailerBrandPages", phone),
    {
      ...serializeRetailerBrand(brand),
      updatedAt: serverTimestamp(),
      ...(isNew ? { createdAt: serverTimestamp() } : {}),
    },
    { merge: true },
  );
}

/** Uploads one shop photo under profile-images/ (the storage-rules-allowed prefix). */
export async function uploadRetailerBrandPhoto(phone: string, file: File): Promise<string> {
  const toUpload = await compressImage(file);
  const digits = phone.replace(/\D/g, "");
  const path = `profile-images/gallery/${Date.now()}-${digits}.${toUpload.type === "image/png" ? "png" : "jpg"}`;
  const snap = await uploadBytes(storageRef(storage, path), toUpload, imageUploadMetadata(toUpload));
  return getDownloadURL(snap.ref);
}
