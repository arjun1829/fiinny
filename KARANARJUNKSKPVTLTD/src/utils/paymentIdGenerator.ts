import { runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { getTenantDoc } from './tenantPath';

/**
 * Generates the next PAY-YYYY-NNNN ID using an atomic Firestore transaction
 * counter stored in settings/paymentCounter. Falls back to a timestamp-based
 * suffix if the transaction fails (e.g. offline).
 */
export async function generatePaymentId(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = getTenantDoc(db, tenantId, 'settings', 'paymentCounter');
  let seq = 1;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const data = snap.data() || {};
      const key = `seq_${year}`;
      seq = (data[key] || 0) + 1;
      tx.set(counterRef, { [key]: seq }, { merge: true });
    });
  } catch {
    seq = (Date.now() % 9998) + 1;
  }
  return `PAY-${year}-${String(seq).padStart(4, '0')}`;
}
