"use client";

import { useState } from "react";
import {
  HelpCircle, ChevronDown, ChevronRight,
  ShoppingCart, ReceiptText, Banknote, CreditCard, IndianRupee, Tag, Link2,
  Users, Contact, MessageSquare, HeadphonesIcon, MessageCircle,
  Box, Package, Building2, Layers,
  Video, GalleryHorizontal, BookOpen, ShieldAlert, Smartphone,
  BarChart3, Mail,
  UserCog, LayoutDashboard,
  Search, ShieldCheck, AlertTriangle,
} from "lucide-react";

type Section = {
  id: string;
  icon: React.ElementType;
  title: string;
  path: string;
  summary: string;
  details: string[];
};

type Group = {
  label: string;
  sections: Section[];
};

const GROUPS: Group[] = [
  {
    label: "Orders & money",
    sections: [
      {
        id: "orders",
        icon: ShoppingCart,
        title: "Orders",
        path: "/admin/orders",
        summary: "View and manage every order placed on the platform.",
        details: [
          "Filter by status (placed, accepted, dispatched, out for delivery, delivered, rejected, cancelled), seller type, and date range.",
          "Click any order to see full details: line items, bill breakdown, payment status, payout estimate, and status history.",
          "Route Order — reassign a placed or accepted order to a different seller without touching the payment. The payout is resolved against the seller who actually fulfils the order at delivery time.",
          "Manually create an order from a captured Razorpay payment that was not automatically recorded.",
          "Refund a paid order directly from the order detail panel when the seller rejects it.",
          "Existing seller permissions and status transition rules apply. A rejected paid order triggers a refund automatically; if other stores sell the same product online, the platform first offers the order to them for 24 hours.",
        ],
      },
      {
        id: "payments",
        icon: ReceiptText,
        title: "Customer payments",
        path: "/admin/payments",
        summary: "Razorpay payment records and failed payment attempts.",
        details: [
          "See every payment attempt: amount, status (paid / failed / pending), Razorpay order ID, and payment ID.",
          "Filter by date range and payment status to diagnose issues.",
          "Failed attempts show the error description from Razorpay, useful for troubleshooting checkout problems.",
          "Linked to the corresponding order — click through to see the full order context.",
        ],
      },
      {
        id: "payouts",
        icon: Banknote,
        title: "Seller payments",
        path: "/admin/payouts",
        summary: "Manage seller Route transfers, bank accounts, and KYC.",
        details: [
          "Overview tab: total platform earnings, Route transfer summary, pending settlements.",
          "Transfers tab: list of all Route transfers — who was paid, how much, and when. Filter by status and date.",
          "Accounts tab: seller bank accounts and KYC status. Verify or flag accounts. Sellers cannot receive payouts until KYC is approved.",
          "Payout run: release settled Route transfers to seller bank accounts. This is the step that moves money from the platform escrow to the seller.",
          "Payout timing is governed by the Razorpay Route settlement schedule — payouts only release after the buyer's order is delivered and the hold period expires.",
        ],
      },
      {
        id: "subscriptions",
        icon: CreditCard,
        title: "Subscriptions",
        path: "/admin/subscriptions",
        summary: "View, extend, revoke, and manually activate seller subscriptions.",
        details: [
          "Each row shows a seller's active plan: seats purchased, seats used, start date, expiry date.",
          "Extend an existing subscription without a new payment (adds months to the expiry).",
          "Revoke a subscription — marks it inactive immediately.",
          "Manually activate a subscription (admin grant, no payment required). These are flagged separately in the Finance analytics.",
          "Promotional grants — seats granted via admin promos — are highlighted and excluded from revenue figures.",
          "A seller's used seat count is the number of active product listings assigned to them.",
        ],
      },
      {
        id: "pricing",
        icon: IndianRupee,
        title: "Pricing & promos",
        path: "/admin/pricing",
        summary: "Set subscription plan pricing and create time-limited promotions.",
        details: [
          "Retailer pricing: configure the per-seat price ladder (1 month, 3 months, 6 months, 1 year). Flat-price standard packs (e.g. 10 listings for ₹X) can also be defined here.",
          "The /sell public page derives its displayed prices from this config — they are always in sync with what is charged.",
          "Promotions tab: create a time-boxed percentage discount that applies at checkout during the active window.",
          "Influencer pricing tab: set separate subscription prices for the influencer role.",
          "Admin promotions tab: grant promotional subscription seats directly to a seller without a payment flow.",
        ],
      },
      {
        id: "discounts",
        icon: Tag,
        title: "Discounts",
        path: "/admin/discounts",
        summary: "Manage product-level discounts across the marketplace.",
        details: [
          "Apply or remove percentage discounts on individual products.",
          "Discounts are shown to buyers on the product listing and at checkout.",
        ],
      },
      {
        id: "referrals",
        icon: Link2,
        title: "Referrals",
        path: "/admin/referrals",
        summary: "Referral campaigns and invite codes for seller onboarding.",
        details: [
          "Create invite codes that pre-assign a retailer role and optional subscription when a new user signs up.",
          "Track how many sellers joined through each referral code.",
          "Referral-linked signups bypass the normal subscription gate — the buyer can complete their first purchase before paying for a plan.",
        ],
      },
    ],
  },
  {
    label: "People",
    sections: [
      {
        id: "users",
        icon: Users,
        title: "Users & roles",
        path: "/admin/users",
        summary: "View, search, create, and edit all platform users.",
        details: [
          "Search by name, email, phone (full or partial), city, or user ID. Partial phone numbers are supported — typing '9876' finds all users whose phone starts with +91 9876.",
          "Filter tabs: All, Retailer, Manufacturer, Customer, Admin.",
          "Advanced filters: subscription status (active / free), registration date range, city, state.",
          "Sellers (retailer / manufacturer): click Dashboard to open that seller's dashboard as an admin view. All seller edits should be made from their dashboard, not the inline edit panel.",
          "Customers and admins: click Edit to update name, email, address, or role directly.",
          "Pending Signups: sellers pre-registered by the admin who have not yet logged in via OTP.",
          "Export seats: download an Excel file with every seller's running plan, seats bought, seats used, and a follow-up note.",
          "Promote to Admin (danger zone): grants full admin access to any user. Requires typing the user's exact email to confirm. Use only intentionally.",
          "Create User: pre-register a retailer, manufacturer, customer, sales executive, or admin account. For retailers/manufacturers an optional subscription can be activated at creation time.",
        ],
      },
      {
        id: "sales-team",
        icon: Contact,
        title: "Sales team",
        path: "/admin/sales-team",
        summary: "Field sales executive accounts and their dealer activity.",
        details: [
          "Each sales executive is a team member who logs in at /sales/login with email and password.",
          "Click an executive to see their dealer list: shops visited, calls logged, and retailers they onboarded.",
          "Dealer detail shows the shop address, visit history, and linked user account (if the dealer has since signed up).",
        ],
      },
      {
        id: "messages",
        icon: MessageSquare,
        title: "Messages",
        path: "/admin/messages",
        summary: "Contact form submissions from the platform.",
        details: [
          "Enquiries submitted via the website's Contact / About page.",
          "Shows sender name, email, phone, and message body.",
          "No reply interface — contact the sender directly via email or phone.",
        ],
      },
      {
        id: "support",
        icon: HeadphonesIcon,
        title: "Support inbox",
        path: "/admin/support",
        summary: "Real-time customer support chat conversations.",
        details: [
          "A green dot in the sidebar means there are unread messages.",
          "Click a conversation to open it and reply inline.",
          "Conversations are started by users from the Help section of the app.",
          "Resolve a conversation once the issue is addressed to remove it from the active queue.",
        ],
      },
      {
        id: "whatsapp",
        icon: MessageCircle,
        title: "WhatsApp",
        path: "/admin/whatsapp",
        summary: "WhatsApp inbox and message templates.",
        details: [
          "Inbox: incoming WhatsApp messages from buyers and sellers. Reply directly from the admin panel.",
          "A green dot in the sidebar means there are unread WhatsApp messages.",
          "Templates tab: manage pre-built message templates for platform announcements (e.g. Navratri offers). Header media IDs are required for templates that include images.",
          "Templates must be pre-approved by Meta/WhatsApp before they can be sent.",
        ],
      },
    ],
  },
  {
    label: "Catalogue",
    sections: [
      {
        id: "products",
        icon: Box,
        title: "Products",
        path: "/admin/products",
        summary: "The marketplace product catalogue.",
        details: [
          "View and edit all products listed on the platform.",
          "Filter by seller, category, or availability.",
          "Product cards (marketplaceCards) are separate from seller copies — one card per product name, built by Cloud Functions.",
          "Adding a product here creates a canonical listing. Sellers can then create their own copies with their own pricing.",
          "GST rate and extra delivery charge can be configured per product.",
        ],
      },
      {
        id: "product-identity",
        icon: Link2,
        title: "Product identity",
        path: "/admin/product-identity",
        summary: "Link or merge duplicate product entries.",
        details: [
          "When multiple product names refer to the same product (e.g. 'Coragen' and 'Coragen 20 SC'), link them to a single canonical identity.",
          "Linked products share a single marketplace card and search ranking.",
          "Use this to clean up the catalogue after bulk imports or data migrations.",
        ],
      },
      {
        id: "inventory",
        icon: Package,
        title: "Inventory",
        path: "/admin/inventory",
        summary: "Product stock levels across all sellers.",
        details: [
          "See which sellers have which products in stock.",
          "Out-of-stock products are hidden from buyers automatically.",
          "Edit stock levels directly from this view.",
        ],
      },
      {
        id: "companies",
        icon: Building2,
        title: "Company pages",
        path: "/admin/companies",
        summary: "Manufacturer brand pages on the platform.",
        details: [
          "Each company page shows the manufacturer's products, contact info, and about section.",
          "Company pages are generated from manufacturer profiles — edit the profile to update the page.",
          "Buyers reach a brand page by clicking on a manufacturer name on any product listing.",
        ],
      },
      {
        id: "hubs",
        icon: Layers,
        title: "Hubs",
        path: "/admin/hubs",
        summary: "Crop hub content pages (e.g. Tomato Hub, Cotton Hub).",
        details: [
          "Each hub covers a specific crop: what to buy, when, and from whom.",
          "Hubs appear in the app's Hub section and can be targeted by location.",
          "Add, edit, or archive hubs from here.",
        ],
      },
    ],
  },
  {
    label: "Content",
    sections: [
      {
        id: "reels",
        icon: Video,
        title: "Reels",
        path: "/admin/reels",
        summary: "AgriReels short video content.",
        details: [
          "Sellers upload reels showing their products in use.",
          "Reels are transcoded to HLS after upload for streaming.",
          "Approve, reject, or remove reels from this view.",
          "Each reel gets an indexed public page that drives search traffic.",
        ],
      },
      {
        id: "banners",
        icon: GalleryHorizontal,
        title: "Banners",
        path: "/admin/banners",
        summary: "Homepage promotional banners.",
        details: [
          "Upload and manage banners shown in the homepage carousel.",
          "Each banner has an image, optional link, and display order.",
          "Inactive banners are hidden from the app without being deleted.",
        ],
      },
      {
        id: "blog",
        icon: BookOpen,
        title: "Blog",
        path: "/admin/blog",
        summary: "Blog article management.",
        details: [
          "Create and publish blog articles about farming, products, and agri-inputs.",
          "Articles are indexed and drive organic search traffic.",
          "The blog editor supports rich HTML content with headings, lists, and emphasis.",
        ],
      },
      {
        id: "moderation",
        icon: ShieldAlert,
        title: "Moderation",
        path: "/admin/moderation",
        summary: "User-reported content queue.",
        details: [
          "Required by Apple App Store Guideline 1.2 — reports must reach a human reviewer within 24 hours.",
          "Users can report any user-generated content (reels, product listings, messages).",
          "Review each report and take action: dismiss, remove the content, or escalate.",
          "Keep this queue clear — a backlog can jeopardise app store standing.",
        ],
      },
      {
        id: "app-version",
        icon: Smartphone,
        title: "App updates",
        path: "/admin/app-version",
        summary: "Mobile app version management.",
        details: [
          "Set the current latest version and minimum supported version.",
          "If a user's installed version is below the minimum, they see a force-update prompt.",
          "Use the maintenance flag to show a maintenance screen to all app users (both platforms) while a critical update is in progress.",
          "Version strings should match the version codes in the Play Store and App Store.",
        ],
      },
    ],
  },
  {
    label: "Insights",
    sections: [
      {
        id: "analytics",
        icon: BarChart3,
        title: "Analytics",
        path: "/admin/analytics",
        summary: "Platform analytics across revenue, users, and engagement.",
        details: [
          "Overview tab: all-time GMV, paid orders, revenue, and active subscribers. Tiles use the payments ledger — they reconcile with Razorpay rather than showing raw order totals.",
          "Orders tab: order volume and status breakdown over time.",
          "Users Growth tab: new registrations by day and by role.",
          "Traffic tab: page views and referral sources from Google Analytics 4.",
          "Engagement tab: Daily Active Users (DAU) and Monthly Active Users (MAU) from the GA4 Data API. Requires GA4_PROPERTY_ID and a Service Account with Viewer access to be configured.",
          "Retention tab: cohort retention — what percentage of users who joined in week N came back in week N+1, N+2, etc.",
          "Products & Network tab: marketplace product discovery and retailer coverage.",
          "Finance tab: subscription revenue split (paid subscriptions vs promotional grants), broken down by month.",
        ],
      },
      {
        id: "reports",
        icon: Mail,
        title: "Reports",
        path: "/admin/reports",
        summary: "Export platform data reports via email.",
        details: [
          "Generate and email reports on demand: subscriber list, order summary, user list.",
          "Reports are sent to the logged-in admin's email address.",
          "Large exports may take a few minutes to arrive.",
        ],
      },
    ],
  },
  {
    label: "Team",
    sections: [
      {
        id: "team",
        icon: UserCog,
        title: "Team",
        path: "/admin/team",
        summary: "Limited-access staff accounts (full admins only).",
        details: [
          "Create a team member with an email and password — they log in at the same /admin-login URL.",
          "Grant access only to the specific sections they need (e.g. Users, WhatsApp, Support) without giving full admin control.",
          "Team members cannot access Team management, Admin Promotion, or anything outside their granted sections.",
          "Edit a team member's sections at any time without recreating the account.",
          "Delete a team member to immediately revoke their access.",
        ],
      },
    ],
  },
];

function SectionCard({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-container-low transition-colors"
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-on-surface">{section.title}</p>
            <code className="rounded bg-surface-container px-1.5 py-0.5 text-[10px] font-mono text-on-surface-variant">
              {section.path}
            </code>
          </div>
          <p className="mt-0.5 text-xs text-on-surface-variant leading-relaxed">{section.summary}</p>
        </div>
        {open
          ? <ChevronDown className="h-4 w-4 shrink-0 mt-1 text-on-surface-variant" />
          : <ChevronRight className="h-4 w-4 shrink-0 mt-1 text-on-surface-variant" />}
      </button>

      {open && (
        <ul className="border-t border-outline-variant/20 bg-surface-container-low/40 px-4 py-3 space-y-1.5">
          {section.details.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-on-surface-variant leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
              {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminHelpPage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = GROUPS.map((g) => ({
    ...g,
    sections: g.sections.filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.path.includes(q) ||
        s.details.some((d) => d.toLowerCase().includes(q)),
    ),
  })).filter((g) => g.sections.length > 0);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 sm:gap-3 mb-1">
          <HelpCircle className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <h1 className="text-lg sm:text-2xl font-black text-on-surface">Help &amp; Reference</h1>
        </div>
        <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9">
          What each admin section does and how to use it.
        </p>
      </div>

      {/* Quick-reference cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 space-y-0.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Login</p>
          <p className="text-xs font-semibold text-on-surface">/admin-login</p>
          <p className="text-[11px] text-on-surface-variant">Email + password</p>
        </div>
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 space-y-0.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Sales login</p>
          <p className="text-xs font-semibold text-on-surface">/sales/login</p>
          <p className="text-[11px] text-on-surface-variant">Field executives only</p>
        </div>
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 space-y-0.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Seller view</p>
          <p className="text-xs font-semibold text-on-surface">Dashboard button</p>
          <p className="text-[11px] text-on-surface-variant">Opens as seller</p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-0.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Danger
          </p>
          <p className="text-xs font-semibold text-on-surface">Admin promotion</p>
          <p className="text-[11px] text-on-surface-variant">Users &amp; roles → scroll down</p>
        </div>
      </div>

      {/* Tips */}
      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-2">
        <p className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant">Quick tips</p>
        <ul className="space-y-1.5">
          {[
            "The sidebar search box (top-left) finds any admin page by label or keyword.",
            "Stats on the Overview are cached — hit Refresh to see live numbers.",
            "To edit a retailer's or manufacturer's details, open their Dashboard from Users & Roles rather than the inline edit.",
            "The Support and WhatsApp sidebar links show a green dot when there are unread messages.",
            "Moderation reports must be reviewed within 24 hours (Apple App Store Guideline 1.2).",
            "Phone search in Users & Roles supports partial numbers — type as few as 4 digits to start filtering.",
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-on-surface-variant leading-relaxed">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/50" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5">
        <Search className="h-4 w-4 text-on-surface-variant shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search features…"
          className="flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60"
        />
      </div>

      {/* Section groups */}
      <div className="space-y-6">
        {filtered.map((g) => (
          <div key={g.label}>
            <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
              {g.label}
            </p>
            <div className="space-y-2">
              {g.sections.map((s) => (
                <SectionCard key={s.id} section={s} />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-on-surface-variant">
            No sections match &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>

      {/* Footer note */}
      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-3">
        <p className="text-xs text-on-surface-variant leading-relaxed">
          This page documents features that exist in the current build. If a section is missing from your
          sidebar, your team account may not have been granted access to it — contact the platform admin.
        </p>
      </div>
    </div>
  );
}
