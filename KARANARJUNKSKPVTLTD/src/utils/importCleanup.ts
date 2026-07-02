/**
 * Shared helper for ledger imports.
 *
 * A "force re-import" must REPLACE the previous import, not append to it.
 * This deletes every document in the given collections whose `sourceRef`
 * matches, so the subsequent re-import leaves exactly one clean copy.
 */
import { writeBatch, query, where, getDocs } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getTenantCollection } from './tenantPath';

export async function deleteBySourceRef(
  db: Firestore,
  tenantId: string,
  sourceRef: string,
  collections: string[],
): Promise<number> {
  let deleted = 0;
  for (const coll of collections) {
    const snap = await getDocs(
      query(getTenantCollection(db, tenantId, coll), where('sourceRef', '==', sourceRef))
    );
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      ops++;
      if (ops >= 450) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}
