'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { Listing } from '@/types/listing';
import { EXPIRY_DAYS } from '@/constants/listing-display';

interface HeroBandProps {
  listings: Listing[];
}

// Mirrors @keyframes float (index (1).html: translateY(0) <-> translateY(-8px),
// 3s ease-in-out infinite) via Framer Motion, per the pinned stack. Each
// floater's `delay` matches the original's per-element animation-delay
// (0s / 1s / .5s / 1.5s).
const FLOATERS = [
  { emoji: '🏠', className: 'right-6 top-[18px] text-[28px] opacity-60', delay: 0 },
  { emoji: '✨', className: 'right-[70px] top-[60px] text-lg opacity-40', delay: 1 },
  { emoji: '🔑', className: 'bottom-[30px] right-10 text-[22px] opacity-50', delay: 0.5 },
  { emoji: '📍', className: 'bottom-[50px] left-[10px] text-base opacity-30', delay: 1.5 },
];

// Mirrors .hero / #hero-band / updateHeroStats() (index (1).html, HERO BAND
// block). Stats are computed from the listing set passed in (seed data for
// now, Firestore from Phase 7 on) rather than a separate DOM update call —
// "Cities" is hardcoded to 3 in the original (Bangalore/Hyderabad/Gurgaon,
// matching the CITIES constant, not the 5 cities named in the page's SEO
// metadata) and "Spam / Dupes" is hardcoded to 0%; both ported as-is since
// neither is actually computed from data in the source.
export function HeroBand({ listings }: HeroBandProps) {
  const reduceMotion = useReducedMotion();
  const now = Date.now();
  const activeCount = listings.filter((l) => (now - new Date(l.created).getTime()) / 86400000 < EXPIRY_DAYS).length;
  const freshCount = listings.filter((l) => (now - new Date(l.created).getTime()) / 3600000 < 24).length;

  return (
    <div className="relative mb-7 overflow-hidden rounded-r3 bg-[linear-gradient(135deg,#1c4532_0%,#14532d_60%,#052e16_100%)] px-8 py-12 mobile:px-[26px] mobile:py-8">
      {FLOATERS.map((f) => (
        <motion.div
          key={f.emoji}
          className={`pointer-events-none absolute ${f.className}`}
          aria-hidden
          animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: f.delay }}
        >
          {f.emoji}
        </motion.div>
      ))}

      <div className="relative z-[1]">
        <div className="mb-[14px] inline-flex items-center gap-[7px] rounded-full border border-white/25 bg-white/[0.12] px-[13px] py-[5px] text-xs font-bold tracking-[0.03em] text-[#a7f3d0]">
          🟢 LIVE · India&apos;s cleanest flat listing platform
        </div>

        <h1 className="mb-[10px] font-display text-[clamp(26px,4vw,46px)] font-black leading-[1.1] tracking-[-0.03em] text-white">
          Your next flat,
          <br />
          <em className="font-serif italic text-[#86efac]">without the chaos.</em>
        </h1>
        <p className="mb-7 text-base font-medium text-[#a7f3d0]">
          Verified listings · Zero spam · Owner direct — Bangalore, Hyderabad, Gurgaon, Mumbai &amp; Noida
        </p>

        <div className="flex flex-wrap gap-7">
          <HeroStat value={activeCount} label="Live Listings" />
          <HeroStat value={freshCount} label="Added Today" />
          <HeroStat value={3} label="Cities" />
          <HeroStat value="0%" label="Spam / Dupes" />
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            className="flex items-center gap-[7px] rounded-xl bg-white px-5 py-[9px] text-[13.5px] font-extrabold text-brand"
          >
            🏘️ Browse Listings ↓
          </button>
          {/* Phase 11 (payments) wires this to the real upgrade flow. */}
          <button
            type="button"
            className="flex items-center gap-[7px] rounded-xl border-[1.5px] border-white/30 bg-white/[0.15] px-5 py-[9px] text-[13.5px] font-extrabold text-white opacity-50"
            disabled
          >
            ⚡ Go Pro — <span className="line-through opacity-60">₹1,499</span> ₹499
          </button>
        </div>

        <div className="mt-[14px] text-[11.5px] font-semibold text-[#6ee7b7] opacity-[0.85]">
          🎉 Launch price — limited time only
        </div>
      </div>
    </div>
  );
}

function HeroStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-[28px] font-extrabold leading-none text-white">{value}</div>
      <div className="mt-[2px] text-xs font-semibold text-[#6ee7b7]">{label}</div>
    </div>
  );
}
