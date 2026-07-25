'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

// Mirrors #tab-bar (index (1).html, TAB BAR block) — Listings / Saved /
// Viewed. The original toggled a `.active` class via `switchTab()` with no
// URL change at all (refreshing always returned to the listings tab, no
// view was deep-linkable). Per the architecture doc (§3.9/§3.10), this
// becomes real navigation: each tab is a Next.js <Link> to its own route,
// and active state is derived from the current pathname instead of JS state.
//
// /saved and /history don't exist as routes yet (they land in Phase 10,
// once there's a real per-user Firestore-backed saved/history feature to
// point them at) — the links below are wired for when those routes exist,
// consistent with building the shared layout once, correctly, rather than
// re-touching it per phase.
const TABS = [
  { href: '/', label: 'Listings', icon: '🏠' },
  { href: '/saved', label: 'Saved', icon: '♥' },
  { href: '/history', label: 'Viewed', icon: '👁' },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <div
      id="tab-bar"
      className="overflow-x-auto border-b-[1.5px] border-border bg-white [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="mx-auto flex max-w-[1200px] px-5">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                'flex flex-1 items-center justify-center gap-[6px] whitespace-nowrap border-b-[3px] px-4 py-[11px] text-[13.5px]',
                active ? 'border-brand font-extrabold text-ink' : 'border-transparent font-bold text-muted',
              )}
            >
              <span aria-hidden>{tab.icon}</span> {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
