"use client";

import { ICONS } from '../constants';

/**
 * The visual content of a single homepage hero banner slide — background
 * image(s), gradient overlay, decorative blurs, title/subtitle/CTA, and the
 * optional foreground/product image.
 *
 * Shared between the live homepage carousel (app/views/HomeView.tsx, which
 * wraps this in its motion/AnimatePresence carousel shell — autoplay, dots,
 * arrows) and the admin Banner Management live preview (app/admin/banners),
 * so what an admin sees while editing is exactly what renders on the site.
 */
export type BannerSlideContent = {
  title: React.ReactNode;
  subtitle: string;
  ctaLabel: string;
  ctaEnabled: boolean;
  /**
   * Tailwind gradient classes (e.g. "from-emerald-950 via-emerald-900/85 to-emerald-700/10"),
   * applied as `bg-gradient-to-r ${bgClass}` over the background image.
   * Empty string means "No Overlay" — the image renders with no color wash.
   */
  bgClass: string;
  bgImg?: string;
  bgImgMobile?: string;
  imgUrl?: string;
};

export function BannerSlideVisual({
  slide,
  onCtaClick,
  variant = 'responsive',
}: {
  slide: BannerSlideContent;
  onCtaClick?: () => void;
  /**
   * 'responsive' (default, used by the live homepage carousel) lets
   * Tailwind's md: breakpoint pick background vs. mobile background by the
   * real viewport width. 'desktop' / 'mobile' force one image regardless of
   * viewport — used by the admin preview's Desktop/Mobile toggle, so the
   * preview shows exactly the chosen mode no matter how wide the admin's
   * browser window is.
   */
  variant?: 'responsive' | 'desktop' | 'mobile';
}) {
  const hasTitle = !!slide.title;
  const hasSubtitle = !!(typeof slide.subtitle === 'string' ? slide.subtitle.trim() : slide.subtitle);
  const hasMobileImg = !!slide.bgImgMobile;

  // Every place the homepage pairs a base (mobile) utility with an md:
  // (desktop) override goes through this resolver instead of a literal
  // `base md:variant` string. That's necessary because Tailwind's `md:` is a
  // real *viewport* media query — it cannot be faked by making a wrapper div
  // narrower. The admin preview forces 'desktop'/'mobile' to make each pair
  // resolve to a single fixed side regardless of the admin's actual browser
  // width; 'responsive' (the homepage's only variant) reproduces the exact
  // `base md:variant` string so production output is byte-for-byte unchanged.
  const cls = (base: string, md: string) =>
    variant === 'mobile' ? base : variant === 'desktop' ? md : `${base} md:${md}`;

  // 'mobile' without a bgImgMobile must fall back to bgImg (same rule the
  // homepage documents for the Mobile Background Image field) — hiding bgImg
  // unconditionally on 'mobile' would render nothing when no mobile image is set.
  const bgImgClass = {
    responsive: hasMobileImg ? 'hidden md:block' : '',
    desktop: '',
    mobile: hasMobileImg ? 'hidden' : '',
  }[variant];
  const bgImgMobileClass = {
    responsive: 'md:hidden',
    desktop: 'hidden',
    mobile: '',
  }[variant];

  return (
    <>
      {/*
        The hero banner is above the fold, so its background is fetched eagerly
        and at high priority — this is what stops the "text renders, then the
        image pops in a beat later" flash. `decoding="async"` keeps the decode
        off the main thread. Only the active slide is mounted (see HomeView's
        AnimatePresence), so this never over-fetches the other banners.
      */}
      {slide.bgImg && (
        <img
          src={slide.bgImg}
          alt=""
          referrerPolicy="no-referrer"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover ${bgImgClass}`}
        />
      )}
      {slide.bgImgMobile && (
        <img
          src={slide.bgImgMobile}
          alt=""
          referrerPolicy="no-referrer"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover ${bgImgMobileClass}`}
        />
      )}
      {slide.bgClass && (
        <div className={`absolute inset-0 bg-gradient-to-r ${slide.bgClass}`} />
      )}
      <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-black/10 blur-3xl" />
      {/*
        This content block is a direct child of the outer `flex items-center`
        wrapper (see HomeView.tsx's motion.div / the admin preview's wrapper),
        which vertically centers it as a flex item by default — the right
        behavior for a normal banner, where the block's height varies with
        title/subtitle and centering keeps it balanced in the box. An
        image-only banner (no title, no subtitle) has just the CTA button, so
        centering it would float the button awkwardly mid-image; `self-end`
        bottom-anchors it in that case only, without touching any banner that
        has text — existing banners keep today's centered layout exactly.
      */}
      <div className={`relative z-10 flex items-center gap-8 w-full py-10 ${
        !hasTitle && !hasSubtitle ? 'self-end' : ''
      } ${cls('flex-col px-8', 'flex-row px-14')}`}>
        {(hasTitle || hasSubtitle || slide.ctaEnabled) && (
          <div className="flex-1 max-w-xl text-white">
            {hasTitle && (
              <h1 className={`font-bold leading-[1.05] mb-4 ${cls('text-4xl', 'text-6xl')}`}>
                {slide.title}
              </h1>
            )}
            {hasSubtitle && (
              <p className={`text-white/85 mb-7 max-w-md ${cls('text-base', 'text-lg')}`}>
                {slide.subtitle}
              </p>
            )}
            {slide.ctaEnabled && (
              <button
                onClick={onCtaClick}
                className="bg-white text-on-surface font-bold px-6 py-2.5 rounded-xl shadow-xl inline-flex items-center gap-2"
              >
                <ICONS.ArrowRight className="w-5 h-5" />
                {slide.ctaLabel}
              </button>
            )}
          </div>
        )}
        {slide.imgUrl && (
          <div className={`flex-shrink-0 ${cls('w-48', 'w-64')}`}>
            <img
              src={slide.imgUrl}
              alt=""
              className="w-full h-auto object-contain drop-shadow-2xl"
            />
          </div>
        )}
      </div>
    </>
  );
}
