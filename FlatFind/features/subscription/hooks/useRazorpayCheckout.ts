'use client';

import { useCallback, useState } from 'react';
import { auth } from '@/firebase/client';
import { useAuth } from '@/providers/auth-provider';
import { activateProAfterPayment } from '../lib/subscription-firestore';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Orchestrates the FlatFind Pro checkout: create-order → open Razorpay
 * Checkout (window.Razorpay, loaded via next/script in app/layout.tsx) →
 * on success, verify → on {status:'ok'}, activate Pro client-side → refresh
 * the auth context's profile so every consumer (header badge, profile
 * card, FreeTierBanner) updates with no page refresh, satisfying the
 * spec's "Pro unlocked instantly" requirement.
 *
 * Mirrors KrishiDukaan-v2's SubscriptionView.tsx handlePayment() flow,
 * adapted to a hook since FlatFind favors hooks over one large page
 * component for this kind of orchestration (see useSavedListings for the
 * same shape elsewhere in this codebase).
 */
export function useRazorpayCheckout() {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = useCallback(
    async (onSuccess?: () => void) => {
      if (!user) {
        setError('Please login to upgrade.');
        return;
      }
      if (typeof window === 'undefined' || !window.Razorpay) {
        setError('Payment gateway is not ready. Please refresh and try again.');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) {
          setError('Please login again to continue.');
          setLoading(false);
          return;
        }

        const orderRes = await fetch('/api/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        });
        if (!orderRes.ok) {
          const body = await orderRes.json().catch(() => ({}));
          throw new Error(body?.error || 'Could not start payment. Please try again.');
        }
        const order = await orderRes.json();

        const rzp = new window.Razorpay({
          key: order.key_id,
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          name: 'FlatFind Pro',
          description: 'Unlimited contact reveals · 30 days',
          prefill: { contact: user.phoneNumber ?? undefined },
          theme: { color: '#166534' },
          handler: async (response: RazorpayHandlerResponse) => {
            try {
              const freshIdToken = await auth.currentUser?.getIdToken();
              const verifyRes = await fetch('/api/razorpay/verify', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${freshIdToken ?? idToken}`,
                },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const verifyData = await verifyRes.json();

              if (verifyData.status !== 'ok') {
                setError('Payment verification failed. Contact support if money was deducted.');
                return;
              }

              await activateProAfterPayment(user.uid, {
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
              });
              await refreshProfile();
              onSuccess?.();
            } catch {
              setError('Payment verified but activation failed. Please contact support.');
            } finally {
              setLoading(false);
            }
          },
          modal: {
            ondismiss: () => setLoading(false),
          },
        });

        rzp.open();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        setLoading(false);
      }
    },
    [user, refreshProfile],
  );

  return { startCheckout, loading, error };
}
