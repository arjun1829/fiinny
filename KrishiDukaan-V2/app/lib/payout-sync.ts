import { getAdminDb } from "./firebase-admin";

/**
 * Razorpay Route webhooks (transfer.processed, transfer.failed,
 * settlement.processed) → "check these orders now".
 *
 * The webhook only marks the orders due (payout.nextCheckAt = 0); the
 * syncPayoutStatus Cloud Function (functions/src/payouts/payout-status.ts)
 * then asks Razorpay and writes the state, within 15 minutes. One place reads
 * Razorpay, so a webhook payload whose shape changes can never write a wrong
 * status: at worst it fails to speed a check up.
 */
export async function markPayoutsDueFromWebhook(eventName: string, payload: unknown): Promise<number> {
  const db = getAdminDb();
  const orders = db.collection("orders");
  const p = (payload ?? {}) as Record<string, any>;
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  const add = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.forEach((d) => refs.set(d.id, d.ref));

  if (eventName.startsWith("transfer.") || eventName.startsWith("transfers.")) {
    const t = (p.transfer?.entity ?? {}) as Record<string, unknown>;
    const id = String(t.id ?? "");
    const source = String(t.source ?? "");
    const reads: Promise<void>[] = [];
    if (/^trf_/.test(id)) reads.push(orders.where("payment.transferId", "==", id).limit(50).get().then(add));
    if (/^pay_/.test(source)) reads.push(orders.where("payment.razorpayPaymentId", "==", source).limit(50).get().then(add));
    if (/^order_/.test(source)) reads.push(orders.where("payment.razorpayOrderId", "==", source).limit(50).get().then(add));
    await Promise.all(reads);
  } else if (eventName === "settlement.processed") {
    // A settlement covers many transfers and doesn't list them: look again at
    // every released transfer that hasn't settled yet.
    add(await orders.where("payout.state", "==", "processing").limit(300).get());
  } else {
    return 0;
  }

  const list = Array.from(refs.values());
  for (let i = 0; i < list.length; i += 400) {
    const batch = db.batch();
    for (const ref of list.slice(i, i + 400)) batch.set(ref, { payout: { nextCheckAt: 0 } }, { merge: true });
    await batch.commit();
  }
  return list.length;
}
