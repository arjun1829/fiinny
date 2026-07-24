import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/firebase/client';

const EXPIRY_DAYS = 30;

/**
 * Activates Pro on the caller's own users/{uid} document. Client-side write,
 * same trust model as KrishiDukaan-v2's updateSubscriptionStatus(): the
 * server (app/api/razorpay/verify) only ever confirms the Razorpay HMAC
 * signature and returns {status:'ok'} — it does not write to Firestore.
 * This function must only be called after that verification succeeds
 * (see useRazorpayCheckout's call site); firestore.rules is the actual
 * enforcement boundary for the write itself (subscriptionFieldsUnchanged()
 * guard), not this function's caller discipline alone.
 */
export async function activateProAfterPayment(
  uid: string,
  payment: { razorpayPaymentId: string; razorpayOrderId: string },
): Promise<void> {
  const proExpiry = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await setDoc(
    doc(db, 'users', uid),
    {
      isPro: true,
      proExpiry,
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpayOrderId: payment.razorpayOrderId,
      lastPaymentAt: serverTimestamp(),
    },
    { merge: true },
  );
}
