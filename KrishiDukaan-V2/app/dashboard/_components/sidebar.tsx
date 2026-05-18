"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  Star,
  UserCircle2,
  UsersRound,
  X,
} from "lucide-react";
import { auth, getUserProfile } from "../../firebase";
import { cn } from "../_lib/cn";

const baseNav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/inventory", label: "Inventory", icon: Package },
  { href: "/dashboard/orders", label: "Orders", icon: ReceiptText },
  { href: "/dashboard/reviews", label: "Reviews", icon: Star },
  { href: "/dashboard/profile", label: "Profile", icon: UserCircle2 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

const subscriptionNav = {
  href: "/dashboard/subscription",
  label: "Subscription",
  icon: CreditCard,
} as const;

const manufacturerExtras = [
  { href: "/dashboard/manufacturer/retailers", label: "Retailer network", icon: UsersRound },
] as const;

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
  const [role, setRole] = useState<"manufacturer" | "retailer" | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRole(null);
        return;
      }
      try {
        const profile = await getUserProfile(user.uid);
        const r = profile?.role;
        setRole(r === "manufacturer" || r === "retailer" ? r : null);
      } catch {
        setRole(null);
      }
    });
    return () => unsub();
  }, []);

  const nav = (() => {
    const base = [...baseNav];
    if (role === "manufacturer") {
      // Insert: retailer network + subscription after Inventory (index 2)
      return [
        ...base.slice(0, 3),
        ...manufacturerExtras,
        subscriptionNav,
        ...base.slice(3),
      ];
    }
    if (role === "retailer") {
      // Insert: subscription after Inventory (index 2)
      return [...base.slice(0, 3), subscriptionNav, ...base.slice(3)];
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
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            const tourKey = hrefToTourKey(href);
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
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
