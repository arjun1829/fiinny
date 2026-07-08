import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  GeoPoint,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

export const VISIT_PURPOSES = [
  'Pitching',
  'Order Collection',
  'Payment Collection',
  'Product Delivery',
  'Follow Up',
  'Complaint Resolution',
  'Stock Verification',
  'Other',
] as const;

export type VisitPurpose = (typeof VISIT_PURPOSES)[number];

export type DealerVisit = {
  id: string;
  dealerId: string;
  dealerName: string;
  salesExecutiveId: string;
  purpose: string;
  purposeOther?: string;
  notes?: string;
  // Location — geo kept for backward compat; arrivalGeo is the Phase 5 canonical field
  geo: { latitude: number; longitude: number } | null;
  arrivalGeo?: { latitude: number; longitude: number } | null;
  departureGeo?: { latitude: number; longitude: number } | null;
  // Session lifecycle
  status?: 'ACTIVE' | 'COMPLETED'; // undefined on Phase 4 docs → treat as COMPLETED
  startedAt?: unknown;              // set on create (= visitedAt)
  endedAt?: unknown;
  visitDurationMinutes?: number;
  // Legacy / compat
  visitedAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};

export type VisitInput = {
  dealerId: string;
  dealerName: string;
  purpose: VisitPurpose;
  purposeOther?: string;
  notes?: string;
  geo: { lat: number; lng: number };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapVisitDoc(d: { id: string; data: () => Record<string, unknown> }): DealerVisit {
  const data = d.data();
  const rawGeo      = data.geo as any;
  const rawArrival  = data.arrivalGeo as any;
  const rawDeparture = data.departureGeo as any;
  return {
    id: d.id,
    dealerId:          String(data.dealerId ?? ''),
    dealerName:        String(data.dealerName ?? ''),
    salesExecutiveId:  String(data.salesExecutiveId ?? ''),
    purpose:           String(data.purpose ?? ''),
    purposeOther:      data.purposeOther  ? String(data.purposeOther)  : undefined,
    notes:             data.notes         ? String(data.notes)         : undefined,
    geo:               rawGeo      ? { latitude: rawGeo.latitude,      longitude: rawGeo.longitude      } : null,
    arrivalGeo:        rawArrival  ? { latitude: rawArrival.latitude,  longitude: rawArrival.longitude  } : null,
    departureGeo:      rawDeparture? { latitude: rawDeparture.latitude,longitude: rawDeparture.longitude} : null,
    status:            (data.status as 'ACTIVE' | 'COMPLETED' | undefined) ?? undefined,
    startedAt:         data.startedAt,
    endedAt:           data.endedAt,
    visitDurationMinutes: typeof data.visitDurationMinutes === 'number' ? data.visitDurationMinutes : undefined,
    visitedAt:         data.visitedAt,
    createdAt:         data.createdAt,
    updatedAt:         data.updatedAt,
  };
}

// ── Write operations ─────────────────────────────────────────────────────────

/** Creates a new ACTIVE visit. Replaces the old logVisit. */
export async function startVisit(uid: string, input: VisitInput): Promise<string> {
  const now = serverTimestamp();
  const geoPoint = new GeoPoint(input.geo.lat, input.geo.lng);
  const ref = await addDoc(collection(db, 'dealerVisits'), {
    dealerId:          input.dealerId,
    dealerName:        input.dealerName,
    salesExecutiveId:  uid,
    purpose:           input.purpose,
    ...(input.purpose === 'Other' && input.purposeOther
      ? { purposeOther: input.purposeOther.trim() }
      : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    geo:        geoPoint, // backward compat
    arrivalGeo: geoPoint,
    status:     'ACTIVE',
    startedAt:  now,
    visitedAt:  now, // backward compat for fetchLastVisitsByExec ordering
    createdAt:  now,
    updatedAt:  now,
  });
  return ref.id;
}

/** Completes an active visit, records departure and duration. */
export async function endVisit(
  visitId: string,
  startedAt: unknown,
  departureCoords: { lat: number; lng: number },
): Promise<void> {
  const startMs =
    typeof (startedAt as any)?.toMillis === 'function'
      ? (startedAt as any).toMillis() as number
      : Date.now();
  const visitDurationMinutes = Math.max(0, Math.round((Date.now() - startMs) / 60_000));

  await updateDoc(doc(db, 'dealerVisits', visitId), {
    departureGeo:         new GeoPoint(departureCoords.lat, departureCoords.lng),
    endedAt:              serverTimestamp(),
    status:               'COMPLETED',
    visitDurationMinutes,
    updatedAt:            serverTimestamp(),
  });
}

// ── Read operations ───────────────────────────────────────────────────────────

/** Returns the current ACTIVE visit for this exec, or null if none. */
export async function fetchActiveVisit(uid: string): Promise<DealerVisit | null> {
  const q = query(
    collection(db, 'dealerVisits'),
    where('salesExecutiveId', '==', uid),
    where('status', '==', 'ACTIVE'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapVisitDoc(snap.docs[0] as any);
}

/** Returns today's visits for the exec, newest first. */
export async function fetchTodayVisits(uid: string): Promise<DealerVisit[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const q = query(
    collection(db, 'dealerVisits'),
    where('salesExecutiveId', '==', uid),
    where('visitedAt', '>=', Timestamp.fromDate(startOfDay)),
    orderBy('visitedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapVisitDoc(d as any));
}

/**
 * Fetches all visits for a sales exec ordered newest-first.
 * Returns a Map<dealerId, DealerVisit> with the latest COMPLETED visit per dealer.
 * (Skips ACTIVE visits so the "last visit" strip shows the previous completed visit.)
 * One query — no N+1 reads.
 */
export async function fetchLastVisitsByExec(uid: string): Promise<Map<string, DealerVisit>> {
  const q = query(
    collection(db, 'dealerVisits'),
    where('salesExecutiveId', '==', uid),
    orderBy('visitedAt', 'desc'),
  );
  const snap = await getDocs(q);

  const lastByDealer = new Map<string, DealerVisit>();
  for (const d of snap.docs) {
    const data = d.data();
    const dealerId = String(data.dealerId ?? '');
    // Skip ACTIVE visits — show last completed visit in the strip
    if (!dealerId || lastByDealer.has(dealerId)) continue;
    if (data.status === 'ACTIVE') continue;
    lastByDealer.set(dealerId, mapVisitDoc(d as any));
  }
  return lastByDealer;
}
