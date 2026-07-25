import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

// lucide-react 1.x removed all brand icons (Github, Instagram, Linkedin, Twitter).
// These inline SVGs replace them without a library dependency.
const IconInstagram = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
  </svg>
);
const IconLinkedin = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
  </svg>
);
const IconTwitter = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
  </svg>
);
const IconGithub = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
  </svg>
);

const footerLinks = [
    {
        title: "PRODUCT",
        links: [
            { name: "Features", path: "/#features" },
            { name: "Pricing", path: "/pricing" },
            { name: "Download", path: "/download" },
            { name: "Changelog", path: "/changelog" }
        ]
    },
    {
        title: "COMPANY",
        links: [
            { name: "About", path: "/about" },
            { name: "Blog", path: "/blog" },
            { name: "Privacy", path: "/privacy" },
            { name: "Terms Page", path: "/terms" }
        ]
    }
];

export default function Footer() {
    return (
        <footer style={{
            padding: '8rem 2rem 4rem',
            borderTop: '1px solid var(--surface-border)',
            maxWidth: '1200px',
            margin: '0 auto',
            width: '100%'
        }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '4rem',
                marginBottom: '6rem'
            }}>
                <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <img src="/logo.png" alt="KaranArjun Logo" style={{ width: '45px', height: '45px' }} />
                        <span style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
                            KaranArjun <span style={{ color: 'var(--primary-light)' }}>OS</span>
                        </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.7, marginBottom: '2.5rem', fontSize: '1rem' }}>
                        The complete professional operating system for Indian small retailers. Built to scale your business with privacy, speed, and intelligence.
                    </p>
                    <div style={{ display: 'flex', gap: '1.75rem' }}>
                        {[IconInstagram, IconLinkedin, IconTwitter, IconGithub].map((Icon, i) => (
                            <motion.a
                                key={i}
                                href="#"
                                whileHover={{ y: -5, color: 'var(--primary-light)' }}
                                style={{ color: 'var(--text-tertiary)', transition: 'color 0.2s' }}
                            >
                                <Icon size={22} />
                            </motion.a>
                        ))}
                    </div>
                </div>

                {footerLinks.map((column) => (
                    <div key={column.title}>
                        <h4 style={{
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            letterSpacing: '0.1em',
                            marginBottom: '2rem',
                            textTransform: 'uppercase'
                        }}>
                            {column.title}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {column.links.map((link) => (
                                <Link
                                    key={link.name}
                                    to={link.path}
                                    style={{
                                        color: 'var(--text-secondary)',
                                        textDecoration: 'none',
                                        fontSize: '0.95rem',
                                        transition: 'color 0.2s',
                                        fontWeight: 500
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.color = 'var(--primary-light)')}
                                    onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                                >
                                    {link.name}
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Cross-Brand Banner */}
            <div style={{
                marginBottom: '5rem',
                padding: '2rem 2.5rem',
                background: 'var(--surface-raised)',
                border: '1px solid var(--surface-border)',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1.5rem',
                boxShadow: 'var(--glass-shadow)'
            }}>
                <div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                        📱 Professional Tools for Bharat — <span style={{ color: 'var(--primary-light)' }}>Fiinny App</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '600px' }}>
                        Track personal spending, manage shared bills, and hit your savings goals with our award-winning mobile app. Free on iOS & Android.
                    </div>
                </div>
                <Link
                    to="/download"
                    style={{
                        background: 'var(--primary)',
                        color: 'white',
                        padding: '0.75rem 1.75rem',
                        borderRadius: '12px',
                        textDecoration: 'none',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 8px 20px -5px hsla(152, 60%, 32%, 0.4)'
                    }}
                >
                    Get the App →
                </Link>
            </div>

            <div style={{
                paddingTop: '3rem',
                borderTop: '1px solid var(--surface-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: 'var(--text-tertiary)',
                fontSize: '0.85rem',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <p>&copy; 2026 KaranArjun Pvt. Ltd. (A Fiinny Initiative). All rights reserved.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600 }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
                    Live Server Monitoring (Operational)
                </div>
            </div>
        </footer>
    );
}
