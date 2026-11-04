'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ICONS } from '../constants';
import { getUserProfile, updateSubscriptionStatus, logFailedPayment } from '../firebase';
import { reportSubscriptionCreated } from '../lib/ads/openai-pixel';
import { useI18n } from '../i18n/I18nContext';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  DEFAULT_DURATIONS,
  PRICING_DOC_PATH,
  SEAT_PRESETS,
  SEAT_STEP,
  billableSeats,
  computeAmount,
  evaluatePromo,
  isPlanAllowed,
  normalizeSeatCount,
  planKey,
  parseDurations,
  tierOf,
  type DurationPrice,
  type PlanTier,
} from '../lib/pricing';
import { LEGAL_ROUTES, TERMS_VERSION, pct } from '../lib/legal-constants';
import { DEFAULT_ROUTE_CONFIG, ROUTE_CONFIG_PATH, parseRouteConfig } from '../lib/route-split';
import { NETWORK_STATS } from '../lib/network-stats';
import { Check, ChevronDown, Lock, Minus, Plus, Tag } from 'lucide-react';
import { authedJsonHeaders } from "../lib/authed-fetch";
import { ProductListingCard } from "../../components/shared/ProductListingCard";
import {
  clearPendingReferral,
  logReferralEvent,
  readPendingReferral,
  savePendingReferral,
  validateReferralCode,
} from '../lib/referral-client';

interface SubscriptionViewProps {
  user: any;
  role: 'customer' | 'retailer' | 'manufacturer';
  onSuccess: () => void;
  onLogout: () => void;
}

declare global {
  interface Window { Razorpay: any; }
}

type PremiumRole = 'retailer' | 'manufacturer';

type DurationOption = {
  months: number;
  label: string;
  pricePerSeat: number;
  badge?: string;
  id?: string;
  /** Set on bundle plans ("Rs 4,999 for 50 listings"); overrides pricePerSeat. */
  flatPrice?: number;
  includedListings?: number;
  /** Standard (fixed 100-listing pack) or Custom (per listing). */
  tier: PlanTier;
  /** Struck-through "was" price. Display only. */
  compareAtPrice?: number;
};

/** "₹11,000" — Indian digit grouping for rupee amounts. */
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** "1 Month" / "3 Months" / "1 Year" from a month count. */
function durationLabel(months: number): string {
  if (months === 12) return '1 Year';
  if (months % 12 === 0) return `${months / 12} Years`;
  return months === 1 ? '1 Month' : `${months} Months`;
}

const toOption = (d: DurationPrice): DurationOption => ({
  id: planKey(d),
  months: d.months,
  // Standard cards read as Monthly / Yearly; Custom keeps period labels.
  label: tierOf(d) === 'standard' && (d.months === 1 || d.months === 12)
    ? (d.months === 1 ? 'Monthly' : 'Yearly')
    : durationLabel(d.months),
  pricePerSeat: d.pricePerSeat,
  tier: tierOf(d),
  ...(d.compareAtPrice ? { compareAtPrice: d.compareAtPrice } : {}),
  ...(d.badge ? { badge: d.badge } : {}),
  ...(d.flatPrice !== undefined
    ? { flatPrice: d.flatPrice, includedListings: d.includedListings }
    : {}),
});

/**
 * Fallback only. The live ladder comes from settings/pricing (see
 * app/lib/pricing.ts) — the same document api/payment/create-order prices the
 * charge from, so what is displayed here and what Razorpay bills cannot drift.
 * These values match DEFAULT_DURATIONS, so a failed read behaves like the old
 * hardcoded table rather than showing nothing.
 */
const DURATION_OPTIONS: DurationOption[] = DEFAULT_DURATIONS.map(toOption);

/**
 * Plans of one tab in display order — Standard longest period first (Yearly
 * left, Monthly right), Custom short to long. The default selection is always
 * the FIRST card shown, so what is preselected is what sits on the left.
 */
function tierInDisplayOrder(opts: DurationOption[], tier: PlanTier): DurationOption[] {
  return opts
    .filter((o) => o.tier === tier)
    .sort((a, b) => (tier === 'standard' ? b.months - a.months : a.months - b.months));
}

export default function SubscriptionView({ user, role, onSuccess, onLogout }: SubscriptionViewProps) {
  const { t } = useI18n();
  const [loading,      setLoading]      = useState(false);
  const [verifying,    setVerifying]    = useState(false);
  const [seatCount,    setSeatCount]    = useState<number>(SEAT_STEP);
  const [seatInput,    setSeatInput]    = useState(String(SEAT_STEP));
  const [options,      setOptions]      = useState<DurationOption[]>(DURATION_OPTIONS);
  // Custom is the default tab; the first plan of the tab is preselected.
  const [tier,         setTier]         = useState<PlanTier>('custom');
  const [duration,     setDuration]     = useState<DurationOption>(
    tierInDisplayOrder(DURATION_OPTIONS, 'custom')[0] ?? DURATION_OPTIONS[0]!,
  );
  const [promoCode,    setPromoCode]    = useState('');
  // The raw promoCodes/ document once a code has been looked up. Eligibility and
  // the discount are NOT stored — they are derived from this doc against the
  // current plan/seat selection below, so changing the plan, billing cycle or
  // seat count re-evaluates the same code without another lookup.
  const [promoDoc,     setPromoDoc]     = useState<Record<string, unknown> | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  // Set only for problems that aren't about eligibility (code not found, network).
  const [promoLookupError, setPromoLookupError] = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  // Sales / marketing referral (lib/referrals.ts). Applied from a /subscribe
  // link (kept in localStorage across login) or typed by the buyer. Only a
  // server-validated code is ever shown as applied or sent to create-order.
  const [referralInput,    setReferralInput]    = useState('');
  const [referral,         setReferral]         = useState<{ code: string; ownerName: string } | null>(null);
  const [referralError,    setReferralError]    = useState<string | null>(null);
  const [referralChecking, setReferralChecking] = useState(false);
  // Plan / seats from a rep's offer link, applied once the live ladder is in.
  const [offer,        setOffer]        = useState<{ plan?: string; seats?: number } | null>(null);
  const [offerApplied, setOfferApplied] = useState(false);
  const [offerNote,    setOfferNote]    = useState<string | null>(null);
  const [pricingReady, setPricingReady] = useState(false);

  const premiumRole: PremiumRole = role === 'manufacturer' ? 'manufacturer' : 'retailer';
  const isRetailer = premiumRole === 'retailer';

  // Display only: the per-sale charges, read from settings/route — the same doc
  // the payment split uses and /sell publishes — so checkout states them before
  // the seller pays. Deliberately NO numeric fallback: if the read fails, the
  // code default may not be the live rate, so the note shows without figures
  // rather than quoting a rate that might not be the one charged.
  const [feeRates, setFeeRates] = useState<typeof DEFAULT_ROUTE_CONFIG | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, ROUTE_CONFIG_PATH.collection, ROUTE_CONFIG_PATH.doc))
      .then((snap) => {
        const parsed = snap.exists() ? parseRouteConfig(snap.data()) : null;
        if (!cancelled && parsed) setFeeRates(parsed);
      })
      .catch(() => { /* keep the default */ });
    return () => { cancelled = true; };
  }, []);

  // Promo / referral fields sit behind a disclosure; it opens by itself
  // whenever a code is already in play (e.g. from a rep's referral link).
  const [codesOpen, setCodesOpen] = useState(false);

  // Load the live pricing ladder. Falls back silently to DURATION_OPTIONS on
  // any failure — an unreachable settings doc must not block a seller from
  // subscribing, and create-order applies the same fallback when pricing the
  // charge, so the two stay consistent either way.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(
          doc(db, PRICING_DOC_PATH.collection, PRICING_DOC_PATH.doc),
        );
        if (cancelled || !snap.exists()) return;
        const parsed = parseDurations(snap.data());
        if (!parsed?.length) return;
        // Mirror of the server-side gate in create-order. Showing a plan the
        // seller would be refused at checkout is worse than not showing it.
        const visible = parsed.filter((d) => isPlanAllowed(d, premiumRole));
        if (!visible.length) return;
        const next = visible.map(toOption);
        setOptions(next);
        // Keep the tab and selection valid if the admin removed plans: fall back
        // to whichever tier still has plans, then to that tier's first plan.
        const hasStandard = next.some((o) => o.tier === 'standard');
        const nextTier: PlanTier = hasStandard ? 'standard' : 'custom';
        setTier((cur) => (next.some((o) => o.tier === cur) ? cur : nextTier));
        setDuration((cur) =>
          next.find((o) => o.id === cur.id) ??
          tierInDisplayOrder(next, next.some((x) => x.tier === cur.tier) ? cur.tier : nextTier)[0] ??
          next[0]!,
        );
      } catch {
        /* keep the defaults */
      } finally {
        if (!cancelled) setPricingReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [premiumRole]);

  // Pick up a referral: the URL (?ref= on this page) wins, else the pending
  // one saved by /subscribe before login. Validated server-side before it is
  // shown as applied.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('ref');
    if (fromUrl) {
      savePendingReferral({
        code: fromUrl,
        plan: params.get('plan'),
        seats: Number(params.get('seats') ?? '') || null,
      });
    }
    const pending = readPendingReferral();
    if (!pending) return;
    setReferralInput(pending.code);
    if (pending.plan || pending.seats) setOffer({ plan: pending.plan, seats: pending.seats });
    let cancelled = false;
    validateReferralCode(pending.code).then((r) => {
      if (cancelled) return;
      if (r.valid) setReferral({ code: r.code!, ownerName: r.ownerName ?? '' });
      else setReferralError(r.error ?? 'This referral code is not valid.');
    });
    return () => { cancelled = true; };
  }, []);

  // "Reached checkout" funnel event, once the code is confirmed.
  useEffect(() => {
    if (referral && user?.uid) {
      logReferralEvent(referral.code, 'checkout_view', { uid: user.uid, plan: offer?.plan ?? null });
    }
  }, [referral, user?.uid, offer?.plan]);

  // Apply the offer link's plan and seats — only if that exact plan is on the
  // live ladder for this account. A rep can only ever point at what admin
  // offers; anything else falls back to the normal choice with a note.
  useEffect(() => {
    if (!offer || offerApplied) return;
    const match = offer.plan ? options.find((o) => o.id === offer.plan) : undefined;
    if (match) {
      setTier(match.tier);
      setDuration(match);
      if (match.tier === 'custom' && match.flatPrice === undefined && offer.seats) {
        const n = normalizeSeatCount(offer.seats);
        setSeatCount(n);
        setSeatInput(String(n));
      }
      setOfferApplied(true);
      setOfferNote(null);
    } else if (pricingReady) {
      setOfferApplied(true);
      if (offer.plan) setOfferNote('The plan in your link is no longer offered — please choose a plan below.');
    }
  }, [offer, offerApplied, options, pricingReady]);

  const applyReferral = async () => {
    const code = referralInput.trim().toUpperCase();
    if (!code) return;
    setReferralChecking(true);
    setReferralError(null);
    const r = await validateReferralCode(code);
    setReferralChecking(false);
    if (r.valid) {
      setReferral({ code: r.code!, ownerName: r.ownerName ?? '' });
      savePendingReferral({ code: r.code! });
    } else {
      setReferral(null);
      setReferralError(r.error ?? 'This referral code is not valid.');
    }
  };

  const removeReferral = () => {
    setReferral(null);
    setReferralInput('');
    setReferralError(null);
    clearPendingReferral();
  };


  const content = {
    badge:    isRetailer ? t('retailerPremiumBadge')    : t('manufacturerPremiumBadge'),
    title:    isRetailer ? t('retailerPremiumTitle')    : t('manufacturerPremiumTitle'),
    subtitle: isRetailer ? t('retailerPremiumSubtitle') : t('manufacturerPremiumSubtitle'),
    benefits: isRetailer
      ? [t('retailerBenefit1'), t('retailerBenefit2'), t('retailerBenefit3'), t('retailerBenefit4')]
      : [t('manufacturerBenefit1'), t('manufacturerBenefit2'), t('manufacturerBenefit3'), t('manufacturerBenefit4')],
  };

  // Same function create-order prices the charge with, so what the seller is
  // shown and what Razorpay bills cannot drift.
  const grantedSeats = billableSeats(duration, seatCount);
  const baseTotal   = computeAmount(duration, seatCount);
  const isStandard  = duration.tier === 'standard';

  // Plans shown under the current tab, and whether the toggle is needed at all
  // (an admin may have removed every plan of one tier).
  // Standard cards run longest period first (Yearly left, Monthly right);
  // Custom keeps its short-to-long ladder order.
  const tierOptions = tierInDisplayOrder(options, tier);
  const showToggle  = options.some((o) => o.tier === 'standard') && options.some((o) => o.tier === 'custom');
  const switchTier  = (next: PlanTier) => {
    if (next === tier) return;
    setTier(next);
    const first = tierInDisplayOrder(options, next)[0];
    if (first) setDuration(first);
  };

  // Re-evaluate the entered code against the CURRENT selection every render —
  // the same shared rule set the server enforces in create-order — so switching
  // plan/cycle or changing seats instantly updates the discount and the reason.
  const promoEval = promoDoc
    ? evaluatePromo(promoDoc, { months: duration.months, seatCount: grantedSeats })
    : null;
  const promoOk = !!promoEval && !promoEval.error;
  const appliedDiscountPct = promoOk ? promoEval!.discountPercent : 0;
  // A lookup failure (not found / network) wins; otherwise show why the found
  // code doesn't apply to this selection.
  const promoError = promoLookupError ?? (promoEval?.error ?? null);

  const discountAmt = Math.floor(baseTotal * appliedDiscountPct / 100);
  const finalTotal  = baseTotal - discountAmt;

  // Seats sell in blocks of SEAT_STEP with a SEAT_STEP minimum. While typing,
  // the raw text is kept as-is so the field stays editable (a seller clearing
  // it to retype shouldn't have "10" jump back in), and only the priced
  // seatCount is snapped to the rule — the same normalizeSeatCount the server
  // applies, so the total shown here is the total charged.
  const handleSeatInput = (val: string) => {
    setSeatInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n <= 10000) setSeatCount(normalizeSeatCount(n));
    // Any applied code is re-evaluated against the new seat count on render — no
    // need to clear it; its eligibility/discount updates automatically.
  };

  // Snap the visible text to the real seat count once the seller leaves the
  // field, so a typed "15" doesn't keep displaying while 20 is being charged.
  const commitSeatInput = () => setSeatInput(String(seatCount));

  const adjustSeats = (delta: number) => {
    const next = normalizeSeatCount(seatCount + delta * SEAT_STEP);
    setSeatCount(next);
    setSeatInput(String(next));
  };

  const selectSeatPreset = (n: number) => {
    setSeatCount(n);
    setSeatInput(String(n));
  };

  // Look the code up once and stash the document. Whether it applies (and the
  // resulting discount) is decided by evaluatePromo on every render — the same
  // rules the server re-checks in create-order — so this only has to fetch, not
  // re-implement the conditions. A read failure lets checkout proceed at full
  // price rather than blocking it; the server is still the final authority.
  const applyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    setPromoLookupError(null);
    setPromoDoc(null);
    try {
      const q = query(collection(db, 'promoCodes'), where('code', '==', code));
      const snap = await getDocs(q);
      if (snap.empty) {
        setPromoLookupError('Invalid or expired promo code.');
        return;
      }
      setPromoDoc(snap.docs[0]!.data() as Record<string, unknown>);
    } catch {
      setPromoLookupError('Could not validate promo code. Try again.');
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromo = () => {
    setPromoCode('');
    setPromoDoc(null);
    setPromoLookupError(null);
  };

  const handlePayment = async () => {
    setLoading(true);
    setError(null);
    try {
      if (typeof window === 'undefined' || !window.Razorpay) {
        throw new Error('Payment gateway is not ready. Please refresh and try again.');
      }
      // The server resolves the buyer's role from this token, not from userId —
      // a role-restricted plan cannot be bought without it.
      const idToken = await user.getIdToken?.();
      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          seatCount: grantedSeats,
          durationMonths: duration.months,
          planId: duration.id,
          // Only send a code that currently qualifies for this exact selection;
          // create-order re-validates it and would 422 an ineligible one,
          // needlessly blocking a seller who left a stale code in the box.
          promoCode: promoOk ? promoEval!.code : null,
          // Validated above; create-order re-checks it before stamping it.
          referralCode: referral?.code ?? null,
          userId: user.uid,
        }),
      });
      const order = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof order.error === 'string'
            ? order.error
            : 'Unable to start payment right now. Please try again.',
        );
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'KrishiDukan',
        description: `${isStandard ? 'Standard · ' : ''}${grantedSeats} listing${grantedSeats !== 1 ? 's' : ''} · ${duration.label}`,
        order_id: order.id,
        handler: async function (paymentResponse: any) {
          setVerifying(true);
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id:  paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature:  paymentResponse.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || verifyData.status !== 'ok') {
              throw new Error('Payment verification failed. Please contact support.');
            }
            const updateResult = await updateSubscriptionStatus(user.uid, 'paid', {
              orderId:   paymentResponse.razorpay_order_id,
              paymentId: paymentResponse.razorpay_payment_id,
            }, verifyData.seatCount || grantedSeats, duration.months, verifyData.amountPaid,
              // What the seller was shown immediately above the pay button, and
              // therefore what they accepted by pressing it. Recorded against
              // the subscription so "which terms did this seller agree to" is
              // answerable from the data rather than from git history.
              {
                version: TERMS_VERSION,
                documents: [LEGAL_ROUTES.terms, LEGAL_ROUTES.sellerTerms],
                acceptedAt: new Date().toISOString(),
                surface: 'web:subscription-checkout',
              },
              // Gateway-verified promo code (from order notes), relayed straight
              // from verify/ — not the checkout input — so attribution matches
              // what was actually charged.
              verifyData.promoCode ?? null,
              // Plan identity from the gateway's order notes (see verify/).
              {
                planId: verifyData.planId ?? duration.id ?? null,
                planTier: verifyData.planTier ?? duration.tier,
                planName: verifyData.planName ?? null,
                referralCode: verifyData.referralCode ?? null,
              });
            // Used — the next purchase is credited only if a code is applied again.
            clearPendingReferral();

            if (!updateResult.paymentLogged) {
              setVerifying(false);
              setLoading(false);
              setError(
                'Payment received, but your listing count could not be updated. ' +
                'Please refresh the page or contact support with your payment ID: ' +
                paymentResponse.razorpay_payment_id
              );
              return;
            }

            // OpenAI Ads conversion — only past the guard above, so the
            // subscription document is known to have been written. A verified
            // payment on its own is NOT an enrolment: when paymentLogged is
            // false the seller paid but activation failed, and that must not
            // report a conversion.
            //
            // Fire-and-forget and self-silencing, so a blocked Pixel or a
            // failed request cannot affect the rest of this handler. The server
            // independently re-checks capture, activation, renewal and
            // duplication before anything reaches OpenAI.
            try {
              const idToken = await user.getIdToken();
              reportSubscriptionCreated({
                razorpayPaymentId: paymentResponse.razorpay_payment_id,
                idToken,
              });
            } catch {
              /* never block activation on measurement */
            }

            getUserProfile(user.uid).then(async (profile) => {
              const profileEmail = profile?.email ?? '';
              if (!profileEmail || profileEmail.includes('@krishidukan.local')) return;
              const now = new Date();
              const expiry = new Date(now);
              expiry.setMonth(expiry.getMonth() + duration.months);
              fetch('/api/email/subscription-confirmation', {
                method: 'POST',
                headers: await authedJsonHeaders(),
                body: JSON.stringify({
                  userEmail:         profileEmail,
                  userName:          profile?.name || user.displayName || '',
                  seatsPurchased:    verifyData.seatCount || grantedSeats,
                  amountPaid:        verifyData.amountPaid ?? finalTotal,
                  planName:          verifyData.planName || (isStandard ? 'Standard' : 'Custom'),
                  startDate:         now.toLocaleDateString('en-IN', { dateStyle: 'medium' }),
                  expiryDate:        expiry.toLocaleDateString('en-IN', { dateStyle: 'medium' }),
                  razorpayPaymentId: paymentResponse.razorpay_payment_id,
                  razorpayOrderId:   paymentResponse.razorpay_order_id,
                }),
              }).catch(() => {});
            }).catch(() => {});

            // One-time, client-only handoff to the /success page. Written ONLY
            // here — past the paymentLogged guard above — so /success can tell a
            // genuinely activated purchase from a direct visit or refresh without
            // re-verifying or re-activating anything. Minimal, non-sensitive
            // fields only: no signature and no card/token data. The payment id is
            // the dedup key for the Google Ads conversion /success fires, and
            // amountPaidPaise its value — verify/ only, never the on-screen total.
            // All values other than durationMonths come from verify/ (the
            // gateway), not the browser.
            try {
              sessionStorage.setItem('kd_sub_success', JSON.stringify({
                paymentId: paymentResponse.razorpay_payment_id,
                planName: verifyData.planName || (isStandard ? 'Standard' : 'Custom'),
                seatCount: verifyData.seatCount || grantedSeats,
                durationMonths: duration.months,
                amountPaid: verifyData.amountPaid ?? finalTotal,
                amountPaidPaise: verifyData.amountPaidPaise,
                ts: Date.now(),
              }));
            } catch {
              /* sessionStorage unavailable — /success will show its neutral state */
            }

            await onSuccess();
          } catch (err: any) {
            setError(err.message || 'Payment completed but profile update failed. Please refresh.');
          } finally {
            setVerifying(false);
            setLoading(false);
          }
        },
        modal:   { ondismiss: () => setLoading(false) },
        prefill: { name: user.displayName || '', email: user.email || '' },
        theme:   { color: '#154212' },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        setLoading(false);
        const reason = response.error?.reason || response.error?.description || 'Unknown error';
        setError(`Payment failed: ${reason}. Please try again.`);
        logFailedPayment(user.uid, response.error, {
          orderId: order.id,
          amount: order.amount,
          seatCount: grantedSeats,
          durationMonths: duration.months,
        }).catch(console.error);
      });
      rzp.open();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  // ── Benefit icons ────────────────────────────────────────────────────────────
  const benefitIcons = isRetailer
    ? ['🌾', '💬', '📍', '🏪']
    : ['🏭', '📦', '🤝', '📈'];

  // ── Display helpers (no effect on what is charged) ──────────────────────────
  const standardPackSize = options.find((o) => o.tier === 'standard')?.includedListings;
  const tierLabel = (tk: PlanTier) =>
    tk === 'standard'
      ? (standardPackSize ? `${standardPackSize}-product pack` : 'Standard pack')
      : 'Pay per product';
  const tierHint = (tk: PlanTier) =>
    tk === 'standard' ? 'Fixed price, best for big catalogues' : 'Choose exactly how many';
  /** Rupees per month for a plan at the current listing count. */
  const monthlyFor = (opt: DurationOption) =>
    Math.round(computeAmount(opt, seatCount) / opt.months);
  const codesShown =
    codesOpen || !!referral || !!referralError || promoDoc !== null || !!promoLookupError || !!promoCode;
  const finalPerMonth = Math.round(finalTotal / duration.months);
  // A pack of the same length that covers this many products for less than
  // the per-product price. Offered as a one-tap switch; nothing changes unless
  // the seller taps it.
  const cheaperPack =
    tier === 'custom' && duration.flatPrice === undefined
      ? options.find(
          (o) =>
            o.tier === 'standard' &&
            o.months === duration.months &&
            typeof o.flatPrice === 'number' &&
            typeof o.includedListings === 'number' &&
            seatCount <= o.includedListings &&
            o.flatPrice < baseTotal,
        )
      : undefined;

  return (
    <>
      {/* Verifying overlay */}
      {verifying && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mb-4" />
          <p className="font-bold text-primary text-base">{t('verifyingPayment')}</p>
          <p className="text-on-surface-variant text-sm mt-1 font-medium">{t('settingUpAccount')}</p>
        </div>
      )}

      <div className="min-h-[calc(100vh-64px)] flex items-start justify-center px-4 md:px-6 py-6 md:py-10 bg-gradient-to-b from-lime-50 via-green-50/40 to-surface-container-lowest">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-5xl"
        >
          {/* ── Hero headline ─────────────────────────────────────────────── */}
          <div className="text-center mb-6 md:mb-8 px-2">
            {isRetailer && (
              <div className="inline-flex items-center gap-2 bg-white ring-1 ring-primary/15 shadow-sm px-3 py-1 rounded-full mb-3">
                <ICONS.Trust className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{content.badge}</span>
              </div>
            )}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-primary leading-tight tracking-tight mb-2">
              {isRetailer ? (
                <>आपले कृषी दुकान<br className="md:hidden" /> <span className="text-green-700">आता ऑनलाइन</span> 🌾</>
              ) : (
                <>आपले प्रॉडक्ट्स थेट<br className="md:hidden" /> <span className="text-green-700">विक्रेत्यांपर्यंत</span></>
              )}
            </h1>
            <p className="text-sm md:text-base text-on-surface-variant font-medium max-w-lg mx-auto">
              {content.subtitle}
            </p>
            {isRetailer && (
              <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 mt-4">
                {[
                  { icon: '✅', text: `${NETWORK_STATS.retailers} retailers on KrishiDukan` },
                  { icon: '🧑‍🌾', text: 'Farmers searching daily' },
                  { icon: '🔒', text: 'Secure · Razorpay' },
                ].map(({ icon, text }) => (
                  <span key={text} className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant bg-white border border-outline-variant/30 px-3 py-1.5 rounded-full shadow-sm">
                    <span>{icon}</span>{text}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Main card ─────────────────────────────────────────────────── */}
          {/* `relative` scopes the accent bar below to this card. Without it the
              absolute bar escaped to the dashboard scroll container and, sitting
              in the vertical-scrollbar gutter, forced a horizontal scrollbar. */}
          <div className="relative bg-white rounded-[1.75rem] shadow-ambient border border-surface-container overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-green-400 to-primary opacity-60 pointer-events-none" />

            <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr]">

              {/* ── Benefits + previews ─────────────────────────────────────
                  Second on phones (the plan picker comes first, so a seller
                  can pay without scrolling past examples), left on desktop. */}
              {/* min-w-0 lets the column shrink inside the grid track so long
                  content truncates instead of widening the page. */}
              <div className="min-w-0 order-last lg:order-first p-6 md:p-8 lg:border-r border-outline-variant/20 bg-surface-container-lowest/60 flex flex-col gap-6">

                {/* Benefits */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">{t('includedBenefits')}</p>
                  <ul className="space-y-3">
                    {content.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-start gap-3">
                        {isRetailer ? (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime-100 text-base leading-none">{benefitIcons[i]}</span>
                        ) : (
                          <span className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Check className="h-3 w-3" aria-hidden />
                          </span>
                        )}
                        <span className="pt-1 text-sm font-medium text-on-surface leading-snug">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* WhatsApp inquiry preview */}
                {isRetailer && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                      Example Farmer Inquiry
                    </p>
                    <div className="bg-[#e5ddd5] rounded-2xl p-4 shadow-inner">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-9 h-9 rounded-full bg-green-700 flex items-center justify-center shrink-0">
                          <span className="text-white text-sm font-bold">S</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800">Suresh Patil</p>
                          <p className="text-[10px] text-gray-500">🧑‍🌾 Farmer · Karjat Village</p>
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm max-w-[85%]">
                        <p className="text-xs text-gray-800 leading-relaxed">नमस्कार! NPK 12:32:16 खत available आहे का? किंमत सांगा 🙏</p>
                        <p className="text-[9px] text-gray-400 text-right mt-1">11:42 AM ✓✓</p>
                      </div>
                      <p className="text-[9px] text-gray-500 mt-2 text-center font-medium">
                        आजच list करा — आजच inquiry मिळवा
                      </p>
                    </div>
                  </div>
                )}

                {/* Product listing preview — reuses the same ProductListingCard
                    shown in the marketplace / Product Detail page, so sellers see
                    exactly how their listing will appear. Sample data only, and
                    no sample rating: a new listing starts with none. */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Your listing will look like this
                  </p>
                  <ProductListingCard
                    className="w-44"
                    image="/product-images/Product_Images/NPK.webp"
                    name={isRetailer ? 'NPK Fertilizer 50kg' : 'Krishi Plus NPK 50kg'}
                    category="Fertilizer"
                    price={850}
                  />
                </div>
              </div>

              {/* ── Checkout ──────────────────────────────────────────────── */}
              <div className="min-w-0 order-first lg:order-last border-b lg:border-b-0 border-outline-variant/20 p-6 md:p-8 flex flex-col gap-6">

                {offerNote && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800">
                    {offerNote}
                  </div>
                )}

                {/* Step 1 — plan */}
                <div>
                  <p className="mb-3 flex items-center gap-2 text-sm font-black text-on-surface">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] text-white">1</span>
                    Choose your plan
                  </p>

                  {/* Plan type toggle — Custom (default) / Standard. Hidden when
                      the admin has left only one tier with plans. */}
                  {showToggle && (
                    <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-surface-container p-1" role="tablist" aria-label="Plan type">
                      {(['custom', 'standard'] as const).map((tk) => (
                        <button
                          key={tk}
                          type="button"
                          role="tab"
                          aria-selected={tier === tk}
                          onClick={() => switchTier(tk)}
                          className={[
                            'rounded-xl px-2 py-2 text-left transition-all sm:px-3',
                            tier === tk
                              ? 'bg-white text-primary shadow-sm'
                              : 'text-on-surface-variant hover:text-on-surface',
                          ].join(' ')}
                        >
                          <span className="block text-xs font-black sm:text-sm">{tierLabel(tk)}</span>
                          <span className="block text-[10px] font-semibold opacity-80">{tierHint(tk)}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2.5">
                    {tierOptions.map((opt) => {
                      const selected = duration.id === opt.id;
                      const best = (opt.badge ?? '').toLowerCase().includes('best');
                      const perListing = opt.tier !== 'standard' && opt.flatPrice === undefined;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDuration(opt)}
                          aria-pressed={selected}
                          className={[
                            'relative flex flex-col items-start rounded-2xl border-2 p-3.5 text-left transition-all',
                            selected
                              ? 'border-primary bg-primary/[0.04] shadow-sm'
                              : 'border-outline-variant/30 hover:border-primary/40',
                          ].join(' ')}
                        >
                          {opt.badge && (
                            <span className={`absolute -top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${best ? 'bg-yellow-300 text-primary' : 'bg-primary text-white'}`}>
                              {opt.badge}
                            </span>
                          )}
                          <span className="flex w-full items-center justify-between gap-2">
                            <span className="text-sm font-black text-on-surface">{opt.label}</span>
                            <span
                              aria-hidden
                              className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${selected ? 'border-primary bg-primary' : 'border-outline-variant'}`}
                            >
                              {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </span>
                          </span>
                          {perListing ? (
                            <>
                              <span className="mt-2 text-xl font-black text-on-surface tabular-nums">
                                {rupees(monthlyFor(opt))}
                                <span className="text-xs font-bold text-on-surface-variant">/month</span>
                              </span>
                              <span className="text-[11px] font-semibold text-on-surface-variant">
                                ₹{Math.round(opt.pricePerSeat / opt.months)} per product / month
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="mt-2 flex items-baseline gap-1.5">
                                {opt.compareAtPrice && opt.compareAtPrice > (opt.flatPrice ?? 0) && (
                                  <span className="text-[11px] text-on-surface-variant line-through">{rupees(opt.compareAtPrice)}</span>
                                )}
                                <span className="text-xl font-black text-on-surface tabular-nums">{rupees(opt.flatPrice ?? 0)}</span>
                              </span>
                              <span className="text-[11px] font-semibold text-on-surface-variant">
                                {opt.includedListings} products
                                {opt.months > 1 && ` · ${rupees(Math.round((opt.flatPrice ?? 0) / opt.months))}/month`}
                              </span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2 — how many products (per-listing plans only; a pack
                    or bundle has a fixed listing count). */}
                {tier === 'custom' && duration.flatPrice === undefined && (
                  <div>
                    <p className="mb-3 flex items-center gap-2 text-sm font-black text-on-surface">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] text-white">2</span>
                      {t('numberOfSeats')}
                    </p>
                    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-white p-1 shadow-sm">
                          <button
                            type="button"
                            aria-label={`${SEAT_STEP} fewer products`}
                            onClick={() => adjustSeats(-1)}
                            disabled={seatCount <= SEAT_STEP}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-primary transition-colors hover:bg-surface-container disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <input
                            type="number"
                            aria-label={t('numberOfSeats')}
                            min={SEAT_STEP}
                            max={10000}
                            step={SEAT_STEP}
                            value={seatInput}
                            onChange={(e) => handleSeatInput(e.target.value)}
                            onBlur={commitSeatInput}
                            className="h-9 w-16 bg-transparent text-center text-lg font-black text-on-surface outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            aria-label={`${SEAT_STEP} more products`}
                            onClick={() => adjustSeats(1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-primary transition-colors hover:bg-surface-container"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex gap-1.5">
                          {SEAT_PRESETS.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => selectSeatPreset(n)}
                              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                                seatCount === n
                                  ? 'bg-primary text-white'
                                  : 'bg-white text-on-surface ring-1 ring-outline-variant/40 hover:bg-surface-container'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="mt-2.5 text-[11px] text-on-surface-variant">
                        Minimum {SEAT_STEP} products, in blocks of {SEAT_STEP} · {SEAT_STEP} listings पासून सुरुवात
                      </p>
                    </div>
                    {cheaperPack && (
                      <button
                        type="button"
                        onClick={() => { setTier('standard'); setDuration(cheaperPack); }}
                        className="mt-2.5 flex w-full items-center justify-between gap-3 rounded-2xl bg-lime-100 px-4 py-3 text-left text-xs font-bold text-primary transition-colors hover:bg-lime-200"
                      >
                        <span>
                          Save {rupees(baseTotal - cheaperPack.flatPrice!)}: the {tierLabel('standard')} ({cheaperPack.label})
                          gives you up to {cheaperPack.includedListings} products for {rupees(cheaperPack.flatPrice!)}.
                        </span>
                        <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] text-white">Switch</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Promo + referral codes, folded away until needed. */}
                <div className="rounded-2xl border border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setCodesOpen((o) => !o)}
                    aria-expanded={codesShown}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="flex items-center gap-2 text-sm font-bold text-on-surface">
                      <Tag className="h-4 w-4 text-primary" aria-hidden />
                      Have a promo or referral code?
                      {(promoOk || referral) && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">Applied</span>
                      )}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-on-surface-variant transition-transform ${codesShown ? 'rotate-180' : ''}`} aria-hidden />
                  </button>

                  {codesShown && (
                    <div className="space-y-4 border-t border-outline-variant/20 px-4 pb-4 pt-3">
                      {/* Promo code */}
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">Promo Code</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Enter promo code"
                            value={promoCode}
                            onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoDoc(null); setPromoLookupError(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } }}
                            disabled={promoDoc !== null}
                            className="min-w-0 flex-1 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 text-xs font-medium text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 uppercase placeholder:normal-case disabled:opacity-60"
                          />
                          {promoDoc !== null ? (
                            <button
                              type="button"
                              onClick={removePromo}
                              className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={applyPromo}
                              disabled={promoLoading || !promoCode.trim()}
                              className="rounded-xl bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                            >
                              {promoLoading ? '…' : 'Apply'}
                            </button>
                          )}
                        </div>
                        {promoOk && (
                          <p className="mt-1.5 text-xs font-semibold text-primary">✓ {appliedDiscountPct}% discount applied</p>
                        )}
                        {promoError && <p className="mt-1.5 text-xs text-red-600">{promoError}</p>}
                      </div>

                      {/* Referral code — which sales / marketing person helped. */}
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                          Referral code <span className="normal-case font-semibold">(optional)</span>
                        </p>
                        {referral ? (
                          <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
                            <span className="text-xs font-semibold text-primary">
                              ✓ {referral.code}{referral.ownerName ? ` · Referred by ${referral.ownerName}` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={removeReferral}
                              className="text-xs font-bold text-on-surface-variant hover:text-red-600"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Code from your KrishiDukan representative"
                              value={referralInput}
                              onChange={(e) => { setReferralInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setReferralError(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyReferral(); } }}
                              maxLength={20}
                              className="min-w-0 flex-1 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 text-xs font-medium text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 uppercase placeholder:normal-case"
                            />
                            <button
                              type="button"
                              onClick={applyReferral}
                              disabled={referralChecking || !referralInput.trim()}
                              className="rounded-xl bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                            >
                              {referralChecking ? '…' : 'Apply'}
                            </button>
                          </div>
                        )}
                        {referralError && <p className="mt-1.5 text-xs text-red-600">{referralError}</p>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Order summary */}
                <div className="rounded-2xl bg-primary p-5 text-white">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Order summary</p>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-white/80">
                        {isStandard
                          ? `${tierLabel('standard')} · ${duration.label}`
                          : duration.flatPrice !== undefined
                            ? `Up to ${duration.includedListings} listings · ${duration.label}`
                            : `${seatCount} products × ₹${duration.pricePerSeat} · ${duration.label}`}
                      </dt>
                      <dd className="font-bold tabular-nums">{rupees(baseTotal)}</dd>
                    </div>
                    {promoOk && (
                      <div className="flex justify-between gap-3 text-yellow-300">
                        <dt>Promo {promoEval!.code} (−{appliedDiscountPct}%)</dt>
                        <dd className="font-bold tabular-nums">−{rupees(discountAmt)}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="my-3 h-px bg-white/15" />
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-white/80">{t('totalPrice')}</p>
                      {duration.months > 1 && (
                        <p className="text-[11px] text-white/70">≈ {rupees(finalPerMonth)} per month</p>
                      )}
                    </div>
                    <p className="text-3xl font-black tracking-tight tabular-nums text-yellow-300">{rupees(finalTotal)}</p>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-50 text-red-700 p-3 rounded-xl border border-red-100 text-xs font-medium flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    {error}
                  </div>
                )}

                {/* CTA */}
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handlePayment}
                    disabled={loading}
                    className="w-full rounded-full bg-primary py-4 text-base font-black tracking-wide text-white shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/35 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
                  >
                    {loading
                      ? t('processing')
                      : grantedSeats === 1
                        ? `आजच List करा — ${rupees(finalTotal)} · ${duration.label}`
                        : `List ${grantedSeats} Products for ${rupees(finalTotal)} · ${duration.label}`
                    }
                  </button>

                  <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
                    <Lock className="h-3 w-3" aria-hidden />
                    {t('securePayment')}
                  </p>

                  <p className="rounded-xl bg-surface-container-low px-3 py-2.5 text-center text-[11px] leading-relaxed text-on-surface-variant">
                    {feeRates ? (
                      <>
                        When farmers pay you online, a {pct(feeRates.commissionPercent)} platform fee and
                        payment gateway charges (currently about {pct(feeRates.gatewayFeePercent)}) apply
                        per sale.
                      </>
                    ) : (
                      <>
                        When farmers pay you online, a platform fee and payment gateway charges
                        apply per sale, as set out in the Seller Terms.
                      </>
                    )}{' '}
                    Nothing on cash or offline sales.
                  </p>

                  <p className="text-[11px] leading-relaxed text-on-surface-variant text-center">
                    By proceeding, you agree to KrishiDukan&apos;s{' '}
                    <a
                      href={LEGAL_ROUTES.terms}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-primary hover:underline"
                    >
                      Terms &amp; Conditions
                    </a>{' '}
                    and{' '}
                    <a
                      href={LEGAL_ROUTES.sellerTerms}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-primary hover:underline"
                    >
                      Seller &amp; Manufacturer Subscription Terms
                    </a>
                    .
                  </p>

                  <button
                    onClick={onLogout}
                    className="mx-auto text-[11px] text-on-surface-variant font-medium hover:text-primary transition-colors hover:underline"
                  >
                    {t('logoutGoBack')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
