'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '../../app/i18n/I18nContext';
import { PLAY_STORE_URL, APP_STORE_URL, androidLive, iosLive } from '../../app/lib/store-links';

const DISMISSED_KEY = 'kd_app_promo_dismissed';
// Let the guided tour (if any) claim the user's attention first.
const SHOW_DELAY_MS = 3000;

/**
 * One-time "get our app" popup shown to first-time web visitors, with a Skip
 * option. Never shows again once dismissed (Skip, backdrop click, or tapping
 * a store badge) — tracked in localStorage, not cookies, so it's purely a
 * client-side nicety with no server/consent implications.
 */
export default function AppPromoModal() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(DISMISSED_KEY) === 'true') return;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      /* localStorage unavailable (e.g. private mode) — non-fatal, just re-shows next visit */
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-4"
      onClick={dismiss}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl relative"
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors"
        >
          ✕
        </button>

        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/krishidukan icon.webp"
            alt="KrishiDukan app icon"
            className="w-16 h-16 rounded-2xl border border-surface-container object-contain bg-white shadow-sm mb-4"
          />
          <h2 className="text-lg font-black text-on-surface mb-2">
            {t('aboutAppTitle')}
          </h2>
          <p className="text-sm text-on-surface-variant leading-relaxed mb-5">
            {t('aboutAppSubtitle')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
            {androidLive ? (
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                aria-label="Get KrishiDukan on Google Play"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/google-play-badge.png" alt="Get it on Google Play" className="h-12 w-auto" />
              </a>
            ) : null}
            {iosLive ? (
              <a
                href={APP_STORE_URL!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                aria-label="Download KrishiDukan on the App Store"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/app-store-badge.svg" alt="Download on the App Store" className="h-10 w-auto" />
              </a>
            ) : (
              <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-on-surface/10 text-on-surface-variant text-xs font-bold cursor-not-allowed select-none">
                {t('footerIosSoon')}
              </div>
            )}
          </div>

          <button
            onClick={dismiss}
            className="text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {t('appPromoSkip')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
