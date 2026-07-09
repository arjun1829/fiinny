import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where,
  GeoPoint,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

export type Dealer = {
  id: string;
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  geo: { latitude: number; longitude: number } | null;
  active: boolean;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export type DealerInput = {
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  geo: { lat: number; lng: number } | null;
};

export async function fetchDealers(): Promise<Dealer[]> {
  const q = query(
    collection(db, 'dealers'),
    where('active', '==', true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    const rawGeo = data.geo;
    return {
      id: d.id,
      shopName: String(data.shopName ?? ''),
      ownerName: String(data.ownerName ?? ''),
      phone: String(data.phone ?? ''),
      address: String(data.address ?? ''),
      geo: rawGeo ? { latitude: rawGeo.latitude, longitude: rawGeo.longitude } : null,
      active: data.active !== false,
      createdBy: String(data.createdBy ?? ''),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    } as Dealer;
  });
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
