"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

/**
 * Mirrors the Firestore `isSalesExec() || isAdmin()` rule on the client so the
 * sales UI is only shown to authorized field-team/admin accounts. Checks the
 * email-based doc at users/{uid} first, then any phone-based doc via
 * uidIndex/{uid} → users/{phone}.
 */
async function hasSalesAccess(uid: string): Promise<boolean> {
  const allowed = (role: unknown) => role === "salesExecutive" || role === "admin";
  try {
    const direct = await getDoc(doc(db, "users", uid));
    if (direct.exists() && allowed(direct.data().role)) return true;

    const idx = await getDoc(doc(db, "uidIndex", uid));
    const phone = idx.exists() ? idx.data().phone : undefined;
    if (phone) {
      const byPhone = await getDoc(doc(db, "users", String(phone)));
      if (byPhone.exists() && allowed(byPhone.data().role)) return true;
    }
  } catch {
    // Treat lookup failure as no access — fail closed.
  }
  return false;
}

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      const isLoginPage = pathname === "/sales/login";

      // Unauthenticated: allow the login page, redirect everything else to it.
      if (!user) {
        setDenied(false);
        if (!isLoginPage) { router.replace("/sales/login"); return; }
        setLoading(false);
        return;
      }

      // Authenticated: verify the account is actually a sales exec / admin.
      const authorized = await hasSalesAccess(user.uid);

      if (!authorized) {
        setDenied(true);
        setLoading(false);
        return;
      }

      setDenied(false);
      if (isLoginPage) { router.replace("/sales"); return; }
      setLoading(false);
    });

    return () => unsub();
  }, [router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-semibold text-primary">Loading…</p>
      </div>
    );
  }

  // Signed in, but not a sales executive / admin — refuse access instead of
  // exposing the sales UI (the Firestore rules would deny the data anyway).
  if (denied) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <svg className="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M12 3l9 16H3l9-16z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold text-on-surface">Access restricted</h1>
          <p className="mt-1 max-w-xs text-sm text-on-surface-variant">
            This portal is for the KrishiDukaan field sales team. Your account isn’t authorized. Contact an administrator if you believe this is a mistake.
          </p>
        </div>
        <button
          onClick={async () => { await signOut(auth); router.replace("/sales/login"); }}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-95 hover:bg-primary-container"
        >
          Sign out
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
