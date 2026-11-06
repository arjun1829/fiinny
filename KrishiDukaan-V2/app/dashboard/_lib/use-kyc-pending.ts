"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useEffectiveUser } from "../_context/effective-user-context";

/** One read per seller per page load, shared by every timeline on the page. */
const cache = new Map<string, Promise<boolean>>();

/**
 * True while the seller's payout details aren't verified, so the payment
 * timeline can say their money is waiting for KYC rather than for a payout.
 * Undefined until known (the timeline then uses its usual wording).
 */
export function useKycPending(): boolean | undefined {
  const { uid, profile } = useEffectiveUser();
  const [pending, setPending] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let phone = String(profile?.phone ?? "").trim();
      if (!phone && uid) {
        const idx = await getDoc(doc(db, "uidIndex", uid)).catch(() => null);
        phone = String(idx?.data()?.phone ?? "").trim();
      }
      if (!phone) return;
      if (!cache.has(phone)) {
        cache.set(
          phone,
          getDoc(doc(db, "payoutAccounts", phone))
            .then((s) => s.data()?.status !== "verified")
            .catch(() => {
              cache.delete(phone);
              return false;
            }),
        );
      }
      const v = await cache.get(phone)!;
      if (!cancelled) setPending(v);
    })();
    return () => { cancelled = true; };
  }, [uid, profile]);
  return pending;
}
