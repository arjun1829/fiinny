"use client";

import { useState } from "react";
import { X, ImageOff } from "lucide-react";

interface DealerImagePreviewModalProps {
  imageUrl: string;
  dealerName: string;
  onClose: () => void;
}

/**
 * Full, uncropped view of a dealer photo. Follows the same two-layer overlay
 * convention used everywhere else in the admin portal (fixed inset-0 backdrop
 * + centered panel) — no dialog library. Click-to-toggle scale gives a simple
 * zoom without a new dependency; the browser's own pinch-zoom still works
 * inside the scrollable container on touch devices.
 */
export default function DealerImagePreviewModal({
  imageUrl,
  dealerName,
  onClose,
}: DealerImagePreviewModalProps) {
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative flex max-h-[90vh] max-w-3xl w-full items-center justify-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute -top-2 -right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>

          {failed ? (
            <div className="flex h-64 w-full flex-col items-center justify-center gap-2 rounded-2xl bg-surface-container text-on-surface-variant">
              <ImageOff className="h-8 w-8" />
              <p className="text-sm">This photo could not be loaded.</p>
            </div>
          ) : (
            <div className="max-h-[90vh] w-full overflow-auto rounded-2xl bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={`${dealerName} shop photo`}
                onClick={() => setZoomed((z) => !z)}
                onError={() => setFailed(true)}
                className={`mx-auto block cursor-zoom-in select-none transition-transform ${
                  zoomed ? "max-w-none scale-150 cursor-zoom-out" : "max-h-[90vh] max-w-full object-contain"
                }`}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
