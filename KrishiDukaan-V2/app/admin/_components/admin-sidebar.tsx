"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Box, LayoutDashboard, Layers, Users, X, ShieldCheck } from "lucide-react";
import { cn } from "../../dashboard/_lib/cn";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users & Roles", icon: Users },
  { href: "/admin/products", label: "Products", icon: Box },
  { href: "/admin/hubs", label: "Hubs", icon: Layers },
] as const;

type Props = { mobileOpen: boolean; onClose: () => void };

export function AdminSidebar({ mobileOpen, onClose }: Props) {
  const pathname = usePathname();

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
          "fixed left-0 top-16 z-50 flex h-[calc(100vh-64px)] w-64 flex-col border-r border-outline-variant/30 bg-surface-container-lowest shadow-ambient transition-transform duration-200 md:translate-x-0",
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

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map(({ href, label, icon: Icon }) => {
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
        </nav>

        <div className="border-t border-outline-variant/30 p-4">
          <div className="rounded-xl bg-primary/5 border border-primary/20 px-3 py-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Admin Access</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">Full platform control</p>
          </div>
        </div>
      </aside>
    </>
  );
}
