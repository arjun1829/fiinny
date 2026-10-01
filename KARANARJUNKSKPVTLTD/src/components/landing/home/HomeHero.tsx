import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, FileCheck2, Sprout } from 'lucide-react';
import { home, container } from './tokens';

const trustPoints = [
    { icon: FileCheck2, label: 'GST-ready invoicing' },
    { icon: ShieldCheck, label: 'Tenant-isolated & private' },
];

export default function HomeHero() {
    return (
        <section
            style={{
                position: 'relative',
                overflow: 'hidden',
                background: `radial-gradient(120% 120% at 80% 0%, ${home.color.forest} 0%, ${home.color.forestDeep} 45%, ${home.color.forestInk} 100%)`,
                color: home.color.onDark,
                padding: '9.5rem 2rem 6rem',
            }}
        >
            {/* soft gold glow */}
            <div style={{
                position: 'absolute', top: '-10%', right: '-5%', width: '520px', height: '520px',
                background: `radial-gradient(circle, rgba(230,168,23,0.16) 0%, transparent 70%)`, pointerEvents: 'none',
            }} />
            {/* subtle grid texture */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
                backgroundImage: `linear-gradient(rgba(234,243,236,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(234,243,236,0.04) 1px, transparent 1px)`,
                backgroundSize: '52px 52px', maskImage: 'radial-gradient(circle at 50% 20%, black, transparent 75%)',
            }} />

            <div style={{
                ...container, position: 'relative',
                display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', alignItems: 'center', gap: '4rem',
            }} className="home-hero-grid">
                <motion.div
                    initial={{ y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                >
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        background: 'rgba(230,168,23,0.14)', color: '#F5C94B',
                        border: '1px solid rgba(230,168,23,0.35)',
                        padding: '0.45rem 1rem', borderRadius: home.radius.pill,
                        fontFamily: home.font.body, fontWeight: 600, fontSize: '0.85rem', marginBottom: '1.75rem',
                    }}>
                        <Sprout size={16} /> The ERP built for India's agri-retail supply chain
                    </span>

                    <h1 style={{
                        fontFamily: home.font.heading, fontWeight: 800,
                        fontSize: '4.1rem', lineHeight: 1.05, letterSpacing: '-0.035em',
                        margin: 0, color: '#FFFFFF',
                    }}>
                        Run your entire<br />business on{' '}
                        <span style={{
                            background: `linear-gradient(120deg, ${home.color.emerald}, #7BE0A9 55%, ${home.color.gold})`,
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                        }}>
                            one platform.
                        </span>
                    </h1>

                    <p style={{
                        fontFamily: home.font.body, fontSize: '1.25rem', lineHeight: 1.6,
                        color: home.color.onDarkMuted, margin: '1.5rem 0 0', maxWidth: '540px',
                    }}>
                        FIINNY brings POS billing, GST invoicing, digital khata, inventory and
                        analytics together for retailers, distributors and manufacturers — from the
                        counter to the warehouse.
                    </p>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '2.5rem 0 1.75rem' }}>
                        <Link to="/login?signup=true" style={{ textDecoration: 'none' }}>
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                                    background: `linear-gradient(135deg, ${home.color.emerald}, ${home.color.forest})`,
                                    color: '#fff', border: 'none', cursor: 'pointer',
                                    padding: '1.05rem 2.2rem', borderRadius: home.radius.sm,
                                    fontFamily: home.font.body, fontWeight: 700, fontSize: '1.05rem',
                                    boxShadow: '0 14px 34px -10px rgba(26,158,103,0.55)',
                                }}
                            >
                                Start free <ArrowRight size={19} />
                            </motion.button>
                        </Link>
                        <Link to="/pricing" style={{ textDecoration: 'none' }}>
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                                    background: 'rgba(255,255,255,0.06)', color: '#fff',
                                    border: '1px solid rgba(234,243,236,0.28)', cursor: 'pointer',
                                    padding: '1.05rem 1.9rem', borderRadius: home.radius.sm,
                                    fontFamily: home.font.body, fontWeight: 600, fontSize: '1.05rem',
                                }}
                            >
                                View pricing
                            </motion.button>
                        </Link>
                    </div>

                    <div style={{ display: 'flex', gap: '1.75rem', flexWrap: 'wrap' }}>
                        {trustPoints.map((t) => (
                            <span key={t.label} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                                fontFamily: home.font.body, fontWeight: 600, fontSize: '0.9rem',
                                color: home.color.onDarkMuted,
                            }}>
                                <t.icon size={17} color="#7BE0A9" /> {t.label}
                            </span>
                        ))}
                    </div>
                </motion.div>

                <motion.div
                    initial={{ y: 30, opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
                    style={{ position: 'relative' }}
                >
                    <div style={{
                        position: 'absolute', inset: '-8% -4%',
                        background: 'radial-gradient(circle at 60% 40%, rgba(123,224,169,0.22), transparent 65%)',
                        pointerEvents: 'none',
                    }} />
                    <img
                        src="/premium-hero.png"
                        alt="FIINNY ERP — POS billing, GST invoicing and inventory dashboard"
                        style={{
                            position: 'relative', width: '100%', borderRadius: home.radius.lg,
                            border: '1px solid rgba(234,243,236,0.14)',
                            boxShadow: '0 40px 80px -24px rgba(0,0,0,0.55)',
                        }}
                    />
                    {/* floating stat chip */}
                    <div style={{
                        position: 'absolute', bottom: '-1.25rem', left: '-1.25rem',
                        background: home.color.surface, color: home.color.ink,
                        borderRadius: home.radius.sm, padding: '0.9rem 1.15rem',
                        boxShadow: home.shadow.lift, display: 'flex', alignItems: 'center', gap: '0.75rem',
                    }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: '50%', background: home.color.emeraldSoft,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <FileCheck2 size={20} color={home.color.forest} />
                        </div>
                        <div>
                            <div style={{ fontFamily: home.font.heading, fontWeight: 800, fontSize: '1rem', lineHeight: 1 }}>
                                GST-compliant
                            </div>
                            <div style={{ fontFamily: home.font.body, fontSize: '0.78rem', color: home.color.muted }}>
                                GSTR-1 &amp; 3B ready
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
