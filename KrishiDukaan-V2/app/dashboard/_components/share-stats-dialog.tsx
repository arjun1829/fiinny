"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share2, X, ImageIcon } from "lucide-react";
import {
  DEFAULT_STATS_SHARE,
  STATS_SHARE_METRICS,
  cardToFile,
  drawStatsCard,
  loadLogo,
  type StatsShareData,
  type StatsShareMetric,
} from "../_lib/stats-share-card";

const PREFS_KEY = "kd.statsShare.v1";

function loadPrefs(): Record<StatsShareMetric, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (saved && typeof saved === "object") return { ...DEFAULT_STATS_SHARE, ...saved };
  } catch {
    // private window or blocked storage: defaults
  }
  return { ...DEFAULT_STATS_SHARE };
}

/**
 * "Share my stats": a story-size image of the seller's numbers for the
 * selected period, to post on Instagram / WhatsApp status or send in a chat.
 * Phones get the share sheet; computers download the image.
 */
export function ShareStatsButton({ data }: { data: StatsShareData | null }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90"
      >
        <ImageIcon className="h-4 w-4" aria-hidden />
        Share my stats
      </button>
      {open && <ShareStatsDialog data={data} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareStatsDialog({ data, onClose }: { data: StatsShareData; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [show, setShow] = useState<Record<StatsShareMetric, boolean>>(DEFAULT_STATS_SHARE);
  const [logo, setLogo] = useState<HTMLImageElement | null | undefined>(undefined);
  // Made ahead of the click: the share sheet must open straight from the tap.
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setShow(loadPrefs());
    let alive = true;
    void loadLogo(data.logoUrl).then((img) => alive && setLogo(img));
    return () => {
      alive = false;
    };
  }, [data.logoUrl]);

  useEffect(() => {
    if (logo === undefined || !canvasRef.current) return;
    drawStatsCard(canvasRef.current, data, show, logo);
    let alive = true;
    setFile(null);
    void cardToFile(canvasRef.current).then((f) => alive && setFile(f));
    return () => {
      alive = false;
    };
  }, [data, show, logo]);

  const toggle = (key: StatsShareMetric) => {
    setShow((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // not saved; fine
      }
      return next;
    });
  };

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
      aria-label="Share my stats"
      onClick={onClose}
    >
      <div
        className="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 sm:max-w-3xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Share my stats</h2>
            <p className="text-sm text-on-surface-variant">
              {data.periodLabel} · story size, ready for Instagram and WhatsApp
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-surface-container">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="mx-auto w-[220px] shrink-0 sm:w-[270px]">
            <canvas
              ref={canvasRef}
              className="h-auto w-full rounded-xl shadow-lg"
              style={{ aspectRatio: "9 / 16" }}
              aria-label="Preview of the stats image"
            />
          </div>

          <div className="flex-1">
            <p className="mb-2 text-sm font-semibold text-on-surface">Show on the image</p>
            <div className="flex flex-wrap gap-2">
              {STATS_SHARE_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggle(m.key)}
                  aria-pressed={show[m.key]}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    show[m.key]
                      ? "border-primary bg-primary text-white"
                      : "border-outline-variant bg-surface text-on-surface-variant hover:border-primary"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-on-surface-variant">
              Sales stay hidden unless you turn them on.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              {canShareFile && (
                <button
                  type="button"
                  onClick={() => void share()}
                  disabled={!file}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Share2 className="h-4 w-4" aria-hidden /> Share
                </button>
              )}
              <button
                type="button"
                onClick={download}
                disabled={!file}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-50 ${
                  canShareFile
                    ? "border border-outline-variant text-on-surface hover:bg-surface-container"
                    : "bg-primary text-white"
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
