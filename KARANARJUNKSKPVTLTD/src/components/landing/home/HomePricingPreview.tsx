import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { home, container, eyebrow } from './tokens';
import { usePricingPlans } from '../../../hooks/usePricingPlans';

export default function HomePricingPreview() {
    // Prices, names, badges and top features stream from the single pricing DATA
    // source shared with /pricing — any Super Admin edit is reflected here live.
    const { plans } = usePricingPlans();

    return (
        <section id="pricing" style={{ background: home.color.surface, padding: '6.5rem 2rem' }}>
            <div style={container}>
                <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
                    <span style={eyebrow}>Simple, honest pricing</span>
                    <h2 style={{
                        fontFamily: home.font.heading, fontWeight: 800, color: home.color.ink,
                        fontSize: '2.9rem', letterSpacing: '-0.03em', margin: '0.9rem 0 0.75rem',
                    }}>
                        Pick the plan that matches your business
                    </h2>
                    <p style={{ fontFamily: home.font.body, color: home.color.body, fontSize: '1.15rem', maxWidth: '620px', margin: '0 auto', lineHeight: 1.6 }}>
                        Monthly pricing shown. Switch to yearly for a discount — full details, limits and
                        add-ons on the pricing page.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.75rem', alignItems: 'stretch' }}>
                    {plans.map((plan, i) => (
                        <motion.div
                            key={plan.id}
                            initial={{ opacity: 0, y: 26 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1, duration: 0.55 }}
                            style={{
                                position: 'relative',
                                background: plan.featured ? `linear-gradient(160deg, ${home.color.forest}, ${home.color.forestDeep})` : home.color.cream,
                                color: plan.featured ? home.color.onDark : home.color.ink,
                                border: `1px solid ${plan.featured ? 'transparent' : home.color.line}`,
                                borderRadius: home.radius.lg, padding: '2.25rem 2rem',
                                boxShadow: plan.featured ? home.shadow.lift : home.shadow.card,
                                display: 'flex', flexDirection: 'column',
                            }}
                        >
                            {plan.badge && plan.badgeVisible && (
                                <span style={{
                                    position: 'absolute', top: '1.5rem', right: '1.5rem',
                                    background: home.color.gold, color: home.color.forestInk,
                                    fontFamily: home.font.body, fontWeight: 700, fontSize: '0.72rem',
                                    padding: '0.3rem 0.75rem', borderRadius: home.radius.pill,
                                }}>
                                    {plan.badge}
                                </span>
                            )}
                            <h3 style={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: '1.4rem', margin: '0 0 0.35rem', color: plan.featured ? '#fff' : home.color.ink }}>
                                {plan.name}
                            </h3>
                            <p style={{ fontFamily: home.font.body, fontSize: '0.9rem', color: plan.featured ? home.color.onDarkMuted : home.color.muted, margin: '0 0 1.4rem' }}>
                                {plan.tagline}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginBottom: '1.6rem' }}>
                                <span style={{ fontFamily: home.font.heading, fontWeight: 800, fontSize: '2.6rem', lineHeight: 1, color: plan.featured ? '#fff' : home.color.ink }}>
                                    ₹{plan.monthlyPrice.toLocaleString('en-IN')}
                                </span>
                                <span style={{ fontFamily: home.font.body, fontSize: '0.9rem', color: plan.featured ? home.color.onDarkMuted : home.color.muted }}>
                                    /month
                                </span>
                            </div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1 }}>
                                {plan.features.slice(0, 4).map((f) => (
                                    <li key={f} style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                                        fontFamily: home.font.body, fontSize: '0.93rem',
                                        color: plan.featured ? home.color.onDark : home.color.body,
                                    }}>
                                        <Check size={17} color={plan.featured ? '#7BE0A9' : home.color.emerald} style={{ flexShrink: 0, marginTop: 2 }} />
                                        {f}
                                    </li>
                                ))}
                            </ul>
                            <Link to="/pricing" style={{ textDecoration: 'none' }}>
                                <button style={{
                                    width: '100%', cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    padding: '0.95rem', borderRadius: home.radius.sm,
                                    fontFamily: home.font.body, fontWeight: 700, fontSize: '0.98rem',
                                    border: plan.featured ? 'none' : `1px solid ${home.color.forest}`,
                                    background: plan.featured ? home.color.gold : 'transparent',
                                    color: plan.featured ? home.color.forestInk : home.color.forest,
                                }}>
                                    Choose {plan.name} <ArrowRight size={16} />
                                </button>
                            </Link>
                        </motion.div>
                    ))}
                </div>

                <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
                    <Link to="/pricing" style={{
                        fontFamily: home.font.body, fontWeight: 700, fontSize: '0.98rem',
                        color: home.color.forest, textDecoration: 'none',
                        display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                    }}>
                        Compare all plans &amp; features <ArrowRight size={16} />
                    </Link>
                </div>
            </div>
        </section>
    );
}
