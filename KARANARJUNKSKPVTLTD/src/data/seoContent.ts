// Bodies of the search-landing pages listed in seoRoutes.ts. Loaded only by the
// lazy SeoContentPage, so none of this text ships in the main bundle.
//
// Accuracy rules for this file (these pages are read by shop owners who will act
// on them):
//  - Only claim features the ERP actually has today.
//  - Tax and legal statements carry a "check with your CA / licensing office" note
//    and a date; rates were checked in November 2026.
//  - Never name other companies' apps; say "general billing apps" and describe
//    them fairly (many DO have GST billing and batch/expiry). We compete on being
//    built only for agri-input retail.
//  - No prices in the text: the live plan prices come from the plan catalogue.

export interface SeoSection {
    h: string;
    p?: string[];
    ul?: string[];
    table?: { head: string[]; rows: string[][] };
    note?: string;
}

export interface SeoPageContent {
    eyebrow: string;
    h1: string;
    intro: string;
    sections: SeoSection[];
    faqs: { q: string; a: string }[];
    related: string[];
    /** Shown on guides and comparisons. */
    updated?: string;
    sources?: { label: string; url: string }[];
}

const UPDATED = 'November 2026';

export const SEO_CONTENT: Record<string, SeoPageContent> = {
    // ═════════════════════════════ SHOP TYPES ═════════════════════════════
    '/fertilizer-shop-billing-software': {
        eyebrow: 'For fertilizer dealers',
        h1: 'Billing software for your fertilizer shop',
        intro: 'Bag-wise stock, 5% GST bills in seconds, the day’s stock ready for your display board, and every farmer’s udhaar in one place. Made only for agri-input retailers.',
        sections: [
            {
                h: 'Why a fertilizer counter needs more than a bill book',
                p: [
                    'In sowing season a fertilizer shop can bill hundreds of bags a day. Every bag has to match your stock register, prices have to stay within the notified maximum, and half the farmers want to pay at harvest. Doing that from a bill book and a register means errors, late nights and udhaar nobody can total.',
                    'KaranArjun ERP keeps billing, stock and credit in one system, so every bill updates your stock and the farmer’s khata the moment you print it.',
                ],
            },
            {
                h: 'What you get',
                ul: [
                    'GST bills with HSN codes and the CGST/SGST split worked out for you (chemical fertilizers are billed at 5%).',
                    'Bag and pack-wise stock: 45 kg urea, 50 kg DAP, 25 kg bags, sold whole or loose.',
                    'Current stock of every product at a glance, so updating the daily stock and price display takes a minute.',
                    'Purchase bills that update stock and your supplier’s ledger together.',
                    'Farmer udhaar with part payments and one-tap WhatsApp reminders.',
                    'Your shop name, GSTIN and licence number printed on every invoice.',
                    'Shop and godown stock kept separately, with transfers between them.',
                ],
            },
            {
                h: 'Works alongside the government PoS machine',
                p: [
                    'Subsidised fertilizer sales still go through the iFMS PoS device as the rules require. KaranArjun ERP is your own business system next to it: your bills, your stock register, your khata, your profit. You no longer copy figures from the PoS slip into a register by hand.',
                ],
            },
            {
                h: 'Set up in minutes',
                ul: [
                    'Verify your mobile number and add your shop details.',
                    'Add your products with pack sizes, rates and opening stock.',
                    'Print your first GST bill the same day, on a thermal or A4 printer, or share it on WhatsApp.',
                ],
            },
        ],
        faqs: [
            { q: 'Which GST rate applies to fertilizers?', a: 'Chemical fertilizers such as urea, DAP and complex fertilizers are billed at 5% GST. Rates for some organic and bio products differ. See our GST rates guide and confirm unusual items with your CA.' },
            { q: 'Can it help with the daily stock display board?', a: 'Yes. The stock report shows the current stock of every product, so you can update the opening stock and price board each morning in a minute.' },
            { q: 'Does it replace the iFMS PoS machine?', a: 'No. Subsidised sales still go through the government PoS device. KaranArjun ERP runs your own billing, stock, khata and accounts alongside it.' },
            { q: 'Can I sell on credit to farmers?', a: 'Yes. Credit bills go straight into the farmer’s khata, and you can record part payments in cash or UPI and send reminders on WhatsApp.' },
        ],
        related: ['/guides/fertilizer-dealer-stock-register', '/guides/gst-rates-fertilizer-pesticide-seeds', '/udhaar-khata-app-for-agri-shops', '/krishi-seva-kendra-software'],
    },

    '/pesticide-shop-billing-software': {
        eyebrow: 'For pesticide & insecticide dealers',
        h1: 'Billing and stock software for your pesticide shop',
        intro: 'Batch and expiry on every bottle and packet, 18% GST bills, your licence number on every invoice and sales records you can show an inspector. Built only for agri-input retailers.',
        sections: [
            {
                h: 'The expensive problems in a pesticide shop',
                p: [
                    'Pesticides expire, and expired stock cannot be sold. Small packs from many companies, each with its own batch and expiry date, make it easy to find a carton of expired stock six months too late. Add 18% GST, licence conditions and sales records the licensing officer may ask for, and a register stops being enough.',
                ],
            },
            {
                h: 'What you get',
                ul: [
                    'Batch number and expiry date on every purchase, so you always know what expires next.',
                    'A list of batches expiring soon, so you can sell or return them in time.',
                    'GST bills for pesticides (HSN 3808) with the correct tax split, alongside 5% and nil-rated items on the same bill.',
                    'Your insecticide licence number, GSTIN and shop details printed on every invoice.',
                    'A digital record of every sale: product, batch, quantity, buyer and date.',
                    'Purchase bills that update stock and the company or distributor ledger together.',
                    'Udhaar for farmers who pay at harvest, with WhatsApp reminders.',
                ],
            },
            {
                h: 'Records in order, without a second register',
                p: [
                    'Because every sale is billed in the system, your sales and stock records build themselves. When you need them, export or print them by date and product instead of rewriting a register. Recent amendments to the Insecticides Rules allow registers to be kept in digital form; check the exact format your state’s licensing office asks for.',
                ],
            },
        ],
        faqs: [
            { q: 'What GST rate do pesticides attract?', a: 'Chemical pesticides, insecticides, fungicides and herbicides under HSN 3808 are generally billed at 18%. Certain bio-pesticides are at 5%. Check unusual products with your CA.' },
            { q: 'Can it warn me about expiring stock?', a: 'Yes. Every batch is stored with its expiry date, and you can see which batches expire soon across your shop and godown.' },
            { q: 'Will my licence number print on bills?', a: 'Yes. You add your licence numbers once in settings and they print on every invoice.' },
            { q: 'Is this a replacement for the records my licence requires?', a: 'It keeps complete digital sales and stock records that you can print or export. The exact format required varies by state, so confirm with your licensing office.' },
        ],
        related: ['/guides/pesticide-dealer-records', '/batch-expiry-stock-software-agri', '/guides/gst-rates-fertilizer-pesticide-seeds', '/krishi-seva-kendra-software'],
    },

    '/seed-shop-billing-software': {
        eyebrow: 'For seed retailers',
        h1: 'Billing software for your seed shop',
        intro: 'Lot-wise stock with validity dates, nil-GST seed bills next to taxed items, and season-long credit for farmers. Made only for agri-input retailers.',
        sections: [
            {
                h: 'Seed retail is seasonal, and that is the hard part',
                p: [
                    'Most seed sales happen in a few weeks before kharif and rabi sowing. Stock arrives in lots from many companies, each with its own validity date. Farmers buy on credit and pay after harvest, months later. Miss a lot’s validity date or lose track of who owes what, and the season’s profit disappears.',
                ],
            },
            {
                h: 'What you get',
                ul: [
                    'Lot and batch-wise stock with validity or expiry dates for every packet.',
                    'Seeds for sowing billed as nil-rated, on the same bill as 5% fertilizer and 18% pesticide when a farmer buys everything together.',
                    'Fast counter billing for the sowing rush, with thermal printing.',
                    'Season credit in each farmer’s khata, with part payments and WhatsApp reminders at harvest.',
                    'Company-wise purchase bills and supplier ledgers, so returns and settlements are clear.',
                    'Reports of what sold this season, to plan next season’s order.',
                ],
            },
        ],
        faqs: [
            { q: 'Is GST charged on seeds?', a: 'Seeds meant for sowing are generally nil-rated. KaranArjun ERP lets you set the tax per product, so nil, 5% and 18% items can go on one bill correctly.' },
            { q: 'Can I track lot numbers and validity?', a: 'Yes. Each purchase is recorded with its batch or lot and its expiry date, and stock is kept batch-wise.' },
            { q: 'How does it handle credit that is repaid after harvest?', a: 'Credit bills go into the farmer’s khata with dates, so you can see how long each balance has been open and remind them when the harvest comes in.' },
        ],
        related: ['/udhaar-khata-app-for-agri-shops', '/batch-expiry-stock-software-agri', '/krishi-seva-kendra-software', '/guides/udhaar-management-agri-shop'],
    },

    '/krishi-seva-kendra-software': {
        eyebrow: 'For krishi seva kendras',
        h1: 'Software for your krishi seva kendra',
        intro: 'Fertilizer, pesticide and seed on one GST bill. Batch and expiry stock, farmer udhaar, supplier ledgers and reports for your CA, in one app on your phone or computer.',
        sections: [
            {
                h: 'One shop, three kinds of products, three tax rates',
                p: [
                    'A krishi seva kendra sells fertilizers at 5% GST, pesticides at 18% and seeds at nil, often to the same farmer on the same bill. Stock comes from a dozen companies, some of it expires, and a big part of sales is on credit until harvest. General billing apps were not made for that mix. KaranArjun ERP was.',
                ],
            },
            {
                h: 'Everything a KSK runs on',
                ul: [
                    'POS billing at the counter and GST invoices for bulk buyers and FPOs.',
                    'Correct HSN and tax for every product, mixed rates on one bill.',
                    'Batch and expiry-wise stock, across your shop and godown.',
                    'Digital khata for every farmer: credit, part payments, reminders.',
                    'Purchase bills and supplier ledgers for every company and distributor.',
                    'Licence numbers, GSTIN and UPI QR code printed on bills.',
                    'Staff logins with roles, so a counter helper can bill without seeing your margins.',
                    'GSTR-1 and GSTR-3B summaries, profit and stock reports, and PDF exports of all bills for your CA.',
                ],
            },
            {
                h: 'Built by people in the trade',
                p: [
                    'KaranArjun ERP is an initiative of Karan Arjun, an agri-input business in Maharashtra. We built it to run our own billing, stock and collections, and we use it every day. That is why it only does agri-input retail, and does it properly.',
                ],
            },
        ],
        faqs: [
            { q: 'Do I need a computer?', a: 'No. It runs in the browser on any Android phone, tablet or laptop. A thermal or A4 printer is optional.' },
            { q: 'Can my staff use it?', a: 'Yes. Add staff logins with their own roles. The number of users depends on your plan.' },
            { q: 'Is there a free plan?', a: 'No. It is a paid product with monthly and yearly plans. Ask for a demo on WhatsApp before you buy.' },
            { q: 'Can my CA get the data?', a: 'Yes. GST summaries, profit and stock reports, and PDF exports of all sales and purchase bills are available.' },
        ],
        related: ['/fertilizer-shop-billing-software', '/pesticide-shop-billing-software', '/seed-shop-billing-software', '/gst-billing-software-for-agri-shops'],
    },

    // ═════════════════════════════ FEATURES ═════════════════════════════
    '/gst-billing-software-for-agri-shops': {
        eyebrow: 'GST billing',
        h1: 'GST billing software for agri-input shops',
        intro: 'Fertilizers at 5%, pesticides at 18%, seeds at nil: one invoice, the right HSN and tax on every line, and summaries ready for GSTR-1 and GSTR-3B.',
        sections: [
            {
                h: 'Mixed tax rates on one bill, done right',
                p: [
                    'When a farmer buys DAP, an insecticide and a packet of seed together, each line carries a different tax. KaranArjun ERP stores the HSN code and GST rate on each product, so the bill splits CGST and SGST (or IGST for another state) line by line, with the totals your CA expects.',
                ],
            },
            {
                h: 'What is on every bill',
                ul: [
                    'Your shop name, address, GSTIN and licence numbers.',
                    'HSN code, rate, quantity and tax for every line.',
                    'CGST/SGST or IGST split, worked out from the buyer’s state.',
                    'Buyer GSTIN for B2B invoices to bulk buyers and FPOs.',
                    'A UPI QR code so the customer can pay on the spot.',
                    'Thermal or A4 printing, or a PDF to share on WhatsApp.',
                ],
            },
            {
                h: 'Month-end without the pile of paper',
                ul: [
                    'Sales summaries for GSTR-1 and GSTR-3B.',
                    'Purchase bills recorded with the supplier’s GSTIN, for your input credit.',
                    'One-click PDF export of all sales and purchase bills for your CA.',
                ],
            },
        ],
        faqs: [
            { q: 'Does it file GST returns for me?', a: 'No. It prepares GSTR-1 and GSTR-3B summaries and exports your bills; your CA or you file the returns.' },
            { q: 'Can I bill another state’s buyer?', a: 'Yes. IGST is applied instead of CGST and SGST when the buyer is in another state.' },
            { q: 'Is e-invoicing supported?', a: 'Not yet. Most agri-input retailers are below the e-invoicing turnover limit; if you are above it, talk to us first.' },
        ],
        related: ['/guides/gst-rates-fertilizer-pesticide-seeds', '/krishi-seva-kendra-software', '/fertilizer-shop-billing-software', '/pesticide-shop-billing-software'],
    },

    '/udhaar-khata-app-for-agri-shops': {
        eyebrow: 'Digital khata',
        h1: 'Udhaar khata app made for agri shops',
        intro: 'Farmers buy at sowing and pay at harvest. Keep every credit bill, part payment and reminder in one ledger per customer, and always know what the market owes you.',
        sections: [
            {
                h: 'Agri credit is not like kirana credit',
                p: [
                    'In a kirana shop udhaar is a few hundred rupees for a few days. In an agri-input shop it can be tens of thousands per farmer, for four to six months, across a whole village. A paper khata cannot tell you who has not paid since last season, or how much is out in each village. That is where money gets lost.',
                ],
            },
            {
                h: 'What the khata does',
                ul: [
                    'Every credit bill goes into the customer’s ledger automatically, with the bill attached.',
                    'Record part payments in cash or UPI against the balance.',
                    'See total outstanding, and who has owed the longest.',
                    'Send a payment reminder on WhatsApp in one tap.',
                    'Separate ledgers for farmers, bulk buyers and your own suppliers.',
                    'Print or share a customer’s statement when they ask.',
                ],
            },
        ],
        faqs: [
            { q: 'Are reminders sent automatically?', a: 'No. You tap the reminder and it opens WhatsApp with the message ready, so you decide who is reminded and when.' },
            { q: 'Can I see udhaar by village?', a: 'Each customer carries their village or address, so you can find balances by place and plan collection rounds.' },
            { q: 'Does it work for supplier credit too?', a: 'Yes. Purchase bills and payments to companies and distributors are kept in supplier ledgers.' },
        ],
        related: ['/guides/udhaar-management-agri-shop', '/krishi-seva-kendra-software', '/seed-shop-billing-software', '/mr/udhari-khata-app'],
    },

    '/batch-expiry-stock-software-agri': {
        eyebrow: 'Batch & expiry stock',
        h1: 'Batch and expiry stock software for agri shops',
        intro: 'Know every batch of pesticide and seed you hold, where it is and when it expires, so nothing sits on the shelf until it is worthless.',
        sections: [
            {
                h: 'Expired stock is lost money',
                p: [
                    'A single expired carton of a high-value insecticide can wipe out a week’s margin. With products from many companies and dates printed small on each pack, the only reliable way to sell the oldest stock first is to record batches and dates when stock comes in.',
                ],
            },
            {
                h: 'How it works',
                ul: [
                    'Enter batch number and expiry date on the purchase bill when stock arrives.',
                    'Stock is kept batch-wise for every product, in every godown.',
                    'See which batches expire soon and sell or return them in time.',
                    'Move stock between shop and godown with a transfer record.',
                    'Print barcode labels for faster billing at the counter.',
                ],
            },
        ],
        faqs: [
            { q: 'Do other billing apps track batches?', a: 'Many general billing apps offer batch and expiry tracking. KaranArjun ERP builds it into an app made only for agri-input retail, together with khata, licences and mixed GST rates.' },
            { q: 'Can I keep stock in more than one godown?', a: 'Yes, depending on your plan. Each godown has its own batch-wise stock.' },
        ],
        related: ['/pesticide-shop-billing-software', '/seed-shop-billing-software', '/guides/pesticide-dealer-records', '/krishi-seva-kendra-software'],
    },

    // ═════════════════════════════ COMPARISONS ═════════════════════════════
    '/agri-shop-software-vs-general-billing-apps': {
        eyebrow: 'Which one is right for you?',
        h1: 'Agri shop software or a general billing app?',
        intro: 'There are many good billing apps for all kinds of shops. KaranArjun ERP is made for only one kind of shop: agri-input retail. Here is a simple way to decide which one your shop needs.',
        updated: UPDATED,
        sections: [
            {
                h: 'The simple difference',
                p: [
                    'A general billing app is made for every kind of shop: kirana, mobile, clothes, medical. It does billing well, but it does not know your trade.',
                    'KaranArjun ERP is made only for shops that sell fertilizers, pesticides and seeds. Pack sizes, batches and expiry, licence numbers, three GST rates on one bill and farmer credit that runs until harvest are part of how it works, not extra settings you have to find.',
                ],
            },
            {
                h: 'Side by side',
                table: {
                    head: ['', 'KaranArjun ERP', 'General billing apps'],
                    rows: [
                        ['Made for', 'Only agri-input shops', 'Every kind of shop'],
                        ['GST bills', 'Yes, with fertilizer, pesticide and seed rates on one bill', 'Yes'],
                        ['Batch & expiry', 'Yes, for every pesticide and seed pack', 'Many apps have it'],
                        ['Licence numbers on bills', 'Built in', 'Usually through custom fields'],
                        ['Farmer credit (udhaar)', 'Made for season-long credit', 'Usually short-term credit'],
                        ['Help & support', 'People from the agri-input trade', 'General support teams'],
                        ['Free version', 'No, paid plans only', 'Some have a free version'],
                    ],
                },
                note: 'Every app is different. Before you choose, check what the app you are looking at offers today.',
            },
            {
                h: 'A general billing app may be enough if…',
                ul: [
                    'Agri-inputs are only a small part of what your shop sells.',
                    'You only need to print bills, and do not need stock, batches or credit.',
                    'You want the cheapest or a free option.',
                ],
            },
            {
                h: 'KaranArjun ERP is a better fit if…',
                ul: [
                    'Fertilizer, pesticide and seed are your main business.',
                    'You lose money to expired stock or udhaar you cannot track.',
                    'You have a godown, staff, or sell to bulk buyers and FPOs.',
                    'You want help from people who understand your licences and the sowing rush.',
                    'You want your CA to get every bill as a PDF without asking twice.',
                ],
            },
        ],
        faqs: [
            { q: 'I already use a billing app. Can I switch?', a: 'Yes. Export your item list and customer balances from your current app and we will help you bring them in when you start.' },
            { q: 'Is KaranArjun ERP more expensive than general apps?', a: 'Some general apps are free or cheaper. KaranArjun ERP is paid, and you pay for software made for agri-input shops. Compare the plans with what your shop needs.' },
            { q: 'Can I see it before I buy?', a: 'Yes. Message us on WhatsApp and we will show you a live demo on your phone.' },
        ],
        related: ['/krishi-seva-kendra-software', '/gst-billing-software-for-agri-shops', '/udhaar-khata-app-for-agri-shops', '/batch-expiry-stock-software-agri'],
    },

    // ═════════════════════════════ GUIDES ═════════════════════════════
    '/guides/gst-rates-fertilizer-pesticide-seeds': {
        eyebrow: 'Guide',
        h1: 'GST rates on fertilizers, pesticides and seeds (2026)',
        intro: 'A quick reference for agri-input retailers: the GST rate and HSN chapter for the products you sell most, and how to bill them together on one invoice.',
        updated: UPDATED,
        sections: [
            {
                h: 'Common rates',
                table: {
                    head: ['Product', 'HSN', 'GST'],
                    rows: [
                        ['Chemical fertilizers (urea, DAP, MOP, NPK complexes)', '3102 – 3105', '5%'],
                        ['Chemical pesticides, insecticides, fungicides, herbicides', '3808', '18%'],
                        ['Bio-pesticides (for example Trichoderma, neem-based)', '3808', '5%'],
                        ['Seeds for sowing (cereals, pulses, oilseeds, vegetables)', 'Chapters 10, 12 (seed quality)', 'Nil'],
                    ],
                },
                note: 'Rates checked in November 2026 against public sources after the September 2025 GST rate changes. Specific products, micronutrients, organic manures and branded packs can differ. Confirm with your CA or the official CBIC rate notifications before you rely on any rate.',
            },
            {
                h: 'Billing mixed rates on one invoice',
                p: [
                    'Each line on a GST invoice carries its own rate. When a farmer buys DAP (5%), an insecticide (18%) and soybean seed (nil) together, tax is worked out per line and the invoice shows the tax for each rate separately. Within your state the tax is split equally into CGST and SGST; for a buyer in another state it is IGST.',
                ],
                ul: [
                    'Set the HSN code and rate once on each product, not on every bill.',
                    'Nil-rated seed lines still appear on the invoice, with zero tax.',
                    'Keep purchase bills with your supplier’s GSTIN so you can claim input credit on taxed items.',
                ],
            },
            {
                h: 'Doing it in KaranArjun ERP',
                p: [
                    'Each product stores its HSN code and GST rate. The bill picks them up automatically, splits CGST/SGST or IGST, and your GST summaries are ready at month end.',
                ],
            },
        ],
        faqs: [
            { q: 'Is GST on fertilizer 5% or 18%?', a: 'Chemical fertilizers used as fertilizers are at 5%. Some goods under the same chapters that are not used as fertilizers can be taxed differently, so check unusual items with your CA.' },
            { q: 'Are bio-pesticides taxed at 18%?', a: 'Public sources list certain bio-pesticides at 5% after the September 2025 changes, while chemical pesticides stay at 18%. Confirm the exact product with your CA.' },
            { q: 'Do I charge GST on seeds?', a: 'Seeds meant for sowing are generally nil-rated. Seeds sold for other uses, such as food, can be taxed differently.' },
        ],
        related: ['/gst-billing-software-for-agri-shops', '/krishi-seva-kendra-software', '/fertilizer-shop-billing-software', '/pesticide-shop-billing-software'],
        sources: [
            { label: 'CBIC GST rates (official)', url: 'https://cbic-gst.gov.in/gst-goods-services-rates.html' },
            { label: 'GST on pesticides, Busy', url: 'https://busy.in/gst-rates/pesticides/' },
            { label: 'GST on fertilizer, Busy', url: 'https://busy.in/gst-rates/fertilizer/' },
        ],
    },

    '/guides/pesticide-dealer-records': {
        eyebrow: 'Guide',
        h1: 'Pesticide dealer records: a practical guide',
        intro: 'What an insecticide retailer should keep on record to stay on the right side of the licensing office, and how to keep it without a second register.',
        updated: UPDATED,
        sections: [
            {
                h: 'The rules in brief',
                p: [
                    'Selling or stocking insecticides by retail needs a licence under the Insecticides Act, 1968 and the Insecticides Rules, 1971. The licence names the products and the premises it covers, and it must be displayed prominently in the part of the shop open to customers.',
                    'Dealers are expected to keep records of what they sell: which insecticide, how much, to whom and when. Recent amendments allow registers to be kept in physical or digital form. Form numbers and exact formats have changed over the years and vary by state, so always check with your state’s licensing officer.',
                ],
                note: 'This is general information, not legal advice. Your licence conditions and your state licensing office decide what you must keep.',
            },
            {
                h: 'A simple record-keeping routine',
                ul: [
                    'Record every purchase with company, product, batch, expiry date and quantity.',
                    'Bill every sale, including cash sales, so each one is recorded with product, batch, quantity and buyer.',
                    'Keep the buyer’s name and village for every sale.',
                    'Check expiring batches every month and return or clear them in time.',
                    'Keep purchase bills and challans filed by month.',
                    'Display your licence where customers can see it.',
                ],
            },
            {
                h: 'How software helps',
                p: [
                    'When every purchase and sale goes through billing software, the stock and sales records exist automatically. In KaranArjun ERP you can print or export sales and stock by date and product when an officer asks, and your licence number prints on every bill.',
                ],
            },
        ],
        faqs: [
            { q: 'Can I keep pesticide registers on a computer?', a: 'Recent amendments to the Insecticides Rules allow digital registers. Confirm the format your state accepts with the licensing office.' },
            { q: 'Do I need to note the buyer for every sale?', a: 'The rules expect a record of who insecticides were sold to and in what quantity. Billing each sale with the buyer’s name covers this.' },
        ],
        related: ['/pesticide-shop-billing-software', '/batch-expiry-stock-software-agri', '/guides/gst-rates-fertilizer-pesticide-seeds', '/guides/fertilizer-dealer-stock-register'],
        sources: [
            { label: 'Insecticides Rules, 1971 (text)', url: 'https://indiankanoon.org/doc/146814531/' },
        ],
    },

    '/guides/fertilizer-dealer-stock-register': {
        eyebrow: 'Guide',
        h1: 'Fertilizer dealer stock register and display board',
        intro: 'What the Fertiliser (Control) Order asks of a retail dealer every day, and how to keep up without extra paperwork.',
        updated: UPDATED,
        sections: [
            {
                h: 'What a retail fertilizer dealer must do',
                ul: [
                    'Hold a valid dealer registration (authorisation letter) for the premises.',
                    'Display, prominently at the shop, the opening stock of each fertilizer for the day and the prices, which cannot exceed the notified maximum.',
                    'Keep a stock register showing opening balance, receipts, sales and closing stock, in the form your state requires.',
                    'Sell subsidised fertilizers through the iFMS PoS device as required.',
                    'File the periodic stock reports your registering authority asks for.',
                ],
                note: 'Based on the Fertiliser (Control) Order, 1985 as amended. Requirements are enforced by state agriculture departments and can differ in detail. This is general information, not legal advice.',
            },
            {
                h: 'A daily routine that takes five minutes',
                ul: [
                    'Morning: check current stock of each fertilizer and update the display board.',
                    'Through the day: bill every sale and enter every receipt as it arrives.',
                    'Evening: closing stock is the morning stock plus receipts minus sales; the software already has it.',
                    'Month end: print the stock and sales summary for your register and reports.',
                ],
            },
            {
                h: 'How KaranArjun ERP helps',
                p: [
                    'Every bill and purchase updates stock immediately, so your current stock for the display board, and your receipts and sales for the register, are always up to date. You still use the government PoS for subsidised sales; the ERP keeps your own books alongside it.',
                ],
            },
        ],
        faqs: [
            { q: 'Can the stock register be digital?', a: 'Some states accept a digital register that shows daily opening balance, receipts, sales and closing stock. Confirm with your registering authority.' },
            { q: 'What if my displayed stock differs from actual stock later in the day?', a: 'The board shows opening stock; actual stock changes through the day with sales and receipts, which inspectors take into account. Keeping every sale billed makes the difference easy to show.' },
        ],
        related: ['/fertilizer-shop-billing-software', '/guides/gst-rates-fertilizer-pesticide-seeds', '/guides/pesticide-dealer-records', '/krishi-seva-kendra-software'],
        sources: [
            { label: 'Fertiliser (Control) Order, 1985 (India Code)', url: 'https://www.indiacode.nic.in/bitstream/123456789/11668/1/6%29_the_fertiliser_%28control%29_order%2C_1985_not_ocr.pdf' },
        ],
    },

    '/guides/udhaar-management-agri-shop': {
        eyebrow: 'Guide',
        h1: 'How to manage farmer udhaar in an agri-input shop',
        intro: 'Credit brings farmers to your counter, and unpaid credit can sink your shop. Simple habits that keep udhaar under control from sowing to harvest.',
        updated: UPDATED,
        sections: [
            {
                h: 'Set rules before the season starts',
                ul: [
                    'Decide a credit limit for each farmer based on land, crop and past payment.',
                    'Agree the repayment time: usually at harvest, with a date, not "later".',
                    'Give more credit to farmers who paid on time last season; less to those who did not.',
                ],
            },
            {
                h: 'Record every credit sale the same day',
                p: [
                    'Most udhaar is lost because it was never written down properly. Bill every credit sale with the farmer’s name and village, keep a running balance per farmer, and record every part payment against it.',
                ],
            },
            {
                h: 'Remind early, politely, and often',
                ul: [
                    'Send a statement when harvest starts, before the money is spent elsewhere.',
                    'Use WhatsApp: it is polite, written and easy to forward to family.',
                    'Plan collection rounds by village, starting with the biggest and oldest balances.',
                ],
            },
            {
                h: 'Watch the numbers every week',
                ul: [
                    'Total udhaar outstanding against your stock and bank balance.',
                    'Balances older than one season.',
                    'Which villages pay well and which do not.',
                ],
            },
        ],
        faqs: [
            { q: 'Should I charge interest on overdue udhaar?', a: 'Many shops do not, but if you do, agree it in advance and write it on the bill. KaranArjun ERP does not add interest automatically.' },
            { q: 'What is the easiest way to remind farmers?', a: 'A WhatsApp message with the balance. In KaranArjun ERP it is one tap from the customer’s khata.' },
        ],
        related: ['/udhaar-khata-app-for-agri-shops', '/krishi-seva-kendra-software', '/seed-shop-billing-software', '/hi/udhaar-khata-app'],
    },

    // ═════════════════════════════ MARATHI ═════════════════════════════
    '/mr/krishi-seva-kendra-billing-software': {
        eyebrow: 'कृषी सेवा केंद्रांसाठी',
        h1: 'कृषी सेवा केंद्रासाठी बिलिंग सॉफ्टवेअर',
        intro: 'खत, कीटकनाशक आणि बियाणे एकाच GST बिलावर. बॅच व एक्सपायरीसह स्टॉक, शेतकऱ्यांची उधारी, पुरवठादार खाती आणि CA साठी रिपोर्ट — सगळं एकाच ॲपमध्ये, मोबाईल किंवा कॉम्प्युटरवर.',
        sections: [
            {
                h: 'एक दुकान, तीन प्रकारचा माल, तीन वेगवेगळे GST दर',
                p: [
                    'कृषी सेवा केंद्रात रासायनिक खतावर 5% GST, कीटकनाशकावर 18% आणि पेरणीच्या बियाण्यांवर शून्य GST असतो — आणि बऱ्याचदा एकाच शेतकऱ्याच्या एकाच बिलावर. माल डझनभर कंपन्यांकडून येतो, काही माल एक्सपायर होतो आणि बरीचशी विक्री काढणीपर्यंत उधारीवर असते. साध्या बिलिंग ॲप्स यासाठी बनलेल्या नाहीत. KaranArjun ERP यासाठीच बनले आहे.',
                ],
            },
            {
                h: 'तुम्हाला काय मिळते',
                ul: [
                    'काउंटरवर जलद बिलिंग आणि मोठ्या ग्राहकांसाठी व FPO साठी GST इन्व्हॉइस.',
                    'प्रत्येक मालावर योग्य HSN कोड व GST दर, एकाच बिलावर वेगवेगळे दर.',
                    'दुकान आणि गोदामातील बॅच व एक्सपायरीनुसार स्टॉक.',
                    'प्रत्येक शेतकऱ्याचे डिजिटल खाते: उधारी, अंशतः जमा, WhatsApp वर आठवण.',
                    'प्रत्येक कंपनी व वितरकाची खरेदी बिले आणि खाती.',
                    'बिलावर तुमचा परवाना क्रमांक, GSTIN आणि UPI QR कोड.',
                    'कर्मचाऱ्यांसाठी वेगळे लॉगिन — काउंटरवरचा माणूस तुमचा नफा न पाहता बिल करू शकतो.',
                    'GSTR-1 व GSTR-3B सारांश, नफा व स्टॉक रिपोर्ट आणि CA साठी सर्व बिलांचे PDF.',
                ],
            },
            {
                h: 'व्यवसायातील लोकांनी बनवलेले',
                p: [
                    'KaranArjun ERP हा करण अर्जुनचा उपक्रम आहे — महाराष्ट्रातील कृषी निविष्ठा व्यवसाय. आम्ही हे सॉफ्टवेअर आमच्या स्वतःच्या बिलिंग, स्टॉक आणि वसुलीसाठी बनवले आणि दररोज वापरतो. म्हणूनच ते फक्त कृषी सेवा केंद्रांसाठी आहे.',
                ],
            },
        ],
        faqs: [
            { q: 'कॉम्प्युटर लागतो का?', a: 'नाही. कोणत्याही अँड्रॉइड मोबाईल, टॅबलेट किंवा लॅपटॉपच्या ब्राउझरमध्ये चालते. थर्मल किंवा A4 प्रिंटर ऐच्छिक आहे.' },
            { q: 'मोफत प्लॅन आहे का?', a: 'नाही. मासिक आणि वार्षिक पेड प्लॅन आहेत. खरेदीपूर्वी WhatsApp वर डेमो मागू शकता.' },
            { q: 'माझे कर्मचारी वापरू शकतात का?', a: 'हो. प्रत्येकासाठी वेगळे लॉगिन आणि भूमिका. किती युजर हे तुमच्या प्लॅनवर अवलंबून आहे.' },
        ],
        related: ['/mr/khat-dukan-billing-software', '/mr/udhari-khata-app', '/krishi-seva-kendra-software', '/guides/gst-rates-fertilizer-pesticide-seeds'],
    },

    '/mr/khat-dukan-billing-software': {
        eyebrow: 'खत विक्रेत्यांसाठी',
        h1: 'खत दुकानासाठी बिलिंग सॉफ्टवेअर',
        intro: 'गोणीनुसार स्टॉक, काही सेकंदांत 5% GST बिल, रोजच्या स्टॉक फलकासाठी तयार माहिती आणि प्रत्येक शेतकऱ्याची उधारी एकाच ठिकाणी.',
        sections: [
            {
                h: 'बिल बुक आणि रजिस्टर आता पुरेसे नाहीत',
                p: [
                    'पेरणीच्या हंगामात खत दुकानात दिवसाला शेकडो गोण्यांचे बिल होते. प्रत्येक गोणी स्टॉक रजिस्टरशी जुळायला हवी, दर ठरलेल्या कमाल किमतीच्या आत असायला हवेत आणि निम्मे शेतकरी काढणीनंतर पैसे देणार असतात. KaranArjun ERP मध्ये बिल छापताच स्टॉक आणि शेतकऱ्याचे खाते दोन्ही अपडेट होतात.',
                ],
            },
            {
                h: 'तुम्हाला काय मिळते',
                ul: [
                    'HSN कोड व CGST/SGST विभागणीसह GST बिल (रासायनिक खतांवर 5%).',
                    'गोणी व पॅकनुसार स्टॉक: 45 किलो युरिया, 50 किलो DAP, सुटे किंवा पूर्ण गोणी.',
                    'प्रत्येक मालाचा चालू स्टॉक एका नजरेत — रोजचा स्टॉक व दर फलक एका मिनिटात.',
                    'खरेदी बिलाने स्टॉक आणि पुरवठादाराचे खाते एकत्र अपडेट.',
                    'शेतकऱ्यांची उधारी, अंशतः जमा आणि WhatsApp आठवण.',
                    'दुकान व गोदाम स्टॉक वेगळा, दोघांमध्ये ट्रान्सफर.',
                ],
            },
            {
                h: 'सरकारी PoS मशीनसोबत चालते',
                p: [
                    'अनुदानित खतांची विक्री नियमांनुसार iFMS PoS मशीनवरूनच होते. KaranArjun ERP त्यासोबत तुमचा स्वतःचा हिशोब ठेवते: तुमची बिले, स्टॉक रजिस्टर, उधारी आणि नफा.',
                ],
            },
        ],
        faqs: [
            { q: 'खतावर GST किती?', a: 'युरिया, DAP सारख्या रासायनिक खतांवर 5% GST. काही सेंद्रिय व जैविक उत्पादनांचे दर वेगळे असू शकतात — शंका असल्यास CA ला विचारा.' },
            { q: 'PoS मशीनची जागा हे घेते का?', a: 'नाही. अनुदानित विक्री PoS मशीनवरूनच होईल. हे सॉफ्टवेअर तुमचा स्वतःचा व्यवसाय हिशोब ठेवते.' },
        ],
        related: ['/mr/krishi-seva-kendra-billing-software', '/mr/udhari-khata-app', '/fertilizer-shop-billing-software', '/guides/fertilizer-dealer-stock-register'],
    },

    '/mr/udhari-khata-app': {
        eyebrow: 'डिजिटल उधारी खाते',
        h1: 'कृषी दुकानांसाठी उधारी खाते ॲप',
        intro: 'शेतकरी पेरणीला माल घेतात आणि काढणीला पैसे देतात. प्रत्येक उधारीचे बिल, अंशतः जमा आणि आठवण एकाच खात्यात — बाजारात किती पैसे अडकले आहेत ते नेहमी समोर.',
        sections: [
            {
                h: 'कृषी उधारी किराणा उधारीसारखी नसते',
                p: [
                    'किराणा दुकानात उधारी काही शे रुपये, काही दिवसांसाठी असते. कृषी दुकानात ती प्रत्येक शेतकऱ्यामागे हजारो रुपये, चार-सहा महिन्यांसाठी आणि पूर्ण गावभर असते. कागदी खाते सांगू शकत नाही की मागच्या हंगामापासून कोणी पैसे दिलेले नाहीत किंवा कोणत्या गावात किती बाकी आहे.',
                ],
            },
            {
                h: 'खाते काय करते',
                ul: [
                    'प्रत्येक उधारीचे बिल आपोआप ग्राहकाच्या खात्यात जाते.',
                    'रोख किंवा UPI ने आलेली अंशतः रक्कम जमा करा.',
                    'एकूण थकबाकी आणि सर्वात जुनी बाकी कोणाची ते पहा.',
                    'WhatsApp वर एका क्लिकमध्ये पैशांची आठवण पाठवा.',
                    'शेतकरी, मोठे ग्राहक आणि पुरवठादार यांची वेगवेगळी खाती.',
                ],
            },
        ],
        faqs: [
            { q: 'आठवण आपोआप जाते का?', a: 'नाही. तुम्ही बटण दाबल्यावर संदेश तयार असलेले WhatsApp उघडते, त्यामुळे कोणाला कधी आठवण द्यायची ते तुम्ही ठरवता.' },
            { q: 'गावनिहाय बाकी पाहता येते का?', a: 'प्रत्येक ग्राहकासोबत गाव किंवा पत्ता असतो, त्यामुळे गावनिहाय बाकी शोधून वसुलीचे नियोजन करता येते.' },
        ],
        related: ['/mr/krishi-seva-kendra-billing-software', '/mr/khat-dukan-billing-software', '/udhaar-khata-app-for-agri-shops', '/guides/udhaar-management-agri-shop'],
    },

    // ═════════════════════════════ HINDI ═════════════════════════════
    '/hi/krishi-seva-kendra-billing-software': {
        eyebrow: 'कृषि सेवा केंद्रों के लिए',
        h1: 'कृषि सेवा केंद्र के लिए बिलिंग सॉफ्टवेयर',
        intro: 'खाद, कीटनाशक और बीज एक ही GST बिल पर। बैच और एक्सपायरी के साथ स्टॉक, किसानों का उधार, सप्लायर खाते और CA के लिए रिपोर्ट — सब एक ऐप में, मोबाइल या कंप्यूटर पर।',
        sections: [
            {
                h: 'एक दुकान, तीन तरह का माल, तीन GST दरें',
                p: [
                    'कृषि सेवा केंद्र में रासायनिक खाद पर 5% GST, कीटनाशक पर 18% और बुवाई के बीज पर शून्य GST लगता है — और अक्सर एक ही किसान के एक ही बिल पर। माल दर्जनों कंपनियों से आता है, कुछ माल एक्सपायर होता है और बड़ी बिक्री कटाई तक उधार पर रहती है। आम बिलिंग ऐप इसके लिए नहीं बने। KaranArjun ERP इसी के लिए बना है।',
                ],
            },
            {
                h: 'आपको क्या मिलता है',
                ul: [
                    'काउंटर पर तेज़ बिलिंग और बड़े ग्राहकों व FPO के लिए GST इनवॉइस।',
                    'हर माल पर सही HSN कोड और GST दर, एक बिल पर अलग-अलग दरें।',
                    'दुकान और गोदाम में बैच और एक्सपायरी के हिसाब से स्टॉक।',
                    'हर किसान का डिजिटल खाता: उधार, आंशिक भुगतान, WhatsApp पर याद दिलाना।',
                    'हर कंपनी और डिस्ट्रीब्यूटर की खरीद और खाते।',
                    'बिल पर आपका लाइसेंस नंबर, GSTIN और UPI QR कोड।',
                    'स्टाफ के लिए अलग लॉगिन — काउंटर वाला आपका मुनाफ़ा देखे बिना बिल बना सकता है।',
                    'GSTR-1 और GSTR-3B सारांश, मुनाफ़ा और स्टॉक रिपोर्ट, और CA के लिए सारे बिल PDF में।',
                ],
            },
            {
                h: 'इस धंधे के लोगों ने बनाया',
                p: [
                    'KaranArjun ERP करण अर्जुन की पहल है — महाराष्ट्र का एक कृषि इनपुट व्यवसाय। हमने इसे अपनी बिलिंग, स्टॉक और वसूली के लिए बनाया और रोज़ इस्तेमाल करते हैं। इसलिए यह सिर्फ़ कृषि इनपुट दुकानों के लिए है।',
                ],
            },
        ],
        faqs: [
            { q: 'क्या कंप्यूटर चाहिए?', a: 'नहीं। यह किसी भी एंड्रॉइड मोबाइल, टैबलेट या लैपटॉप के ब्राउज़र में चलता है। थर्मल या A4 प्रिंटर वैकल्पिक है।' },
            { q: 'क्या मुफ़्त प्लान है?', a: 'नहीं। मासिक और वार्षिक पेड प्लान हैं। खरीदने से पहले WhatsApp पर डेमो माँग सकते हैं।' },
            { q: 'क्या मेरा स्टाफ इस्तेमाल कर सकता है?', a: 'हाँ। हर किसी का अलग लॉगिन और भूमिका। कितने यूज़र, यह आपके प्लान पर निर्भर है।' },
        ],
        related: ['/hi/khad-beej-dukan-billing-software', '/hi/udhaar-khata-app', '/krishi-seva-kendra-software', '/guides/gst-rates-fertilizer-pesticide-seeds'],
    },

    '/hi/khad-beej-dukan-billing-software': {
        eyebrow: 'खाद-बीज विक्रेताओं के लिए',
        h1: 'खाद-बीज दुकान के लिए बिलिंग सॉफ्टवेयर',
        intro: 'बोरी और लॉट के हिसाब से स्टॉक, सही GST वाले बिल, रोज़ के स्टॉक बोर्ड के लिए तैयार जानकारी और हर किसान का उधार एक जगह।',
        sections: [
            {
                h: 'बिल बुक और रजिस्टर अब काफ़ी नहीं',
                p: [
                    'बुवाई के मौसम में खाद-बीज की दुकान पर दिन में सैकड़ों बोरियों के बिल बनते हैं। हर बोरी स्टॉक रजिस्टर से मिलनी चाहिए, दाम तय अधिकतम कीमत के अंदर रहने चाहिए और आधे किसान कटाई के बाद पैसे देंगे। KaranArjun ERP में बिल छपते ही स्टॉक और किसान का खाता दोनों अपडेट हो जाते हैं।',
                ],
            },
            {
                h: 'आपको क्या मिलता है',
                ul: [
                    'HSN कोड और CGST/SGST के साथ GST बिल: रासायनिक खाद 5%, बुवाई के बीज शून्य।',
                    'बोरी और पैक के हिसाब से स्टॉक: 45 किलो यूरिया, 50 किलो DAP, खुला या पूरी बोरी।',
                    'बीज का लॉट और वैधता तारीख के साथ स्टॉक।',
                    'हर माल का मौजूदा स्टॉक एक नज़र में — रोज़ का स्टॉक और भाव बोर्ड एक मिनट में।',
                    'खरीद बिल से स्टॉक और सप्लायर खाता एक साथ अपडेट।',
                    'किसानों का उधार, आंशिक भुगतान और WhatsApp पर याद दिलाना।',
                ],
            },
            {
                h: 'सरकारी PoS मशीन के साथ चलता है',
                p: [
                    'सब्सिडी वाली खाद की बिक्री नियम के अनुसार iFMS PoS मशीन से ही होती है। KaranArjun ERP उसके साथ आपका अपना हिसाब रखता है: आपके बिल, स्टॉक रजिस्टर, उधार और मुनाफ़ा।',
                ],
            },
        ],
        faqs: [
            { q: 'खाद पर कितना GST लगता है?', a: 'यूरिया, DAP जैसी रासायनिक खाद पर 5% GST। कुछ जैविक उत्पादों की दर अलग हो सकती है — शक हो तो CA से पूछें।' },
            { q: 'बीज पर GST लगता है?', a: 'बुवाई के बीज आम तौर पर शून्य GST पर होते हैं। एक ही बिल पर शून्य, 5% और 18% वाले माल सही तरीके से आ जाते हैं।' },
        ],
        related: ['/hi/krishi-seva-kendra-billing-software', '/hi/udhaar-khata-app', '/fertilizer-shop-billing-software', '/seed-shop-billing-software'],
    },

    '/hi/udhaar-khata-app': {
        eyebrow: 'डिजिटल उधार खाता',
        h1: 'कृषि दुकानों के लिए उधार खाता ऐप',
        intro: 'किसान बुवाई पर माल लेते हैं और कटाई पर पैसे देते हैं। हर उधार बिल, आंशिक भुगतान और याद दिलाना एक ही खाते में — बाज़ार में कितना पैसा फँसा है, हमेशा सामने।',
        sections: [
            {
                h: 'कृषि का उधार किराना के उधार जैसा नहीं',
                p: [
                    'किराना दुकान में उधार कुछ सौ रुपये, कुछ दिनों के लिए होता है। कृषि दुकान में यह हर किसान पर हज़ारों रुपये, चार-छह महीनों के लिए और पूरे गाँव में होता है। कागज़ का खाता यह नहीं बता सकता कि पिछले सीज़न से किसने पैसे नहीं दिए या किस गाँव में कितना बाकी है।',
                ],
            },
            {
                h: 'खाता क्या करता है',
                ul: [
                    'हर उधार बिल अपने आप ग्राहक के खाते में जाता है।',
                    'नकद या UPI से आया आंशिक भुगतान दर्ज करें।',
                    'कुल बकाया और सबसे पुराना बकाया किसका है, देखें।',
                    'WhatsApp पर एक टैप में पैसों की याद दिलाएँ।',
                    'किसान, बड़े ग्राहक और सप्लायर के अलग-अलग खाते।',
                ],
            },
        ],
        faqs: [
            { q: 'क्या याद दिलाना अपने आप जाता है?', a: 'नहीं। आप बटन दबाते हैं तो संदेश तैयार WhatsApp खुलता है, ताकि किसे कब याद दिलाना है आप तय करें।' },
            { q: 'क्या गाँव के हिसाब से बकाया दिखता है?', a: 'हर ग्राहक के साथ गाँव या पता रहता है, इसलिए गाँव के हिसाब से बकाया ढूँढकर वसूली की योजना बना सकते हैं।' },
        ],
        related: ['/hi/krishi-seva-kendra-billing-software', '/hi/khad-beej-dukan-billing-software', '/udhaar-khata-app-for-agri-shops', '/guides/udhaar-management-agri-shop'],
    },
};
