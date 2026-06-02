"use client";

import { useState } from "react";
import { Menu, ShieldCheck } from "lucide-react";
import { AdminSidebar } from "./admin-sidebar";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative flex-1 overflow-x-hidden bg-surface min-h-[calc(100dvh-64px)]">
      <AdminSidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="min-h-[calc(100dvh-64px)] md:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-outline-variant/30 bg-surface-container-lowest/90 px-4 backdrop-blur md:hidden">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-outline-variant/40 bg-surface-container-low p-2 text-on-surface hover:bg-surface-container"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-on-surface">Admin Panel</span>
          </div>
        </header>

        <main className="w-full px-3 py-4 pb-24 sm:px-5 md:px-6 md:py-6 md:pb-10">{children}</main>
      </div>
    </div>
  );
}
