/**
 * "Brands & companies connected with us" logo strip for /sell.
 *
 * The logos are the same admin-managed list the About page orbits
 * (Admin > About page, Firestore siteContent/about, public read), so adding
 * or removing a partner there updates this strip too. The page passes them
 * in already loaded; if the list is empty or disabled, nothing renders.
 *
 * Server component with a CSS-only marquee: no client JS, paused on hover,
 * and still for anyone who has asked for reduced motion.
 */

export type StripPartner = {
  name: string;
  logoUrl: string;
  website?: string;
};

/** Repeat the list so one half of the track is always wider than the screen. */
const MIN_PER_HALF = 10;

export function TrustedBrandsStrip({
  partners,
  heading,
}: {
  partners: StripPartner[];
  heading: string;
}) {
  if (partners.length === 0) return null;

  const half: StripPartner[] = [];
  while (half.length < Math.max(MIN_PER_HALF, partners.length)) {
    half.push(...partners);
  }
  const track = [...half, ...half];

  return (
    <section aria-label={heading} className="border-b border-surface-container bg-white py-8">
      <style>{`
        @keyframes kd-brand-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .kd-brand-track { animation: kd-brand-marquee 40s linear infinite; }
        .kd-brand-strip:hover .kd-brand-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .kd-brand-track { animation: none; } }
      `}</style>
      <p className="px-4 text-center text-xs font-black uppercase tracking-widest text-on-surface-variant">
        {heading}
      </p>
      <div className="kd-brand-strip relative mt-5 overflow-hidden">
        {/* Soft fade at both edges, like the reference strip. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent sm:w-24"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent sm:w-24"
        />
        <ul className="kd-brand-track flex w-max items-center gap-6 sm:gap-10">
          {track.map((p, i) => {
            // Only the first copy is announced; the repeats exist for the loop.
            const repeat = i >= partners.length;
            // Admin names like "1", "2" say nothing, so don't read them out.
            const alt = /^\s*\d*\s*$/.test(p.name) ? "Partner brand logo" : `${p.name} logo`;
            const logo = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.logoUrl}
                alt={repeat ? "" : alt}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-16 w-32 scale-125 object-contain sm:h-20 sm:w-44"
              />
            );
            return (
              <li
                key={i}
                aria-hidden={repeat || undefined}
                className="flex h-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-surface-container bg-white px-3 sm:h-24 sm:px-4"
              >
                {p.website && !repeat ? (
                  <a href={p.website} target="_blank" rel="noopener noreferrer">
                    {logo}
                  </a>
                ) : (
                  logo
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
