"use client";

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Banknote } from "lucide-react";
import { hasSection, useAdminAuth, type AdminSection } from "../_context/admin-auth-context";
import { OverviewTab } from "./_tabs/overview";
import { TransfersTab } from "./_tabs/transfers";
import { AccountsTab, PayoutRunPanel } from "./_tabs/accounts";

/**
 * Admin → Seller payments: everything about paying sellers in one place.
 *   Overview   how the money moves, totals, what needs action, auto-release
 *   Transfers  every Razorpay Route transfer, searchable, with each order's
 *              payment story (was the separate Route Payouts page)
 *   Payout run paying sellers who are not on Route (bank transfer run)
 *   Bank & KYC sellers' bank details and documents to verify
 * Each tab shows only for the sections a team member was granted.
 */

type Tab = "overview" | "transfers" | "run" | "accounts";

const TABS: { key: Tab; label: string; section: AdminSection }[] = [
  { key: "overview", label: "Overview", section: "routePayouts" },
  { key: "transfers", label: "Transfers", section: "routePayouts" },
  { key: "run", label: "Payout run", section: "payouts" },
  { key: "accounts", label: "Bank & KYC", section: "payouts" },
];

function SellerPayments() {
  const identity = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const visible = TABS.filter((t) => hasSection(identity, t.section));
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = visible.find((t) => t.key === requested)?.key ?? visible[0]?.key ?? "overview";
  const filter = params.get("filter") ?? "all";

  const go = useCallback(
    (next: Tab, nextFilter?: string) => {
      const qs = new URLSearchParams({ tab: next, ...(nextFilter ? { filter: nextFilter } : {}) });
      router.replace(`${pathname}?${qs}`, { scroll: false });
    },
    [router, pathname],
  );

  return (
    <div className="pb-16">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-bold text-on-surface">
          <Banknote className="h-5 w-5 text-primary" /> Seller payments
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Where every seller&apos;s money is: held, released, on the way or in their bank, and the accounts it goes to.
        </p>
      </div>

      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-outline-variant/30">
        {visible.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => go(t.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab onOpenTransfers={(f) => go("transfers", f)} />}
      {tab === "transfers" && <TransfersTab initialFilter={filter} />}
      {tab === "run" && (
        <div>
          <p className="mb-4 text-sm text-on-surface-variant">
            For sellers <strong>not</strong> on Razorpay Route: pays verified sellers by bank transfer for orders delivered
            more than 7 days ago. Sellers on Route are paid automatically and are skipped here.
          </p>
          <PayoutRunPanel />
        </div>
      )}
      {tab === "accounts" && <AccountsTab />}
    </div>
  );
}

export default function SellerPaymentsPage() {
  return (
    <Suspense fallback={null}>
      <SellerPayments />
    </Suspense>
  );
}
