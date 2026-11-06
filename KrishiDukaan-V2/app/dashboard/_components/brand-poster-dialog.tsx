"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Loader2, Share2, X } from "lucide-react";
import { drawBrandPoster, posterToFile, type BrandPosterData, type BrandPosterStat } from "../../lib/brand-poster";

/**
 * "Share my shop" poster: an image of the shop's brand page to post on
 * Instagram, WhatsApp status or Facebook — readable with no app or link.
 * Phones get the share sheet; computers download the image.
 */
export function BrandPosterButton({ data, className, loadStats }: {
  data: BrandPosterData | null;
  className?: string;
  /**
   * Optional numbers for the poster (e.g. product count), fetched only when
   * the dialog opens — so pages never pay for them just by loading.
   */
  loadStats?: () => Promise<BrandPosterStat[]>;
}) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
        }
      >
        <ImageIcon className="h-4 w-4" aria-hidden />
        Share as image
      </button>
      {open && <BrandPosterDialog data={data} loadStats={loadStats} onClose={() => setOpen(false)} />}
    </>
  );
}

const STATS_TIMEOUT_MS = 4000;

/** The stats, or [] if they fail or are slow — the poster never waits long. */
function statsOrEmpty(loadStats?: () => Promise<BrandPosterStat[]>): Promise<BrandPosterStat[]> {
  if (!loadStats) return Promise.resolve([]);
  return Promise.race([
    loadStats().catch(() => [] as BrandPosterStat[]),
    new Promise<BrandPosterStat[]>((resolve) => setTimeout(() => resolve([]), STATS_TIMEOUT_MS)),
  ]);
}

function BrandPosterDialog({ data, loadStats, onClose }: {
  data: BrandPosterData;
  loadStats?: () => Promise<BrandPosterStat[]>;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Made ahead of the click: the share sheet must open straight from the tap.
  const [file, setFile] = useState<File | null>(null);
  const [drawing, setDrawing] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDrawing(true);
    void statsOrEmpty(loadStats)
      .then((stats) => drawBrandPoster(canvas, stats.length ? { ...data, stats: [...(data.stats ?? []), ...stats] } : data))
      .then(() => posterToFile(canvas, data.shopName))
      .then((f) => {
        if (!alive) return;
        setFile(f);
        if (!f) setMessage("Couldn't create the image on this browser. Try another browser or the app.");
      })
      .finally(() => alive && setDrawing(false));
    return () => {
      alive = false;
    };
    // loadStats is a fresh closure each render; the dialog draws once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const canShareFile =
    !!file && typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [file] });

  const download = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Image saved. Post it on Instagram, WhatsApp status or anywhere you like.");
  };

  const share = async () => {
    if (!file) return;
    if (!canShareFile) return download();
    try {
      // The image alone: Instagram and some others drop a share that also
      // carries text. The shop link is printed on the image.
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      download();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share my shop as an image"
      onClick={onClose}
    >
      <div
        className="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Share my shop</h2>
            <p className="text-sm text-on-surface-variant">Ready for Instagram, WhatsApp status and Facebook</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-surface-container">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="relative mx-auto w-[240px] shrink-0 sm:w-[280px]">
            <canvas
              ref={canvasRef}
              className="h-auto w-full rounded-xl shadow-lg"
              style={{ aspectRatio: "4 / 5" }}
              aria-label="Preview of the shop image"
            />
            {drawing && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>

          <div className="flex-1 text-sm text-on-surface-variant">
            <p>
              Your logo, banner, shop photos and highlights, with your number and shop link — so anyone who sees the
              post can call you or find you on KrishiDukan.
            </p>
            <p className="mt-2">Change what it shows by editing your brand page and profile.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {canShareFile && (
                <button
                  type="button"
                  onClick={() => void share()}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white"
                >
                  <Share2 className="h-4 w-4" aria-hidden /> Share
                </button>
              )}
              <button
                type="button"
                onClick={download}
                disabled={!file}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-50 ${
                  canShareFile ? "border border-outline-variant text-on-surface hover:bg-surface-container" : "bg-primary text-white"
                }`}
              >
                <Download className="h-4 w-4" aria-hidden /> Download image
              </button>
            </div>
            {message && <p className="mt-3 text-sm text-primary">{message}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
