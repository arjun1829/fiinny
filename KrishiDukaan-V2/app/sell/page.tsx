import type { Metadata } from "next";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore/lite";
import { PLAY_STORE_URL } from "../lib/store-links";
import { getClientDb } from "../lib/firebase-client-server";
import {
  ArrowRight,
  Check,
  Clock,
  MessageCircle,
  Package,
  Search,
  Share2,
  Smartphone,
  Store,
  Users,
  Wheat,
} from "lucide-react";
import { SiteHeader } from "../../components/shared/site-chrome";
import { SeatCalculator } from "./_components/seat-calculator";
import { TrustedBrandsStrip, type StripPartner } from "./_components/trusted-brands-strip";
import {
  DEFAULT_DURATIONS,
  PRICING_DOC_PATH,
  SEAT_STEP,
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
  const TITLE = `Take Your Agri Shop Online — ${SEAT_STEP} Products for ₹${entry.price * SEAT_STEP} | Sell on KrishiDukan`;
  const DESCRIPTION =
    `Take your agri shop online with KrishiDukan. List seeds, fertilizers, pesticides and farming tools ` +
    `at ₹${entry.price} per product per ${periodOf(entry.months)}, sold in blocks of ${SEAT_STEP} ` +
    `(${SEAT_STEP} products for ₹${entry.price * SEAT_STEP}), or ₹${best.price} per product for ${best.label.toLowerCase()}. On online sales, a ` +
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
    title: `Take Your Shop Online — ${SEAT_STEP} products for ₹${entry.price * SEAT_STEP}`,
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

/**
 * Network size quoted above the logo strip. These are the same hand-maintained
 * figures as the About page stats (app/views/AboutView.tsx on main). Update
 * both together.
 */
const NETWORK = { retailers: "275+", manufacturers: "35+" };

/**
 * Partner logos from siteContent/about, the doc Admin > About page edits and
 * the About page's "Brands & companies connected with us" orbit reads. Public
 * read. Any failure or a disabled list just hides the strip.
 */
async function loadPartners(): Promise<StripPartner[]> {
  try {
    const snap = await getDoc(doc(getClientDb(), "siteContent", "about"));
    const d = snap.exists() ? snap.data() : undefined;
    if (!d || d.partnersEnabled !== true || !Array.isArray(d.partners)) return [];
    return d.partners
      .filter((p: any) => p && typeof p.logoUrl === "string" && p.logoUrl)
      .map((p: any) => ({
        name: typeof p.name === "string" ? p.name : "",
        logoUrl: p.logoUrl as string,
        ...(typeof p.website === "string" && p.website ? { website: p.website } : {}),
      }));
  } catch (err) {
    console.warn("[/sell] partner logos read failed, hiding strip:", err);
    return [];
  }
}

/** "month" for 1, otherwise "N months". */
function periodOf(months: number): string {
  return months === 1 ? "month" : `${months} months`;
}

/**
 * Seasonal strip above the hero. Rabi sowing runs Oct–Dec and kharif Jun–Jul,
 * which is when farmers are buying inputs and searching for them. The page
 * revalidates daily, so the strip switches itself on and off.
 */
function seasonBanner(now = new Date()): string | null {
  const m = now.getMonth(); // 0 = January
  if (m >= 9 && m <= 11)
    return "Rabi sowing season is here. Farmers are buying seeds and fertilizer right now. Be online when they search.";
  if (m === 5 || m === 6)
    return "Kharif sowing season is here. Farmers are buying seeds and fertilizer right now. Be online when they search.";
  return null;
}

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
    // Longest period first — Yearly left, Monthly right, as at checkout.
    .sort((a, b) => b.months - a.months)
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
      `Listings are sold in blocks of ${SEAT_STEP}, so the smallest plan is ${SEAT_STEP} products: ` +
      `₹${entry.price * SEAT_STEP} for ${entry.label.toLowerCase()}, or ₹${best.price * SEAT_STEP} in total ` +
      `for ${best.label.toLowerCase()} (about ₹${bestPerMonth * SEAT_STEP} per month).`,
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
    q: "What is the smallest plan I can buy?",
    a: `Listings are sold in blocks of ${SEAT_STEP}. The smallest purchase is ${SEAT_STEP} product listings for ${entry.label.toLowerCase()}, which costs ₹${entry.price * SEAT_STEP}. You can start with fewer products than that, see the enquiries they bring, and add more blocks of ${SEAT_STEP} whenever you want.`,
  },
  ];
}

export default async function SellPage() {
  const [PLANS, STANDARD, fees, PARTNERS] = await Promise.all([
    loadPlans(),
    loadStandardPlans(),
    loadPublicFeeRates(),
    loadPartners(),
  ]);
  const FAQS = buildFaqs(PLANS, fees);
  const INCLUDED = buildIncluded(fees);
  const { entry, best, bestPerMonth } = headline(PLANS);
  const season = seasonBanner();
  // The campaign numbers: the smallest purchase (one block of SEAT_STEP
  // listings) per month, per day, and the same block on the best-value plan.
  const starterMonthly = Math.round((entry.price * SEAT_STEP) / entry.months);
  const starterPerDay = Math.round(starterMonthly / 30);
  const bestBlockMonthly = bestPerMonth * SEAT_STEP;
  const bestBlockTotal = best.price * SEAT_STEP;
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
      description: `₹${p.price} per product listing for ${p.months} month${p.months === 1 ? "" : "s"} (${p.perMonth}), sold in blocks of ${SEAT_STEP} listings. A ${pct(fees.platformFeePercent)} KrishiDukan platform fee applies to successful online transactions, in addition to payment gateway charges levied by the payment service provider (currently around ${pct(fees.gatewayFeePercent)}) and applicable taxes.`,
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

      <SiteHeader />

      {season ? (
        <div className="bg-primary text-white">
          <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold">
            <Wheat className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-300" aria-hidden />
            {season}
          </p>
        </div>
      ) : null}

      {/* Hero — the "Take Your Shop Online" campaign poster, as a web page.
          Every rupee figure is derived from settings/pricing. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-lime-50 via-white to-surface">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-green-200/50 blur-0"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-5">
          <nav
            aria-label="Breadcrumb"
            className="mb-8 flex items-center gap-2 text-xs font-semibold text-on-surface-variant"
          >
            <Link href="/" className="hover:text-primary">
              KrishiDukan
            </Link>
            <span>›</span>
            <span className="text-primary">Sell on KrishiDukan</span>
          </nav>

          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-black uppercase tracking-wide text-primary shadow-sm ring-1 ring-primary/10">
                <Store className="h-3.5 w-3.5" aria-hidden />
                For agri shops, retailers &amp; dealers
              </p>
              <h1 className="mt-5 text-5xl font-black leading-[1.02] tracking-tight text-primary sm:text-6xl lg:text-7xl">
                Take Your
                <br />
                Shop{" "}
                <span className="relative inline-block whitespace-nowrap">
                  Online
                  <svg
                    aria-hidden
                    viewBox="0 0 200 14"
                    preserveAspectRatio="none"
                    className="absolute -bottom-2 left-0 h-3 w-full text-green-500"
                  >
                    <path
                      d="M3 10 Q 100 0 197 8"
                      stroke="currentColor"
                      strokeWidth="5"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-on-surface-variant sm:text-lg">
                Get your own shop page on KrishiDukan, show all your seeds,
                fertilizers and pesticides, and reach the farmers who search for
                them on their phones.
              </p>

              <div className="mt-7 grid max-w-xl grid-cols-2 gap-3">
                <div className="flex items-center gap-2 rounded-3xl bg-lime-100 px-4 py-4 sm:px-5">
                  <span className="text-[2rem] font-black text-primary sm:text-5xl">
                    ₹{entry.price}
                  </span>
                  <span className="text-xs font-bold leading-tight text-primary sm:text-sm">
                    / product
                    <br />/ {periodOf(entry.months)}
                  </span>
                </div>
                <div className="rounded-3xl bg-primary px-4 py-4 text-white sm:px-5">
                  <p className="text-xs font-bold sm:text-sm">
                    {SEAT_STEP} products for just
                  </p>
                  <p className="mt-0.5 whitespace-nowrap">
                    <span className="text-[2rem] font-black text-yellow-300 sm:text-5xl">
                      ₹{starterMonthly}
                    </span>
                    <span className="text-xs font-bold sm:text-sm"> / month</span>
                  </p>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/?view=signup"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-black text-white shadow-lg shadow-primary/20 transition-opacity hover:opacity-90"
                >
                  Start Selling Now <ArrowRight className="h-5 w-5" aria-hidden />
                </Link>
                <a
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-surface-container bg-white px-6 py-4 text-sm font-bold text-on-surface transition-colors hover:border-primary"
                >
                  <Smartphone className="h-4 w-4" aria-hidden /> Get the seller app
                </a>
              </div>
              <p className="mt-4 text-xs text-on-surface-variant">
                +{pct(fees.platformFeePercent)} platform fee &amp; payment gateway
                charges on online sales only. GST extra.{" "}
                <a href="#transaction-charges" className="font-semibold text-primary hover:underline">
                  See all charges
                </a>
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div
                aria-hidden
                className="absolute -left-4 top-8 h-[85%] w-[90%] rounded-[2.5rem] bg-green-600/15"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/sell/hero-shopkeeper.webp"
                alt="Smiling agri-input shopkeeper in a green apron standing in front of shelves of pesticide and fertilizer"
                width={509}
                height={555}
                fetchPriority="high"
                className="relative w-full rounded-[2.5rem] object-cover shadow-xl"
              />
              <div className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-black/5 sm:left-8">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime-100 text-primary">
                  <Search className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-xs font-bold leading-tight text-on-surface">
                  Farmers nearby
                  <br />
                  <span className="text-on-surface-variant">can find your shop</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The three-icon strip that sits on every campaign poster. */}
      <section className="border-y border-surface-container bg-white">
        <ul className="mx-auto grid max-w-5xl grid-cols-1 gap-5 px-4 py-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-surface-container">
          {[
            { Icon: Store, label: "Your digital shop profile" },
            { Icon: Package, label: "Product catalogue" },
            { Icon: Users, label: "Get discovered by farmers" },
          ].map(({ Icon, label }) => (
            <li key={label} className="flex items-center gap-3 sm:justify-center sm:px-4">
              <Icon className="h-8 w-8 flex-shrink-0 text-green-700" aria-hidden />
              <span className="text-base font-black text-on-surface">{label}</span>
            </li>
          ))}
        </ul>
      </section>

      <TrustedBrandsStrip
        partners={PARTNERS}
        heading={`Trusted by ${NETWORK.retailers} agri retailers & ${NETWORK.manufacturers} manufacturers`}
      />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Pricing — the "₹7 a day" and "Even cheaper yearly" posters, plus a
            calculator that uses checkout's own seat rule. */}
        <section className="mt-12" id="pricing">
          <h2 className="text-center text-3xl font-black tracking-tight text-primary sm:text-4xl">
            {starterPerDay <= 10
              ? `₹${starterPerDay} a day. Less than a chai.`
              : "Simple, per-product pricing"}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base text-on-surface-variant">
            Put {SEAT_STEP} products online for just ₹{starterMonthly}/month. No
            joining fee, no fixed platform charge. You pay only for the products
            you list.
          </p>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col rounded-3xl bg-lime-100 p-5">
                  <p className="text-lg font-black text-primary">{entry.label}</p>
                  <p className="text-sm font-bold text-primary/80">
                    {SEAT_STEP} products
                  </p>
                  <div className="my-4 h-px bg-primary/15" />
                  <p className="text-4xl font-black text-primary">₹{starterMonthly}</p>
                  <p className="text-sm font-bold text-primary/80">/month</p>
                </div>
                {best.months !== entry.months ? (
                  <div className="relative flex flex-col rounded-3xl bg-primary p-5 text-white">
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-yellow-300 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-primary">
                      Best value
                    </span>
                    <p className="text-lg font-black">{best.label}</p>
                    <p className="text-sm font-bold text-white/80">
                      {SEAT_STEP} products
                    </p>
                    <div className="my-4 h-px bg-white/20" />
                    <p className="text-4xl font-black text-yellow-300">
                      ₹{bestBlockMonthly}
                    </p>
                    <p className="text-sm font-bold text-white/80">/month</p>
                  </div>
                ) : null}
              </div>
              {best.months !== entry.months ? (
                <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-on-surface ring-1 ring-surface-container">
                  ₹{bestBlockTotal.toLocaleString("en-IN")} for the whole{" "}
                  {best.months === 12 ? "year" : best.label.toLowerCase()}.
                </p>
              ) : null}
              <ul className="mt-5 space-y-2.5">
                {[
                  "No joining or setup fee",
                  `Listings sold in blocks of ${SEAT_STEP}. Add more whenever you want`,
                  "Nothing to pay on offline or cash-on-delivery sales",
                  "You set your own prices, KrishiDukan never changes them",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-on-surface">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <SeatCalculator
              plans={PLANS.map((p) => ({
                label: p.label,
                months: p.months,
                price: p.price,
                ...(p.badge ? { badge: p.badge } : {}),
              }))}
              standard={STANDARD.map((s) => ({
                label: s.label,
                months: s.months,
                price: s.price,
                products: s.products,
              }))}
            />
          </div>

          <details className="group mt-8 rounded-3xl border border-surface-container bg-white p-5 sm:p-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-black text-on-surface">
              See every plan and how listings work
              <span className="text-lg leading-none text-primary transition-transform group-open:rotate-45">
                +
              </span>
            </summary>

            <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
              The subscription is a seat model:{" "}
              <strong className="text-on-surface">one seat = one product listing</strong>.
              Seats are sold in blocks of {SEAT_STEP}, so 30 products need 30 seats
              and 15 products need 20. Longer plans cost less per month.
              Assigning a product to a retailer in your network occupies a seat in
              the same way, and your dashboard always shows your current seat
              position.
            </p>

            {STANDARD.length > 0 ? (
              <>
                <h3 className="mt-6 text-xs font-black uppercase tracking-widest text-on-surface">
                  Standard plans
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {STANDARD.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-primary/30 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-on-surface">{p.label}</p>
                        {p.badge ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
                            {p.badge}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 flex items-baseline gap-2">
                        {p.compareAt && p.compareAt > p.price ? (
                          <span className="text-sm text-on-surface-variant line-through">
                            ₹{p.compareAt.toLocaleString("en-IN")}
                          </span>
                        ) : null}
                        <span className="text-2xl font-black text-on-surface">
                          ₹{p.price.toLocaleString("en-IN")}
                        </span>
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        for {p.products} product listings
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <h3 className="mt-6 text-xs font-black uppercase tracking-widest text-on-surface">
              Custom — pay per product
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {PLANS.map((p) => (
                <div
                  key={p.label}
                  className={`rounded-2xl border p-4 ${
                    p.badge === "Best Value"
                      ? "border-primary ring-1 ring-primary"
                      : "border-surface-container"
                  }`}
                >
                  <div className="flex min-h-[22px] items-center justify-between gap-2">
                    <p className="text-sm font-black text-on-surface">{p.label}</p>
                    {p.badge ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">
                        {p.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-2xl font-black text-on-surface">₹{p.price}</p>
                  <p className="text-xs text-on-surface-variant">per product listing</p>
                  <p className="mt-2 text-sm font-bold text-primary">{p.perMonth}</p>
                </div>
              ))}
            </div>
          </details>
        </section>

        {/* "Farmers search before they buy" poster. */}
        <section className="mt-24 grid items-center gap-8 md:grid-cols-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/sell/farmer-searching.webp"
            alt="Farmer in a turban standing in his field, searching on his smartphone"
            width={575}
            height={450}
            loading="lazy"
            className="w-full rounded-[2rem] object-cover shadow-lg"
          />
          <div>
            <h2 className="text-3xl font-black leading-tight tracking-tight text-primary sm:text-4xl">
              Farmers search before they buy.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-on-surface-variant">
              When a farmer looks for a seed, a fertilizer or a pesticide on his
              phone, will he find{" "}
              <strong className="text-on-surface">your</strong> shop? On
              KrishiDukan your products show up to farmers searching in your area,
              with directions to your store.
            </p>
            <ul className="mt-5 space-y-2.5">
              {[
                "Shown on the KrishiDukan website and mobile app",
                "Directions to your shop for farmers nearby",
                "A public shop page that search engines can find",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-on-surface">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* "Your shop never closes online" poster. */}
        <section className="mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-lime-100 text-primary">
              <Clock className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
              Your shop never closes online.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-on-surface-variant">
              Your shutter comes down at night. Your online shop doesn&apos;t.
              Farmers can see your products and send you an enquiry at any hour,
              and you reply when it suits you.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/sell/never-closes.webp"
            alt="Left: an agri shop with its shutter closed at 9 pm. Right: the shopkeeper at home at 9:30 pm, reading a farmer's message asking if DAP 50 kg is in stock"
            width={1254}
            height={603}
            loading="lazy"
            className="mt-8 w-full rounded-[2rem] object-cover shadow-lg"
          />
        </section>

        {/* "Farmers message you directly" + "Share your shop link" posters. */}
        <section className="mt-24 grid items-center gap-10 md:grid-cols-[0.8fr_1.2fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/sell/whatsapp-enquiries.webp"
            alt="Phone screen showing enquiries from farmers: price of Coragen 150 ml, availability of hybrid cotton seed, and delivery to a village"
            width={420}
            height={635}
            loading="lazy"
            className="mx-auto w-full max-w-xs"
          />
          <div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-lime-100 text-primary">
              <MessageCircle className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-primary sm:text-4xl">
              Farmers message you directly.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-on-surface-variant">
              No middleman. No lead fee. Enquiries come straight to you on
              WhatsApp, so you can answer about price, stock and delivery the way
              you already do at the counter.
            </p>
          </div>
        </section>

        <section className="mt-24 grid items-center gap-10 md:grid-cols-[1.2fr_0.8fr]">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/sell/shop-on-devices.webp"
              alt="A seller's KrishiDukan shop page shown on a laptop and a phone, with shop name, location, product count and products"
              width={902}
              height={460}
              loading="lazy"
              className="w-full"
            />
            <figcaption className="mt-2 text-center text-[11px] text-on-surface-variant">
              Illustration. Your page shows your own shop name, details and products.
            </figcaption>
          </figure>
          <div className="order-first md:order-last">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-lime-100 text-primary">
              <Share2 className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-primary sm:text-4xl">
              Share your shop link everywhere.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-on-surface-variant">
              Every shop gets its own page with all its products. Send the link to
              farmer WhatsApp groups, put it on your status, print it on your
              bills. Customers see everything you sell in one tap.
            </p>
          </div>
        </section>

        {/* How to start — the "Online in 3 easy steps" poster, keeping the
            fourth step because it carries the "we don't deliver" disclosure. */}
        <section className="mt-24">
          <h2 className="text-center text-3xl font-black tracking-tight text-primary sm:text-4xl">
            Online in {STEPS.length} easy steps.
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => {
              const Icon = [Smartphone, Store, Package, MessageCircle][i] ?? Check;
              return (
                <li
                  key={s.title}
                  className="relative rounded-3xl border border-surface-container bg-white p-5 pt-8"
                >
                  <span className="absolute -top-4 left-5 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-black text-white">
                    {i + 1}
                  </span>
                  <Icon className="h-8 w-8 text-green-700" aria-hidden />
                  <h3 className="mt-3 text-base font-black text-on-surface">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-on-surface-variant">
                    {s.body}
                  </p>
                </li>
              );
            })}
          </ol>
          <div className="mt-8 text-center">
            <Link
              href="/?view=signup"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-black text-white transition-opacity hover:opacity-90"
            >
              Start Now <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
          </div>
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
        <section className="mt-20 mb-8 grid items-center gap-8 overflow-hidden rounded-[2rem] bg-primary px-6 py-10 sm:px-10 md:grid-cols-[1.2fr_0.8fr]">
          <div>
          <h2 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
            Start with {SEAT_STEP} products
            <br />
            for <span className="text-yellow-300">₹{starterMonthly}</span>.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/90 sm:text-base">
            No joining fee and no fixed monthly platform charge. You pay per
            listing, plus {pct(fees.platformFeePercent)} on online sales. List your
            best-selling products, see the enquiries they bring, then add more.
          </p>
          <Link
            href="/?view=signup"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-black text-primary transition-opacity hover:opacity-90"
          >
            Create your seller account <ArrowRight className="h-5 w-5" aria-hidden />
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
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/sell/first-product.webp"
            alt="A 500 ml pesticide bottle next to a phone showing the same product listed on KrishiDukan with Enquire Now and WhatsApp enquiry buttons"
            width={500}
            height={650}
            loading="lazy"
            className="mx-auto hidden w-full max-w-xs rounded-[1.5rem] md:block"
          />
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
