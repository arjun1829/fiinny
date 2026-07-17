"use client";

import { Lock } from "lucide-react";
import Link from "next/link";

export function FeatureLocked() {
  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 px-6 py-16 text-center">
      <div className="rounded-full bg-surface-container p-5">
        <Lock className="h-9 w-9 text-on-surface-variant/40" />
      </div>
      <div>
        <p className="text-base font-bold text-on-surface">Feature Locked</p>
        <p className="mt-1.5 text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
          Enable Online Delivery in your Profile to access Orders and Delivery Settings.
        </p>
      </div>
      <Link
        href="/dashboard/profile"
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-all"
      >
        Go to Profile
      </Link>
    </div>
  );
}
