import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, MessageCircle, ArrowRight } from 'lucide-react';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';
import { home, container, eyebrow } from '../components/landing/home/tokens';

const channels = [
    {
        icon: Mail,
        title: 'Email us',
        desc: 'For sales, support or partnership enquiries.',
        action: 'support@fiinny.com',
        href: 'mailto:support@fiinny.com',
    },
    {
        icon: MessageCircle,
        title: 'WhatsApp',
        desc: 'Chat with our team during business hours.',
        action: 'Start a chat',
        href: 'https://wa.me/919999999999',
    },
    {
        icon: Phone,
        title: 'Call us',
        desc: 'Mon–Sat, 10am – 7pm IST.',
        action: '+91 99999 99999',
        href: 'tel:+919999999999',
    },
];

export default function ContactPage() {
    return (
        <div style={{
            background: home.color.cream,
            color: home.color.ink,
            fontFamily: home.font.body,
            minHeight: '100vh',
            overflowX: 'hidden',
        }}>
            <Navbar />

            <main>
                {/* Hero */}
                <section style={{
                    background: `radial-gradient(120% 120% at 80% 0%, ${home.color.forest} 0%, ${home.color.forestDeep} 45%, ${home.color.forestInk} 100%)`,
                    color: home.color.onDark,
                    padding: '6rem 2rem 5rem',
                }}>
                    <div style={{ ...container, textAlign: 'center', maxWidth: 760 }}>
                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, ease: 'easeOut' }}
                        >
                            <span style={{ ...eyebrow, color: home.color.gold }}>Contact us</span>
                            <h1 style={{
                                fontFamily: home.font.heading, fontWeight: 800,
                                fontSize: '3.2rem', letterSpacing: '-0.03em',
                                margin: '0.9rem 0 1rem', lineHeight: 1.1,
                            }}>
                                We’d love to hear from you
                            </h1>
                            <p style={{
                                color: home.color.onDarkMuted, fontSize: '1.2rem',
                                lineHeight: 1.6, maxWidth: 560, margin: '0 auto',
                            }}>
                                Questions about FIINNY, pricing or migrating your shop? Reach out
                                through whichever channel is easiest for you.
                            </p>
                        </motion.div>
                    </div>
                </section>

                {/* Channels */}
                <section style={{ padding: '5rem 2rem 7rem' }}>
                    <div style={{
                        ...container,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '1.5rem',
                    }}>
                        {channels.map((c, i) => (
                            <motion.a
                                key={c.title}
                                href={c.href}
                                target={c.href.startsWith('http') ? '_blank' : undefined}
                                rel={c.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                                initial={{ opacity: 0, y: 26 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1, duration: 0.55 }}
                                style={{
                                    textDecoration: 'none',
                                    background: home.color.surface,
                                    border: `1px solid ${home.color.line}`,
                                    borderRadius: home.radius.lg,
                                    padding: '2.1rem 2rem',
                                    boxShadow: home.shadow.card,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = home.shadow.soft;
                                    e.currentTarget.style.borderColor = home.color.emerald;
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = home.shadow.card;
                                    e.currentTarget.style.borderColor = home.color.line;
                                }}
                            >
                                <div style={{
                                    width: 52, height: 52, borderRadius: home.radius.sm, marginBottom: '1.2rem',
                                    background: home.color.emeraldSoft, color: home.color.forest,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <c.icon size={26} />
                                </div>
                                <h3 style={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: '1.25rem', color: home.color.ink, margin: '0 0 0.5rem' }}>
                                    {c.title}
                                </h3>
                                <p style={{ fontSize: '0.96rem', color: home.color.body, lineHeight: 1.6, margin: '0 0 1.25rem' }}>
                                    {c.desc}
                                </p>
                                <span style={{
                                    marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                    color: home.color.forest, fontWeight: 700, fontSize: '0.95rem',
                                }}>
                                    {c.action} <ArrowRight size={16} />
                                </span>
                            </motion.a>
                        ))}
                    </div>

                    {/* Office */}
                    <div style={{
                        ...container,
                        marginTop: '2.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        color: home.color.body,
                        fontSize: '1rem',
                        justifyContent: 'center',
                        textAlign: 'center',
                    }}>
                        <MapPin size={20} style={{ color: home.color.emerald, flexShrink: 0 }} />
                        <span>KARAN ARJUN KSK PVT LTD · Maharashtra, India</span>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}
