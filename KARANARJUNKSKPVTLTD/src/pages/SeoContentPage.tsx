import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronRight, MessageCircle } from 'lucide-react';
import KaPage from '../components/landing/ka/KaPage';
import { usePageJsonLd } from '../hooks/useSeo';
import { usePricingPlans } from '../hooks/usePricingPlans';
import { BRAND, whatsappLink } from '../utils/brand';
import { formatINR } from '../utils/pendingPlan';
import { findSeoRoute, SEO_ROUTES, type SeoLang } from '../data/seoRoutes';
import { SEO_CONTENT } from '../data/seoContent';

// Button and label text for the three page languages. The marketing shell
// (nav/footer) stays English; the page body is in the page's language.
const UI: Record<SeoLang, {
    home: string; guides: string; seePlans: string; demo: string; plansFrom: (p: string) => string;
    perMonth: string; faq: string; related: string; updated: string; sources: string; readIn: string;
    ctaTitle: string; ctaBody: string;
}> = {
    en: {
        home: 'Home', guides: 'Guides', seePlans: 'See plans & buy', demo: 'Get a demo on WhatsApp',
        plansFrom: p => `Plans from ${p}/month`, perMonth: '/month', faq: 'Common questions', related: 'Read next',
        updated: 'Last checked', sources: 'Sources', readIn: 'Read in',
        ctaTitle: 'Run your agri shop on software made for it.',
        ctaBody: 'Verify your mobile, add your shop and print your first GST bill the same day.',
    },
    mr: {
        home: 'मुख्यपृष्ठ', guides: 'मार्गदर्शक', seePlans: 'प्लॅन पहा व खरेदी करा', demo: 'WhatsApp वर डेमो घ्या',
        plansFrom: p => `प्लॅन ${p}/महिना पासून`, perMonth: '/महिना', faq: 'नेहमीचे प्रश्न', related: 'हेही वाचा',
        updated: 'शेवटची तपासणी', sources: 'संदर्भ', readIn: 'या भाषेत वाचा',
        ctaTitle: 'तुमचे कृषी दुकान त्यासाठीच बनलेल्या सॉफ्टवेअरवर चालवा.',
        ctaBody: 'मोबाईल नंबर पडताळा, दुकानाची माहिती भरा आणि त्याच दिवशी पहिले GST बिल छापा.',
    },
    hi: {
        home: 'होम', guides: 'गाइड', seePlans: 'प्लान देखें और खरीदें', demo: 'WhatsApp पर डेमो लें',
        plansFrom: p => `प्लान ${p}/महीना से`, perMonth: '/महीना', faq: 'अक्सर पूछे जाने वाले सवाल', related: 'यह भी पढ़ें',
        updated: 'आखिरी जाँच', sources: 'स्रोत', readIn: 'इस भाषा में पढ़ें',
        ctaTitle: 'अपनी कृषि दुकान उसी के लिए बने सॉफ्टवेयर पर चलाएँ।',
        ctaBody: 'मोबाइल नंबर सत्यापित करें, दुकान की जानकारी भरें और उसी दिन पहला GST बिल छापें।',
    },
};

const LANG_NAME: Record<SeoLang, string> = { en: 'English', mr: 'मराठी', hi: 'हिन्दी' };

export default function SeoContentPage() {
    const { pathname } = useLocation();
    const route = findSeoRoute(pathname);
    const content = route ? SEO_CONTENT[route.path] : undefined;
    const { plans } = usePricingPlans();
    const starter = plans.find(p => p.id === 'starter');

    // Language of the page body for screen readers and search engines, plus
    // hreflang links between the English / Marathi / Hindi versions.
    useEffect(() => {
        if (!route) return;
        const prevLang = document.documentElement.lang;
        document.documentElement.lang = route.lang === 'en' ? 'en-IN' : `${route.lang}-IN`;
        const versions: Partial<Record<SeoLang, string>> = { [route.lang]: route.path, ...(route.alternates ?? {}) };
        const links = Object.keys(versions).length > 1
            ? (Object.entries(versions) as [SeoLang, string][]).map(([lang, path]) => {
                const l = document.createElement('link');
                l.rel = 'alternate';
                l.hreflang = lang === 'en' ? 'en-IN' : `${lang}-IN`;
                l.href = `${BRAND.url}${path}`;
                document.head.appendChild(l);
                return l;
            })
            : [];
        return () => {
            document.documentElement.lang = prevLang || 'en';
            links.forEach(l => l.remove());
        };
    }, [route]);

    const crumbs = route ? [
        { name: UI[route.lang].home, path: '/' },
        { name: UI[route.lang].guides, path: '/resources' },
        { name: route.label, path: route.path },
    ] : [];

    usePageJsonLd(route?.path ?? pathname, route && content ? [
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${BRAND.url}${c.path === '/' ? '/' : c.path}` })),
        },
        {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            inLanguage: route.lang === 'en' ? 'en-IN' : `${route.lang}-IN`,
            mainEntity: content.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
        },
        ...(route.kind === 'guide' ? [{
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: content.h1,
            description: route.description,
            inLanguage: 'en-IN',
            dateModified: '2026-11-06',
            author: { '@type': 'Organization', name: BRAND.company },
            publisher: { '@type': 'Organization', name: BRAND.company, logo: { '@type': 'ImageObject', url: `${BRAND.url}/logo.png` } },
            mainEntityOfPage: `${BRAND.url}${route.path}`,
        }] : []),
    ] : []);

    if (!route || !content) return <Navigate to="/" replace />;
    const t = UI[route.lang];
    const related = content.related.map(p => SEO_ROUTES.find(r => r.path === p)).filter(Boolean) as typeof SEO_ROUTES;
    const alternates = route.alternates ? (Object.entries(route.alternates) as [SeoLang, string][]) : [];

    return (
        <KaPage>
            <section className="ka-hero" style={{ padding: '36px 0 56px' }}>
                <div className="ka-container ka-narrow" style={{ display: 'grid', gap: 16 }}>
                    <nav aria-label="Breadcrumb" className="ka-crumbs">
                        {crumbs.map((c, i) => (
                            <span key={c.path}>
                                {i < crumbs.length - 1 ? <Link to={c.path}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
                                {i < crumbs.length - 1 && <ChevronRight size={14} />}
                            </span>
                        ))}
                    </nav>
                    <span className="ka-pill" style={{ justifySelf: 'start' }}>{content.eyebrow}</span>
                    <h1 style={{ fontSize: 'clamp(2.1rem, 4.6vw, 3.2rem)', margin: 0 }}>{content.h1}</h1>
                    <p className="ka-lead">{content.intro}</p>
                    {content.updated && <p style={{ color: 'var(--ka-muted)', fontSize: '0.9rem' }}>{t.updated}: {content.updated}</p>}
                    <div className="ka-hero-ctas">
                        <a href="/#pricing" className="ka-btn ka-btn-primary">{t.seePlans} <ArrowRight size={18} /></a>
                        <a href={whatsappLink(`Hi, I want a demo of ${BRAND.name} for my agri shop.`)} target="_blank" rel="noopener noreferrer" className="ka-btn ka-btn-ghost">
                            <MessageCircle size={18} /> {t.demo}
                        </a>
                    </div>
                    {starter && <p className="ka-hero-note">{t.plansFrom(formatINR(starter.monthlyPrice))}</p>}
                    {alternates.length > 0 && (
                        <p className="ka-hero-note">
                            {t.readIn}:{' '}
                            {alternates.map(([lang, path], i) => (
                                <span key={lang}>{i > 0 && ' · '}<Link to={path} hrefLang={lang}>{LANG_NAME[lang]}</Link></span>
                            ))}
                        </p>
                    )}
                </div>
            </section>

            <section className="ka-section-tight">
                <article className="ka-container ka-narrow ka-doc">
                    {content.sections.map(s => (
                        <section key={s.h} style={{ display: 'grid', gap: 12 }}>
                            <h2>{s.h}</h2>
                            {s.p?.map(p => <p key={p.slice(0, 40)}>{p}</p>)}
                            {s.ul && (
                                <ul className="ka-ticks">
                                    {s.ul.map(li => <li key={li}><CheckCircle2 size={18} /> <span>{li}</span></li>)}
                                </ul>
                            )}
                            {s.table && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table>
                                        <thead><tr>{s.table.head.map(h => <th key={h || 'blank'}>{h}</th>)}</tr></thead>
                                        <tbody>{s.table.rows.map(r => <tr key={r[0]}>{r.map((c, i) => i === 0 ? <th key={i} scope="row" style={{ background: 'transparent', color: 'var(--ka-ink)' }}>{c}</th> : <td key={i}>{c}</td>)}</tr>)}</tbody>
                                    </table>
                                </div>
                            )}
                            {s.note && <p className="ka-note">{s.note}</p>}
                        </section>
                    ))}

                    <section style={{ display: 'grid', gap: 12 }}>
                        <h2>{t.faq}</h2>
                        <div className="ka-faq">
                            {content.faqs.map(f => (
                                <details key={f.q}>
                                    <summary>{f.q}</summary>
                                    <p>{f.a}</p>
                                </details>
                            ))}
                        </div>
                    </section>

                    {content.sources && (
                        <section style={{ display: 'grid', gap: 8 }}>
                            <h2 style={{ fontSize: '1.05rem' }}>{t.sources}</h2>
                            <ul>
                                {content.sources.map(s => (
                                    <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.label}</a></li>
                                ))}
                            </ul>
                        </section>
                    )}
                </article>
            </section>

            {related.length > 0 && (
                <section className="ka-section-tight">
                    <div className="ka-container">
                        <h2 className="ka-h2" style={{ fontSize: '1.6rem', marginBottom: 18 }}>{t.related}</h2>
                        <div className="ka-grid-2">
                            {related.map(r => (
                                <Link key={r.path} to={r.path} className="ka-contact-card" hrefLang={r.lang}>
                                    <small>{r.kind === 'guide' ? 'Guide' : r.kind === 'compare' ? 'Comparison' : LANG_NAME[r.lang]}</small>
                                    <b>{r.label}</b>
                                    <span>{r.description}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            <section className="ka-container" style={{ marginTop: 32 }}>
                <div className="ka-cta">
                    <div>
                        <h2>{t.ctaTitle}</h2>
                        <p>{t.ctaBody}</p>
                    </div>
                    <div className="ka-cta-actions">
                        <a href="/#pricing" className="ka-btn ka-btn-gold">{t.seePlans} <ArrowRight size={18} /></a>
                    </div>
                </div>
            </section>
        </KaPage>
    );
}
