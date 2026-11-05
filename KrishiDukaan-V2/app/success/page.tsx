'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reportSubscriptionPurchase } from '../lib/ads/google-ads';

// Must match the key written by SubscriptionView.handlePayment once a payment
// has been verified and the subscription activated (paymentLogged === true).
const SUCCESS_KEY = 'kd_sub_success';
const REDIRECT_SECONDS = 5;
// Ignore a handoff older than this — a stale key left over from a previous
// purchase must not be replayed as a fresh confirmation.
const MAX_AGE_MS = 10 * 60 * 1000;

type SuccessInfo = {
  paymentId?: string;
  planName?: string;
  seatCount?: number;
  durationMonths?: number;
  amountPaid?: number;
  amountPaidPaise?: number;
  ts?: number;
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function durationLabel(months?: number): string | null {
  if (!months || months < 1) return null;
  if (months === 12) return '1 Year';
  if (months % 12 === 0) return `${months / 12} Years`;
  return months === 1 ? '1 Month' : `${months} Months`;
}

export default function SuccessPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);
  // Guards against the auto-redirect and the button both navigating.
  const navigatedRef = useRef(false);

  const goToDashboard = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push('/dashboard');
  }, [router]);

  // Consume the one-time success state. Runs client-side only (no SSR/hydration
  // risk) and removes the key immediately, so a refresh or revisit cannot
  // re-confirm the purchase or re-fire a conversion. This page never verifies a
  // payment or activates a subscription — it only reads what the trusted
  // checkout flow already recorded.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SUCCESS_KEY);
      // Consume once: remove before doing anything else with it.
      sessionStorage.removeItem(SUCCESS_KEY);
      if (raw) {
        const data = JSON.parse(raw) as SuccessInfo;
        const fresh =
          typeof data.ts !== 'number' || Date.now() - data.ts <= MAX_AGE_MS;
        if (data?.paymentId && fresh) {
          setSuccess(data);

          // Google Ads "Subscription Purchase" conversion. This block runs once
          // per verified, activated purchase: the success key has just been
          // consumed, so a refresh/revisit or a direct visit never reaches it,
          // and the payment id dedups any repeat (here and at Google). The value
          // is verify/'s gateway amount; without it nothing is sent. The OpenAI
          // Ads conversion is separate and fires in the checkout flow.
          try {
            reportSubscriptionPurchase({
              amountPaise: Number(data.amountPaidPaise),
              transactionId: data.paymentId,
            });
          } catch {
            /* never let measurement affect the success screen */
          }
        }
      }
    } catch {
      /* sessionStorage unavailable (private mode) — fall through to neutral */
    }
    setReady(true);
  }, []);

  // Auto-redirect countdown — genuine purchases only. A direct/neutral visit
  // gets buttons instead, never an automatic "you succeeded" redirect.
  useEffect(() => {
    if (!ready || !success) return;
    const timeout = setTimeout(goToDashboard, REDIRECT_SECONDS * 1000);
    const interval = setInterval(
      () => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [ready, success, goToDashboard]);

  // Avoid a flash of the neutral state before the client-only read runs.
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50/60 to-surface-container-lowest">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // ── Neutral state: no verified purchase for this session ────────────────────
  if (!success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-green-50/60 to-surface-container-lowest">
        <div className="w-full max-w-md bg-white rounded-[1.5rem] shadow-ambient border border-surface-container p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container text-3xl">
            🧾
          </div>
          <h1 className="text-xl font-black text-on-surface mb-2">
            No recent purchase found
          </h1>
          <p className="text-sm text-on-surface-variant font-medium mb-6 leading-relaxed">
            We couldn&apos;t find a completed subscription for this session. If you
            just paid, check your dashboard — your plan may already be active.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={goToDashboard}
              className="w-full bg-primary text-white font-black py-3.5 rounded-2xl shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all text-sm"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => router.push('/dashboard/upgrade')}
              className="w-full bg-surface-container text-on-surface font-bold py-3.5 rounded-2xl hover:bg-surface-container-high transition-colors text-sm"
            >
              View Plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Verified success state ──────────────────────────────────────────────────
  const dLabel = durationLabel(success.durationMonths);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-b from-green-50/60 to-surface-container-lowest">
      <div className="w-full max-w-md bg-white rounded-[1.5rem] shadow-ambient border border-surface-container overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-primary via-green-400 to-primary" />
        <div className="p-8 text-center">
          {/* Success check */}
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
            <svg
              className="h-10 w-10 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>

          <h1 className="text-2xl font-black text-on-surface leading-tight mb-2">
            Subscription Activated Successfully!
          </h1>
          <p className="text-sm text-on-surface-variant font-medium leading-relaxed mb-6">
            Congratulations! Your KrishiDukan subscription is now active.
          </p>

          {/* Plan / seat summary — only the fields actually present. */}
          {(success.planName ||
            success.seatCount != null ||
            dLabel ||
            success.amountPaid != null) && (
            <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/5 to-green-50 p-4 mb-6 text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2.5">
                Your subscription
              </p>
              <dl className="space-y-1.5 text-sm">
                {success.planName && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-on-surface-variant font-medium">Plan</dt>
                    <dd className="font-bold text-on-surface">{success.planName}</dd>
                  </div>
                )}
                {success.seatCount != null && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-on-surface-variant font-medium">Listings</dt>
                    <dd className="font-bold text-on-surface">
                      {success.seatCount}
                    </dd>
                  </div>
                )}
                {dLabel && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-on-surface-variant font-medium">Duration</dt>
                    <dd className="font-bold text-on-surface">{dLabel}</dd>
                  </div>
                )}
                {success.amountPaid != null && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-on-surface-variant font-medium">
                      Amount paid
                    </dt>
                    <dd className="font-bold text-on-surface">
                      {rupees(success.amountPaid)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          <button
            onClick={goToDashboard}
            className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/25 hover:shadow-primary/35 hover:-translate-y-0.5 active:translate-y-0 transition-all text-sm tracking-wide"
          >
            Continue to Dashboard
          </button>

          <p className="mt-4 text-xs text-on-surface-variant font-medium">
            Redirecting to your dashboard in{' '}
            <span className="font-bold text-primary">{secondsLeft}</span>{' '}
            second{secondsLeft === 1 ? '' : 's'}…
          </p>
        </div>
      </div>
    </div>
  );
}
