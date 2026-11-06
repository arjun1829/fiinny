"use client";

import { PageHeader } from "../_components/page-header";
import { TeamManager } from "../_components/team-manager";
import { useEffectiveUser } from "../_context/effective-user-context";

/** Dashboard → Team: the shop owner's helpers (app/lib/shop-team.ts). */
export default function TeamPage() {
  const { profile, isAdminView, staff } = useEffectiveUser();
  // Helpers are sent back to the overview by the layout; this is a fallback.
  if (staff) return null;
  const role = profile?.role;
  if (role !== "retailer" && role !== "manufacturer") {
    return <p className="rounded-2xl bg-surface-container-low p-6 text-sm text-on-surface-variant">Team is available for retailer and manufacturer accounts.</p>;
  }
  return (
    <div className="max-w-3xl space-y-6 pb-16">
      <PageHeader
        title="Team"
        description="Let the people who help run your shop manage products, orders and reels with their own login."
      />
      {/* In admin view the API is called with the admin's login, so name the shop explicitly. */}
      <TeamManager ownerPhone={isAdminView ? String(profile?.phone ?? "") || undefined : undefined} />
    </div>
  );
}
