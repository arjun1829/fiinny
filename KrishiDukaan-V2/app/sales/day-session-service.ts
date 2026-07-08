import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  limit,
  GeoPoint,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export type DaySession = {
  id: string;
  salesExecutiveId: string;
  date: string;
  status: 'ACTIVE' | 'COMPLETED';
  startGeo: { latitude: number; longitude: number };
  endGeo?: { latitude: number; longitude: number };
  startedAt: unknown;
  endedAt?: unknown;
  totalWorkingMinutes?: number;
  totalDistanceKm?: number;
  calculationError?: string;
  createdAt: unknown;
  updatedAt: unknown;
};

/** Returns today's date as YYYY-MM-DD in IST, avoiding UTC/IST midnight boundary issues. */
export function getTodayIST(): string {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return [
    ist.getFullYear(),
    String(ist.getMonth() + 1).padStart(2, '0'),
    String(ist.getDate()).padStart(2, '0'),
  ].join('-');
}

function mapSession(d: { id: string; data: () => Record<string, unknown> }): DaySession {
  const data     = d.data();
  const rawStart = data.startGeo as { latitude: number; longitude: number } | undefined;
  const rawEnd   = data.endGeo   as { latitude: number; longitude: number } | undefined;
  return {
    id:                  d.id,
    salesExecutiveId:    String(data.salesExecutiveId ?? ''),
    date:                String(data.date ?? ''),
    status:              (data.status as 'ACTIVE' | 'COMPLETED') ?? 'ACTIVE',
    startGeo:            rawStart ? { latitude: rawStart.latitude, longitude: rawStart.longitude } : { latitude: 0, longitude: 0 },
    endGeo:              rawEnd   ? { latitude: rawEnd.latitude,   longitude: rawEnd.longitude   } : undefined,
    startedAt:           data.startedAt,
    endedAt:             data.endedAt,
    totalWorkingMinutes: typeof data.totalWorkingMinutes === 'number' ? data.totalWorkingMinutes : undefined,
    totalDistanceKm:     typeof data.totalDistanceKm    === 'number' ? data.totalDistanceKm    : undefined,
    calculationError:    data.calculationError ? String(data.calculationError) : undefined,
    createdAt:           data.createdAt,
    updatedAt:           data.updatedAt,
  };
}

// ── Route distance (client-side, single Directions API call) ─────────────────

/**
 * Calculates road distance for an ordered list of waypoints (start → visits → end).
 * Calls /api/directions which proxies Google Directions server-side (no CORS),
 * with automatic fallback to OSRM if Google is unavailable.
 */
export async function calculateRouteDistanceKm(
  waypoints: { lat: number; lng: number }[],
): Promise<number> {
  if (waypoints.length < 2) return 0;

  const res = await fetch('/api/directions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ waypoints }),
  });

  const data = (await res.json()) as { totalDistanceKm?: number; error?: string };

  if (!res.ok || typeof data.totalDistanceKm !== 'number') {
    throw new Error(data.error ?? 'Distance calculation failed.');
  }

  return data.totalDistanceKm;
}

// ── Write operations ─────────────────────────────────────────────────────────

export async function startDaySession(
  uid: string,
  geo: { lat: number; lng: number },
): Promise<string> {
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, 'daySessions'), {
    salesExecutiveId: uid,
    date:             getTodayIST(),
    status:           'ACTIVE',
    startGeo:         new GeoPoint(geo.lat, geo.lng),
    startedAt:        now,
    createdAt:        now,
    updatedAt:        now,
  });
  return ref.id;
}

/**
 * Marks the session COMPLETED and writes all results in a single Firestore update.
 * Distance is passed in from the caller (calculated client-side before this call).
 */
export async function endDaySession(
  sessionId: string,
  startedAt: unknown,
  geo: { lat: number; lng: number },
  distanceResult: { totalDistanceKm: number } | { calculationError: string },
): Promise<void> {
  const startMs =
    typeof (startedAt as any)?.toMillis === 'function'
      ? (startedAt as any).toMillis() as number
      : Date.now();
  const totalWorkingMinutes = Math.max(0, Math.round((Date.now() - startMs) / 60_000));

  await updateDoc(doc(db, 'daySessions', sessionId), {
    endGeo:              new GeoPoint(geo.lat, geo.lng),
    endedAt:             serverTimestamp(),
    status:              'COMPLETED',
    totalWorkingMinutes,
    ...('totalDistanceKm' in distanceResult
      ? { totalDistanceKm: distanceResult.totalDistanceKm }
      : { calculationError: distanceResult.calculationError }),
    updatedAt:           serverTimestamp(),
  });
}

// ── Read operations ───────────────────────────────────────────────────────────

export async function fetchActiveSession(uid: string): Promise<DaySession | null> {
  const q = query(
    collection(db, 'daySessions'),
    where('salesExecutiveId', '==', uid),
    where('status', '==', 'ACTIVE'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapSession(snap.docs[0] as any);
}

export async function fetchTodaySession(uid: string): Promise<DaySession | null> {
  const q = query(
    collection(db, 'daySessions'),
    where('salesExecutiveId', '==', uid),
    where('date', '==', getTodayIST()),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapSession(snap.docs[0] as any);
}
