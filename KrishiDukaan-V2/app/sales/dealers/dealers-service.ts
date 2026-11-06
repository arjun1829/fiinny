import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  GeoPoint,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * `type`, `imageUrl` and `imagePath` are written only by the Flutter Sales App
 * (lib/features/dealers/data/dealer.dart / dealer_repository.dart) — this web
 * service predates them, so they are optional here and simply absent on docs
 * the web portal itself created. Mirrors the Flutter side's own fallback:
 * a missing `type` reads as 'retailer', and image fields stay undefined.
 */
export type Dealer = {
  id: string;
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  type: string;
  geo: { latitude: number; longitude: number } | null;
  active: boolean;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
  imageUrl?: string;
  imagePath?: string;

  /**
   * How interested the dealer seemed, as the rep's own assessment — written
   * only by the Flutter Sales App (DealerInterest enum: 'low' | 'considering'
   * | 'veryInterested'). Optional with no fallback: unlike `type`, a missing
   * value means "not assessed", not a default to assume.
   */
  interest?: string;
};

export type DealerInput = {
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  geo: { lat: number; lng: number } | null;
};

function mapDealerDoc(d: { id: string; data: () => Record<string, unknown> }): Dealer {
  const data = d.data();
  const rawGeo = data.geo as any;
  return {
    id: d.id,
    shopName: String(data.shopName ?? ''),
    ownerName: String(data.ownerName ?? ''),
    phone: String(data.phone ?? ''),
    address: String(data.address ?? ''),
    type: String(data.type ?? 'retailer'),
    geo: rawGeo ? { latitude: rawGeo.latitude, longitude: rawGeo.longitude } : null,
    active: data.active !== false,
    createdBy: String(data.createdBy ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
    imagePath: data.imagePath ? String(data.imagePath) : undefined,
    interest: data.interest ? String(data.interest) : undefined,
  };
}

export async function fetchDealers(): Promise<Dealer[]> {
  const q = query(
    collection(db, 'dealers'),
    where('active', '==', true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDealerDoc(d as any));
}

/** Active dealers created by one sales executive — used by the admin Sales Team detail page. */
export async function fetchDealersByExec(uid: string): Promise<Dealer[]> {
  const q = query(
    collection(db, 'dealers'),
    where('createdBy', '==', uid),
    where('active', '==', true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDealerDoc(d as any));
}

/** A single dealer by id, or null if it doesn't exist — used by the admin Dealer Detail page. */
export async function fetchDealerById(dealerId: string): Promise<Dealer | null> {
  const snap = await getDoc(doc(db, 'dealers', dealerId));
  return snap.exists() ? mapDealerDoc(snap as any) : null;
}

export async function createDealer(uid: string, input: DealerInput): Promise<string> {
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, 'dealers'), {
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    geo: input.geo ? new GeoPoint(input.geo.lat, input.geo.lng) : null,
    active: true,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateDealer(dealerId: string, input: DealerInput): Promise<void> {
  await updateDoc(doc(db, 'dealers', dealerId), {
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    geo: input.geo ? new GeoPoint(input.geo.lat, input.geo.lng) : null,
    updatedAt: serverTimestamp(),
  });
}

export async function deactivateDealer(dealerId: string): Promise<void> {
  await updateDoc(doc(db, 'dealers', dealerId), {
    active: false,
    updatedAt: serverTimestamp(),
  });
}
