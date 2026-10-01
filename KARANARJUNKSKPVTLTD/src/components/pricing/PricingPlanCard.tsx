import type { ReactNode } from 'react';
import { Check, Building2, Zap, Rocket, Crown, Tag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { home } from '../landing/home/tokens';
import { computeSavingsPct } from '../../utils/subscriptionPlans';
import { discountedRupees, formatRupees } from '../../utils/planPromotions';
import type { PricingPlan } from '../../hooks/usePricingPlans';

/**
 * The single, shared customer-facing plan card in the marketing (cream/forest)
 * design language. Rendered identically by:
 *   • the public `/pricing` page, and
 *   • the Super Admin "Live preview · /pricing".
 *
 * It owns ONLY presentation (layout, spacing, typography, borders, radius,
 * badges, price + promotion display, feature/limit list). The DATA is a
 * `PricingPlan` from the shared pricing catalogue, and the action area (subscribe
 * button / current-plan pill / disabled preview button) is injected via
 * `children` so each surface keeps its own behaviour without duplicating the card.
 */

// Per-tier icon (visual only, keyed by the shared pricing-tier id).
const TIER_ICON: Record<PricingPlan['id'], LucideIcon> = {
    starter: Zap,
    growth: Rocket,
    pro: Crown,
};

interface PricingPlanCardProps {
    plan: PricingPlan;
    cycle: 'monthly' | 'yearly';
    /** Active promotion percentage for this plan+cycle (0 = none). */
    promoPct?: number;
    /** Optional promotion label shown on the discount ribbon. */
    promoLabel?: string;
    /** Localises known badge text; defaults to identity (verbatim). */
    badgeLabel?: (badge: string) => string;
    /** The action area rendered flush at the bottom (CTA button / current pill). */
    children?: ReactNode;
}

export default function PricingPlanCard({
    plan,
    cycle,
    promoPct = 0,
    promoLabel,
    badgeLabel = (b) => b,
    children,
}: PricingPlanCardProps) {
    const featured = plan.featured;
    const Icon = TIER_ICON[plan.id] ?? Zap;
    const showBadge = !!plan.badge && plan.badgeVisible !== false;

    const price = cycle === 'yearly' ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice;
    const savings = computeSavingsPct(plan.monthlyPrice, plan.yearlyPrice);
    const savingsText = plan.savingsLabel || (savings > 0 ? `Save ${savings}% vs monthly` : '');

    // Promotion applied on top of the base price for the selected cycle.
    const pct = promoPct;
    const baseCharged = cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
    const discCharged = pct ? discountedRupees(baseCharged, pct) : baseCharged;
    const origPerMo = cycle === 'yearly' ? plan.yearlyPrice / 12 : plan.monthlyPrice;
    const discPerMo = cycle === 'yearly' ? discCharged / 12 : discCharged;

    // Palette split: the featured card is forest-green with light text; the rest
    // are cream with dark ink (mirrors the landing preview).
    const ink = featured ? '#fff' : home.color.ink;
    const bodyColor = featured ? home.color.onDark : home.color.body;
    const mutedColor = featured ? home.color.onDarkMuted : home.color.muted;
    const checkColor = featured ? '#7BE0A9' : home.color.emerald;

    return (
        <div
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                background: featured
                    ? `linear-gradient(160deg, ${home.color.forest}, ${home.color.forestDeep})`
                    : home.color.surface,
                color: ink,
                border: `1px solid ${featured ? 'transparent' : home.color.line}`,
                borderRadius: home.radius.lg,
                padding: '2.25rem 2rem',
                boxShadow: featured ? home.shadow.lift : home.shadow.card,
            }}
        >
            {/* Badge */}
            {showBadge && (
                <span style={{
                    position: 'absolute', top: '1.5rem', right: '1.5rem',
                    background: home.color.gold, color: home.color.forestInk,
                    fontFamily: home.font.body, fontWeight: 700, fontSize: '0.72rem',
                    padding: '0.3rem 0.75rem', borderRadius: home.radius.pill,
                }}>
                    {badgeLabel(plan.badge!)}
                </span>
            )}

            {/* Plan header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{
                    width: 44, height: 44, borderRadius: home.radius.sm,
                    background: featured ? 'rgba(255,255,255,0.14)' : home.color.emeraldSoft,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: featured ? '#fff' : home.color.forest, flexShrink: 0,
                }}>
                    <Icon size={22} />
                </div>
                <div>
                    <h3 style={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: '1.4rem', margin: 0, color: ink }}>{plan.name}</h3>
                    <p style={{ fontFamily: home.font.body, fontSize: '0.88rem', color: mutedColor, margin: '0.1rem 0 0' }}>{plan.tagline}</p>
                </div>
            </div>

            {/* Promotion ribbon — shown only when a promotion applies */}
            {pct > 0 && (
                <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '0.35rem', marginTop: '0.9rem', padding: '0.25rem 0.65rem', background: home.color.gold, color: home.color.forestInk, borderRadius: '8px', fontSize: '0.74rem', fontWeight: 800 }}>
                    <Tag size={12} /> {pct}% OFF{promoLabel ? ` · ${promoLabel}` : ''}
                </div>
            )}

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem', marginTop: '1.4rem' }}>
                <span style={{ fontFamily: home.font.heading, fontWeight: 800, fontSize: '2.7rem', lineHeight: 1, color: featured ? '#fff' : home.color.forest }}>₹{formatRupees(pct > 0 ? discPerMo : price)}</span>
                {pct > 0 && (
                    <span style={{ color: mutedColor, fontSize: '1.1rem', textDecoration: 'line-through', marginBottom: '0.35rem' }}>
                        ₹{formatRupees(origPerMo)}
                    </span>
                )}
                <span style={{ color: mutedColor, fontSize: '0.9rem', marginBottom: '0.4rem' }}>/mo</span>
            </div>
            {cycle === 'yearly' ? (
                <div style={{ fontSize: '0.8rem', color: mutedColor, marginTop: '0.35rem' }}>
                    {pct > 0 ? (
                        <>
                            <span style={{ fontWeight: 700 }}>₹{formatRupees(discCharged)}/yr</span>{' '}
                            <span style={{ textDecoration: 'line-through' }}>₹{plan.yearlyPrice.toLocaleString('en-IN')}</span>
                        </>
                    ) : (
                        <>₹{plan.yearlyPrice.toLocaleString('en-IN')}/yr{savingsText ? ` · ${savingsText}` : ''}</>
                    )}
                </div>
            ) : pct > 0 && (
                <div style={{ fontSize: '0.8rem', color: mutedColor, marginTop: '0.35rem' }}>
                    Was ₹{plan.monthlyPrice.toLocaleString('en-IN')}/mo · you save {pct}%
                </div>
            )}

            {/* Features + limits — flex:1 keeps every CTA aligned at the bottom */}
            <ul style={{ listStyle: 'none', padding: 0, margin: '1.6rem 0 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                {plan.features.map((f, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontFamily: home.font.body, fontSize: '0.92rem', color: bodyColor }}>
                        <Check size={17} style={{ color: checkColor, flexShrink: 0, marginTop: '0.15rem' }} />
                        <span>{f}</span>
                    </li>
                ))}
                {plan.limits.map((l, i) => (
                    <li key={`lim-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontFamily: home.font.body, fontSize: '0.92rem', color: mutedColor }}>
                        <Building2 size={17} style={{ color: mutedColor, flexShrink: 0, marginTop: '0.15rem' }} />
                        <span>{l}</span>
                    </li>
                ))}
            </ul>

            {children}
        </div>
    );
}
