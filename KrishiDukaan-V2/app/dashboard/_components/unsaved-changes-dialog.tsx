"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

/** Browser tab close / reload asks first while [dirty]. */
export function useBeforeUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

/**
 * "Save your changes?" asked when a product form is closed with unsaved
 * edits — Save, Discard or Keep editing. Sits above the form drawers (z-60/61).
 */
export function UnsavedChangesDialog({ open, saving, onSave, onDiscard, onKeepEditing }: {
  open: boolean;
  saving?: boolean;
  /** Omit when the form has no single save action here; the Save button is then hidden. */
  onSave?: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onKeepEditing(); }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, onKeepEditing]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onKeepEditing}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title"
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 id="unsaved-title" className="text-base font-bold text-on-surface">Save your changes?</h3>
        <p className="mt-1.5 text-sm text-on-surface-variant">
          You have changes that are not saved yet. Save them before leaving?
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onKeepEditing} disabled={saving}
            className="rounded-xl px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-50">
            Keep editing
          </button>
          <button type="button" onClick={onDiscard} disabled={saving}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
            Discard
          </button>
          {onSave && (
            <button type="button" onClick={onSave} disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
