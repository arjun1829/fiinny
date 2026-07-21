'use client';

import { useState } from 'react';
import { clsx } from 'clsx';

interface ImageCarouselProps {
  images: string[];
  placeholderIcon: string;
  imageCount?: number; // overridable for the modal "1/N" badge later; grid always shows all
}

// Mirrors .car / .car-btn / .car-dots / .img-c (index (1).html, Carousel
// block) plus the carNav() logic — prev/next buttons, dot indicators, and an
// "n/total" badge. Card-level only (buildCard's carState/carNav); the modal
// detail view's parallel mcarNav()/mcar-* implementation is Phase 9/10
// territory (there is no detail route yet — see ListingCard's note on why
// click-through isn't wired up in Phase 4).
export function ImageCarousel({ images, placeholderIcon }: ImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const filtered = images.filter((u) => u && u.trim());

  if (filtered.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[52px]">{placeholderIcon}</div>
    );
  }

  const navigate = (dir: 1 | -1) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex((i) => (i + dir + filtered.length) % filtered.length);
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote Unsplash/user-submitted URLs; next/image domain allowlisting happens once real uploads exist (Phase 9) */}
      <img src={filtered[index]} alt="" className="h-full w-full object-cover" style={{ transition: 'opacity .28s' }} />
      {filtered.length > 1 && (
        <>
          <button
            type="button"
            onClick={navigate(-1)}
            className="absolute left-[9px] top-1/2 z-[3] flex h-[30px] w-[30px] -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(28,25,23,0.45)] text-base text-white transition-colors hover:bg-[rgba(28,25,23,0.7)]"
            aria-label="Previous photo"
          >
            &lsaquo;
          </button>
          <button
            type="button"
            onClick={navigate(1)}
            className="absolute right-[9px] top-1/2 z-[3] flex h-[30px] w-[30px] -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(28,25,23,0.45)] text-base text-white transition-colors hover:bg-[rgba(28,25,23,0.7)]"
            aria-label="Next photo"
          >
            &rsaquo;
          </button>
          <div className="absolute bottom-[9px] left-1/2 z-[3] flex -translate-x-1/2 gap-1">
            {filtered.map((_, i) => (
              <div
                key={i}
                className={clsx('h-[6px] w-[6px] rounded-full transition-colors', i === index ? 'bg-white' : 'bg-white/50')}
              />
            ))}
          </div>
          <div className="absolute bottom-2 right-[10px] z-[3] rounded-lg bg-[rgba(28,25,23,0.5)] px-2 py-[2px] text-[10px] font-bold text-white">
            {index + 1}/{filtered.length}
          </div>
        </>
      )}
    </>
  );
}
