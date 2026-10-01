import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { home, container, eyebrow } from './tokens';
// Imported so Vite fingerprints and bundles the asset (raw relative string
// paths from src/ are not resolved at build time).
import dashboardShot from '../../../assets/home.png';

const points = [
    'Real-time dashboards for B2B, B2C and online channels',
    'One live inventory across POS, invoicing and marketplace sync',
    'Works offline as a PWA and syncs the moment you reconnect',
];

export default function HomeShowcase() {
    return (
        <section style={{
            background: `linear-gradient(180deg, ${home.color.forestDeep}, ${home.color.forestInk})`,
            color: home.color.onDark, padding: '6.5rem 2rem', overflow: 'hidden',
        }}>
            <div style={{ ...container, textAlign: 'center', marginBottom: '3.5rem' }}>
                <span style={{ ...eyebrow, color: '#7BE0A9' }}>See it in action</span>
                <h2 style={{
                    fontFamily: home.font.heading, fontWeight: 800, color: '#fff',
                    fontSize: '2.9rem', letterSpacing: '-0.03em', margin: '0.9rem 0 0.75rem',
                }}>
                    A control room for your whole business
                </h2>
                <p style={{ fontFamily: home.font.body, color: home.color.onDarkMuted, fontSize: '1.15rem', maxWidth: '640px', margin: '0 auto', lineHeight: 1.6 }}>
                    From the billing counter to the back-office warehouse, everything reports into one
                    clean, fast interface.
                </p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                style={{ ...container, position: 'relative' }}
            >
                <div style={{
                    position: 'absolute', inset: '-6%',
                    background: 'radial-gradient(circle at 50% 30%, rgba(123,224,169,0.18), transparent 65%)',
                    pointerEvents: 'none',
                }} />
                <img
                    src={dashboardShot}
                    alt="FIINNY ERP dashboard — analytics, inventory and billing overview"
                    style={{
                        position: 'relative', width: '100%', borderRadius: home.radius.lg,
                        border: '1px solid rgba(234,243,236,0.16)',
                        boxShadow: '0 48px 90px -30px rgba(0,0,0,0.6)',
                    }}
                />
            </motion.div>

            <div style={{
                ...container, display: 'flex', justifyContent: 'center', flexWrap: 'wrap',
                gap: '1.75rem', marginTop: '2.75rem',
            }}>
                {points.map((p) => (
                    <span key={p} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                        fontFamily: home.font.body, fontSize: '0.98rem', color: home.color.onDark,
                    }}>
                        <span style={{
                            width: 24, height: 24, borderRadius: '50%', background: 'rgba(123,224,169,0.18)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <Check size={15} color="#7BE0A9" />
                        </span>
                        {p}
                    </span>
                ))}
            </div>
        </section>
    );
}
