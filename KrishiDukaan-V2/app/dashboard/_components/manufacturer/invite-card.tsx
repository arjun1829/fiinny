"use client";

import { Check, Copy, Mail, MessageCircle, Share2, X } from "lucide-react";
import { useState } from "react";
import {
  buildInviteShareMessage,
  buildMailtoInviteUrl,
  buildSignupInviteUrl,
  buildWhatsAppShareUrl,
} from "../../../lib/invite/invite-utils";
import { HelperIcon } from "../../../../components/helpers";

type InviteCardProps = {
  inviteCode: string;
  shopName: string;
  /** Used as the mailto recipient — may be empty if retailer has no email. */
  retailerEmail: string;
  onDismiss: () => void;
};

export function InviteCard({ inviteCode, shopName, retailerEmail, onDismiss }: InviteCardProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteLink = buildSignupInviteUrl(inviteCode);
  const shareMessage = buildInviteShareMessage(inviteLink);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(false);
    }
  };

  const whatsappHref = buildWhatsAppShareUrl(shareMessage);
  const mailtoHref = buildMailtoInviteUrl({
    to: retailerEmail,
    subject: "Your KrishiDukan retailer invite",
    body: shareMessage,
  });

  return (
    <div
      role="status"
      className="relative rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-ambient md:p-5"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-3 top-3 rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <p className="pr-10 text-sm font-semibold text-primary inline-flex items-center gap-1.5">
        Retailer added
        <HelperIcon
          size="xs"
          variant="ghost"
          side="right"
          textKey="dashRetailerInvite"
          ariaLabel="Invite link help"
        />
      </p>
      <p className="mt-1 text-sm text-on-surface-variant">
        Share this signup link with{" "}
        <span className="font-medium text-on-surface">{shopName || "the retailer"}</span> so they can
        create their account and join your network.
      </p>
      <p className="mt-2 break-all font-mono text-xs text-on-surface-variant">{inviteLink}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-2.5 font-mono text-lg font-semibold tracking-wider text-on-surface">
          {inviteCode}
        </code>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container"
        >
          {copiedCode ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          {copiedCode ? "Copied code" : "Copy code"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container"
        >
          {copiedLink ? <Check className="h-4 w-4 text-primary" /> : <Share2 className="h-4 w-4" />}
          {copiedLink ? "Copied link" : "Copy invite link"}
        </button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container"
        >
          <MessageCircle className="h-4 w-4" />
          Share on WhatsApp
        </a>
        {retailerEmail ? (
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container"
          >
            <Mail className="h-4 w-4" />
            Share via email
          </a>
        ) : null}
      </div>
    </div>
  );
}
