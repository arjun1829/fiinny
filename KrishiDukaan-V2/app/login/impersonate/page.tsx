"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { auth } from "../../firebase";

/**
 * Consumes a one-time admin-minted login token (see
 * /api/admin/impersonate-seller) and signs into THIS browser as that seller.
 *
 * The token travels in the URL fragment (#token=...), not a query string —
 * fragments are never sent to the server or written to server access logs,
 * which matters here because the fragment IS a bearer credential for the
 * hour it's valid.
 *
 * Deliberately signs in on the DEFAULT app instance (the same `auth` the
 * whole app uses) so the resulting session persists into /dashboard exactly
 * like a normal login — but that also means it REPLACES whatever was
 * signed in on this browser before. This page is meant to be opened in an
 * Incognito/private window for that reason; the admin flow that generates
 * the link says so.
 */
export default function ImpersonateConsumePage() {
  const router = useRouter();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const token = new URLSearchParams(hash).get("token");

    if (!token) {
      setState("error");
      setError("No login token found in the link.");
      return;
    }

    // Clear the fragment immediately so the token doesn't linger in browser
    // history/the address bar any longer than it has to.
    window.history.replaceState(null, "", window.location.pathname);

    signInWithCustomToken(auth, token)
      .then(() => {
        setState("done");
        router.replace("/dashboard");
      })
      .catch((e) => {
        setState("error");
        setError(
          e?.code === "auth/invalid-custom-token" || e?.code === "auth/custom-token-mismatch"
            ? "This login link has expired or already been used. Ask admin to generate a new one."
            : e instanceof Error
              ? e.message
              : "Could not sign in.",
        );
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-container-lowest px-4">
      <div className="w-full max-w-sm rounded-2xl border border-outline-variant/40 bg-white p-6 text-center">
        {state === "working" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm font-semibold text-on-surface">Signing you in…</p>
          </>
        )}
        {state === "done" && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
            <p className="mt-3 text-sm font-semibold text-on-surface">Signed in — redirecting…</p>
          </>
        )}
        {state === "error" && (
          <>
            <ShieldAlert className="mx-auto h-8 w-8 text-red-600" />
            <p className="mt-3 text-sm font-semibold text-on-surface">Could not sign in</p>
            <p className="mt-1 text-xs text-on-surface-variant">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
