import { useState, useEffect } from 'react';
import { getDocs, query, where, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';

export interface SalesFilter {
  /** null = no restriction (admin/analyst); Set = allowed retailer IDs for this sales user */
  allowedRetailerIds: Set<string> | null;
  filterLoading: boolean;
}

/**
 * Resolves access for the current user.
 * - Non-sales, non-retailer roles → allowedRetailerIds: null (unrestricted).
 * - Retailer role → Set containing their single assigned retailer ID.
 * - Sales with neither districts nor retailers assigned → empty Set (sees nothing).
 * - Sales with districts only → resolves matching retailer IDs from Firestore.
 * - Sales with retailers only → uses those IDs directly (no Firestore fetch).
 * - Sales with both → union of district-resolved IDs and directly-assigned IDs.
 */
export function useSalesFilter(): SalesFilter {
  const { userRole, assignedDistricts, assignedRetailers, tenantId } = useAuth();
  const [allowedRetailerIds, setAllowedRetailerIds] = useState<Set<string> | null>(null);
  const [filterLoading, setFilterLoading] = useState(true);

  useEffect(() => {
    if (userRole !== 'sales' && userRole !== 'retailer') {
      setAllowedRetailerIds(null);
      setFilterLoading(false);
      return;
    }

    // Retailer users always have exactly one assigned retailer — use it directly.
    if (userRole === 'retailer') {
      setAllowedRetailerIds(new Set(assignedRetailers));
      setFilterLoading(false);
      return;
    }

    const hasDistricts = assignedDistricts.length > 0;
    const hasRetailers = assignedRetailers.length > 0;

    // No access configured at all
    if (!hasDistricts && !hasRetailers) {
      setAllowedRetailerIds(new Set());
      setFilterLoading(false);
      return;
    }

    // Only specific retailers — no Firestore fetch needed
    if (!hasDistricts && hasRetailers) {
      setAllowedRetailerIds(new Set(assignedRetailers));
      setFilterLoading(false);
      return;
    }

    // Need to resolve districts → retailer IDs
    const lowerDistricts = assignedDistricts.map(d => d.toLowerCase());
    setFilterLoading(true);

    getDocs(getTenantCollection(db, tenantId!, 'retailers'))
      .then(snap => {
        const ids = new Set<string>(
          snap.docs
            .filter(d => lowerDistricts.includes((d.data().district || '').toLowerCase()))
            .map(d => d.id)
        );
        // Union with directly-assigned retailer IDs
        for (const id of assignedRetailers) ids.add(id);
        setAllowedRetailerIds(ids);
      })
      .catch(() => {
        // Fallback to just the explicitly assigned IDs
        setAllowedRetailerIds(new Set(assignedRetailers));
      })
      .finally(() => setFilterLoading(false));

  }, [userRole, tenantId, assignedDistricts.join('|'), assignedRetailers.join('|')]);

  return { allowedRetailerIds, filterLoading };
}

/**
 * Fetches salesOrders restricted to the given retailer ID set.
 * Chunks the IDs to respect Firestore's 30-item `in` operator limit.
 * Returns an empty array immediately when the set is empty.
 */
export async function fetchSalesOrdersByRetailerIds(
  tenantId: string,
  allowedRetailerIds: Set<string>
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  if (allowedRetailerIds.size === 0) return [];

  const ids = Array.from(allowedRetailerIds);
  const CHUNK = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    chunks.push(ids.slice(i, i + CHUNK));
  }

  const snapshots = await Promise.all(
    chunks.map(chunk =>
      getDocs(query(
        getTenantCollection(db, tenantId, 'salesOrders'),
        where('retailerId', 'in', chunk)
      ))
    )
  );

  return snapshots.flatMap(snap => snap.docs);
}
