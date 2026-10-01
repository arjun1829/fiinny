import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { home, container } from './tokens';

export default function HomeFinalCTA() {
    return (
        <section style={{ background: home.color.surface, padding: '5rem 2rem 6.5rem' }}>
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
                style={{
                    ...container, position: 'relative', overflow: 'hidden',
                    background: `radial-gradient(120% 140% at 15% 0%, ${home.color.forest}, ${home.color.forestInk})`,
                    borderRadius: home.radius.lg, padding: '4.5rem 3rem', textAlign: 'center',
                    boxShadow: home.shadow.lift,
                }}
            >
                <div style={{
                    position: 'absolute', top: '-30%', right: '-8%', width: 420, height: 420,
                    background: 'radial-gradient(circle, rgba(230,168,23,0.2), transparent 70%)', pointerEvents: 'none',
                }} />
                <h2 style={{
                    position: 'relative', fontFamily: home.font.heading, fontWeight: 800, color: '#fff',
                    fontSize: '2.8rem', letterSpacing: '-0.03em', margin: '0 0 1rem',
                }}>
                    Ready to run your business on FIINNY?
                </h2>
                <p style={{
                    position: 'relative', fontFamily: home.font.body, color: home.color.onDarkMuted,
                    fontSize: '1.2rem', lineHeight: 1.6, maxWidth: 620, margin: '0 auto 2.5rem',
                }}>
                    Set up your workspace today and issue your first GST-compliant invoice in minutes.
                    No hardware, no consultants.
                </p>
                <div style={{ position: 'relative', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link to="/login?signup=true" style={{ textDecoration: 'none' }}>
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                                background: home.color.gold, color: home.color.forestInk, border: 'none', cursor: 'pointer',
                                padding: '1.05rem 2.4rem', borderRadius: home.radius.sm,
                                fontFamily: home.font.body, fontWeight: 700, fontSize: '1.05rem',
                                boxShadow: '0 14px 34px -10px rgba(230,168,23,0.5)',
                            }}
                        >
                            Get started free <ArrowRight size={19} />
                        </motion.button>
                    </Link>
                    <Link to="/login" style={{ textDecoration: 'none' }}>
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                                background: 'rgba(255,255,255,0.08)', color: '#fff',
                                border: '1px solid rgba(234,243,236,0.3)', cursor: 'pointer',
                                padding: '1.05rem 2rem', borderRadius: home.radius.sm,
                                fontFamily: home.font.body, fontWeight: 600, fontSize: '1.05rem',
                            }}
                        >
                            Log in
                        </motion.button>
                    </Link>
                </div>
            </motion.div>
        </section>
    );
}
