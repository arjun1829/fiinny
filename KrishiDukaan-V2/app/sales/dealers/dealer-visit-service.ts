import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  GeoPoint,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { getTodayIST } from '../day-session-service';

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
  daySessionId?: string;
  visitSequence?: number;
  purpose: string;
  purposeOther?: string;
  notes?: string;
  geo: { latitude: number; longitude: number } | null;
  visitedAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};

export type MarkVisitInput = {
  dealerId: string;
  dealerName: string;
  purpose: VisitPurpose;
  purposeOther?: string;
  notes?: string;
  geo: { lat: number; lng: number };
  daySessionId?: string;
  visitSequence?: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapVisitDoc(d: { id: string; data: () => Record<string, unknown> }): DealerVisit {
  const data = d.data();
  const rawGeo = data.geo as any;
  return {
    id:               d.id,
    dealerId:         String(data.dealerId ?? ''),
    dealerName:       String(data.dealerName ?? ''),
    salesExecutiveId: String(data.salesExecutiveId ?? ''),
    daySessionId:     data.daySessionId  ? String(data.daySessionId)  : undefined,
    visitSequence:    typeof data.visitSequence === 'number' ? data.visitSequence : undefined,
    purpose:          String(data.purpose ?? ''),
    purposeOther:     data.purposeOther  ? String(data.purposeOther)  : undefined,
    notes:            data.notes         ? String(data.notes)         : undefined,
    geo:              rawGeo ? { latitude: rawGeo.latitude, longitude: rawGeo.longitude } : null,
    visitedAt:        data.visitedAt,
    createdAt:        data.createdAt,
    updatedAt:        data.updatedAt,
  };
}

// ── Write operations ─────────────────────────────────────────────────────────

/** Records a completed dealer visit as a single timestamped checkpoint. */
export async function markAsVisited(uid: string, input: MarkVisitInput): Promise<string> {
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, 'dealerVisits'), {
    dealerId:         input.dealerId,
    dealerName:       input.dealerName,
    salesExecutiveId: uid,
    ...(input.daySessionId  != null ? { daySessionId:  input.daySessionId  } : {}),
    ...(input.visitSequence != null ? { visitSequence: input.visitSequence } : {}),
    purpose:   input.purpose,
    ...(input.purpose === 'Other' && input.purposeOther ? { purposeOther: input.purposeOther } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    geo:       new GeoPoint(input.geo.lat, input.geo.lng),
    visitedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

// ── Sorting utility ───────────────────────────────────────────────────────────

/**
 * Sorts visits into the canonical route order used by both the map and timeline.
 * Primary:   visitSequence ASC (set when the visit was recorded)
 * Fallback:  visitedAt ASC (for visits recorded before visitSequence was added)
 * Mixed:     visits with a sequence come before those without
 */
export function sortVisits(visits: DealerVisit[]): DealerVisit[] {
  return [...visits].sort((a, b) => {
    if (a.visitSequence != null && b.visitSequence != null) {
      return a.visitSequence - b.visitSequence;
    }
    if (a.visitSequence != null) return -1;
    if (b.visitSequence != null) return  1;
    const ta = (a.visitedAt as any)?.toMillis?.() ?? 0;
    const tb = (b.visitedAt as any)?.toMillis?.() ?? 0;
    return ta - tb;
  });
}

// ── Read operations ───────────────────────────────────────────────────────────

/**
 * Returns today's visits for the exec, newest first.
 * "Today" is anchored to the IST calendar day — matching daySessions
 * (getTodayIST) and fetchVisitsForDate — so the dashboard's visit count and
 * visitSequence stay consistent regardless of the device's local timezone or
 * proximity to the UTC/IST midnight boundary.
 */
export async function fetchTodayVisits(uid: string): Promise<DealerVisit[]> {
  // Midnight IST for today = Date.UTC(y, m-1, d) - 5h30m, where y/m/d are the
  // IST calendar date components (from getTodayIST).
  const [y, m, d] = getTodayIST().split('-').map(Number);
  const startMs = Date.UTC(y, m - 1, d) - 5.5 * 3_600_000;

  const q = query(
    collection(db, 'dealerVisits'),
    where('salesExecutiveId', '==', uid),
    where('visitedAt', '>=', Timestamp.fromDate(new Date(startMs))),
    orderBy('visitedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapVisitDoc(d as any));
}

/**
 * Returns Map<dealerId, DealerVisit> with the latest visit per dealer.
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
    if (!dealerId || lastByDealer.has(dealerId)) continue;
    lastByDealer.set(dealerId, mapVisitDoc(d as any));
  }
  return lastByDealer;
}

/** All visits for a sales exec, newest-first. Used to compute per-date visit counts. */
export async function fetchAllVisitsForExec(uid: string): Promise<DealerVisit[]> {
  const q = query(
    collection(db, 'dealerVisits'),
    where('salesExecutiveId', '==', uid),
    orderBy('visitedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapVisitDoc(d as any));
}

/**
 * Visits for a specific IST date (YYYY-MM-DD), ordered oldest-first for timeline display.
 * Uses IST day boundaries to avoid UTC/IST midnight mismatches.
 */
export async function fetchVisitsForDate(uid: string, dateStr: string): Promise<DealerVisit[]> {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Midnight IST = Date.UTC(y, m-1, d) - 5h30m
  const startMs = Date.UTC(y, m - 1, d) - 5.5 * 3_600_000;
  const q = query(
    collection(db, 'dealerVisits'),
    where('salesExecutiveId', '==', uid),
    where('visitedAt', '>=', Timestamp.fromDate(new Date(startMs))),
    where('visitedAt', '<',  Timestamp.fromDate(new Date(startMs + 86_400_000))),
    orderBy('visitedAt', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapVisitDoc(d as any));
}
