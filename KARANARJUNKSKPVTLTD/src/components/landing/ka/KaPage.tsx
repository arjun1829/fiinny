import type { ReactNode } from 'react';
import KaNav from './KaNav';
import KaFooter from './KaFooter';
import '../../../styles/ka-marketing.css';

/** Shell for public content pages (About, Contact, legal): same nav and footer as the landing page. */
export default function KaPage({ children }: { children: ReactNode }) {
    return (
        <div className="ka">
            <KaNav announce={false} />
            <main>{children}</main>
            <KaFooter />
        </div>
    );
}

/** Long-form legal / policy page body. */
export function KaDoc({ title, updated, intro, children }: { title: string; updated: string; intro?: ReactNode; children: ReactNode }) {
    return (
        <>
            <section className="ka-hero" style={{ padding: '48px 0 36px' }}>
                <div className="ka-container ka-narrow" style={{ display: 'grid', gap: 12 }}>
                    <span className="ka-eyebrow">Legal</span>
                    <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', margin: 0 }}>{title}</h1>
                    <p style={{ color: 'var(--ka-muted)' }}>Last updated {updated}</p>
                    {intro && <p className="ka-lead">{intro}</p>}
                </div>
            </section>
            <section className="ka-section-tight">
                <div className="ka-container ka-narrow ka-doc">{children}</div>
            </section>
        </>
    );
}
