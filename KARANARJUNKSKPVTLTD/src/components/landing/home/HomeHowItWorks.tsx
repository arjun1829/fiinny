import { motion } from 'framer-motion';
import { UserPlus, Boxes, ScanLine, TrendingUp } from 'lucide-react';
import { home, container, eyebrow } from './tokens';

const steps = [
    {
        icon: UserPlus,
        title: 'Set up your business',
        desc: 'Create your workspace, add business details and pick your language — English, हिन्दी or मराठी.',
    },
    {
        icon: Boxes,
        title: 'Load catalogue & rates',
        desc: 'Import products, set piece and box pricing, rate sheets and opening stock across warehouses.',
    },
    {
        icon: ScanLine,
        title: 'Bill & sell',
        desc: 'Use rapid POS or B2B invoicing. Move quotations to orders, challans and invoices in the worklist.',
    },
    {
        icon: TrendingUp,
        title: 'Track & grow',
        desc: 'Watch profit, khata and GST reports update live — and let the AI Advisor flag what needs action.',
    },
];

export default function HomeHowItWorks() {
    return (
        <section style={{ background: home.color.cream, padding: '6.5rem 2rem' }}>
            <div style={container}>
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <span style={eyebrow}>How FIINNY works</span>
                    <h2 style={{
                        fontFamily: home.font.heading, fontWeight: 800, color: home.color.ink,
                        fontSize: '2.9rem', letterSpacing: '-0.03em', margin: '0.9rem 0 0.75rem',
                    }}>
                        Live in an afternoon, not a quarter
                    </h2>
                    <p style={{ fontFamily: home.font.body, color: home.color.body, fontSize: '1.15rem', maxWidth: '620px', margin: '0 auto', lineHeight: 1.6 }}>
                        No consultants, no lengthy migration. Four steps from sign-up to your first
                        compliant invoice.
                    </p>
                </div>

                <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }} className="home-steps-grid">
                    <div style={{
                        position: 'absolute', top: 34, left: '12%', right: '12%', height: 2,
                        background: `linear-gradient(to right, transparent, ${home.color.lineStrong}, transparent)`,
                    }} className="home-steps-line" />
                    {steps.map((s, i) => (
                        <motion.div
                            key={s.title}
                            initial={{ opacity: 0, y: 22 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.12, duration: 0.55 }}
                            style={{ position: 'relative', textAlign: 'center', zIndex: 1 }}
                        >
                            <div style={{
                                width: 68, height: 68, borderRadius: '50%', margin: '0 auto 1.5rem',
                                background: home.color.surface, border: `2px solid ${home.color.emerald}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: home.color.forest, boxShadow: home.shadow.card, position: 'relative',
                            }}>
                                <s.icon size={30} />
                                <span style={{
                                    position: 'absolute', top: -8, right: -8, width: 26, height: 26, borderRadius: '50%',
                                    background: home.color.gold, color: home.color.forestInk,
                                    fontFamily: home.font.heading, fontWeight: 800, fontSize: '0.8rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {i + 1}
                                </span>
                            </div>
                            <h3 style={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: '1.2rem', color: home.color.ink, margin: '0 0 0.5rem' }}>
                                {s.title}
                            </h3>
                            <p style={{ fontFamily: home.font.body, fontSize: '0.95rem', color: home.color.body, lineHeight: 1.55, margin: 0 }}>
                                {s.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
