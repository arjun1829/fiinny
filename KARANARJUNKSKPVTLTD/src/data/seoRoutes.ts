// Public search-landing pages: one per thing an agri-input retailer actually
// types into Google. This file is the small, always-loaded index (paths, titles,
// descriptions, language links) shared by the router, RouteSeo, the sitemap test
// and the hub page. The long page bodies live in seoContent.ts, which only the
// lazily-loaded SeoContentPage imports.

export type SeoLang = 'en' | 'mr' | 'hi';
export type SeoKind = 'shop' | 'feature' | 'compare' | 'guide';

export interface SeoRoute {
    path: string;
    lang: SeoLang;
    kind: SeoKind;
    /** Browser title / search result title (≈60 chars). */
    title: string;
    /** Meta description (≈150 chars). */
    description: string;
    /** Short label for links and the hub page. */
    label: string;
    /** Same page in other languages (hreflang). */
    alternates?: Partial<Record<SeoLang, string>>;
}

export const SEO_ROUTES: SeoRoute[] = [
    // ── Shop types ────────────────────────────────────────────────────────
    {
        path: '/fertilizer-shop-billing-software', lang: 'en', kind: 'shop', label: 'Fertilizer shop software',
        title: 'Fertilizer Shop Billing Software — GST, Stock & Udhaar | KaranArjun ERP',
        description: 'Billing software for fertilizer dealers: 5% GST bills, bag-wise stock, daily stock for your display board, supplier ledger and farmer udhaar. Made only for agri shops.',
        alternates: { mr: '/mr/khat-dukan-billing-software', hi: '/hi/khad-beej-dukan-billing-software' },
    },
    {
        path: '/pesticide-shop-billing-software', lang: 'en', kind: 'shop', label: 'Pesticide shop software',
        title: 'Pesticide Shop Billing Software — Batch, Expiry & GST | KaranArjun ERP',
        description: 'Billing and stock software for pesticide and insecticide dealers: batch and expiry tracking, licence number on bills, 18% GST invoices and digital sales records.',
    },
    {
        path: '/seed-shop-billing-software', lang: 'en', kind: 'shop', label: 'Seed shop software',
        title: 'Seed Shop Billing Software — Lot-wise Stock & Season Credit | KaranArjun ERP',
        description: 'Software for seed retailers: lot and batch-wise stock, validity dates, nil-GST seed bills next to taxed items, and season-long credit for farmers.',
    },
    {
        path: '/krishi-seva-kendra-software', lang: 'en', kind: 'shop', label: 'Krishi seva kendra software',
        title: 'Krishi Seva Kendra Software — Billing, Stock & Khata | KaranArjun ERP',
        description: 'One app for your krishi seva kendra: fertilizer, pesticide and seed on one GST bill, batch and expiry stock, farmer udhaar and reports for your CA.',
        alternates: { mr: '/mr/krishi-seva-kendra-billing-software', hi: '/hi/krishi-seva-kendra-billing-software' },
    },
    // ── Features ──────────────────────────────────────────────────────────
    {
        path: '/gst-billing-software-for-agri-shops', lang: 'en', kind: 'feature', label: 'GST billing for agri shops',
        title: 'GST Billing Software for Agri-Input Shops | KaranArjun ERP',
        description: 'Make GST bills with the right HSN and tax split for fertilizers (5%), pesticides (18%) and seeds (nil) on one invoice. GSTR-1 and 3B summaries for your CA.',
    },
    {
        path: '/udhaar-khata-app-for-agri-shops', lang: 'en', kind: 'feature', label: 'Udhaar khata app',
        title: 'Udhaar Khata App for Agri Shops — Season Credit for Farmers | KaranArjun ERP',
        description: 'Digital khata for agri-input shops: every credit bill in the farmer’s ledger, part payments, outstanding by village and one-tap WhatsApp reminders.',
        alternates: { mr: '/mr/udhari-khata-app', hi: '/hi/udhaar-khata-app' },
    },
    {
        path: '/batch-expiry-stock-software-agri', lang: 'en', kind: 'feature', label: 'Batch & expiry stock',
        title: 'Batch & Expiry Stock Software for Agri Shops | KaranArjun ERP',
        description: 'Track every pesticide and seed batch with its expiry date across shop and godown. See what expires soon and sell the oldest stock first.',
    },
    // ── Comparisons ───────────────────────────────────────────────────────
    {
        path: '/agri-shop-software-vs-general-billing-apps', lang: 'en', kind: 'compare', label: 'Agri software vs general billing apps',
        title: 'Agri Shop Software vs General Billing Apps: Which Should You Use?',
        description: 'A general billing app or software made for agri-input shops? A simple guide for fertilizer, pesticide and seed shop owners to choose the right one.',
    },
    // ── Guides ────────────────────────────────────────────────────────────
    {
        path: '/guides/gst-rates-fertilizer-pesticide-seeds', lang: 'en', kind: 'guide', label: 'GST rates: fertilizer, pesticide, seeds',
        title: 'GST Rates on Fertilizers, Pesticides & Seeds with HSN Codes (2026)',
        description: 'Current GST rates and HSN codes for chemical fertilizers, pesticides, bio-pesticides and seeds, and how to bill them together on one invoice.',
    },
    {
        path: '/guides/pesticide-dealer-records', lang: 'en', kind: 'guide', label: 'Pesticide dealer records',
        title: 'Pesticide Dealer Records & Licence Rules: A Practical Guide',
        description: 'What an insecticide retailer should keep on record under the Insecticides Act and Rules: licence display, sales records, stock and expiry, and keeping them digitally.',
    },
    {
        path: '/guides/fertilizer-dealer-stock-register', lang: 'en', kind: 'guide', label: 'Fertilizer stock register',
        title: 'Fertilizer Dealer Stock Register & Display Board (FCO 1985) Guide',
        description: 'How a fertilizer retailer keeps the stock register and the daily stock and price display required under the Fertiliser (Control) Order, without extra paperwork.',
    },
    {
        path: '/guides/udhaar-management-agri-shop', lang: 'en', kind: 'guide', label: 'Managing farmer udhaar',
        title: 'How to Manage Farmer Udhaar in an Agri-Input Shop',
        description: 'Practical ways to give season credit to farmers without losing money: limits, records, reminders and collecting at harvest.',
    },
    // ── Marathi ───────────────────────────────────────────────────────────
    {
        path: '/mr/krishi-seva-kendra-billing-software', lang: 'mr', kind: 'shop', label: 'कृषी सेवा केंद्र सॉफ्टवेअर',
        title: 'कृषी सेवा केंद्र बिलिंग सॉफ्टवेअर — GST बिल, स्टॉक, उधारी | KaranArjun ERP',
        description: 'खत, कीटकनाशक आणि बियाण्यांसाठी एकाच GST बिलावर बिलिंग, बॅच व एक्सपायरी स्टॉक, शेतकऱ्यांची उधारी आणि CA साठी रिपोर्ट. फक्त कृषी सेवा केंद्रांसाठी.',
        alternates: { en: '/krishi-seva-kendra-software', hi: '/hi/krishi-seva-kendra-billing-software' },
    },
    {
        path: '/mr/khat-dukan-billing-software', lang: 'mr', kind: 'shop', label: 'खत दुकान सॉफ्टवेअर',
        title: 'खत दुकान बिलिंग सॉफ्टवेअर — GST, स्टॉक रजिस्टर | KaranArjun ERP',
        description: 'खत विक्रेत्यांसाठी 5% GST बिल, गोणीनुसार स्टॉक, दैनिक स्टॉक फलकासाठी माहिती, पुरवठादार खाते आणि शेतकरी उधारी.',
        alternates: { en: '/fertilizer-shop-billing-software', hi: '/hi/khad-beej-dukan-billing-software' },
    },
    {
        path: '/mr/udhari-khata-app', lang: 'mr', kind: 'feature', label: 'उधारी खाते ॲप',
        title: 'शेतकरी उधारी खाते ॲप — कृषी दुकानांसाठी | KaranArjun ERP',
        description: 'प्रत्येक उधारीचे बिल शेतकऱ्याच्या खात्यात, अंशतः जमा, गावनिहाय थकबाकी आणि WhatsApp वर एका क्लिकमध्ये आठवण.',
        alternates: { en: '/udhaar-khata-app-for-agri-shops', hi: '/hi/udhaar-khata-app' },
    },
    // ── Hindi ─────────────────────────────────────────────────────────────
    {
        path: '/hi/krishi-seva-kendra-billing-software', lang: 'hi', kind: 'shop', label: 'कृषि सेवा केंद्र सॉफ्टवेयर',
        title: 'कृषि सेवा केंद्र बिलिंग सॉफ्टवेयर — GST बिल, स्टॉक, उधार | KaranArjun ERP',
        description: 'खाद, कीटनाशक और बीज एक ही GST बिल पर, बैच और एक्सपायरी स्टॉक, किसानों का उधार खाता और CA के लिए रिपोर्ट। सिर्फ़ कृषि इनपुट दुकानों के लिए।',
        alternates: { en: '/krishi-seva-kendra-software', mr: '/mr/krishi-seva-kendra-billing-software' },
    },
    {
        path: '/hi/khad-beej-dukan-billing-software', lang: 'hi', kind: 'shop', label: 'खाद-बीज दुकान सॉफ्टवेयर',
        title: 'खाद बीज दुकान बिलिंग सॉफ्टवेयर — GST, स्टॉक, उधार | KaranArjun ERP',
        description: 'खाद-बीज विक्रेताओं के लिए सही GST वाले बिल, बोरी और लॉट के हिसाब से स्टॉक, रोज़ का स्टॉक बोर्ड, सप्लायर खाता और किसान उधार।',
        alternates: { en: '/fertilizer-shop-billing-software', mr: '/mr/khat-dukan-billing-software' },
    },
    {
        path: '/hi/udhaar-khata-app', lang: 'hi', kind: 'feature', label: 'उधार खाता ऐप',
        title: 'किसान उधार खाता ऐप — कृषि दुकानों के लिए | KaranArjun ERP',
        description: 'हर उधार बिल किसान के खाते में, आंशिक भुगतान, गाँव के हिसाब से बकाया और WhatsApp पर एक टैप में याद दिलाना।',
        alternates: { en: '/udhaar-khata-app-for-agri-shops', mr: '/mr/udhari-khata-app' },
    },
];

/** Hub that links every page above (also in the sitemap). */
export const RESOURCES_PATH = '/resources';
export const RESOURCES_META = {
    title: 'Guides & Software for Agri-Input Retailers | KaranArjun ERP',
    description: 'Billing software guides for fertilizer, pesticide and seed shops: GST rates, dealer records, udhaar, comparisons, in English, मराठी and हिन्दी.',
};

export const SEO_PATHS: string[] = [RESOURCES_PATH, ...SEO_ROUTES.map(r => r.path)];

export function findSeoRoute(path: string): SeoRoute | undefined {
    const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
    return SEO_ROUTES.find(r => r.path === clean);
}
