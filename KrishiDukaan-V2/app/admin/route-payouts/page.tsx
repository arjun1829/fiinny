"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Route Payouts moved into Seller payments → Transfers; old links land there. */
export default function RoutePayoutsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/payouts?tab=transfers");
  }, [router]);
  return null;
}
