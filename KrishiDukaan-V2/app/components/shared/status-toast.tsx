"use client";

import { useEffect } from "react";
import { CheckCircle2, X, AlertCircle } from "lucide-react";

type StatusToastProps = {
  message: string | null;
  type?: "success" | "error";
  onDismiss: () => void;
  /** Auto-dismiss after this many ms. Set to 0 to disable. Default: 3500 */
  autoClose?: number;
};

/**
 * Fixed bottom-right toast that auto-dismisses.
 * Drop this into any page/component alongside your existing status state.
 */
export function StatusToast({
  message,
  type = "success",
  onDismiss,
  autoClose = 3500,
}: StatusToastProps) {
  useEffect(() => {
    if (!message || autoClose === 0) return;
    const id = setTimeout(onDismiss, autoClose);
    return () => clearTimeout(id);
  }, [message, onDismiss, autoClose]);

  if (!message) return null;

  const isSuccess = type === "success";
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed bottom-6 right-6 z-[200] flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg border animate-in slide-in-from-bottom-4 fade-in duration-200",
        isSuccess
          ? "bg-white border-primary/25 text-primary"
          : "bg-white border-red-200 text-red-700",
      ].join(" ")}
    >
      {isSuccess ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" />
      )}
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 rounded-lg p-0.5 opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
