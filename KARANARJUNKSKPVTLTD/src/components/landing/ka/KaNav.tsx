import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

/** Top bar for every public KaranArjun ERP page. */
export default function KaNav({ announce = true }: { announce?: boolean }) {
    const { currentUser } = useAuth();
    const [open, setOpen] = useState(false);
    const links = [
        { href: '/#features', label: 'Features' },
        { href: '/#pricing', label: 'Pricing' },
        { href: '/#how', label: 'How it works' },
        { href: '/about', label: 'About' },
        { href: '/contact', label: 'Contact' },
    ];

    return (
        <>
            {announce && (
                <div className="ka-announce">
                    Rabi season rush is here. <strong>Get billing, khata and stock in order</strong> before the counter gets busy.
                </div>
            )}
            <header className="ka-nav">
                <div className="ka-container ka-nav-inner">
                    <Link to="/" className="ka-brand" aria-label="KaranArjun ERP home">
                        <img src="/logo.png" alt="" width={36} height={36} />
                        <span className="ka-brand-name">KaranArjun <span>ERP</span></span>
                    </Link>
                    <nav className="ka-nav-links" aria-label="Main">
                        {links.map(l => <a key={l.href} href={l.href}>{l.label}</a>)}
                    </nav>
                    <div className="ka-nav-cta">
                        {currentUser ? (
                            <Link to="/dashboard" className="ka-btn ka-btn-primary ka-btn-sm">Open ERP →</Link>
                        ) : (
                            <>
                                <Link to="/login" className="ka-nav-login">Log in</Link>
                                <a href="/#pricing" className="ka-btn ka-btn-primary ka-btn-sm">Buy now</a>
                            </>
                        )}
                        <button className="ka-menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(o => !o)}>
                            {open ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>
                <div className={`ka-mobile-menu${open ? ' open' : ''}`}>
                    {links.map(l => <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>)}
                    {!currentUser && <Link to="/login" onClick={() => setOpen(false)}>Log in</Link>}
                </div>
            </header>
        </>
    );
}
