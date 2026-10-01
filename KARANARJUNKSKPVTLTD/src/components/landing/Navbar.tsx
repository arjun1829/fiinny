import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { home } from './home/tokens';

// Company dropdown destinations. Careers reuses the existing /careers route/page.
const companyLinks = [
    { label: 'About FIINNY', to: '/about' },
    { label: 'Careers', to: '/careers' },
    { label: 'Contact Us', to: '/contact' },
];

// Single-page section anchors (smooth-scroll on the landing page).
const sectionLinks = [
    { label: 'Features', id: 'features' },
    { label: 'Pricing', id: 'pricing' },
];

export default function Navbar() {
    const { currentUser } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [companyOpen, setCompanyOpen] = useState(false);
    const companyCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const onLanding = location.pathname === '/';
    const companyActive = companyLinks.some(l => l.to === location.pathname);

    // Elevate the bar with a subtle shadow once the page is scrolled.
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Close menus on route change.
    useEffect(() => {
        setMobileOpen(false);
        setCompanyOpen(false);
    }, [location.pathname]);

    // Smooth-scroll to a section when already on the landing page; otherwise let
    // the browser navigate to /#id (native hash jump on load). Keeps LandingPage
    // untouched.
    const handleSection = (e: React.MouseEvent, id: string) => {
        if (onLanding) {
            e.preventDefault();
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
            setMobileOpen(false);
        }
    };

    const openCompany = () => {
        if (companyCloseTimer.current) clearTimeout(companyCloseTimer.current);
        setCompanyOpen(true);
    };
    const scheduleCloseCompany = () => {
        companyCloseTimer.current = setTimeout(() => setCompanyOpen(false), 140);
    };

    const linkBase: React.CSSProperties = {
        color: home.color.body,
        textDecoration: 'none',
        fontFamily: home.font.body,
        fontSize: '0.95rem',
        fontWeight: 600,
        letterSpacing: '-0.01em',
        transition: 'color 0.18s ease',
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
    };

    return (
        <header
            style={{
                position: 'sticky',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1000,
                width: '100%',
                background: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderBottom: `1px solid ${home.color.line}`,
                boxShadow: scrolled ? home.shadow.card : 'none',
                transition: 'box-shadow 0.25s ease',
            }}
        >
            <div
                style={{
                    maxWidth: home.maxW,
                    margin: '0 auto',
                    width: '100%',
                    height: '72px',
                    padding: '0 2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1.5rem',
                }}
            >
                {/* Brand */}
                <Link
                    to="/"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.7rem', flexShrink: 0 }}
                >
                    <img src="/logo.png" alt="Fiinny logo" style={{ width: 34, height: 34 }} />
                    <span
                        style={{
                            fontFamily: home.font.heading,
                            fontSize: '1.3rem',
                            fontWeight: 800,
                            letterSpacing: '-0.03em',
                            color: home.color.ink,
                        }}
                    >
                        Fiinny <span style={{ color: home.color.forest }}>Business</span>
                    </span>
                </Link>

                {/* Desktop nav */}
                <nav className="home-nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    {sectionLinks.map(item => (
                        <a
                            key={item.id}
                            href={`/#${item.id}`}
                            onClick={e => handleSection(e, item.id)}
                            style={linkBase}
                            onMouseEnter={e => (e.currentTarget.style.color = home.color.forest)}
                            onMouseLeave={e => (e.currentTarget.style.color = home.color.body)}
                        >
                            {item.label}
                        </a>
                    ))}

                    {/* Company dropdown */}
                    <div
                        style={{ position: 'relative' }}
                        onMouseEnter={openCompany}
                        onMouseLeave={scheduleCloseCompany}
                    >
                        <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={companyOpen}
                            onClick={() => setCompanyOpen(v => !v)}
                            style={{
                                ...linkBase,
                                color: companyActive || companyOpen ? home.color.forest : home.color.body,
                            }}
                        >
                            Company
                            <ChevronDown
                                size={16}
                                style={{ transition: 'transform 0.2s ease', transform: companyOpen ? 'rotate(180deg)' : 'none' }}
                            />
                        </button>

                        {companyOpen && (
                            <div
                                role="menu"
                                style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 0.9rem)',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    minWidth: 200,
                                    background: home.color.surface,
                                    border: `1px solid ${home.color.line}`,
                                    borderRadius: home.radius.md,
                                    boxShadow: home.shadow.soft,
                                    padding: '0.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}
                            >
                                {companyLinks.map(link => {
                                    const active = location.pathname === link.to;
                                    return (
                                        <Link
                                            key={link.to}
                                            to={link.to}
                                            role="menuitem"
                                            style={{
                                                textDecoration: 'none',
                                                fontFamily: home.font.body,
                                                fontSize: '0.92rem',
                                                fontWeight: 600,
                                                color: active ? home.color.forest : home.color.body,
                                                background: active ? home.color.emeraldSoft : 'transparent',
                                                padding: '0.6rem 0.85rem',
                                                borderRadius: home.radius.sm,
                                                transition: 'background 0.15s ease, color 0.15s ease',
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.background = home.color.emeraldSoft;
                                                e.currentTarget.style.color = home.color.forest;
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = active ? home.color.emeraldSoft : 'transparent';
                                                e.currentTarget.style.color = active ? home.color.forest : home.color.body;
                                            }}
                                        >
                                            {link.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </nav>

                {/* Desktop actions */}
                <div className="home-nav-actions-desktop" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexShrink: 0 }}>
                    {!currentUser && (
                        <Link
                            to="/login"
                            style={{ ...linkBase }}
                            onMouseEnter={e => (e.currentTarget.style.color = home.color.forest)}
                            onMouseLeave={e => (e.currentTarget.style.color = home.color.body)}
                        >
                            Login
                        </Link>
                    )}
                    <Link
                        to={currentUser ? '/dashboard' : '/login?signup=true'}
                        style={{
                            textDecoration: 'none',
                            background: home.color.forest,
                            color: home.color.onDark,
                            fontFamily: home.font.body,
                            fontWeight: 700,
                            fontSize: '0.92rem',
                            padding: '0.6rem 1.35rem',
                            borderRadius: home.radius.pill,
                            whiteSpace: 'nowrap',
                            transition: 'background 0.18s ease, transform 0.18s ease',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = home.color.emerald;
                            e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = home.color.forest;
                            e.currentTarget.style.transform = 'none';
                        }}
                    >
                        {currentUser ? 'Console →' : 'Start Free →'}
                    </Link>
                </div>

                {/* Hamburger */}
                <button
                    type="button"
                    aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={mobileOpen}
                    onClick={() => setMobileOpen(v => !v)}
                    className="home-nav-hamburger"
                    style={{
                        display: 'none',
                        background: 'none',
                        border: `1px solid ${home.color.line}`,
                        borderRadius: home.radius.sm,
                        padding: '0.5rem',
                        color: home.color.ink,
                        cursor: 'pointer',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {mobileOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
            </div>

            {/* Mobile panel */}
            {mobileOpen && (
                <div
                    className="home-nav-mobile"
                    style={{
                        display: 'none',
                        borderTop: `1px solid ${home.color.line}`,
                        background: home.color.surface,
                        padding: '1rem 1.5rem 1.5rem',
                        flexDirection: 'column',
                        gap: '0.25rem',
                    }}
                >
                    {sectionLinks.map(item => (
                        <a
                            key={item.id}
                            href={`/#${item.id}`}
                            onClick={e => handleSection(e, item.id)}
                            style={{ ...linkBase, padding: '0.85rem 0.25rem', fontSize: '1.05rem' }}
                        >
                            {item.label}
                        </a>
                    ))}

                    <div style={{ padding: '0.85rem 0.25rem 0.35rem', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: home.color.muted }}>
                        Company
                    </div>
                    {companyLinks.map(link => {
                        const active = location.pathname === link.to;
                        return (
                            <Link
                                key={link.to}
                                to={link.to}
                                style={{
                                    textDecoration: 'none',
                                    fontFamily: home.font.body,
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    color: active ? home.color.forest : home.color.body,
                                    padding: '0.7rem 0.75rem',
                                    borderRadius: home.radius.sm,
                                    background: active ? home.color.emeraldSoft : 'transparent',
                                }}
                            >
                                {link.label}
                            </Link>
                        );
                    })}

                    <div style={{ height: 1, background: home.color.line, margin: '0.85rem 0' }} />

                    {!currentUser && (
                        <Link
                            to="/login"
                            style={{ ...linkBase, padding: '0.85rem 0.25rem', fontSize: '1.05rem' }}
                        >
                            Login
                        </Link>
                    )}
                    <Link
                        to={currentUser ? '/dashboard' : '/login?signup=true'}
                        style={{
                            textDecoration: 'none',
                            textAlign: 'center',
                            background: home.color.forest,
                            color: home.color.onDark,
                            fontFamily: home.font.body,
                            fontWeight: 700,
                            fontSize: '1rem',
                            padding: '0.85rem 1.35rem',
                            borderRadius: home.radius.pill,
                            marginTop: '0.4rem',
                        }}
                    >
                        {currentUser ? 'Console →' : 'Start Free →'}
                    </Link>
                </div>
            )}
        </header>
    );
}
