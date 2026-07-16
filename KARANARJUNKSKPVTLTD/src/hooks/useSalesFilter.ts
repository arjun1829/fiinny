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
 * Resolves district-based access for the current user.
 * - Non-sales roles → allowedRetailerIds: null (no restriction, fetch all).
 * - Sales role with districts → resolves the matching retailer IDs from Firestore.
 * - Sales role with no districts assigned → empty Set (sees nothing).
 */
export function useSalesFilter(): SalesFilter {
  const { userRole, assignedDistricts, tenantId } = useAuth();
  const [allowedRetailerIds, setAllowedRetailerIds] = useState<Set<string> | null>(null);
  const [filterLoading, setFilterLoading] = useState(true);

  useEffect(() => {
    if (userRole !== 'sales') {
      setAllowedRetailerIds(null);
      setFilterLoading(false);
      return;
    }

    if (!tenantId || assignedDistricts.length === 0) {
      setAllowedRetailerIds(new Set());
      setFilterLoading(false);
      return;
    }

    const lowerDistricts = assignedDistricts.map(d => d.toLowerCase());
    setFilterLoading(true);

    getDocs(getTenantCollection(db, tenantId, 'retailers'))
      .then(snap => {
        const ids = new Set<string>(
          snap.docs
            .filter(d => lowerDistricts.includes((d.data().district || '').toLowerCase()))
            .map(d => d.id)
        );
        setAllowedRetailerIds(ids);
      })
      .catch(() => setAllowedRetailerIds(new Set()))
      .finally(() => setFilterLoading(false));

  // Use join() so the array content (not reference) drives re-runs
  }, [userRole, tenantId, assignedDistricts.join('|')]);

  return { allowedRetailerIds, filterLoading };
}

/**
 * Fetches salesOrders documents restricted to the given retailer ID set.
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
