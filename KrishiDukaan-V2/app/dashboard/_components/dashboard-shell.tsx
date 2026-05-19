"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Menu, Package, ReceiptText, Star, UserCircle2 } from "lucide-react";
import { Sidebar } from "./sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const mobileNav = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/dashboard/inventory", label: "Stock", icon: Package },
    { href: "/dashboard/orders", label: "Orders", icon: ReceiptText },
    { href: "/dashboard/reviews", label: "Reviews", icon: Star },
    { href: "/dashboard/profile", label: "Profile", icon: UserCircle2 },
  ] as const;

  return (
    <div className="flex-1 bg-surface relative overflow-y-auto h-[calc(100vh-64px)]">
      <Sidebar mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />

      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-outline-variant/30 bg-surface-container-lowest/90 px-4 backdrop-blur md:hidden">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-outline-variant/40 bg-surface-container-low p-2 text-on-surface hover:bg-surface-container"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-on-surface">Dashboard</span>
        </header>

        <main className="mx-auto w-full max-w-7xl p-4 pb-24 md:p-8 md:pb-8">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-outline-variant/30 bg-white/95 backdrop-blur md:hidden">
        <div className="grid h-16 grid-cols-5">
          {mobileNav.map(({ href, label, icon: Icon }) => {
            const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold ${
                  active ? "text-primary" : "text-on-surface-variant"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
