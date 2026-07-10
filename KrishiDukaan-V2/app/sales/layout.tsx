"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const isLoginPage = pathname === "/sales/login";

      if (!user && !isLoginPage) {
        router.replace("/sales/login");
        return;
      }

      if (user && isLoginPage) {
        router.replace("/sales");
        return;
      }

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

  return <>{children}</>;
}
