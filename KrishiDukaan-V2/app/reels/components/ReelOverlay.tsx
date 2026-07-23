/**
 * The seller's text overlay, rendered at playback time.
 *
 * Overlays are never burned into the video pixels — they live on the reel doc
 * as `overlayText` / `overlayPos` and every surface renders them itself (see the
 * note in mobile/lib/features/reels/widgets/reel_filters.dart). That keeps the
 * mobile APK free of ffmpeg, and means editing a caption never requires
 * re-encoding.
 *
 * Shared by the feed and the single-reel page, which previously carried two
 * copies of this markup that had already drifted apart in their vertical offsets.
 */

type OverlayPosition = "top" | "center" | "bottom";

interface Props {
  text: string;
  position?: string;
  /**
   * Feed cards sit under a floating action column and a taller gradient, so
   * they need more clearance than the detail page.
   */
  variant?: "feed" | "detail";
}

const OFFSETS: Record<OverlayPosition, { feed: string; detail: string }> = {
  top: { feed: "top-16", detail: "top-10" },
  bottom: { feed: "bottom-44", detail: "bottom-20" },
  center: { feed: "top-1/2 -translate-y-1/2", detail: "top-1/2 -translate-y-1/2" },
};

function normalise(position?: string): OverlayPosition {
  return position === "top" || position === "bottom" ? position : "center";
}

export default function ReelOverlay({ text, position, variant = "feed" }: Props) {
  if (!text) return null;

  const offset = OFFSETS[normalise(position)][variant];
  const size = variant === "feed" ? "text-xl" : "text-lg";

  return (
    <div
      className={`pointer-events-none absolute inset-x-6 flex justify-center ${offset}`}
    >
      <p
        className={`max-w-full rounded-xl bg-black/35 px-3 py-1.5 text-center ${size} font-extrabold leading-snug text-white drop-shadow-md`}
      >
        {text}
      </p>
    </div>
  );
}
