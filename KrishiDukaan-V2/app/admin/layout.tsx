"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getUserProfile } from "../firebase";
import { Navbar } from "../../components/shared/navbar";
import { AdminShell } from "./_components/admin-shell";
import Link from "next/link";
import { ICONS } from "../constants";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/admin-login");
        return;
      }
      const profile = await getUserProfile(user.uid);
      if (profile?.role === "admin") {
        setLoading(false);
      } else {
        router.push("/admin-login");
      }
    });
    return () => unsub();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mb-4" />
        <p className="font-bold text-primary">Verifying admin access…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar isDashboard={true} />
      <div className="flex-1 flex overflow-hidden pb-16 md:pb-0">
        <AdminShell>{children}</AdminShell>
      </div>

      {/* Bottom nav — mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-surface-container bg-white/95 px-3 py-2 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5 gap-2">
          {([
            { key: 'home',    icon: ICONS.Home,      label: 'Home',    href: '/' },
            { key: 'market',  icon: ICONS.Market,    label: 'Market',  href: '/?view=market' },
            { key: 'hub',     icon: ICONS.Hub,       label: 'Hub',     href: '/?view=hub' },
            { key: 'map',     icon: ICONS.Location,  label: 'Stores',  href: '/?view=map' },
            { key: 'admin',   icon: ICONS.Dashboard, label: 'Admin',   href: '/admin' },
          ] as { key: string; icon: React.ElementType; label: string; href: string }[]).map((item) => {
            const isActive = item.key === 'admin';
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 transition-all ${
                  isActive
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="truncate text-[9px] font-bold uppercase tracking-wide">{item.label}</span>
                {isActive && (
                  <span className="absolute inset-0 -z-10 rounded-2xl border border-primary/15 bg-primary/10" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
