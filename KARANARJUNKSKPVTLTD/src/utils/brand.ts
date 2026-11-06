// Customer-facing identity of the product. One place, so the landing page,
// login, checkout, legal pages and footer never drift apart again (the site
// used to say "Fiinny Business" in some places and KaranArjun in others).

export const BRAND = {
    name: 'KaranArjun ERP',
    short: 'KaranArjun',
    company: 'KARAN ARJUN KSK PVT LTD',
    /** How we describe ourselves everywhere: one audience, one job. */
    initiative: 'An initiative of Karan Arjun',
    tagline: 'ERP, billing and POS software built only for agri-input retailers',
    domain: 'karanarjunerp.com',
    url: 'https://karanarjunerp.com',
    location: 'Maharashtra, India',
    /** Support contact shown on the site, receipts and legal pages. */
    supportPhone: '+91 86580 32751',
    supportPhoneE164: '+918658032751',
    supportWhatsApp: '918658032751',
    supportEmail: 'support@karanarjunerp.com',
} as const;

export const whatsappLink = (text = `Hi, I have a question about ${BRAND.name}.`) =>
    `https://wa.me/${BRAND.supportWhatsApp}?text=${encodeURIComponent(text)}`;
