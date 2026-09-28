import type { Metadata } from "next";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore/lite";
import { PLAY_STORE_URL } from "../lib/store-links";
import { getClientDb } from "../lib/firebase-client-server";
import {
  DEFAULT_DURATIONS,
  PRICING_DOC_PATH,
  isFlatPlan,
  parseDurations,
  perMonthLabel,
  tierOf,
  type DurationPrice,
} from "../lib/pricing";
import {
  LEGAL_ROUTES,
  loadPublicFeeRates,
  pct,
  type PublicFeeRates,
} from "../lib/legal";
import { LegalLinks } from "../../components/shared/legal-doc";

/**
 * Public, indexable seller-acquisition page.
 *
 * Every other seller surface (/dashboard/upgrade, /dashboard/subscription) is
 * auth-gated AND Disallow'd in robots.ts, so nothing on the site answered the
 * seller-intent query "where can I sell agri products online and what does it
 * cost". This page is the crawlable answer, and it states the real numbers in
 * plain text so search engines and AI answer engines can quote them.
 *
 * EVERY number on this page is derived, never typed:
 *
 *   subscription prices  ← settings/pricing (app/lib/pricing.ts), the same
 *                          document api/payment/create-order charges from
 *   platform fee         ← settings/route   (app/lib/legal.ts wrapping
 *   gateway fee            app/lib/route-split.ts), the same document
 *                          api/payment/create-cart-order splits a payment with
 *
 * so the advertised figure cannot drift from the billed one.
 *
 * THIS PAGE USED TO SAY "0% commission, always" and "you keep 100% of your
 * price", in the H1, the hero stat, a feature card, two FAQ answers and the
 * JSON-LD offer schema. That was hand-typed in ten places with nothing tying it
 * to the code, and it stopped being true the moment a platform fee existed. The
 * legal statement of these charges is app/seller-terms/page.tsx; this page is
 * the plain-language summary of it and must not contradict it.
 */
export const revalidate = 86400;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export async function generateMetadata(): Promise<Metadata> {
  const [plans, fees] = await Promise.all([loadPlans(), loadPublicFeeRates()]);
  const { entry, best } = headline(plans);

  // `absolute` bypasses the "%s | KrishiDukan" template in app/layout.tsx — the
  // brand is already in the title, and the template pushed it past 100 chars.
  const TITLE = `Sell on KrishiDukan — ₹${entry.price} per Product Listing, ${pct(fees.platformFeePercent)} Platform Fee`;
  const DESCRIPTION =
    `Sell seeds, fertilizers, pesticides and farming tools online on KrishiDukan. ` +
    `Listings start at ₹${entry.price} per product per ${entry.months === 1 ? "month" : `${entry.months} months`}, ` +
    `or ₹${best.price} per product for ${best.label.toLowerCase()}. On online sales, a ` +
    `${pct(fees.platformFeePercent)} KrishiDukan platform fee applies, plus payment gateway ` +
    `charges of currently around ${pct(fees.gatewayFeePercent)} levied by the payment provider. ` +
    `GST extra as applicable. Open to retailers, manufacturers and agri-input dealers across India.`;

  return {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "sell agri products online",
    "sell pesticides online India",
    "sell fertilizers online",
    "sell seeds online India",
    "agri marketplace seller",
    "low commission agri marketplace",
    "agri marketplace platform fee",
    "agri seller platform India",
    "list products KrishiDukan",
    "agri dealer online selling",
    "farm input seller account",
  ],
  alternates: { canonical: "/sell" },
  openGraph: {
    type: "website",
    siteName: "KrishiDukan",
    url: `${SITE_URL}/sell`,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/images/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Sell on KrishiDukan — ₹${entry.price} per Listing`,
    description: DESCRIPTION,
    images: ["/images/og-default.png"],
  },
  };
}

// ─── Pricing ────────────────────────────────────────────────────────────────
// Read from settings/pricing, the SAME document api/payment/create-order prices
// the charge from. This page used to carry its own hardcoded copy, which meant
// the public marketing price could silently drift from the amount actually
// billed. Falls back to DEFAULT_DURATIONS when the doc is missing.

type Plan = {
  label: string;
  months: number;
  price: number;
  perMonth: string;
  badge?: string;
};

function planLabel(months: number): string {
  if (months === 12) return "1 Year";
  if (months % 12 === 0) return `${months / 12} Years`;
  return months === 1 ? "1 Month" : `${months} Months`;
}

async function loadLadder(): Promise<DurationPrice[]> {
  let durations = DEFAULT_DURATIONS;
  try {
    const snap = await getDoc(
      doc(getClientDb(), PRICING_DOC_PATH.collection, PRICING_DOC_PATH.doc),
    );
    if (snap.exists()) durations = parseDurations(snap.data()) ?? DEFAULT_DURATIONS;
  } catch (err) {
    console.warn("[/sell] pricing read failed, using defaults:", err);
  }
  return durations;
}

/**
 * The per-listing (Custom) ladder — what the seat-model copy and the price
 * headline describe. Standard packs and bundles are not per-listing prices,
 * so they are listed separately (loadStandardPlans) rather than distorting
 * "cheapest per listing" maths here.
 */
async function loadPlans(): Promise<Plan[]> {
  const durations = (await loadLadder()).filter(
    (d) => tierOf(d) === "custom" && !isFlatPlan(d),
  );
  return durations.map((d) => ({
    label: planLabel(d.months),
    months: d.months,
    price: d.pricePerSeat,
    perMonth: perMonthLabel(d),
    ...(d.badge ? { badge: d.badge } : {}),
  }));
}

type StandardPlan = {
  id: string;
  label: string;
  months: number;
  price: number;
  products: number;
  compareAt?: number;
  badge?: string;
};

/** Standard packs (fixed price for a fixed number of products). */
async function loadStandardPlans(): Promise<StandardPlan[]> {
  return (await loadLadder())
    .filter((d) => tierOf(d) === "standard" && d.flatPrice !== undefined)
    .map((d) => ({
      id: d.id ?? String(d.months),
      label: d.months === 1 ? "Monthly" : d.months === 12 ? "Yearly" : planLabel(d.months),
      months: d.months,
      price: d.flatPrice!,
      products: d.includedListings ?? 0,
      ...(d.compareAtPrice ? { compareAt: d.compareAtPrice } : {}),
      ...(d.badge ? { badge: d.badge } : {}),
    }));
}

/**
 * The two plans the prose talks about: the cheapest way in, and the best
 * per-month rate. Derived rather than named so the copy still makes sense if an
 * admin adds, removes or reorders a duration.
 */
function headline(plans: Plan[]) {
  const entry = plans[0]!;
  const best = plans.reduce((a, b) =>
    b.price / b.months < a.price / a.months ? b : a,
  );
  return { entry, best, bestPerMonth: Math.round(best.price / best.months) };
}

/**
 * Built from the live fee config rather than declared as a constant, because the
 * first card states a rate. A card that quotes a number has to be regenerated
 * when the number changes, and the only way to guarantee that is to derive it.
 */
function buildIncluded(fees: PublicFeeRates): { title: string; body: string }[] {
  return [
  {
    title: `Low ${pct(fees.platformFeePercent)} platform fee`,
    body: `KrishiDukan charges ${pct(fees.platformFeePercent)} of the transaction value on successful online sales — not the 5%–25% that percentage-based marketplaces take. Offline and cash-on-delivery sales carry no platform fee.`,
  },
  {
    title: "You set your own prices",
    body: "You control MRP, selling price, discounts and delivery charges on every listing. KrishiDukan never sets or changes your price.",
  },
  {
    title: "Farmers nearby find you",
    body: "Your products surface to farmers searching in your area, on both the website and the mobile app, with directions to your store.",
  },
  {
    title: "Direct WhatsApp enquiries",
    body: "Farmers and retailers contact you directly. No middleman sits between you and your buyer, and no lead fee is charged.",
  },
  {
    title: "AgriReels product videos",
    body: "Post short videos showing your products in use. Reels get their own indexed pages, bringing search traffic to your listings.",
  },
  {
    title: "Full seller dashboard",
    body: "Manage inventory, prices, discounts, delivery charges and orders. Generate GST invoices and track payouts in one place.",
  },
  {
    title: "Bulk enquiries for manufacturers",
    body: "Manufacturers get discovered by retailers across the region and can build distribution without depending on traditional distributors.",
  },
  ];
}

const STEPS: { title: string; body: string }[] = [
  {
    title: "Create your seller account",
    body: "Sign up with your phone number and pick your role — retailer, manufacturer or agri-input dealer.",
  },
  {
    title: "Add your business details",
    body: "Add your store name, address and the licences you trade under, so buyers can see you are a verified seller.",
  },
  {
    title: "List your products",
    body: "Add each product with pack sizes, prices and photos. You pay only for the number of products you choose to list.",
  },
  {
    title: "Receive orders and fulfil them",
    body: "Farmers nearby discover your listings, order or send a direct enquiry. You accept the order, pack it, dispatch it and deliver it — KrishiDukan does not provide delivery or logistics.",
  },
];

/**
 * FAQ copy is generated from the live ladder. These answers state exact rupee
 * figures and are the text AI answer engines are most likely to quote, so they
 * must never outlive a price change.
 */
function buildFaqs(plans: Plan[], fees: PublicFeeRates): { q: string; a: string }[] {
  const { entry, best, bestPerMonth } = headline(plans);
  const ladder = plans
    .map((p) => `₹${p.price} per listing for ${p.label.toLowerCase()}`)
    .join(", ");

  return [
  {
    q: "How much does it cost to sell on KrishiDukan?",
    a:
      `${ladder}. The ${best.label.toLowerCase()} plan works out to about ₹${bestPerMonth} per month. ` +
      `You pay only for the number of products you list, so a seller listing 10 products on the ` +
      `${best.label.toLowerCase()} plan pays ₹${best.price * 10} in total.`,
  },
  {
    q: "What does KrishiDukan charge on a sale?",
    a:
      `On a successful online transaction, KrishiDukan charges a platform fee of ` +
      `${pct(fees.platformFeePercent)} of the transaction value. That is the only ` +
      `transaction charge set by KrishiDukan, and it is far below the 5% to 25% that ` +
      `percentage-based agri marketplaces typically take. Separately, the payment ` +
      `service provider levies its own payment gateway charges — currently around ` +
      `${pct(fees.gatewayFeePercent)} of the transaction value — which are set by the ` +
      `provider and not by KrishiDukan. GST and other applicable taxes are additional, ` +
      `at the rates prescribed under law. Sales you make offline or take as cash on ` +
      `delivery carry no KrishiDukan platform fee and no gateway charge.`,
  },
  {
    q: "So what is deducted from an online order?",
    a:
      `Three things, and they are shown on every order in your dashboard: the ` +
      `${pct(fees.platformFeePercent)} KrishiDukan platform fee, the payment gateway ` +
      `charge (currently about ${pct(fees.gatewayFeePercent)}, levied by the payment ` +
      `service provider, plus the tax the provider charges on its own fee), and any ` +
      `applicable taxes. Current base transaction charges therefore come to about ` +
      `${pct(fees.baseTransactionPercent)}, with GST additional as prescribed by law. ` +
      `Payment gateway charges are not controlled by KrishiDukan and may change from ` +
      `time to time depending on the payment method, the provider and its pricing.`,
  },
  {
    q: "Who handles packing, shipping and delivery?",
    a: "You do. KrishiDukan does not currently provide logistics or delivery services. As the seller you are responsible for inventory, product availability, pricing, packing, dispatch, shipping, delivery and overall order fulfilment, as well as product authenticity, licences, labels and regulatory compliance. KrishiDukan provides the technology platform, the discovery surface and the payment flow.",
  },
  {
    q: "Who can sell on KrishiDukan?",
    a: "Agri-input retailers, manufacturers and dealers in India. You must hold the licences required for what you sell — a CIB & RC registration for pesticides and insecticides, and a fertilizer licence for fertilizers, as required under Indian law. Seeds, tools, sprayers and equipment have their own applicable requirements.",
  },
  {
    q: "Do I need a licence to sell pesticides or fertilizers online?",
    a: "Yes. Selling agrochemicals in India requires valid distribution licences regardless of whether you sell in a shop or online. KrishiDukan is a marketplace for licensed sellers — you continue to trade under your existing licence, and you remain the seller of record on every order.",
  },
  {
    q: "How do I get paid?",
    a: "Online payments settle to the account you register with us, through the payment service provider, net of the KrishiDukan platform fee, the gateway charges and applicable taxes. Cash-on-delivery orders are collected by you directly. Your payouts and the charges on each order are visible in the payouts section of your seller dashboard. Settlement timing depends on the payment service provider and your account setup.",
  },
  {
    q: "Can I try it with just one product?",
    a: `Yes. There is no minimum. You can list a single product for ₹${entry.price} for ${entry.label.toLowerCase()}, see the enquiries it brings, and add more listings whenever you want.`,
  },
  ];
}

export default async function SellPage() {
  const [PLANS, STANDARD, fees] = await Promise.all([
    loadPlans(),
    loadStandardPlans(),
    loadPublicFeeRates(),
  ]);
  const FAQS = buildFaqs(PLANS, fees);
  const INCLUDED = buildIncluded(fees);
  const { entry, best, bestPerMonth } = headline(PLANS);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const serviceLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "KrishiDukan Seller Platform",
    serviceType: "Online agri-input marketplace for sellers",
    url: `${SITE_URL}/sell`,
    areaServed: { "@type": "Country", name: "India" },
    provider: {
      "@type": "Organization",
      name: "KrishiDukan",
      url: SITE_URL,
    },
    description:
      `List seeds, fertilizers, pesticides and farming tools on KrishiDukan. Sellers pay a per-product listing subscription starting at ₹${entry.price} per ${entry.months === 1 ? "month" : `${entry.months} months`}, plus a ${pct(fees.platformFeePercent)} platform fee on successful online transactions and payment gateway charges of currently around ${pct(fees.gatewayFeePercent)} levied by the payment service provider. GST additional as applicable.`,
    offers: PLANS.map((p) => ({
      "@type": "Offer",
      name: `${p.label} product listing`,
      price: String(p.price),
      priceCurrency: "INR",
      description: `₹${p.price} per product listing for ${p.months} month${p.months === 1 ? "" : "s"} (${p.perMonth}). A ${pct(fees.platformFeePercent)} KrishiDukan platform fee applies to successful online transactions, in addition to payment gateway charges levied by the payment service provider (currently around ${pct(fees.gatewayFeePercent)}) and applicable taxes.`,
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Sell on KrishiDukan" },
    ],
  };

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant mb-10"
        >
          <Link href="/" className="hover:text-primary">
            KrishiDukan
          </Link>
          <span>›</span>
          <span className="text-primary">Sell on KrishiDukan</span>
        </nav>

        {/* Hero */}
        <section className="text-center max-w-3xl mx-auto">
          <p className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-primary">
            For retailers, manufacturers &amp; dealers
          </p>
          <h1 className="mt-6 text-3xl sm:text-4xl font-black text-on-surface leading-tight">
            Sell your agri products online — from ₹{entry.price} per listing
          </h1>
          <p className="mt-5 text-base text-on-surface-variant leading-relaxed">
            List seeds, fertilizers, pesticides, herbicides, sprayers and farming
            tools on KrishiDukan and reach farmers across your region. You pay{" "}
            <strong className="text-on-surface">
              ₹{entry.price} per product listing
            </strong>{" "}
            per {entry.months === 1 ? "month" : `${entry.months} months`}, plus a{" "}
            <strong className="text-on-surface">
              {pct(fees.platformFeePercent)} platform fee
            </strong>{" "}
            on successful online sales. Payment gateway charges and applicable
            taxes are additional — the full breakdown is below.
          </p>

          {/* Headline numbers */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-surface-container bg-white p-5">
              <p className="text-3xl font-black text-primary">
                {pct(fees.platformFeePercent)}
              </p>
              <p className="mt-1 text-sm font-bold text-on-surface">
                Platform fee on online sales
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Nothing on offline or cash-on-delivery sales
              </p>
            </div>
            <div className="rounded-2xl border border-surface-container bg-white p-5">
              <p className="text-3xl font-black text-primary">₹{entry.price}</p>
              <p className="mt-1 text-sm font-bold text-on-surface">
                Per product, per{" "}
                {entry.months === 1 ? "month" : `${entry.months} months`}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                As low as ₹{bestPerMonth} on the {best.label.toLowerCase()} plan
              </p>
            </div>
            <div className="rounded-2xl border border-surface-container bg-white p-5">
              <p className="text-3xl font-black text-primary">₹0</p>
              <p className="mt-1 text-sm font-bold text-on-surface">
                Setup &amp; joining fee
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                No fixed monthly platform charge — you pay per listing
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/?view=signup"
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-7 py-3.5 font-bold text-white hover:opacity-90 transition-opacity text-sm"
            >
              Start selling on KrishiDukan →
            </Link>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-surface-container bg-white px-7 py-3.5 font-bold text-on-surface hover:border-primary transition-colors text-sm"
            >
              Get the seller app
            </a>
          </div>
        </section>

        {/* Pricing */}
        <section className="mt-20" id="pricing">
          <h2 className="text-2xl font-black text-on-surface text-center">
            Seller pricing
          </h2>
          <p className="mt-3 text-sm text-on-surface-variant text-center max-w-2xl mx-auto leading-relaxed">
            The subscription is a seat model:{" "}
            <strong className="text-on-surface">one seat = one product listing</strong>.
            You buy the number of seats you need, then add your products — 30
            products need 30 seats. Longer plans cost less per month, and there is
            no minimum. Assigning a product to a retailer in your network occupies
            a seat in the same way, and your dashboard always shows your current
            seat position.
          </p>

          {STANDARD.length > 0 ? (
            <div className="mt-8">
              <h3 className="text-center text-sm font-black uppercase tracking-widest text-on-surface">
                Standard plans
              </h3>
              <div className="mx-auto mt-4 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
                {STANDARD.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-primary/40 bg-white p-5 flex flex-col"
                  >
                    <div className="flex items-center justify-between gap-2 min-h-[24px]">
                      <p className="text-sm font-black text-on-surface">{p.label}</p>
                      {p.badge ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
                          {p.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-4 flex items-baseline gap-2">
                      {p.compareAt && p.compareAt > p.price ? (
                        <span className="text-base text-on-surface-variant line-through">
                          ₹{p.compareAt.toLocaleString("en-IN")}
                        </span>
                      ) : null}
                      <span className="text-3xl font-black text-on-surface">
                        ₹{p.price.toLocaleString("en-IN")}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      for {p.products} product listings
                    </p>
                  </div>
                ))}
              </div>
              <h3 className="mt-10 text-center text-sm font-black uppercase tracking-widest text-on-surface">
                Custom — pay per product
              </h3>
            </div>
          ) : null}

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((p) => (
              <div
                key={p.label}
                className={`rounded-2xl border bg-white p-5 flex flex-col ${
                  p.badge === "Best Value"
                    ? "border-primary ring-1 ring-primary"
                    : "border-surface-container"
                }`}
              >
                <div className="flex items-center justify-between gap-2 min-h-[24px]">
                  <p className="text-sm font-black text-on-surface">{p.label}</p>
                  {p.badge ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">
                      {p.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-3xl font-black text-on-surface">
                  ₹{p.price}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  per product listing
                </p>
                <p className="mt-3 text-sm font-bold text-primary">
                  {p.perMonth}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-sm text-on-surface-variant">
            Example: listing{" "}
            <strong className="text-on-surface">
              10 products on the {best.label.toLowerCase()} plan
            </strong>{" "}
            costs ₹{(best.price * 10).toLocaleString("en-IN")} in total for the
            subscription. Transaction charges on online sales are separate and are
            set out below.
          </p>
        </section>

        {/* Transaction charges — the legally-operative breakdown, in plain text
            so search and answer engines quote the real figures rather than the
            "0% commission" line this page used to lead with. */}
        <section className="mt-20" id="transaction-charges">
          <h2 className="text-2xl font-black text-on-surface text-center">
            What a sale costs you
          </h2>
          <p className="mt-3 text-sm text-on-surface-variant text-center max-w-2xl mx-auto leading-relaxed">
            The subscription above covers your listings. These charges apply only
            when a buyer pays you online through KrishiDukan.
          </p>

          <div className="mt-8 overflow-x-auto rounded-2xl border border-surface-container bg-white">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <tbody>
                <tr className="border-b border-surface-container">
                  <td className="py-4 px-5">
                    <p className="font-bold text-on-surface">
                      KrishiDukan platform fee
                    </p>
                    <p className="mt-0.5 text-xs text-on-surface-variant">
                      Set by KrishiDukan. Charged on successful online transactions.
                    </p>
                  </td>
                  <td className="py-4 px-5 text-right text-lg font-black text-on-surface whitespace-nowrap">
                    {pct(fees.platformFeePercent)}
                  </td>
                </tr>
                <tr className="border-b border-surface-container">
                  <td className="py-4 px-5">
                    <p className="font-bold text-on-surface">
                      Payment gateway charges
                    </p>
                    <p className="mt-0.5 text-xs text-on-surface-variant">
                      Levied by the payment service provider, not by KrishiDukan.
                      Currently approximately this rate; may vary by payment method,
                      provider and pricing plan, and may change from time to time.
                    </p>
                  </td>
                  <td className="py-4 px-5 text-right text-lg font-black text-on-surface whitespace-nowrap">
                    ~{pct(fees.gatewayFeePercent)}
                  </td>
                </tr>
                <tr className="border-b border-surface-container bg-surface-container-low">
                  <td className="py-4 px-5 font-black text-on-surface">
                    Current base transaction charges
                  </td>
                  <td className="py-4 px-5 text-right text-lg font-black text-primary whitespace-nowrap">
                    {pct(fees.baseTransactionPercent)}
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-5">
                    <p className="font-bold text-on-surface">GST and other taxes</p>
                    <p className="mt-0.5 text-xs text-on-surface-variant">
                      Charged separately on applicable fees and charges, at the
                      rates prescribed under applicable law.
                    </p>
                  </td>
                  <td className="py-4 px-5 text-right text-sm font-bold text-on-surface whitespace-nowrap">
                    Additional
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-on-surface-variant text-center max-w-2xl mx-auto leading-relaxed">
            The {pct(fees.baseTransactionPercent)} figure is the platform fee plus
            the gateway charge currently applying, and is stated exclusive of tax.
            No platform fee or gateway charge applies to a sale you complete
            offline or take as cash on delivery. The binding statement of these
            charges is in the{" "}
            <Link
              href={LEGAL_ROUTES.sellerTerms}
              className="font-semibold text-primary hover:underline"
            >
              Seller &amp; Manufacturer Subscription Terms
            </Link>
            .
          </p>
        </section>

        {/* Comparison */}
        <section className="mt-20">
          <h2 className="text-2xl font-black text-on-surface text-center">
            Why sellers choose KrishiDukan
          </h2>
          <p className="mt-3 text-sm text-on-surface-variant text-center max-w-2xl mx-auto leading-relaxed">
            Most agri marketplaces earn from a large percentage of every sale.
            KrishiDukan earns mainly from a flat per-listing subscription, with a
            small {pct(fees.platformFeePercent)} platform fee on online
            transactions — so your cost barely moves as your sales grow.
          </p>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-container">
                  <th className="py-3 px-4 text-left font-black text-on-surface">
                    On a ₹1,00,000 month of sales
                  </th>
                  <th className="py-3 px-4 text-left font-black text-on-surface">
                    Typical commission marketplace
                  </th>
                  <th className="py-3 px-4 text-left font-black text-primary">
                    KrishiDukan
                  </th>
                </tr>
              </thead>
              <tbody className="text-on-surface-variant">
                <tr className="border-b border-surface-container">
                  <td className="py-3 px-4 font-bold text-on-surface">
                    Platform fee on sales
                  </td>
                  <td className="py-3 px-4">5% – 25% of every sale</td>
                  <td className="py-3 px-4 font-bold text-primary">
                    {pct(fees.platformFeePercent)} — ₹
                    {(100000 * fees.platformFeePercent / 100).toLocaleString("en-IN")}
                  </td>
                </tr>
                <tr className="border-b border-surface-container">
                  <td className="py-3 px-4 font-bold text-on-surface">
                    Payment gateway charges
                  </td>
                  <td className="py-3 px-4">Charged by the provider, varies</td>
                  <td className="py-3 px-4">
                    Currently ~{pct(fees.gatewayFeePercent)}, set by the provider
                  </td>
                </tr>
                <tr className="border-b border-surface-container">
                  <td className="py-3 px-4 font-bold text-on-surface">
                    Platform subscription
                  </td>
                  <td className="py-3 px-4">Often ₹2,000 – ₹3,500 per month</td>
                  <td className="py-3 px-4 font-bold text-primary">₹0</td>
                </tr>
                <tr className="border-b border-surface-container">
                  <td className="py-3 px-4 font-bold text-on-surface">
                    Cost to list 10 products
                  </td>
                  <td className="py-3 px-4">Usually bundled into the above</td>
                  <td className="py-3 px-4 font-bold text-primary">
                    ₹{entry.price * 10} per{" "}
                    {entry.months === 1 ? "month" : `${entry.months} months`}, or ₹
                    {bestPerMonth * 10} per month on the {best.label.toLowerCase()}{" "}
                    plan
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-on-surface">
                    You keep, before tax
                  </td>
                  <td className="py-3 px-4">₹75,000 – ₹95,000</td>
                  <td className="py-3 px-4 font-bold text-primary">
                    about ₹
                    {(
                      100000 -
                      (100000 * fees.baseTransactionPercent) / 100
                    ).toLocaleString("en-IN")}
                    , less your listing subscription
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-on-surface-variant text-center max-w-2xl mx-auto leading-relaxed">
            Commission and subscription ranges shown for comparison are typical
            published rates across Indian agri marketplaces and vary by platform
            and product category. Check each platform&apos;s current terms. The
            KrishiDukan column assumes the whole ₹1,00,000 was taken as online
            transactions; sales completed offline or as cash on delivery carry no
            platform fee or gateway charge. Figures are stated before GST and
            other applicable taxes, which are charged at the rates prescribed
            under applicable law.
          </p>
        </section>

        {/* What's included */}
        <section className="mt-20">
          <h2 className="text-2xl font-black text-on-surface text-center mb-8">
            What your listing includes
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {INCLUDED.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-surface-container bg-white p-5"
              >
                <h3 className="text-sm font-black text-on-surface mb-1.5">
                  {f.title}
                </h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How to start */}
        <section className="mt-20">
          <h2 className="text-2xl font-black text-on-surface text-center mb-8">
            How to start selling
          </h2>
          <ol className="grid sm:grid-cols-2 gap-4">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="rounded-2xl border border-surface-container bg-surface-container-low p-5 flex gap-4"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white font-black text-sm flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-sm font-black text-on-surface mb-1">
                    {s.title}
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Eligibility / licences */}
        <section className="mt-20 rounded-2xl border border-surface-container bg-surface-container-low p-6 sm:p-8">
          <h2 className="text-xl font-black text-on-surface mb-3">
            Who can sell, and what licences you need
          </h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            KrishiDukan is open to agri-input retailers, manufacturers and
            dealers across India. Agrochemicals are regulated: selling
            pesticides and insecticides requires a valid CIB &amp; RC
            registration, and selling fertilizers requires a fertilizer licence,
            under the Insecticides Act and the Fertilizer (Control) Order
            respectively. These rules apply to online and offline sales alike.
          </p>
          <p className="mt-3 text-sm text-on-surface-variant leading-relaxed">
            You continue to trade under your own licence and remain the seller of
            record on every order. KrishiDukan is the technology, marketplace and
            discovery platform that connects you to buyers — it does not sell on
            your behalf. Listing a product on KrishiDukan is not a certification
            of its regulatory status: responsibility for licences, registrations,
            labels and compliance stays with you.
          </p>
        </section>

        {/* What the seller is responsible for. This was implicit before, and
            "you fulfil from your existing stock" was the closest the page came
            to saying that KrishiDukan ships nothing. */}
        <section className="mt-20">
          <h2 className="text-2xl font-black text-on-surface text-center">
            What you are responsible for
          </h2>
          <p className="mt-3 text-sm text-on-surface-variant text-center max-w-2xl mx-auto leading-relaxed">
            KrishiDukan provides the technology, the discovery surface and the
            payment flow.{" "}
            <strong className="text-on-surface">
              KrishiDukan does not currently provide logistics or delivery
              services.
            </strong>{" "}
            As the seller, you handle:
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              {
                title: "Stock and availability",
                body: "Maintaining inventory and keeping availability, pack sizes and stock levels accurate on your listings.",
              },
              {
                title: "Pricing",
                body: "Setting and maintaining your MRP, selling price, discounts and any delivery charge you apply.",
              },
              {
                title: "Packing and dispatch",
                body: "Packing each order appropriately and dispatching it within the time your listing states.",
              },
              {
                title: "Shipping and delivery",
                body: "Arranging courier or transport, bearing its cost, and getting the order to the buyer.",
              },
              {
                title: "Product information",
                body: "The accuracy of product name, composition, description, MRP, pack size, images, usage information, labels and any claim you make.",
              },
              {
                title: "Authenticity and compliance",
                body: "Product authenticity, and holding the licences, registrations and regulatory approvals required for what you sell.",
              },
            ].map((r) => (
              <div
                key={r.title}
                className="rounded-2xl border border-surface-container bg-white p-5"
              >
                <h3 className="text-sm font-black text-on-surface mb-1.5">
                  {r.title}
                </h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  {r.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-on-surface-variant leading-relaxed">
            These responsibilities, and the charges above, are set out in full in
            the{" "}
            <Link
              href={LEGAL_ROUTES.sellerTerms}
              className="font-semibold text-primary hover:underline"
            >
              Seller &amp; Manufacturer Subscription Terms
            </Link>
            . The same standard terms apply to every seller and manufacturer on
            KrishiDukan — we do not maintain separate company-specific
            agreements.
          </p>
        </section>

        {/* FAQ */}
        <section className="mt-20">
          <h2 className="text-2xl font-black text-on-surface text-center mb-8">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-surface-container bg-white p-5"
              >
                <summary className="cursor-pointer list-none text-sm font-black text-on-surface flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-primary text-lg leading-none transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-on-surface-variant leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mt-20 mb-8 rounded-2xl bg-primary px-6 py-10 sm:px-10 text-center">
          <h2 className="text-2xl font-black text-white">
            List your first product for ₹{entry.price}
          </h2>
          <p className="mt-3 text-sm text-white/90 max-w-xl mx-auto leading-relaxed">
            No joining fee and no fixed monthly platform charge — you pay per
            listing, plus {pct(fees.platformFeePercent)} on online sales. Try it
            with one product and see the enquiries it brings.
          </p>
          <Link
            href="/?view=signup"
            className="mt-7 inline-flex items-center justify-center rounded-2xl bg-white px-7 py-3.5 font-bold text-primary hover:opacity-90 transition-opacity text-sm"
          >
            Create your seller account →
          </Link>
          <p className="mt-5 text-xs text-white/80 leading-relaxed">
            By creating a seller account or purchasing a subscription you agree to
            the{" "}
            <Link href={LEGAL_ROUTES.terms} className="font-semibold underline">
              Terms &amp; Conditions
            </Link>{" "}
            and the{" "}
            <Link
              href={LEGAL_ROUTES.sellerTerms}
              className="font-semibold underline"
            >
              Seller &amp; Manufacturer Subscription Terms
            </Link>
            .
          </p>
        </section>

        {/* /sell is SSR and does not render the SPA footer, so these are the
            only legal links a crawler or a seller reading this page can reach. */}
        <div className="mb-12 border-t border-surface-container pt-6">
          <LegalLinks />
        </div>
      </div>
    </main>
  );
}
