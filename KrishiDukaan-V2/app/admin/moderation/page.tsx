"use client";

/**
 * Admin -> Moderation — the queue Apple's App Store review (Guideline 1.2)
 * asked for: every report and block filed against AgriReels content
 * (videos + comments), in one place a human can review and act on within
 * 24 hours by removing the content and ejecting the user who posted it.
 *
 * Rows come from `contentReports` (see moderation-firestore.ts for why this
 * is separate from the older `reel_reports`, which only ever fed an
 * auto-hide counter and was never readable by a person).
 */

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, Flag, MessageCircle, UserX, Search, Check, X, ExternalLink } from "lucide-react";
import { auth } from "../../firebase";
import { useAdminAuth } from "../_context/admin-auth-context";
import {
  fetchContentReports,
  resolveContentReport,
  removeReportedReel,
  removeReportedComment,
  fetchReportedUserBrief,
  type ContentReport,
  type ContentReportStatus,
} from "../_lib/moderation-firestore";

const TYPE_LABEL: Record<ContentReport["type"], string> = {
  reel: "Reel",
  comment: "Comment",
  block: "Block",
};

const TYPE_ICON: Record<ContentReport["type"], typeof Flag> = {
  reel: Flag,
  comment: MessageCircle,
  block: UserX,
};

function fmtDate(ts: ContentReport["createdAt"]): string {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminModerationPage() {
  const identity = useAdminAuth();
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentReportStatus | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ejectTarget, setEjectTarget] = useState<ContentReport | null>(null);
  const [ejectConfirm, setEjectConfirm] = useState("");
  const [ejectError, setEjectError] = useState<string | null>(null);
  const [ejecting, setEjecting] = useState(false);

  const load = () => {
    setLoading(true);
    fetchContentReports()
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.reportedUserId, r.reporterId, r.reason, r.contentSnippet]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [reports, search, statusFilter]);

  const pendingCount = reports.filter((r) => r.status === "pending").length;

  // ── Remove the reported content, then mark the report actioned ──────────
  const handleRemoveContent = async (r: ContentReport) => {
    setBusyId(r.id);
    try {
      if (r.type === "comment" && r.reelId && r.commentId) {
        await removeReportedComment(r.reelId, r.commentId);
      } else if (r.reelId) {
        await removeReportedReel(r.reelId);
      }
      await resolveContentReport(r.id, "actioned", identity.uid);
      setReports((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, status: "actioned" } : x)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not remove content.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (r: ContentReport) => {
    setBusyId(r.id);
    try {
      await resolveContentReport(r.id, "dismissed", identity.uid);
      setReports((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, status: "dismissed" } : x)),
      );
    } finally {
      setBusyId(null);
    }
  };

  // ── Eject the reported user — reuses the existing adminDeleteUser flow
  //    (same one Users & Roles uses) rather than a separate ban mechanism.
  const openEject = (r: ContentReport) => {
    setEjectTarget(r);
    setEjectConfirm("");
    setEjectError(null);
  };

  const handleEject = async () => {
    if (!ejectTarget) return;
    const phone = ejectTarget.reportedUserId;
    if (ejectConfirm.trim() !== phone) {
      setEjectError(`Type the phone number "${phone}" exactly to confirm.`);
      return;
    }
    setEjecting(true);
    setEjectError(null);
    try {
      const { adminDeleteUser } = await import("../../firebase");
      const brief = await fetchReportedUserBrief(phone);
      const result = await adminDeleteUser(phone, brief?.uid ?? null, brief?.role ?? "consumer");
      if (brief?.uid) {
        const idToken = await auth.currentUser?.getIdToken();
        await fetch("/api/admin/delete-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ targetUid: brief.uid }),
        });
      }
      await resolveContentReport(ejectTarget.id, "actioned", identity.uid);
      setReports((prev) =>
        prev.map((x) => (x.id === ejectTarget.id ? { ...x, status: "actioned" } : x)),
      );
      alert(
        `Ejected. Products deactivated: ${result.productsDeactivated}, inventory deleted: ${result.inventoryDeleted}.`,
      );
      setEjectTarget(null);
    } catch (e) {
      setEjectError(e instanceof Error ? e.message : "Could not eject user.");
    } finally {
      setEjecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 sm:gap-3">
          <ShieldAlert className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
          <h1 className="text-lg font-black text-on-surface sm:text-2xl">Moderation</h1>
          {pendingCount > 0 && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-black text-red-700">
              {pendingCount} pending
            </span>
          )}
        </div>
        <p className="ml-7 text-xs text-on-surface-variant sm:ml-9 sm:text-sm">
          Reports and blocks filed against AgriReels videos and comments. Act on new reports
          within 24 hours — remove the content and, if warranted, eject the account.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
          <Search className="h-4 w-4 text-outline shrink-0" />
          <input
            type="text"
            placeholder="Search by phone or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {(["pending", "actioned", "dismissed", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold capitalize transition-colors ${
                statusFilter === s
                  ? "bg-primary text-white"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
          <div className="px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low">
            <span className="text-xs font-bold text-on-surface-variant">
              {filtered.length} report{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="divide-y divide-outline-variant/10">
            {filtered.map((r) => {
              const Icon = TYPE_ICON[r.type];
              const isPending = r.status === "pending";
              return (
                <div key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container">
                    <Icon className="h-4 w-4 text-on-surface-variant" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-on-surface">{TYPE_LABEL[r.type]}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          r.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : r.status === "actioned"
                              ? "bg-green-100 text-green-700"
                              : "bg-surface-container text-on-surface-variant"
                        }`}
                      >
                        {r.status}
                      </span>
                      <span className="text-xs text-on-surface-variant">{fmtDate(r.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-on-surface">{r.reason}</p>
                    {r.contentSnippet && (
                      <p className="mt-1 truncate rounded-lg bg-surface-container-low px-2.5 py-1.5 text-xs text-on-surface-variant">
                        “{r.contentSnippet}”
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                      <span>
                        Reported user: <span className="font-mono font-semibold text-on-surface">{r.reportedUserId}</span>
                      </span>
                      <span>
                        Reported by: <span className="font-mono">{r.reporterId}</span>
                      </span>
                      {r.reelId && (
                        <a
                          href={`/reel/${r.reelId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-semibold text-primary hover:underline"
                        >
                          View reel <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {isPending && (
                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                      <button
                        onClick={() => handleRemoveContent(r)}
                        disabled={busyId === r.id}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Remove content
                      </button>
                      <button
                        onClick={() => openEject(r)}
                        disabled={busyId === r.id}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <UserX className="h-3.5 w-3.5" /> Eject user
                      </button>
                      <button
                        onClick={() => handleDismiss(r)}
                        disabled={busyId === r.id}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant px-3 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" /> Dismiss
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-on-surface-variant">
                No reports {statusFilter !== "all" ? `with status "${statusFilter}"` : ""}.
              </div>
            )}
          </div>
        </div>
      )}

      {ejectTarget && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-end justify-center bg-on-surface/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 text-red-600 mb-4">
                <UserX className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-on-surface">Eject this user?</h3>
              <p className="text-sm text-on-surface-variant mt-2">
                This deletes the account for{" "}
                <span className="font-mono font-semibold text-on-surface">{ejectTarget.reportedUserId}</span>{" "}
                — same effect as deleting them from Users &amp; Roles. Their products are deactivated
                (not deleted, to preserve order history). This cannot be undone.
              </p>
            </div>
            <input
              type="text"
              placeholder={`Type "${ejectTarget.reportedUserId}" to confirm`}
              value={ejectConfirm}
              onChange={(e) => setEjectConfirm(e.target.value)}
              className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {ejectError && <p className="text-xs font-medium text-red-600">{ejectError}</p>}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <button
                onClick={() => setEjectTarget(null)}
                disabled={ejecting}
                className="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEject}
                disabled={ejecting}
                className="flex-1 py-3 bg-red-600 text-white text-sm font-bold rounded-2xl hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {ejecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Ejecting…
                  </>
                ) : (
                  "Eject user"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
