"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {  Box, LayoutDashboard, Layers, Users, X, Mail, MessageSquare, Building2, BarChart3, CreditCard, BookOpen, Tag, Package, MessageCircle, Video, UserCog, ShoppingCart, IndianRupee, Banknote, ReceiptText, ShieldAlert, Contact, GalleryHorizontal, Link2, Search, ChevronDown, Smartphone, Info, SearchCheck , HeadphonesIcon, HelpCircle  } from "lucide-react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { cn } from "../../dashboard/_lib/cn";
import { db } from "../../firebase";
import { useAdminAuth, hasSection, type AdminSection } from "../_context/admin-auth-context";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Box;
  /** Any one of these sections shows the item. */
  sections: AdminSection[];
  /** Other paths that count as this page (old links). */
  also?: string[];
  /** Extra words the search box matches. */
  keywords?: string;
};

type NavGroup = { key: string; label: string; items: NavItem[] };

// Grouped by what an admin is trying to do, instead of one long list.
const navGroups: NavGroup[] = [
  {
    key: "money",
    label: "Orders & money",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingCart, sections: ["orders"] },
      { href: "/admin/payments", label: "Customer payments", icon: ReceiptText, sections: ["payments"], keywords: "razorpay failed attempts" },
      {
        href: "/admin/payouts",
        label: "Seller payments",
        icon: Banknote,
        sections: ["payouts", "routePayouts"],
        also: ["/admin/route-payouts"],
        keywords: "payouts route transfers settlement kyc bank release",
      },
      { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard, sections: ["subscriptions"], keywords: "plans seats" },
      { href: "/admin/pricing", label: "Pricing & promos", icon: IndianRupee, sections: ["pricing"], keywords: "offers coupons" },
      { href: "/admin/discounts", label: "Discounts", icon: Tag, sections: ["discounts"] },
      { href: "/admin/referrals", label: "Referrals", icon: Link2, sections: ["referrals"] },
    ],
  },
  {
    key: "people",
    label: "People",
    items: [
      { href: "/admin/users", label: "Users & roles", icon: Users, sections: ["users"], keywords: "sellers retailers manufacturers farmers" },
      { href: "/admin/sales-team", label: "Sales team", icon: Contact, sections: ["salesTeam"], keywords: "dealers visits" },
      { href: "/admin/messages", label: "Messages", icon: MessageSquare, sections: ["messages"], keywords: "contact" },
      { href: "/admin/support", label: "Support inbox", icon: HeadphonesIcon, sections: ["support"], keywords: "chat help user messages" },
      { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle, sections: ["whatsapp"], keywords: "inbox templates" },
    ],
  },
  {
    key: "catalogue",
    label: "Catalogue",
    items: [
      { href: "/admin/products", label: "Products", icon: Box, sections: ["products"] },
      { href: "/admin/product-identity", label: "Product identity", icon: Link2, sections: ["products"], keywords: "duplicates link canonical merge same product" },
      { href: "/admin/inventory", label: "Inventory", icon: Package, sections: ["inventory"], keywords: "stock" },
      { href: "/admin/companies", label: "Company pages", icon: Building2, sections: ["companies"], keywords: "brands manufacturers" },
      { href: "/admin/hubs", label: "Hubs", icon: Layers, sections: ["hubs"] },
    ],
  },
  {
    key: "content",
    label: "Content",
    items: [
      { href: "/admin/reels", label: "Reels", icon: Video, sections: ["reels"], keywords: "videos" },
      { href: "/admin/banners", label: "Banners", icon: GalleryHorizontal, sections: ["banners"] },
      { href: "/admin/about-page", label: "About page", icon: Info, sections: ["aboutPage"], keywords: "brands partners logos presence india map" },
      { href: "/admin/blog", label: "Blog", icon: BookOpen, sections: ["blog"] },
      // Apple Guideline 1.2 requires reports on user-generated content to reach a
      // human who can act within 24 hours — this is that queue.
      { href: "/admin/moderation", label: "Moderation", icon: ShieldAlert, sections: ["moderation"], keywords: "reports abuse" },
      { href: "/admin/app-version", label: "App updates", icon: Smartphone, sections: ["appVersion"], keywords: "version force update play store release" },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    items: [
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, sections: ["analytics"], keywords: "gmv revenue charts" },
      { href: "/admin/search-insights", label: "Search insights", icon: SearchCheck, sections: ["analytics"], keywords: "searches keywords demand categories" },
      { href: "/admin/search-links", label: "Search links", icon: Link2, sections: ["analytics"], keywords: "search synonyms aliases spellings link products no results" },
      { href: "/admin/reports", label: "Reports", icon: Mail, sections: ["reports"], keywords: "export email" },
    ],
  },
];

const overviewItem: NavItem = { href: "/admin", label: "Overview", icon: LayoutDashboard, sections: ["overview"] };

// Admin-only — never shown to (or reachable by) a "team" account, since
// granting access to Team management would let a team member create more
// team accounts or grant themselves further sections.
const teamNavItem: NavItem = { href: "/admin/team", label: "Team", icon: UserCog, sections: [], keywords: "staff access permissions" };

const COLLAPSED_KEY = "kd.adminNav.collapsed";

function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/admin") return pathname === "/admin";
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

type Props = { mobileOpen: boolean; onClose: () => void };

export function AdminSidebar({ mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const identity = useAdminAuth();
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [supportUnread, setSupportUnread] = useState(false);
  const [whatsappUnread, setWhatsappUnread] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
      if (Array.isArray(saved)) setCollapsed(new Set(saved.map(String)));
    } catch {
      // private window or blocked storage: all groups open
    }
  }, []);

  useEffect(() => {
    const unsubSupport = onSnapshot(
      query(collection(db, "supportConversations"), where("unreadByAdmin", ">", 0), limit(1)),
      (snap) => setSupportUnread(!snap.empty),
      () => setSupportUnread(false),
    );
    const unsubWa = onSnapshot(
      query(collection(db, "waConversations"), where("unreadCount", ">", 0), limit(1)),
      (snap) => setWhatsappUnread(!snap.empty),
      () => setWhatsappUnread(false),
    );
    return () => { unsubSupport(); unsubWa(); };
  }, []);

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // not remembered; fine
      }
      return next;
    });

  const allowed = (item: NavItem) => item.sections.some((s) => hasSection(identity, s));
  const term = filter.trim().toLowerCase();
  const matches = (item: NavItem) => !term || `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(term);
  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(i) && matches(i)) }))
    .filter((g) => g.items.length > 0);
  const showOverview = allowed(overviewItem) && matches(overviewItem);
  const showTeam = identity.role === "admin" && matches(teamNavItem);
  const visibleCount = groups.reduce((n, g) => n + g.items.length, 0) + (showOverview ? 1 : 0);

  const link = (item: NavItem) => {
    const active = isActive(item, pathname);
    const Icon = item.icon;
    const hasBadge =
      (item.href === "/admin/support" && supportUnread) ||
      (item.href === "/admin/whatsapp" && whatsappUnread);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" />
        {item.label}
        {hasBadge && (
          <span className={cn("ml-auto h-2 w-2 shrink-0 rounded-full", active ? "bg-white" : "bg-emerald-700")} />
        )}
      </Link>
    );
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 top-16 z-40 bg-on-surface/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-16 z-50 flex h-[calc(100dvh-64px)] w-[82vw] max-w-64 flex-col border-r border-outline-variant/30 bg-surface-container-lowest shadow-ambient transition-transform duration-200 md:w-64 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-outline-variant/30 px-4 md:h-16">
          <Link
            href="/admin"
            className="flex items-center gap-2 hover:scale-[1.02] transition-transform"
            onClick={onClose}
          >
            <img
              src="/images/krishidukan icon.webp"
              alt="Logo"
              className="w-8 h-8 object-contain"
            />
            <div className="flex flex-col -gap-1">
              <span className="font-black text-sm text-primary tracking-tight leading-none">
                Krishi<span className="text-secondary">Dukan</span>
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant leading-none">Admin</span>
            </div>
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container md:hidden"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-outline-variant/20 px-3 py-2">
          <label className="flex items-center gap-2 rounded-lg bg-surface-container-low px-2.5 py-1.5">
            <Search className="h-4 w-4 text-on-surface-variant" aria-hidden />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a page…"
              aria-label="Find an admin page"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {showOverview && link(overviewItem)}

          {groups.map((g) => {
            const hasActive = g.items.some((i) => isActive(i, pathname));
            // Searching or on one of its pages: always open.
            const open = Boolean(term) || hasActive || !collapsed.has(g.key);
            return (
              <div key={g.key} className="mt-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1 text-[11px] font-black uppercase tracking-widest text-on-surface-variant/80 hover:text-on-surface"
                >
                  {g.label}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open ? "" : "-rotate-90")} />
                </button>
                {open && <div className="mt-0.5 flex flex-col gap-0.5">{g.items.map(link)}</div>}
              </div>
            );
          })}

          {showTeam && (
            <>
              <div className="my-2 border-t border-outline-variant/20" />
              {link(teamNavItem)}
            </>
          )}

          {visibleCount === 0 && !showTeam && (
            <p className="px-3 py-4 text-sm text-on-surface-variant">No page matches "{filter}".</p>
          )}

          <div className={'mt-2 border-t border-outline-variant/20 pt-2'}>
            <Link
              href={'/admin/help'}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                pathname === '/admin/help'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container',
              )}
            >
              <HelpCircle className={'h-[18px] w-[18px] shrink-0 opacity-90'} />
              {'Help & Reference'}
            </Link>
          </div>
        </nav>

        <div className="border-t border-outline-variant/30 p-4 pb-5">
          {identity.role === "admin" ? (
            <div className="rounded-xl bg-primary/5 border border-primary/20 px-3 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Admin Access</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">Full platform control</p>
            </div>
          ) : (
            <div className="rounded-xl bg-secondary/5 border border-secondary/20 px-3 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Team Access</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">{identity.adminSections.length} section{identity.adminSections.length !== 1 ? "s" : ""} granted</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
