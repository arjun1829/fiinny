import { MapPin, MessageCircle, Phone, Mail } from 'lucide-react';
import KaPage from '../components/landing/ka/KaPage';
import { usePageJsonLd } from '../hooks/useSeo';
import { BRAND, whatsappLink } from '../utils/brand';

export default function ContactPage() {
    usePageJsonLd('/contact', [{
            '@context': 'https://schema.org',
            '@type': 'ContactPage',
            url: `${BRAND.url}/contact`,
            mainEntity: {
                '@type': 'Organization',
                name: BRAND.company,
                url: BRAND.url,
                contactPoint: [{
                    '@type': 'ContactPoint',
                    telephone: BRAND.supportPhoneE164,
                    email: BRAND.supportEmail,
                    contactType: 'customer support',
                    areaServed: 'IN',
                    availableLanguage: ['en', 'hi', 'mr'],
                }],
            },
        }]);

    return (
        <KaPage>
            <section className="ka-hero" style={{ padding: '56px 0 40px' }}>
                <div className="ka-container ka-narrow" style={{ display: 'grid', gap: 14, textAlign: 'center', justifyItems: 'center' }}>
                    <span className="ka-eyebrow">Contact us</span>
                    <h1 style={{ margin: 0, fontSize: 'clamp(2.2rem, 4.6vw, 3.2rem)' }}>We are a call away.</h1>
                    <p className="ka-lead">Want a demo, help choosing a plan, or stuck setting up your shop? Reach us the way that suits you.</p>
                </div>
            </section>
            <section className="ka-section-tight">
                <div className="ka-container ka-grid-3">
                    <a className="ka-contact-card" href={`tel:${BRAND.supportPhoneE164}`}>
                        <Phone size={24} color="var(--ka-forest)" />
                        <small>Call us</small><b>{BRAND.supportPhone}</b><span>Mon–Sat, 10 am – 7 pm IST</span>
                    </a>
                    <a className="ka-contact-card" href={whatsappLink()} target="_blank" rel="noopener noreferrer">
                        <MessageCircle size={24} color="var(--ka-forest)" />
                        <small>WhatsApp</small><b>Start a chat</b><span>Demos, plans and setup help</span>
                    </a>
                    <a className="ka-contact-card" href={`mailto:${BRAND.supportEmail}`}>
                        <Mail size={24} color="var(--ka-forest)" />
                        <small>Email</small><b>{BRAND.supportEmail}</b><span>Billing, refunds and account questions</span>
                    </a>
                </div>
                <p className="ka-container" style={{ marginTop: 28, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', color: 'var(--ka-body)' }}>
                    <MapPin size={18} color="var(--ka-emerald)" /> {BRAND.company} · {BRAND.location}
                </p>
            </section>
        </KaPage>
    );
}
