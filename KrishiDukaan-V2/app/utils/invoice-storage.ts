import { getApp } from "firebase/app";
import { doc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import type { OrderDoc } from "../../types/order";
import { buildInvoiceBlob } from "./invoice-generator";

/**
 * Generates the invoice PDF for an order, uploads it to Firebase Storage,
 * and writes the invoice metadata back to the order document.
 *
 * Called once immediately after the order document is created.
 * Uses getApp() instead of importing from firebase.ts to avoid a circular dependency.
 *
 * Storage path: invoices/{orderId}/{invoiceNumber}.pdf
 * Firestore field written: order.invoice { invoiceNumber, storagePath, generatedAt, version }
 *
 * Note: downloadUrl is intentionally not stored. The public invoice URL is
 * krishidukan.com/invoice/{orderId} — the route handler proxies the PDF from Storage.
 */
export async function generateAndStoreInvoice(
  orderId: string,
  order: OrderDoc,
): Promise<void> {
  const app = getApp();
  const db = getFirestore(app);
  const storage = getStorage(app);

  const invoiceNumber =
    order.invoiceNumber ?? `INV-${orderId.slice(0, 8).toUpperCase()}`;
  const storagePath = `invoices/${orderId}/${invoiceNumber}.pdf`;

  // 1. Generate PDF in memory
  const blob = buildInvoiceBlob(order);

  // 2. Upload to Firebase Storage
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, { contentType: "application/pdf" });

  // 3. Write invoice metadata to the order document (no downloadUrl — route handles access)
  await updateDoc(doc(db, "orders", orderId), {
    invoice: {
      invoiceNumber,
      storagePath,
      generatedAt: serverTimestamp(),
      version: 1,
    },
  });
}
