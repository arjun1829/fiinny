"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getUserProfile } from "../firebase";
import { Navbar } from "../../components/shared/navbar";
import { AdminShell } from "./_components/admin-shell";

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
      <div className="flex-1 flex overflow-hidden">
        <AdminShell>{children}</AdminShell>
      </div>
    </div>
  );
}
