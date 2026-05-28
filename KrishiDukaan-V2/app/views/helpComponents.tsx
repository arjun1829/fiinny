/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useState } from 'react';
import { ICONS } from '../constants';
import { useI18n } from '../i18n/I18nContext';
import type { HelpMedia, HelpLink } from './helpContent';

type TFn = ReturnType<typeof useI18n>['t'];
type IconKey = keyof typeof ICONS;

/* ------------------------------------------------------------------ */
/* ScreenshotPreview — lazy-loaded image with graceful fallback        */
/* ------------------------------------------------------------------ */

/**
 * Renders a single screenshot card. The image is lazy-loaded (loading="lazy" +
 * async decoding) so off-screen previews cost nothing until scrolled into view.
 * If the file is missing (404 / decode error) it gracefully falls back to a
 * styled placeholder using the section icon — the page never shows a broken image.
 */
export function ScreenshotPreview({
  media,
  fallbackIcon,
  t,
}: {
  media: HelpMedia;
  fallbackIcon: IconKey;
  t: TFn;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const Icon = ICONS[media.icon ?? fallbackIcon];
  const caption = t(media.captionKey);

  return (
    <figure className="group flex flex-col rounded-2xl border border-surface-container bg-surface-container-low overflow-hidden">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-white">
        {!failed ? (
          <>
            {/* Skeleton shimmer until the image decodes */}
            {!loaded && <div className="absolute inset-0 animate-pulse bg-surface-container" aria-hidden="true" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media.src}
              alt={caption}
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              /* object-contain keeps the whole screenshot visible (no cropping/zoom),
                 centered with light padding regardless of the capture's aspect ratio. */
              className={`absolute inset-0 h-full w-full object-contain p-2 transition-opacity duration-300 ${
                loaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </>
        ) : (
          // Graceful placeholder — shown when the screenshot file isn't present yet.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface-container-low to-surface-container text-on-surface-variant">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Icon className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest">{t('helpScreenshotComingSoon')}</span>
          </div>
        )}
      </div>
      <figcaption className="px-3 py-2.5 text-xs text-on-surface-variant leading-snug border-t border-surface-container">
        {caption}
      </figcaption>
    </figure>
  );
}

/**
 * A responsive grid of screenshot previews for a section.
 * 1 column on mobile; 2 columns when a section has multiple previews on larger screens.
 */
export function ScreenshotGallery({
  media,
  fallbackIcon,
  t,
}: {
  media: HelpMedia[];
  fallbackIcon: IconKey;
  t: TFn;
}) {
  if (!media.length) return null;
  return (
    <div className="mt-1">
      <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-1.5">
        <ICONS.Docs className="w-3.5 h-3.5 text-primary" />
        {t('helpVisualPreview')}
      </div>
      <div className={`grid gap-3 ${media.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
        {media.map((m, i) => (
          <ScreenshotPreview key={i} media={m} fallbackIcon={fallbackIcon} t={t} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SectionActions — auth-aware deep-link buttons                       */
/* ------------------------------------------------------------------ */

/**
 * Renders the "Open the actual screen" deep-link buttons for a section.
 *  - 'view' links call onNavigate (the parent's in-app SPA router).
 *  - 'route' links call onOpenRoute (Next router.push) for /dashboard/* pages.
 * Dashboard links that require auth are hidden for guests; instead a small hint
 * tells them to log in — so nobody is silently bounced to the paywall/login.
 */
export function SectionActions({
  links,
  canAccessDashboard,
  onNavigate,
  onOpenRoute,
  t,
}: {
  links: HelpLink[];
  canAccessDashboard: boolean;
  onNavigate?: (view: string) => void;
  onOpenRoute?: (route: string) => void;
  t: TFn;
}) {
  if (!links.length) return null;

  const visible = links.filter((l) => !l.requiresDashboard || canAccessDashboard);
  const hasGatedHidden = links.some((l) => l.requiresDashboard) && !canAccessDashboard;

  if (!visible.length && !hasGatedHidden) return null;

  const handle = (link: HelpLink) => {
    if (link.kind === 'view') onNavigate?.(link.target);
    else onOpenRoute?.(link.target);
  };

  return (
    <div className="mt-1 rounded-2xl border border-surface-container bg-surface-container-low/50 p-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-1.5">
        <ICONS.ArrowRight className="w-3.5 h-3.5 text-primary" />
        {t('helpRelatedScreens')}
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.map((link, i) => {
          const Icon = ICONS[(link.icon ?? 'ArrowRight') as IconKey];
          return (
            <button
              key={i}
              onClick={() => handle(link)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-outline-variant px-3 py-2 text-xs font-bold text-on-surface hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">{t(link.labelKey)}</span>
              <ICONS.ChevronRight className="w-3 h-3 opacity-50" />
            </button>
          );
        })}
      </div>
      {hasGatedHidden && (
        <p className="mt-2 text-[11px] text-on-surface-variant leading-snug flex items-start gap-1.5">
          <ICONS.Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          {t('helpLoginToOpen')}
        </p>
      )}
    </div>
  );
}
