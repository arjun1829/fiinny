"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Lock,
  Package,
  ReceiptText,
  Star,
  UserCircle2,
  UsersRound,
  X,
} from "lucide-react";
import { auth, getUserProfile } from "../../firebase";
import { cn } from "../_lib/cn";
import { useI18n } from "../../i18n/I18nContext";

const baseNav = [
  { href: "/dashboard", labelKey: "sideOverview" as const, icon: LayoutDashboard },
  { href: "/dashboard/analytics", labelKey: "sideAnalytics" as const, icon: BarChart3 },
  { href: "/dashboard/inventory", labelKey: "sideInventory" as const, icon: Package },
  { href: "/dashboard/orders", labelKey: "sideOrders" as const, icon: ReceiptText },
  { href: "/dashboard/reviews", labelKey: "sideReviews" as const, icon: Star },
  { href: "/dashboard/profile", labelKey: "sideProfile" as const, icon: UserCircle2 },
] as const;

const subscriptionNavKey = {
  href: "/dashboard/subscription",
  labelKey: "sideSubscription" as const,
  icon: CreditCard,
};

const manufacturerExtrasKeys = [
  { href: "/dashboard/manufacturer/retailers", labelKey: "sideRetailerNetwork" as const, icon: UsersRound },
];

function hrefToTourKey(href: string): string {
  switch (href) {
    case "/dashboard":
      return "overview";
    case "/dashboard/analytics":
      return "analytics";
    case "/dashboard/inventory":
      return "inventory";
    case "/dashboard/subscription":
      return "subscription";
    case "/dashboard/orders":
      return "orders";
    case "/dashboard/reviews":
      return "reviews";
    case "/dashboard/profile":
      return "profile";
    case "/dashboard/settings":
      return "settings";
    case "/dashboard/manufacturer/retailers":
      return "retailer-network";
    default:
      return "";
  }
}

type SidebarProps = {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

export function Sidebar({ mobileOpen, onMobileOpenChange }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [role, setRole] = useState<"manufacturer" | "retailer" | null>(null);
  const [onlineDelivery, setOnlineDelivery] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRole(null);
        setOnlineDelivery(false);
        return;
      }
      try {
        const profile = await getUserProfile(user.uid);
        const r = profile?.role;
        setRole(r === "manufacturer" || r === "retailer" ? r : null);
        setOnlineDelivery(!!(profile as any)?.onlineDelivery);
      } catch {
        setRole(null);
        setOnlineDelivery(false);
      }
    });
    return () => unsub();
  }, []);

  const nav = (() => {
    const base = [...baseNav];
    if (role === "manufacturer") {
      return [
        ...base.slice(0, 3),
        ...manufacturerExtrasKeys,
        subscriptionNavKey,
        ...base.slice(3),
      ];
    }
    if (role === "retailer") {
      return [...base.slice(0, 3), subscriptionNavKey, ...base.slice(3)];
    }
    return base;
  })();

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 top-16 z-40 bg-on-surface/40 backdrop-blur-sm md:hidden"
          onClick={() => onMobileOpenChange(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed left-0 top-16 z-50 flex h-[calc(100vh-64px)] w-64 flex-col border-r border-outline-variant/30 bg-surface-container-lowest shadow-ambient transition-transform duration-200 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-outline-variant/30 px-4 md:h-16">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 hover:scale-[1.02] transition-transform"
            onClick={() => onMobileOpenChange(false)}
          >
            <img 
              src="/images/krishidukan icon.webp" 
              alt="Logo" 
              className="w-8 h-8 object-contain"
            />
            <span className="font-black text-sm text-primary tracking-tight">
              Krishi<span className="text-secondary">Dukan</span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container md:hidden"
            aria-label="Close sidebar"
            onClick={() => onMobileOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map(({ href, labelKey, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            const tourKey = hrefToTourKey(href);
            const isOrdersLocked = href === "/dashboard/orders" && !onlineDelivery;

            if (isOrdersLocked) {
              return (
                <Link
                  key={href}
                  href={href}
                  data-tour-dash={tourKey}
                  onClick={() => onMobileOpenChange(false)}
                  title={t('enableOnlineDeliveryHint')}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface-variant/50 hover:bg-surface-container/50"
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{t(labelKey)}</span>
                  <Lock className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
                </Link>
              );
            }

            return (
              <Link
                key={href}
                href={href}
                data-tour-dash={tourKey}
                onClick={() => onMobileOpenChange(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container",
                )}
              >
                <Icon className="h-5 w-5 shrink-0 opacity-90" />
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
