import { runTransaction, type DocumentReference } from "firebase/firestore";

type AvailabilityEntry = Record<string, unknown>;

/**
 * Rewrites the signed-in seller's own entries in a product's availability[]
 * list (another seller's product, typically the manufacturer's). [update]
 * returns the new value for one of the seller's entries, or null to leave an
 * entry as it is. Resolves to whether anything was written.
 *
 * firestore.rules let a seller change only their own entries, and compare the
 * entries strictly by number type. The app saves whole numbers as decimals
 * (450.0) and the web SDK can only send them back as integers (450), so
 * another seller's untouched entry looks edited and the write is refused. On
 * that refusal the list is first written back unchanged, a write that changes
 * no value and that the rules allow, which stores those numbers the website's
 * way, and the edit is tried once more.
 */
export async function updateOwnAvailabilityEntries(
  productRef: DocumentReference,
  update: (entry: AvailabilityEntry) => AvailabilityEntry | null,
): Promise<boolean> {
  const edit = () =>
    runTransaction(productRef.firestore, async (tx) => {
      const snap = await tx.get(productRef);
      const list: unknown = snap.exists() ? snap.get("availability") : null;
      if (!Array.isArray(list) || !list.length) return false;
      let changed = false;
      const next = list.map((entry: AvailabilityEntry) => {
        const updated = update(entry);
        if (!updated) return entry;
        changed = true;
        return updated;
      });
      if (changed) tx.update(productRef, { availability: next });
      return changed;
    });

  try {
    return await edit();
  } catch (err) {
    if ((err as { code?: string })?.code !== "permission-denied") throw err;
    await runTransaction(productRef.firestore, async (tx) => {
      const snap = await tx.get(productRef);
      const list: unknown = snap.exists() ? snap.get("availability") : null;
      if (Array.isArray(list)) tx.update(productRef, { availability: list });
    });
    return edit();
  }
}
