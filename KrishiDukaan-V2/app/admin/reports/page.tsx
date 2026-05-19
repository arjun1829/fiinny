"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, RefreshCw, Send, SendHorizonal, Users } from "lucide-react";
import { fetchAllUsers } from "../../firebase";
import { buildReportDataClientSide } from "../../lib/reports/build-report-client";

type Manufacturer = {
  id: string;
  name?: string;
  shopName?: string;
  ownerName?: string;
  email?: string;
};

type SendState = "idle" | "sending" | "sent" | "error";

type RowState = { state: SendState; sentAt?: string; error?: string };

export default function AdminReportsPage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [sendAllState, setSendAllState] = useState<SendState>("idle");
  const [sendAllResult, setSendAllResult] = useState<string | null>(null);

  const loadManufacturers = useCallback(async () => {
    setLoading(true);
    try {
      const users = await fetchAllUsers();
      setManufacturers(users.filter((u: any) => u.role === "manufacturer") as Manufacturer[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadManufacturers();
  }, [loadManufacturers]);

  const displayName = (m: Manufacturer) =>
    m.shopName || m.ownerName || m.name || "—";

  // Fetch report data client-side (uses admin's Firebase auth) then POST to email API
  const sendReport = async (m: Manufacturer) => {
    if (!m.email) return;
    setRowStates((prev) => ({ ...prev, [m.id]: { state: "sending" } }));
    try {
      const reportData = await buildReportDataClientSide(m.id, {
        shopName: m.shopName,
        ownerName: m.ownerName,
        name: m.name,
        email: m.email,
      });

      if (!reportData) {
        setRowStates((prev) => ({
          ...prev,
          [m.id]: { state: "error", error: "Could not build report data." },
        }));
        return;
      }

      const res = await fetch("/api/email/manufacturer-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportData, sentBy: "admin" }),
      });
      const json = (await res.json()) as { ok: boolean; sentTo?: string; error?: string };

      if (json.ok) {
        setRowStates((prev) => ({
          ...prev,
          [m.id]: { state: "sent", sentAt: new Date().toLocaleString() },
        }));
      } else {
        setRowStates((prev) => ({
          ...prev,
          [m.id]: { state: "error", error: json.error ?? "Unknown error" },
        }));
      }
    } catch (e) {
      setRowStates((prev) => ({
        ...prev,
        [m.id]: { state: "error", error: e instanceof Error ? e.message : "Network error" },
      }));
    }
  };

  const sendAll = async () => {
    setSendAllState("sending");
    setSendAllResult(null);
    let sent = 0, skipped = 0, failed = 0;
    for (const m of manufacturers) {
      if (!m.email) { skipped++; continue; }
      try {
        const reportData = await buildReportDataClientSide(m.id, {
          shopName: m.shopName,
          ownerName: m.ownerName,
          name: m.name,
          email: m.email,
        });
        if (!reportData) { skipped++; continue; }

        const res = await fetch("/api/email/manufacturer-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportData, sentBy: "admin" }),
        });
        const json = (await res.json()) as { ok: boolean };
        if (json.ok) {
          sent++;
          setRowStates((prev) => ({
            ...prev,
            [m.id]: { state: "sent", sentAt: new Date().toLocaleString() },
          }));
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    setSendAllState(failed > 0 && sent === 0 ? "error" : "sent");
    setSendAllResult(`Sent: ${sent} · Skipped (no email): ${skipped} · Failed: ${failed}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-on-surface">Weekly Reports</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Send weekly network summaries to manufacturers &mdash; retailer count, product assignments,
            seat usage, and this week&apos;s activity.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadManufacturers}
            className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={sendAll}
            disabled={sendAllState === "sending" || manufacturers.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {sendAllState === "sending" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Sending all…
              </>
            ) : (
              <>
                <SendHorizonal className="h-4 w-4" /> Send to All
              </>
            )}
          </button>
        </div>
      </div>

      {/* Send-all result */}
      {sendAllResult && (
        <div
          className={[
            "rounded-xl border px-4 py-3 text-sm",
            sendAllState === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-800",
          ].join(" ")}
        >
          {sendAllState === "error" ? "Batch send failed — " : "Batch send complete — "}
          <span className="font-semibold">{sendAllResult}</span>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-4">
        <Users className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm font-semibold text-on-surface">
          {manufacturers.length} manufacturer{manufacturers.length !== 1 ? "s" : ""} on the platform
        </p>
      </div>

      {/* Table */}
      {manufacturers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant/40 py-16 text-center">
          <p className="font-semibold text-on-surface">No manufacturers yet</p>
          <p className="text-sm text-on-surface-variant">
            Manufacturers will appear here once they sign up.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-low">
                  {["Manufacturer", "Email", "Last Sent", "Action"].map((h, i) => (
                    <th
                      key={h}
                      className={[
                        "px-5 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant",
                        i === 3 ? "text-right" : "text-left",
                      ].join(" ")}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {manufacturers.map((m) => {
                  const rs = rowStates[m.id];
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors"
                    >
                      <td className="px-5 py-3">
                        <p className="font-semibold text-on-surface">{displayName(m)}</p>
                        <p className="text-xs text-on-surface-variant">{m.id.slice(0, 14)}…</p>
                      </td>
                      <td className="px-5 py-3">
                        {m.email ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            {m.email}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-harvest">No email</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {rs?.state === "sent" && rs.sentAt ? (
                          <span className="text-xs font-medium text-green-700">
                            Sent {rs.sentAt}
                          </span>
                        ) : rs?.state === "error" ? (
                          <span className="text-xs text-red-600" title={rs.error}>
                            Failed: {rs.error?.slice(0, 40)}
                          </span>
                        ) : (
                          <span className="text-xs text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => sendReport(m)}
                          disabled={
                            !m.email ||
                            rs?.state === "sending" ||
                            rs?.state === "sent"
                          }
                          title={!m.email ? "No email on file" : undefined}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {rs?.state === "sending" ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                          ) : rs?.state === "sent" ? (
                            <><Send className="h-3.5 w-3.5 text-green-600" /> Sent</>
                          ) : (
                            <><Send className="h-3.5 w-3.5" /> Send Report</>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Automation hint */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-4 text-sm text-on-surface-variant">
        <p className="font-semibold text-on-surface mb-1">Automate weekly reports</p>
        <p>
          Point a cron service (Firebase Cloud Scheduler, cron-job.org, etc.) to{" "}
          <code className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-xs text-on-surface">
            POST /api/cron/weekly-reports
          </code>{" "}
          with header{" "}
          <code className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-xs text-on-surface">
            x-cron-secret: &lt;CRON_SECRET&gt;
          </code>
          . The cron endpoint uses Application Default Credentials and runs automatically on
          Firebase App Hosting — no service account key required.
        </p>
      </div>
    </div>
  );
}
