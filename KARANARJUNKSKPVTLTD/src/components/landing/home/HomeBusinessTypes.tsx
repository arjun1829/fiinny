import { motion } from 'framer-motion';
import { Store, Truck, Factory, ArrowRight } from 'lucide-react';
import { home, container, eyebrow } from './tokens';

// "Who is it for" — the three roles in the trade chain. No pricing here on
// purpose; pricing lives in a single dedicated section further down the page.
const types = [
    {
        icon: Store,
        title: 'Retailers',
        blurb: 'Run the counter end to end — fast billing, credit and everyday stock.',
        highlights: ['POS & GST billing', 'Digital khata (udhaar)', 'Stock & low-stock alerts'],
    },
    {
        icon: Truck,
        title: 'Distributors',
        blurb: 'Move goods to shops with clean paperwork and stock you can trust.',
        highlights: ['PO → challan → invoice', 'Batch & expiry tracking', 'Multi-warehouse / godown'],
        featured: true,
    },
    {
        icon: Factory,
        title: 'Manufacturers',
        blurb: 'Operate at scale across companies, with insight and payments built in.',
        highlights: ['Multi-company support', 'AI Business Advisor', 'Online payment links'],
    },
];

export default function HomeBusinessTypes() {
    return (
        <section style={{ background: home.color.cream, padding: '6.5rem 2rem' }}>
            <div style={container}>
                <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
                    <span style={eyebrow}>Who it's for</span>
                    <h2 style={{
                        fontFamily: home.font.heading, fontWeight: 800, color: home.color.ink,
                        fontSize: '2.9rem', letterSpacing: '-0.03em', margin: '0.9rem 0 0.75rem',
                    }}>
                        Built for every link in the trade chain
                    </h2>
                    <p style={{
                        fontFamily: home.font.body, color: home.color.body, fontSize: '1.15rem',
                        maxWidth: '640px', margin: '0 auto', lineHeight: 1.6,
                    }}>
                        Whether you sell at the counter, supply to shops, or produce at scale — FIINNY
                        adapts to how your business actually runs.
                    </p>
                </div>

                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.75rem',
                }}>
                    {types.map((tt, i) => (
                        <motion.div
                            key={tt.title}
                            initial={{ opacity: 0, y: 26 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1, duration: 0.6 }}
                            whileHover={{ y: -8 }}
                            style={{
                                position: 'relative',
                                background: tt.featured ? `linear-gradient(160deg, ${home.color.forest}, ${home.color.forestDeep})` : home.color.surface,
                                color: tt.featured ? home.color.onDark : home.color.ink,
                                border: `1px solid ${tt.featured ? 'transparent' : home.color.line}`,
                                borderRadius: home.radius.lg, padding: '2.25rem 2rem',
                                boxShadow: tt.featured ? home.shadow.lift : home.shadow.card,
                            }}
                        >
                            <div style={{
                                width: 54, height: 54, borderRadius: home.radius.sm, marginBottom: '1.4rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: tt.featured ? 'rgba(255,255,255,0.12)' : home.color.emeraldSoft,
                                color: tt.featured ? '#7BE0A9' : home.color.forest,
                            }}>
                                <tt.icon size={28} />
                            </div>
                            <h3 style={{
                                fontFamily: home.font.heading, fontWeight: 700, fontSize: '1.5rem',
                                margin: '0 0 0.5rem', color: tt.featured ? '#fff' : home.color.ink,
                            }}>
                                {tt.title}
                            </h3>
                            <p style={{
                                fontFamily: home.font.body, fontSize: '0.98rem', lineHeight: 1.55,
                                color: tt.featured ? home.color.onDarkMuted : home.color.body, margin: '0 0 1.4rem',
                            }}>
                                {tt.blurb}
                            </p>
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.6rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                {tt.highlights.map((h) => (
                                    <li key={h} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                                        fontFamily: home.font.body, fontSize: '0.92rem',
                                        color: tt.featured ? home.color.onDark : home.color.body,
                                    }}>
                                        <span style={{
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: tt.featured ? '#7BE0A9' : home.color.emerald, flexShrink: 0,
                                        }} />
                                        {h}
                                    </li>
                                ))}
                            </ul>
                            <a href="#features" style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.45rem', textDecoration: 'none',
                                fontFamily: home.font.body, fontWeight: 700, fontSize: '0.92rem',
                                color: tt.featured ? '#7BE0A9' : home.color.forest,
                            }}>
                                See what FIINNY does <ArrowRight size={16} />
                            </a>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
