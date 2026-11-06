"use client";

import { Loader2 } from "lucide-react";

/** "Load more" under a paged admin table (see usePagedQuery). Renders nothing when there is no more. */
export function LoadMore({
  hasMore,
  loading,
  onClick,
  label = "Load more",
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  label?: string;
}) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center py-4">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl border border-outline-variant bg-white px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Loading…" : label}
      </button>
    </div>
  );
}
