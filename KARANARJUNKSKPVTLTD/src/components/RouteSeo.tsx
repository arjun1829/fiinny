import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Per-route search metadata for the single-page app. Firebase Hosting serves the
// same index.html for every path, so without this every URL Google renders would
// carry the homepage title and canonical. Public marketing pages get their own
// title/description and a canonical on the primary domain (karanarjunerp.com,
// so the *.web.app copy consolidates into it); every signed-in ERP screen is
// marked noindex. Keep the public list in sync with public/sitemap.xml.

const SITE = 'https://karanarjunerp.com';

const PUBLIC_PAGES: Record<string, { title: string; description: string }> = {
    '/': {
        title: 'KaranArjun ERP | POS Billing, GST Invoicing, Khata & Inventory Software',
        description: 'Billing and business software for agri-input retailers, distributors and manufacturers in India — POS billing, GST B2B invoices, digital khata, batch-wise inventory, supplier ledger and analytics.',
    },
    '/about': {
        title: 'About | KaranArjun ERP',
        description: 'Who builds KaranArjun ERP and why: software made for India’s agri-retail supply chain.',
    },
    '/download': {
        title: 'Download the App | KaranArjun ERP',
        description: 'Bill, collect khata and check stock from your phone with the KaranArjun ERP Android app.',
    },
    '/contact': {
        title: 'Contact | KaranArjun ERP',
        description: 'Talk to the KaranArjun ERP team about a demo, pricing or onboarding your shop or distribution business.',
    },
    '/blog': {
        title: 'Blog | KaranArjun ERP',
        description: 'Guides on GST billing, khata management and inventory for agri-input businesses.',
    },
    '/changelog': {
        title: 'What’s New | KaranArjun ERP',
        description: 'Latest features and improvements in KaranArjun ERP.',
    },
    '/careers': {
        title: 'Careers | KaranArjun ERP',
        description: 'Open roles at KaranArjun.',
    },
    '/privacy': {
        title: 'Privacy Policy | KaranArjun ERP',
        description: 'How KaranArjun ERP collects, uses and protects your business data.',
    },
    '/terms': {
        title: 'Terms of Service | KaranArjun ERP',
        description: 'Terms governing the use of KaranArjun ERP.',
    },
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
        const page = PUBLIC_PAGES[path];
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
            setMeta('meta[name="robots"]', 'name', 'robots', 'index, follow');
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
