import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { functionUrl } from '../utils/functionsUrl';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Star, Shield, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { PLAN_ID_TO_PRICING_TIER } from '../utils/subscriptionPlans';
import { usePricingPlans, type PricingPlan } from '../hooks/usePricingPlans';
import PricingPlanCard from '../components/pricing/PricingPlanCard';
import { home, container, eyebrow } from '../components/landing/home/tokens';
import {
    PLAN_PROMOTIONS_COLLECTION,
    findApplicablePromotion,
    type PlanPromotion,
} from '../utils/planPromotions';

declare global {
    interface Window {
        Razorpay: any;
    }
}

// ─── API helper ──────────────────────────────────────────────────────────────
// The SaaS functions are reached through the Firebase Hosting rewrites declared in
// firebase.json — same-origin `/api/saas/*` paths that Hosting invokes via a service
// account. This avoids Google's IAM invoker gate, which rejects an anonymous browser
// call to the direct cloudfunctions.net URL with a 403 (surfaced as a CORS error)
// BEFORE the function runs — without needing an `allUsers` binding. Auth is still
// enforced INSIDE the function via the Firebase ID token sent as
// `Authorization: Bearer <token>`; the rewrite carries the header through unchanged.
//
// Local emulator is the exception: Vite does not serve Hosting rewrites, so when
// VITE_USE_EMULATOR is set we call the emulated function directly via functionUrl().
const SAAS_REWRITE_PATHS: Record<string, string> = {
    getSaaSSubscription: '/api/saas/subscription',
    createSaaSOrder:     '/api/saas/order',
    verifySaaSPayment:   '/api/saas/verify',
};

function saasFunctionUrl(fnName: string): string {
    if (import.meta.env.VITE_USE_EMULATOR === 'true') return functionUrl(fnName);
    return SAAS_REWRITE_PATHS[fnName] ?? functionUrl(fnName);
}

async function callFunction(
    fnName: string,
    idToken: string,
    body: Record<string, unknown>
): Promise<any> {
    const res = await fetch(saasFunctionUrl(fnName), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
}

// Where a logged-out visitor's plan choice is stashed while they log in, so the
// selection survives the /login round-trip and can be resumed afterwards. Session-
// scoped (cleared when the tab closes); it only ever holds a plan id + billing
// cycle — never any subscription/payment state, which stays server-side.
const PENDING_PLAN_KEY = 'fiinny_pending_plan';

function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.Razorpay) return resolve(true);
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

export default function PricingPage() {
    const { tenantId, currentUser, planEntitlements } = useAuth();
    const { showToast } = useToast();
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly');
    // paying: plan id whose Razorpay order is being created / checkout is open
    const [paying, setPaying] = useState<string | null>(null);
    // verifying: plan id whose payment is being verified server-side
    const [verifying, setVerifying] = useState<string | null>(null);
    // activating: shown briefly after verification succeeds, before navigating away
    const [activating, setActivating] = useState(false);
    // Active promotions streamed from `planPromotions` (isActive filter satisfies the
    // security rule). Applied on top of the base price per plan/cycle/date at render.
    const [promotions, setPromotions] = useState<PlanPromotion[]>([]);

    // The authoritative, live plan catalogue — the single pricing DATA source shared
    // with the landing page and Super Admin preview.
    const { plans, loading: plansLoading } = usePricingPlans();

    useEffect(() => {
        loadRazorpayScript();
    }, []);

    // Subscribe to active promotions only (rule allows reading isActive == true).
    useEffect(() => {
        const unsub = onSnapshot(
            query(collection(db, PLAN_PROMOTIONS_COLLECTION), where('isActive', '==', true)),
            snap => setPromotions(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PlanPromotion, 'id'>) }))),
            () => setPromotions([]),
        );
        return () => unsub();
    }, []);

    // Derive current plan from AuthContext (same source as the rest of the app).
    // planEntitlements.planId is the catalog id (retailer/distributor/manufacturer).
    const activePlanId = planEntitlements.hasSubscription && planEntitlements.planId
        ? (PLAN_ID_TO_PRICING_TIER[planEntitlements.planId] ?? planEntitlements.planId)
        : null;

    // `forCycle` lets a resumed-after-login checkout use the exact cycle the visitor
    // picked before logging in (state may not have caught up yet); defaults to the
    // live toggle for the normal authenticated flow.
    const handleSubscribe = async (plan: PricingPlan, forCycle: 'monthly' | 'yearly' = cycle) => {
        if (paying || verifying) return;

        // Logged-out visitor: this is the ONLY place the CTA diverges. Preserve the
        // chosen plan + cycle and route to the existing Login page — no protected
        // subscription/payment work happens here. The flow resumes in the effect
        // below once they return authenticated.
        if (!currentUser) {
            sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ plan: plan.id, cycle: forCycle }));
            navigate('/login?redirect=/pricing');
            return;
        }
        if (!tenantId) return;

        setPaying(plan.id);
        try {
            const loaded = await loadRazorpayScript();
            if (!loaded) {
                showToast('Could not load payment gateway. Check your internet connection.', 'error');
                return;
            }

            // 1. Create a Razorpay order server-side. The backend returns the order_id
            //    and the public key_id — the secret key never leaves the server.
            const idToken = await currentUser.getIdToken();
            const { order_id, key_id, amount } = await callFunction(
                'createSaaSOrder', idToken, { plan: plan.id, cycle: forCycle, tenantId }
            );

            // 2. Open the Razorpay checkout modal. Wrapping in a Promise lets us await
            //    the user's action (pay / cancel) before proceeding.
            await new Promise<void>((resolve, reject) => {
                const options = {
                    key: key_id,
                    amount,
                    currency: 'INR',
                    name: 'Fiinny ERP',
                    description: `${plan.name} Plan — ${forCycle === 'yearly' ? 'Annual' : 'Monthly'}`,
                    order_id,
                    prefill: {
                        email: currentUser?.email ?? '',
                        contact: currentUser?.phoneNumber ?? '',
                    },
                    theme: { color: home.color.forest },
                    modal: {
                        ondismiss: () => reject(new Error('cancelled')),
                    },
                    handler: async (response: {
                        razorpay_payment_id: string;
                        razorpay_order_id: string;
                        razorpay_signature: string;
                    }) => {
                        // Checkout succeeded on the Razorpay side. Transition to the
                        // verification phase — the server now does the HMAC check and
                        // writes the subscription to Firestore. The client never writes
                        // subscription data directly.
                        setPaying(null);
                        setVerifying(plan.id);
                        try {
                            await callFunction('verifySaaSPayment', idToken, {
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature,
                                plan: plan.id,
                                cycle: forCycle,
                                tenantId,
                            });
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    },
                };
                const rzpInstance = new window.Razorpay(options);
                rzpInstance.open();
            });

            // Verification succeeded. AuthContext's onSnapshot on tenantSubscriptions/{id}
            // will fire shortly and update planEntitlements (showInactiveScreen → false).
            // Show a brief activation screen then navigate to the ERP.
            setVerifying(null);
            setActivating(true);
            showToast(`${plan.name} plan activated! Welcome to Fiinny ERP.`, 'success');
            setTimeout(() => {
                navigate('/dashboard');
            }, 1600);

        } catch (e: any) {
            setVerifying(null);
            setPaying(null);
            if (e?.message === 'cancelled') return; // user dismissed the modal intentionally
            const msg = e?.message ?? 'Unknown error';
            showToast(`Payment failed: ${msg}`, 'error');
        } finally {
            // Guard: ensure spinners clear even if an unexpected branch runs.
            setPaying(prev => prev === plan.id ? null : prev);
            setVerifying(prev => prev === plan.id ? null : prev);
        }
    };

    // Resume-after-login: if a logged-out visitor picked a plan (stashed above) and
    // has now returned authenticated, continue straight into that plan's checkout.
    // Runs once, only when auth + tenant + catalogue are ready, then clears the stash.
    const resumeAttempted = useRef(false);
    useEffect(() => {
        if (resumeAttempted.current) return;
        if (!currentUser || !tenantId || plans.length === 0) return;
        resumeAttempted.current = true;
        const raw = sessionStorage.getItem(PENDING_PLAN_KEY);
        if (!raw) return;
        sessionStorage.removeItem(PENDING_PLAN_KEY);
        try {
            const parsed = JSON.parse(raw) as { plan?: string; cycle?: string };
            const savedCycle: 'monthly' | 'yearly' = parsed.cycle === 'monthly' ? 'monthly' : 'yearly';
            const target = plans.find(p => p.id === parsed.plan);
            if (target) {
                setCycle(savedCycle);
                handleSubscribe(target, savedCycle);
            }
        } catch { /* ignore a malformed stash */ }
        // handleSubscribe intentionally omitted: the ref guard makes this run once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, tenantId, plans]);

    // Known badges are localized; custom badges render verbatim.
    const badgeLabel = (badge: string) =>
        badge === 'Most Popular' ? t('pricing.most_popular')
        : badge === 'Best Value' ? t('pricing.best_value')
        : badge;

    // Full-page activation overlay shown briefly after server verification succeeds.
    if (activating) {
        return (
            <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', textAlign: 'center', padding: '2rem', background: home.color.cream }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: home.color.emeraldTint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={44} color={home.color.emerald} />
                </div>
                <div>
                    <h2 style={{ fontFamily: home.font.heading, fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem', color: home.color.ink }}>Subscription Activated!</h2>
                    <p style={{ fontFamily: home.font.body, color: home.color.body }}>Launching your ERP dashboard...</p>
                </div>
                <Loader2 size={22} className="animate-spin" style={{ color: home.color.emerald, opacity: 0.7 }} />
            </div>
        );
    }

    return (
        <div style={{
            // A self-contained cream marketing surface. Kept as an inset rounded
            // panel (no negative-margin bleed) so it renders safely in BOTH shells
            // the page appears in — the ERP dashboard and the subscription gate —
            // and at every breakpoint (mobile .main-content has 0 padding).
            background: home.color.cream,
            color: home.color.ink,
            fontFamily: home.font.body,
            borderRadius: home.radius.lg,
            padding: 'clamp(2rem, 4vw, 3.5rem) clamp(1.25rem, 3vw, 2.5rem) 4rem',
        }}>
            <div style={{ ...container, maxWidth: 1150 }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <span style={eyebrow}>Simple, transparent pricing</span>
                    <h1 style={{
                        fontFamily: home.font.heading, fontWeight: 800, color: home.color.ink,
                        fontSize: '2.9rem', letterSpacing: '-0.03em', margin: '0.9rem 0 0.9rem',
                    }}>
                        {t('pricing.title')}
                    </h1>
                    <p style={{ fontFamily: home.font.body, color: home.color.body, fontSize: '1.12rem', maxWidth: '560px', margin: '0 auto 2rem', lineHeight: 1.6 }}>
                        {t('pricing.desc')}. All plans include GST compliance, invoicing, and inventory management.
                    </p>

                    {plansLoading && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: home.color.muted, fontSize: '0.82rem', marginBottom: '1rem' }}>
                            <Loader2 size={14} className="animate-spin" /> Loading latest pricing…
                        </div>
                    )}

                    {/* Current Plan Badge — driven by AuthContext planEntitlements */}
                    {activePlanId && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', background: home.color.goldSoft, border: `1px solid ${home.color.gold}`, borderRadius: home.radius.pill, color: home.color.forestInk, fontWeight: 700, fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            <Star size={16} fill="currentColor" />
                            {t('pricing.current_plan')}: {activePlanId.toUpperCase()}
                            {planEntitlements.status === 'active' && ' · Active'}
                        </div>
                    )}

                    {/* Billing Toggle */}
                    <div style={{ display: 'inline-flex', background: home.color.surface, border: `1px solid ${home.color.line}`, borderRadius: home.radius.pill, padding: '4px', gap: '4px', boxShadow: home.shadow.card }}>
                        {(['monthly', 'yearly'] as const).map(c => (
                            <button key={c} onClick={() => setCycle(c)} style={{ padding: '0.55rem 1.5rem', borderRadius: home.radius.pill, border: 'none', cursor: 'pointer', fontWeight: c === cycle ? 700 : 500, background: c === cycle ? home.color.forest : 'transparent', color: c === cycle ? '#fff' : home.color.body, font: 'inherit', fontFamily: home.font.body, fontSize: '0.9rem', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {c === 'monthly' ? t('pricing.monthly') : t('pricing.yearly')}
                                {c === 'yearly' && <span style={{ background: home.color.gold, color: home.color.forestInk, borderRadius: '6px', padding: '1px 6px', fontSize: '0.72rem', fontWeight: 800 }}>{t('pricing.save_pct', { pct: 17 })}</span>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Plan Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.75rem', alignItems: 'stretch' }}>
                    {plans.map(plan => {
                        const featured = plan.featured;
                        const isCurrentPlan = activePlanId === plan.id;
                        const isBusy = paying === plan.id || verifying === plan.id;
                        const anyBusy = !!(paying || verifying);

                        // Active promotion for this plan + selected cycle (highest % wins).
                        const promo = findApplicablePromotion(promotions, plan.id, cycle);

                        return (
                            <PricingPlanCard
                                key={plan.id}
                                plan={plan}
                                cycle={cycle}
                                promoPct={promo?.discountPct ?? 0}
                                promoLabel={promo?.label}
                                badgeLabel={badgeLabel}
                            >
                                {isCurrentPlan ? (
                                    <div style={{
                                        width: '100%', padding: '0.95rem', borderRadius: home.radius.sm,
                                        border: `1px solid ${featured ? 'rgba(255,255,255,0.4)' : home.color.forest}`,
                                        textAlign: 'center', fontWeight: 700, fontSize: '0.98rem', fontFamily: home.font.body,
                                        color: featured ? '#fff' : home.color.forest,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    }}>
                                        <Star size={16} fill="currentColor" /> {t('pricing.current_plan')}
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleSubscribe(plan)}
                                        disabled={anyBusy}
                                        style={{
                                            width: '100%', padding: '0.95rem', borderRadius: home.radius.sm,
                                            cursor: anyBusy ? 'not-allowed' : 'pointer',
                                            fontWeight: 700, font: 'inherit', fontFamily: home.font.body, fontSize: '0.98rem',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                            border: featured ? 'none' : `1px solid ${home.color.forest}`,
                                            background: featured ? home.color.gold : 'transparent',
                                            color: featured ? home.color.forestInk : home.color.forest,
                                            opacity: anyBusy && !isBusy ? 0.5 : 1,
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {paying === plan.id ? (
                                            <><Loader2 className="animate-spin" size={16} /> Preparing checkout…</>
                                        ) : verifying === plan.id ? (
                                            <><Loader2 className="animate-spin" size={16} /> Verifying payment…</>
                                        ) : (
                                            <>{t('pricing.get_plan', { plan: plan.name })} <ArrowRight size={16} /></>
                                        )}
                                    </button>
                                )}
                            </PricingPlanCard>
                        );
                    })}
                </div>

                {/* Free Plan Note */}
                <div style={{ textAlign: 'center', marginTop: '3rem', padding: '2rem', background: home.color.surface, borderRadius: home.radius.md, border: `1px solid ${home.color.line}`, boxShadow: home.shadow.card }}>
                    <div style={{ fontFamily: home.font.heading, fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: home.color.ink }}>
                        <Shield size={18} style={{ color: home.color.emerald }} /> {t('pricing.free_plan')}
                    </div>
                    <p style={{ color: home.color.body, fontSize: '0.92rem', maxWidth: '500px', margin: '0 auto 1rem' }}>
                        {t('pricing.free_plan_desc')}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap', fontSize: '0.85rem', color: home.color.muted }}>
                        {[`🔒 ${t('pricing.secure_payment')}`, `📅 ${t('pricing.cancel_anytime')}`, `🇮🇳 ${t('pricing.gst_invoice')}`, `🔄 ${t('pricing.prorated')}`].map(item => (
                            <span key={item}>{item}</span>
                        ))}
                    </div>
                </div>

                {/* FAQ */}
                <div style={{ marginTop: '3rem' }}>
                    <h2 style={{ fontFamily: home.font.heading, fontWeight: 800, fontSize: '1.6rem', marginBottom: '1.5rem', textAlign: 'center', color: home.color.ink }}>{t('pricing.faq_title')}</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                        {[
                            { q: 'Can I change plans later?', a: 'Yes! Upgrade anytime. Unused days are prorated and credited.' },
                            { q: 'Is payment secure?', a: 'Payments are processed by Razorpay — PCI-DSS compliant, 256-bit SSL.' },
                            { q: 'Do I get a GST invoice?', a: 'Yes, a tax invoice is sent to your registered email after payment.' },
                            { q: 'What payment methods are accepted?', a: 'UPI, Credit/Debit cards, Net Banking, Wallets (Paytm, PhonePe), EMI.' },
                        ].map(({ q, a }) => (
                            <div key={q} style={{ background: home.color.surface, border: `1px solid ${home.color.line}`, borderRadius: home.radius.sm, padding: '1.25rem', boxShadow: home.shadow.card }}>
                                <div style={{ fontFamily: home.font.heading, fontWeight: 700, marginBottom: '0.5rem', color: home.color.ink }}>{q}</div>
                                <div style={{ fontSize: '0.9rem', color: home.color.body, lineHeight: 1.6 }}>{a}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
