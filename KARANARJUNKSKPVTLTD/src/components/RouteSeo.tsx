import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { RESOURCES_META, RESOURCES_PATH, SEO_ROUTES } from '../data/seoRoutes';

// Per-route search metadata for the single-page app. Firebase Hosting serves the
// same index.html for every path, so without this every URL Google renders would
// carry the homepage title and canonical. Public marketing pages get their own
// title/description and a canonical on the primary domain (karanarjunerp.com,
// so the *.web.app copy consolidates into it); every signed-in ERP screen is
// marked noindex. Keep the public list in sync with public/sitemap.xml.

const SITE = 'https://karanarjunerp.com';

const PUBLIC_PAGES: Record<string, { title: string; description: string }> = {
    '/': {
        title: 'KaranArjun ERP | Billing, POS & GST Software for Agri-Input Retailers',
        description: 'ERP, billing and POS software made only for agri-input retailers. GST invoices, counter billing, farmer udhaar khata, batch and expiry-wise stock for seed, fertilizer and pesticide shops.',
    },
    '/about': {
        title: 'About KaranArjun ERP — an initiative of Karan Arjun',
        description: 'KaranArjun ERP is an initiative of Karan Arjun to build ERP, billing and POS software only for agri-input retailers: seed, fertilizer and pesticide shops across India.',
    },
    '/contact': {
        title: 'Contact KaranArjun ERP — sales & support for agri-input retailers',
        description: 'Call, WhatsApp or email KaranArjun ERP for a demo, plans, or help setting up billing and stock for your seed, fertilizer or pesticide shop.',
    },
    '/privacy': {
        title: 'Privacy Policy | KaranArjun ERP',
        description: 'What KaranArjun ERP collects, why, who can see your business data and how to get it deleted.',
    },
    '/terms': {
        title: 'Terms of Service | KaranArjun ERP',
        description: 'The terms that apply when you buy and use KaranArjun ERP, the billing and POS software for agri-input retailers.',
    },
    '/refund-policy': {
        title: 'Refund & Cancellation Policy | KaranArjun ERP',
        description: 'When KaranArjun ERP plan payments are refunded, how cancellation works and how long a refund takes.',
    },
};

// Search-landing pages (src/data/seoRoutes.ts) and their hub.
const SEO_PAGES: Record<string, { title: string; description: string }> = {
    [RESOURCES_PATH]: RESOURCES_META,
    ...Object.fromEntries(SEO_ROUTES.map(r => [r.path, { title: r.title, description: r.description }])),
};

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
    let el = document.head.querySelector<HTMLMetaElement>(selector);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

export default function RouteSeo() {
    const { pathname } = useLocation();

    useEffect(() => {
        const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
        const page = PUBLIC_PAGES[path] ?? SEO_PAGES[path];
        let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

        if (page) {
            if (!canonical) {
                canonical = document.createElement('link');
                canonical.rel = 'canonical';
                document.head.appendChild(canonical);
            }
            document.title = page.title;
            setMeta('meta[name="description"]', 'name', 'description', page.description);
            setMeta('meta[property="og:title"]', 'property', 'og:title', page.title);
            setMeta('meta[property="og:description"]', 'property', 'og:description', page.description);
            setMeta('meta[property="og:url"]', 'property', 'og:url', `${SITE}${path === '/' ? '/' : path}`);
            setMeta('meta[name="robots"]', 'name', 'robots', 'index, follow, max-image-preview:large');
            setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', page.title);
            setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', page.description);
            canonical.href = `${SITE}${path === '/' ? '/' : path}`;
        } else {
            // App screens, portals, payment links: never in search results.
            // Title is left to the page itself.
            // No canonical alongside noindex — Google treats the pair as conflicting.
            setMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow');
            canonical?.remove();
        }
    }, [pathname]);

    return null;
}
