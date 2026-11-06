"use client";

import { useCallback, useState } from "react";
import { Share2 } from "lucide-react";
import { shareLink } from "../../lib/share-links";
import { StatusToast } from "./status-toast";

type Props = {
  url: string | null;
  title: string;
  /** Message sent with the link (WhatsApp, SMS…). */
  text: string;
  label?: string;
  className?: string;
};

/**
 * A "Share" button for a shop or brand link: the device share sheet where
 * there is one (phones), else copies the link.
 */
export function ShareLinkButton({ url, title, text, label = "Share", className }: Props) {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const dismiss = useCallback(() => setToast(null), []);

  if (!url) return null;

  const onClick = async () => {
    const result = await shareLink({ title, text, url });
    if (result === "copied") setToast({ msg: "Link copied. Paste it in WhatsApp, Instagram or SMS.", type: "success" });
    if (result === "failed") setToast({ msg: `Couldn't share. Link: ${url}`, type: "error" });
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-4 py-2 text-sm font-bold text-primary hover:bg-surface-container"
        }
      >
        <Share2 className="h-4 w-4" aria-hidden />
        {label}
      </button>
      <StatusToast message={toast?.msg ?? null} type={toast?.type} onDismiss={dismiss} />
    </>
  );
}
