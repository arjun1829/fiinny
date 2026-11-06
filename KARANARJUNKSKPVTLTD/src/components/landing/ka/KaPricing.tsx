import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowRight, CheckCircle2, CreditCard, Lock, Zap } from 'lucide-react';
import { db } from '../../../firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { usePricingPlans, type PricingPlan } from '../../../hooks/usePricingPlans';
import {
    PLAN_PROMOTIONS_COLLECTION,
    discountedRupees,
    findApplicablePromotion,
    type PlanPromotion,
} from '../../../utils/planPromotions';
import { computeSavingsPct } from '../../../utils/subscriptionPlans';
import { formatINR, savePendingPlan, type BillingCycle } from '../../../utils/pendingPlan';

/**
 * The buy box. Picking a plan remembers it and walks the visitor through
 * mobile OTP → business details → Razorpay checkout for exactly that plan.
 */
export default function KaPricing() {
    const { plans } = usePricingPlans();
    const { currentUser, tenantId } = useAuth();
    const navigate = useNavigate();
    const [cycle, setCycle] = useState<BillingCycle>('yearly');
    const [promotions, setPromotions] = useState<PlanPromotion[]>([]);

    // Same promotions the checkout applies server-side, so the price shown here is
    // the price charged.
    useEffect(() => onSnapshot(
        query(collection(db, PLAN_PROMOTIONS_COLLECTION), where('isActive', '==', true)),
        snap => setPromotions(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PlanPromotion, 'id'>) }))),
        () => setPromotions([]),
    ), []);

    const savePct = plans.length ? computeSavingsPct(plans[0].monthlyPrice, plans[0].yearlyPrice) : 0;

    const buy = (plan: PricingPlan) => {
        savePendingPlan({ plan: plan.id, cycle });
        if (!currentUser) navigate('/login?signup=true');
        else if (!tenantId) navigate('/client-onboarding');
        else navigate('/pricing');
    };

    return (
        <section className="ka-section ka-pricing-bg" id="pricing">
            <div className="ka-container">
                <div className="ka-section-head">
                    <span className="ka-eyebrow">Plans &amp; pricing</span>
                    <h2 className="ka-h2">One price. Your whole business.</h2>
                    <p className="ka-lead">Pay for a month or save with a year. No setup fee, and nothing renews without asking you.</p>
                    <div className="ka-toggle" role="group" aria-label="Billing period">
                        <button className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')} aria-pressed={cycle === 'monthly'}>Monthly</button>
                        <button className={cycle === 'yearly' ? 'on' : ''} onClick={() => setCycle('yearly')} aria-pressed={cycle === 'yearly'}>
                            Yearly {savePct > 0 && <span className="ka-save">Save {savePct}%</span>}
                        </button>
                    </div>
                </div>

                <div className="ka-plans">
                    {plans.map(plan => {
                        const base = cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
                        const promo = findApplicablePromotion(promotions, plan.id, cycle);
                        const price = promo ? discountedRupees(base, promo.discountPct) : base;
                        const perMonth = cycle === 'yearly' ? Math.round(price / 12) : price;
                        return (
                            <article key={plan.id} className={`ka-plan${plan.featured ? ' featured' : ''}`}>
                                {plan.badgeVisible && plan.badge && <span className="ka-plan-badge">{plan.badge}</span>}
                                <h3>{plan.name}</h3>
                                <p className="ka-plan-tag">{plan.tagline}</p>
                                <div className="ka-plan-price">
                                    <b>{formatINR(perMonth)}<em> /month</em></b>
                                    <span>
                                        {promo && <s>{formatINR(base)}</s>}
                                        {cycle === 'yearly' ? `${formatINR(price)} billed once for 12 months` : `${formatINR(price)} for 1 month`}
                                        {promo ? ` · ${promo.label}` : ''}
                                    </span>
                                </div>
                                <button
                                    className={`ka-btn ka-btn-block ${plan.featured ? 'ka-btn-gold' : 'ka-btn-primary'}`}
                                    onClick={() => buy(plan)}
                                >
                                    Buy {plan.name} <ArrowRight size={18} />
                                </button>
                                <ul>
                                    {plan.features.map(f => <li key={f}><CheckCircle2 size={17} /> {f}</li>)}
                                    {plan.limits.map(l => <li key={l}><CheckCircle2 size={17} /> {l}</li>)}
                                </ul>
                            </article>
                        );
                    })}
                </div>

                <div className="ka-pay-badges">
                    <span><Lock size={16} /> Secure checkout by Razorpay</span>
                    <span><CreditCard size={16} /> UPI · cards · net banking</span>
                    <span><Zap size={16} /> Account ready right after payment</span>
                </div>
                <p className="ka-plan-foot">
                    You pay after verifying your mobile number and adding your business details.
                    See our <a href="/refund-policy">refund &amp; cancellation policy</a>.
                </p>
            </div>
        </section>
    );
}
