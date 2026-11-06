import { Link } from 'react-router-dom';
import KaPage from '../components/landing/ka/KaPage';
import { usePageJsonLd } from '../hooks/useSeo';
import { BRAND } from '../utils/brand';
import { SEO_ROUTES, type SeoKind, type SeoLang } from '../data/seoRoutes';

const GROUPS: { title: string; match: (k: SeoKind, l: SeoLang) => boolean }[] = [
    { title: 'Software for your kind of shop', match: (k, l) => k === 'shop' && l === 'en' },
    { title: 'Features', match: (k, l) => k === 'feature' && l === 'en' },
    { title: 'Guides for agri-input retailers', match: k => k === 'guide' },
    { title: 'Comparisons', match: k => k === 'compare' },
    { title: 'मराठीत वाचा', match: (_k, l) => l === 'mr' },
    { title: 'हिन्दी में पढ़ें', match: (_k, l) => l === 'hi' },
];

/** Hub linking every search-landing page, so each is two clicks from home. */
export default function ResourcesPage() {
    usePageJsonLd('/resources', [{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `Guides & software for agri-input retailers — ${BRAND.name}`,
        url: `${BRAND.url}/resources`,
        hasPart: SEO_ROUTES.map(r => ({ '@type': 'WebPage', name: r.label, url: `${BRAND.url}${r.path}`, inLanguage: `${r.lang}-IN` })),
    }]);

    return (
        <KaPage>
            <section className="ka-hero" style={{ padding: '48px 0 32px' }}>
                <div className="ka-container ka-narrow" style={{ display: 'grid', gap: 14 }}>
                    <span className="ka-eyebrow">Resources</span>
                    <h1 style={{ fontSize: 'clamp(2.1rem, 4.6vw, 3rem)', margin: 0 }}>Guides and software for agri-input retailers</h1>
                    <p className="ka-lead">GST rates, dealer records, udhaar and honest comparisons for fertilizer, pesticide and seed shops. In English, मराठी and हिन्दी.</p>
                </div>
            </section>
            {GROUPS.map(g => {
                const items = SEO_ROUTES.filter(r => g.match(r.kind, r.lang));
                if (!items.length) return null;
                return (
                    <section className="ka-section-tight" key={g.title} style={{ paddingTop: 12 }}>
                        <div className="ka-container">
                            <h2 className="ka-h2" style={{ fontSize: '1.5rem', marginBottom: 16 }}>{g.title}</h2>
                            <div className="ka-grid-3">
                                {items.map(r => (
                                    <Link key={r.path} to={r.path} className="ka-contact-card" hrefLang={r.lang}>
                                        <b>{r.label}</b>
                                        <span>{r.description}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </section>
                );
            })}
        </KaPage>
    );
}
