"use client";

/**
 * /subscribe?ref=CODE[&plan=<planKey>][&seats=<n>] — the sales / marketing
 * share link (app/lib/referrals.ts).
 *
 * With the app installed, Android opens this URL in the app instead (App
 * Links cover every krishidukan.com path); this page is the web path. It
 * remembers the referral for the login / signup hop, counts the link open,
 * and sends the visitor to the right place:
 *   signed out          → signup (retailer preselected), then checkout
 *   signed in, unpaid   → checkout
 *   signed in, paid     → buy-more page (/dashboard/upgrade)
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getUserProfile } from "../firebase";
import { logReferralEvent, savePendingReferral } from "../lib/referral-client";

function SubscribeRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const code = params.get("ref") ?? params.get("code") ?? "";
    const plan = params.get("plan");
    const seats = Number(params.get("seats") ?? "") || null;
    if (code) {
      savePendingReferral({ code, plan, seats });
      logReferralEvent(code, "open", { plan });
    }

    const timer = window.setTimeout(() => setFallback(true), 8000);
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) {
        router.replace("/?view=signup");
        return;
      }
      try {
        const profile = await getUserProfile(user.uid);
        const isSeller = profile?.role === "retailer" || profile?.role === "manufacturer";
        router.replace(isSeller && profile?.isPaid ? "/dashboard/upgrade" : "/?view=subscription");
      } catch {
        router.replace("/?view=subscription");
      }
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
    };
  }, [params, router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm font-semibold text-on-surface">Opening your KrishiDukan plan…</p>
      {fallback ? (
        <a href="/?view=subscription" className="text-sm font-bold text-primary underline">
          Continue to subscription
        </a>
      ) : null}
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={null}>
      <SubscribeRedirect />
    </Suspense>
  );
}
