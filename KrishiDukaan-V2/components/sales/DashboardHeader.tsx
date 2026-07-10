"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../../app/firebase";
import { LogOut } from "lucide-react";

interface DashboardHeaderProps {
  email?: string | null;
  displayName?: string | null;
}

export default function DashboardHeader({ email, displayName }: DashboardHeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut(auth);
    router.replace("/sales/login");
  };

  const greeting = getGreeting();
  const nameToShow = displayName || (email ? email.split("@")[0] : "");

  return (
    <header className="sticky top-0 z-10 border-b border-outline/15 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-on-surface-variant">{greeting}</p>
          <h1 className="truncate text-base font-bold text-on-surface capitalize">{nameToShow}</h1>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label="Logout"
          className="ml-3 flex shrink-0 items-center gap-1.5 rounded-xl border border-outline/25 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container active:scale-95 disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          {loggingOut ? "…" : "Logout"}
        </button>
      </div>

      <div className="mt-1 flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
        <p className="text-xs text-outline">KrishiDukan Sales</p>
      </div>
    </header>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning,";
  if (h < 17) return "Good afternoon,";
  return "Good evening,";
}
