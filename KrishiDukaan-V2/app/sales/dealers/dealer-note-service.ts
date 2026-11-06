import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * A free-text note a rep leaves against a dealer. Same collection and field
 * shape the Flutter Sales App writes
 * (sales_app/lib/features/dealers/data/dealer_note.dart) — read-only here,
 * since the admin Sales Team view never creates or deletes notes.
 */
export type DealerNote = {
  id: string;
  dealerId: string;
  salesExecutiveId: string;
  note: string;
  createdAt: unknown;
};

function mapNoteDoc(d: { id: string; data: () => Record<string, unknown> }): DealerNote {
  const data = d.data();
  return {
    id: d.id,
    dealerId: String(data.dealerId ?? ''),
    salesExecutiveId: String(data.salesExecutiveId ?? ''),
    note: String(data.note ?? ''),
    createdAt: data.createdAt,
  };
}

/** A dealer's notes, oldest first — used by the admin Dealer Detail page. */
export async function fetchNotesForDealer(dealerId: string): Promise<DealerNote[]> {
  const q = query(
    collection(db, 'dealerNotes'),
    where('dealerId', '==', dealerId),
    orderBy('createdAt'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapNoteDoc(d as any));
}
