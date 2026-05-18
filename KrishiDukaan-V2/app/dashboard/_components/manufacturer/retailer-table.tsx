"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Mail,
  MessageCircle,
  PackagePlus,
  Trash2,
  XCircle,
} from "lucide-react";
import type { ManufacturerRetailerRow } from "../../_types/manufacturer-retailers";
import { cn } from "../../_lib/cn";
import { HelperTooltip } from "../../../../components/helpers";
import {
  buildInviteShareMessage,
  buildMailtoInviteUrl,
  buildSignupInviteUrl,
  buildWhatsAppShareUrl,
} from "../../../lib/invite/invite-utils";

type RetailerTableProps = {
  rows: ManufacturerRetailerRow[];
  loading?: boolean;
  onRemove?: (row: ManufacturerRetailerRow) => Promise<void>;
  onAssignProduct?: (row: ManufacturerRetailerRow) => void;
};

function OnboardingBadge({ status }: { status: ManufacturerRetailerRow["onboardingStatus"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
        <CheckCircle2 className="h-3 w-3" />
        Active
      </span>
    );
  }
  if (status === "removed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-on-surface/10 px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
        <XCircle className="h-3 w-3" />
        Removed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-harvest/15 px-2.5 py-0.5 text-xs font-semibold text-harvest">
      <Clock className="h-3 w-3" />
      Pending
    </span>
  );
}

function RowInviteActions({ row }: { row: ManufacturerRetailerRow }) {
  const [copied, setCopied] = useState(false);

  if (row.status === "revoked") {
    return <span className="text-xs text-on-surface-variant">—</span>;
  }
  if (!row.inviteCode) {
    return <span className="text-xs text-on-surface-variant">—</span>;
  }

  const link = buildSignupInviteUrl(row.inviteCode);
  const message = buildInviteShareMessage(link);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const whatsappHref = buildWhatsAppShareUrl(message);
  const mailtoHref = buildMailtoInviteUrl({
    to: row.retailerEmail,
    subject: "Your KrishiDukan retailer invite",
    body: message,
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1 text-xs font-medium text-on-surface hover:bg-surface-container"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        Copy link
      </button>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1 text-xs font-medium text-on-surface hover:bg-surface-container"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        WhatsApp
      </a>
      {row.retailerEmail ? (
        <a
          href={mailtoHref}
          className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1 text-xs font-medium text-on-surface hover:bg-surface-container"
        >
          <Mail className="h-3.5 w-3.5" />
          Email
        </a>
      ) : null}
    </div>
  );
}

function RemoveAction({
  row,
  onRemove,
}: {
  row: ManufacturerRetailerRow;
  onRemove: (row: ManufacturerRetailerRow) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (row.status === "revoked") {
    return <span className="text-xs text-on-surface-variant">Removed</span>;
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
        <span className="text-xs font-medium text-red-700">Remove retailer?</span>
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            try {
              await onRemove(row);
            } finally {
              setRemoving(false);
              setConfirming(false);
            }
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {removing ? "Removing…" : "Confirm"}
        </button>
        <button
          type="button"
          disabled={removing}
          onClick={() => setConfirming(false)}
          className="rounded-lg px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1 text-xs font-medium text-on-surface-variant hover:border-red-200 hover:bg-red-50 hover:text-red-600"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Remove
    </button>
  );
}

export function RetailerTable({ rows, loading, onRemove, onAssignProduct }: RetailerTableProps) {
  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-14 text-center">
        <p className="text-base font-semibold text-on-surface">No retailers yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-on-surface-variant">
          Add a retailer to pre-create their profile and generate a signup invite link.
        </p>
      </div>
    );
  }

  const hasActions = !!(onRemove || onAssignProduct);

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Shop name</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Owner</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Phone</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Onboarding</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Invite actions</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Added</th>
              {hasActions ? (
                <th className="whitespace-nowrap px-4 py-3 font-medium">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {rows.map((row) => {
              const isRevoked = row.status === "revoked";
              // Seat assignment doesn't require retailer login — only that
              // the retailer is linked to this manufacturer and not revoked.
              const canAssign = onAssignProduct && !isRevoked;

              return (
                <tr
                  key={row.id}
                  className={cn(
                    "hover:bg-surface-container/50",
                    isRevoked && "opacity-50",
                  )}
                >
                  <td className="px-4 py-3 font-medium text-on-surface">
                    {row.shopName || <span className="text-on-surface-variant">—</span>}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{row.ownerName || "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-on-surface-variant">
                    {row.retailerPhone || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <OnboardingBadge status={row.onboardingStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <RowInviteActions row={row} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                    {row.addedAtLabel}
                  </td>
                  {hasActions ? (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {canAssign ? (
                          <HelperTooltip side="left" textKey="dashAssignProduct">
                            <button
                              type="button"
                              onClick={() => onAssignProduct(row)}
                              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1 text-xs font-medium text-on-surface hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                            >
                              <PackagePlus className="h-3.5 w-3.5" />
                              Assign product
                            </button>
                          </HelperTooltip>
                        ) : null}
                        {onRemove ? (
                          <RemoveAction row={row} onRemove={onRemove} />
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
