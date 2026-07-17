"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Menu, Package, ReceiptText, ShieldAlert, UserCircle2, X, Home } from "lucide-react";
import { Sidebar } from "./sidebar";
import { useI18n } from "../../i18n/I18nContext";
import { useEffectiveUser } from "../_context/effective-user-context";

export function DashboardShell({ children, banner }: { children: React.ReactNode; banner?: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { t } = useI18n();
  const { isAdminView, displayName, uid: effectiveUid } = useEffectiveUser();

  // Primary bottom-nav items (most-used pages) — "Menu" opens the full sidebar
  const mobileNav = [
    { href: "/dashboard",           label: "Overview",  icon: LayoutDashboard },
    { href: "/dashboard/inventory", label: "Stock",     icon: Package },
    { href: "/dashboard/orders",    label: "Orders",    icon: ReceiptText },
    { href: "/dashboard/profile",   label: "Profile",   icon: UserCircle2 },
  ] as const;

  return (
    <div className="flex-1 bg-surface relative overflow-y-auto h-[calc(100vh-64px)]">
      <Sidebar mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />

      <div className="md:pl-64">
        {/* Mobile top bar — hamburger + page title */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-outline-variant/30 bg-surface-container-lowest/90 px-4 backdrop-blur md:hidden">
          <button
            type="button"
            data-dash-menu-toggle
            className="inline-flex items-center justify-center rounded-lg border border-outline-variant/40 bg-surface-container-low p-2 text-on-surface hover:bg-surface-container"
            aria-label="Open menu"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="text-sm font-semibold text-on-surface">{t('dashTitle')}</span>
          {/* Quick link back to consumer app */}
          <Link href="/" className="ml-auto text-[10px] font-bold text-on-surface-variant border border-outline-variant/40 rounded-lg px-2.5 py-1.5 hover:bg-surface-container transition-colors flex items-center gap-1">
            <Home className="h-3 w-3" /> App
          </Link>
        </header>

        {/* Admin impersonation banner */}
        {isAdminView && (
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="text-xs font-semibold text-blue-800 truncate">
                Admin View — <span className="font-bold">{displayName}</span>
              </span>
              {effectiveUid && (
                <span className="hidden sm:inline text-[10px] font-mono text-blue-500 truncate">({effectiveUid})</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                try { sessionStorage.removeItem('kd_admin_view_uid'); } catch {}
                window.location.href = '/admin/users';
              }}
              className="shrink-0 rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
            >
              ← Back to Admin
            </button>
          </div>
        )}

        {banner && <div className="border-b border-amber-200">{banner}</div>}
        <main className="mx-auto w-full max-w-7xl p-4 pb-24 md:p-8 md:pb-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-outline-variant/30 bg-white/95 backdrop-blur md:hidden">
        <div className="grid h-16 grid-cols-5">
          {mobileNav.map(({ href, label, icon: Icon }) => {
            const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition-colors ${
                  active ? "text-primary" : "text-on-surface-variant"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                <span>{label}</span>
              </Link>
            );
          })}

          {/* Menu button — opens full sidebar for Subscription, Analytics, Company, etc. */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition-colors ${
              mobileOpen ? "text-primary" : "text-on-surface-variant"
            }`}
          >
            {mobileOpen
              ? <X className="h-5 w-5 text-primary" />
              : <Menu className="h-5 w-5" />
            }
            <span>More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
