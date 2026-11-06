"use client";

import { useState } from "react";

/**
 * A product photo that never shows the browser's broken-image icon.
 *
 * Some products have no image on file, and a few point at third-party links that
 * have since died. A plain <img> renders both as a broken icon with the product
 * name as alt text. This shows the same leaf placeholder the brand page uses.
 */
export default function ProductImage({
  src,
  alt,
  className,
  placeholderClassName = "text-4xl",
  loading = "lazy",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  /** Size of the leaf emoji; the wrapper fills the same box the image would. */
  placeholderClassName?: string;
  loading?: "lazy" | "eager";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const url = typeof src === "string" ? src.trim() : "";

  if (!url || failedSrc === url) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={`flex h-full w-full items-center justify-center ${placeholderClassName} opacity-30 select-none`}
      >
        🌿
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      loading={loading}
      decoding="async"
      src={url}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(url)}
    />
  );
}
