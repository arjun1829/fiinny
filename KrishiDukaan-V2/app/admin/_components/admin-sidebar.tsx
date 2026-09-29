"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, LayoutDashboard, Layers, Users, X, Mail, MessageSquare, Building2, BarChart3, CreditCard, BookOpen, Tag, Package, MessageCircle, Video, UserCog, ShoppingCart, IndianRupee, Banknote, ReceiptText, Zap, ShieldAlert, Contact, GalleryHorizontal, Link2 } from "lucide-react";
import { cn } from "../../dashboard/_lib/cn";
import { useAdminAuth, hasSection, type AdminSection } from "../_context/admin-auth-context";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, section: "overview" as AdminSection },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, section: "analytics" as AdminSection },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, section: "orders" as AdminSection },
  { href: "/admin/payments", label: "Payments", icon: ReceiptText, section: "payments" as AdminSection },
  { href: "/admin/users", label: "Users & Roles", icon: Users, section: "users" as AdminSection },
  { href: "/admin/sales-team", label: "Sales Team", icon: Contact, section: "salesTeam" as AdminSection },
  { href: "/admin/referrals", label: "Referrals", icon: Link2, section: "referrals" as AdminSection },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard, section: "subscriptions" as AdminSection },
  { href: "/admin/payouts", label: "Seller Payouts", icon: Banknote, section: "payouts" as AdminSection },
  { href: "/admin/route-payouts", label: "Route Payouts", icon: Zap, section: "routePayouts" as AdminSection },
  { href: "/admin/pricing", label: "Pricing & Promos", icon: IndianRupee, section: "pricing" as AdminSection },
  { href: "/admin/products", label: "Products", icon: Box, section: "products" as AdminSection },
  { href: "/admin/reels", label: "Reels", icon: Video, section: "reels" as AdminSection },
  // Apple Guideline 1.2 requires reports on user-generated content to reach a
  // human who can act within 24 hours — this is that queue.
  { href: "/admin/moderation", label: "Moderation", icon: ShieldAlert, section: "moderation" as AdminSection },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle, section: "whatsapp" as AdminSection },
  { href: "/admin/messages", label: "Messages", icon: MessageSquare, section: "messages" as AdminSection },
  { href: "/admin/discounts", label: "Discounts", icon: Tag, section: "discounts" as AdminSection },
  { href: "/admin/companies", label: "Company Pages", icon: Building2, section: "companies" as AdminSection },
  { href: "/admin/hubs", label: "Hubs", icon: Layers, section: "hubs" as AdminSection },
  { href: "/admin/banners", label: "Banners", icon: GalleryHorizontal, section: "banners" as AdminSection },
  { href: "/admin/reports", label: "Reports", icon: Mail, section: "reports" as AdminSection },
  { href: "/admin/inventory", label: "Inventory", icon: Package, section: "inventory" as AdminSection },
  { href: "/admin/blog", label: "Blog", icon: BookOpen, section: "blog" as AdminSection },
] as const;

// Admin-only — never shown to (or reachable by) a "team" account, since
// granting access to Team management would let a team member create more
// team accounts or grant themselves further sections.
const teamNavItem = { href: "/admin/team", label: "Team", icon: UserCog };

type Props = { mobileOpen: boolean; onClose: () => void };

export function AdminSidebar({ mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const identity = useAdminAuth();
  const visibleItems = navItems.filter((item) => hasSection(identity, item.section));

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

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {visibleItems.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container"
                )}
              >
                <Icon className="h-5 w-5 shrink-0 opacity-90" />
                {label}
              </Link>
            );
          })}

          {identity.role === "admin" && (
            <>
              <div className="my-2 border-t border-outline-variant/20" />
              <Link
                href={teamNavItem.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  pathname.startsWith(teamNavItem.href)
                    ? "bg-primary text-white shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container"
                )}
              >
                <teamNavItem.icon className="h-5 w-5 shrink-0 opacity-90" />
                {teamNavItem.label}
              </Link>
            </>
          )}
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
              <p className="mt-0.5 text-xs text-on-surface-variant">{visibleItems.length} section{visibleItems.length !== 1 ? "s" : ""} granted</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
