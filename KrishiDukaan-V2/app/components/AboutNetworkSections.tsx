'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import type { AboutPartner } from '../firebase';

/** Logos placed on the orbit; any beyond this go in a row below it. */
const MAX_ORBIT = 8;
/** Below this many extra logos the row is static; a marquee needs enough to fill it. */
const MIN_MARQUEE = 6;
/** Orbit radius, as a % of the square stage. */
const RADIUS = 38;

const DEFAULT_CENTER_LOGO = '/images/krishidukan icon.webp';

function PartnerLogo({ partner, className }: { partner: AboutPartner; className: string }) {
  const img = (
    <img
      src={partner.logoUrl}
      alt={partner.name}
      title={partner.name}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="w-full h-full object-contain select-none"
    />
  );
  return partner.website ? (
    <a href={partner.website} target="_blank" rel="noopener noreferrer" aria-label={partner.name} className={className}>
      {img}
    </a>
  ) : (
    <div className={className}>{img}</div>
  );
}

/**
 * The animated "brands connected with us" block: KrishiDukan in the centre,
 * partner logos slowly orbiting it on a ring (the logos counter-rotate so
 * they stay upright). Pure CSS transforms — compositor-only — and paused
 * while off-screen, on hover, and for prefers-reduced-motion.
 */
export function AboutPartnersSection({
  label, title, subtitle, partners, centerLogoUrl,
}: {
  label: string;
  title: string;
  subtitle?: string;
  partners: AboutPartner[];
  centerLogoUrl?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { margin: '100px' });

  const orbit = partners.slice(0, MAX_ORBIT);
  const extra = partners.slice(MAX_ORBIT);
  const itemSize = orbit.length <= 6 ? 24 : 21;
  const positions = orbit.map((_, i) => {
    // Start at 12 o'clock and go clockwise, like the reference design.
    const angle = (i / orbit.length) * 2 * Math.PI - Math.PI / 2;
    return { x: 50 + RADIUS * Math.cos(angle), y: 50 + RADIUS * Math.sin(angle) };
  });

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-emerald-50/50 to-white border-b border-surface-container py-16">
      <div className="px-4 md:px-10 max-w-7xl mx-auto w-full">
        <div className="text-center mb-10 max-w-2xl mx-auto">
          <span className="text-primary text-xs font-black uppercase tracking-widest mb-3 block">{label}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface leading-tight">{title}</h2>
          {subtitle && <p className="text-on-surface-variant text-base md:text-lg leading-relaxed mt-4">{subtitle}</p>}
        </div>

        <div
          ref={stageRef}
          data-paused={!inView || undefined}
          className="kd-orbit relative mx-auto w-full max-w-[560px] aspect-square"
        >
          {/* Static rings */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden="true">
            <circle cx="50" cy="50" r={RADIUS + 9} fill="none" stroke="rgb(16 185 129 / 0.10)" strokeWidth="0.3" />
            <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="rgb(16 185 129 / 0.25)" strokeWidth="0.3" strokeDasharray="1 1.2" />
            <circle cx="50" cy="50" r={RADIUS - 13} fill="none" stroke="rgb(16 185 129 / 0.12)" strokeWidth="0.3" />
          </svg>

          {/* Rotating ring: spokes + logos */}
          <div className="kd-orbit-ring absolute inset-0">
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden="true">
              {positions.map((p, i) => {
                // Spoke runs from the centre badge's edge to the logo's edge.
                const dx = p.x - 50;
                const dy = p.y - 50;
                const len = Math.hypot(dx, dy);
                const from = 19 / len;
                const to = (len - itemSize / 2) / len;
                return (
                  <g key={i}>
                    <line
                      x1={50 + dx * from} y1={50 + dy * from}
                      x2={50 + dx * to} y2={50 + dy * to}
                      stroke="rgb(22 163 74 / 0.45)" strokeWidth="0.3"
                    />
                    <circle cx={50 + dx * to} cy={50 + dy * to} r="0.9" fill="rgb(22 163 74)" />
                  </g>
                );
              })}
            </svg>

            {orbit.map((partner, i) => (
              <div
                key={partner.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%`, width: `${itemSize}%`, height: `${itemSize}%` }}
              >
                <div className="kd-orbit-counter w-full h-full">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 220, damping: 18 }}
                    className="w-full h-full"
                  >
                    <PartnerLogo
                      partner={partner}
                      className="block w-full h-full rounded-full bg-white border border-emerald-100 shadow-[0_8px_24px_-8px_rgba(6,78,59,0.25)] p-[16%] transition-transform duration-300 hover:scale-110"
                    />
                  </motion.div>
                </div>
              </div>
            ))}
          </div>

          {/* Centre badge — inset box instead of translate, since framer's scale owns `transform`. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 180, damping: 16 }}
            className="absolute inset-[32%]"
          >
            <div className="kd-orbit-pulse absolute inset-0 rounded-full bg-emerald-400/20" aria-hidden="true" />
            <div className="relative w-full h-full rounded-full bg-white border-4 border-emerald-100 shadow-[0_12px_40px_-12px_rgba(6,78,59,0.4)] p-[14%] flex items-center justify-center">
              <img
                src={centerLogoUrl || DEFAULT_CENTER_LOGO}
                alt="KrishiDukan"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-contain"
              />
            </div>
          </motion.div>
        </div>

        {extra.length > 0 && extra.length < MIN_MARQUEE && (
          <div className="mt-10 flex flex-wrap justify-center gap-6">
            {extra.map(partner => (
              <PartnerLogo
                key={partner.id}
                partner={partner}
                className="block w-24 h-24 md:w-28 md:h-28 rounded-full bg-white border border-emerald-100 shadow-sm p-4"
              />
            ))}
          </div>
        )}

        {extra.length >= MIN_MARQUEE && (
          <div className="kd-marquee relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
            {/* Rendered twice so the -50% loop is seamless. */}
            <div className="kd-marquee-track flex w-max gap-6">
              {[...extra, ...extra].map((partner, i) => (
                <PartnerLogo
                  key={`${partner.id}-${i}`}
                  partner={partner}
                  className="block w-24 h-24 md:w-28 md:h-28 shrink-0 rounded-full bg-white border border-emerald-100 shadow-sm p-4"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Gap between dots popping in; ~620 dots fill in under 3s. */
const DOT_STAGGER_MS = 4.5;
/** Dots this big (the busiest towns) keep pulsing after the intro. */
const PULSE_MIN_RADIUS = 8.5;
/** Same size as PRESENCE_MAP_SIZE, kept here so the frame can reserve space before the data loads. */
const MAP_W = 600;
const MAP_H = 575;

type PresenceMapData = typeof import('./india-map-data');

/**
 * "Presence across India": a map of India where presence dots pop up,
 * rippling out from Maharashtra, then the busiest towns pulse. The dots are
 * a fixed set (india-map-data.ts), so the About page reads no store data.
 * The base map is a cached static SVG; dot data loads only when the section
 * nears the viewport; the dots animate once (CSS) and the pulses are
 * compositor-only HTML rings, paused off-screen. Reduced motion shows the
 * finished map.
 */
export function AboutPresenceSection({
  label, title, subtitle, mapLabel,
}: {
  label: string;
  title: string;
  subtitle?: string;
  mapLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { once: true, margin: '400px' });
  const seen = useInView(ref, { once: true, amount: 0.3 });
  const visible = useInView(ref, { amount: 0 });
  const [data, setData] = useState<PresenceMapData | null>(null);

  useEffect(() => {
    if (!near || data) return;
    let alive = true;
    import('./india-map-data')
      .then((m) => { if (alive) setData(m); })
      .catch(() => { /* the base map still shows */ });
    return () => { alive = false; };
  }, [near, data]);

  const dots = useMemo(() => {
    const out: { x: number; y: number; r: number; i: number }[] = [];
    const flat = data?.PRESENCE_DOTS ?? [];
    for (let k = 0; k + 2 < flat.length; k += 3) out.push({ x: flat[k], y: flat[k + 1], r: flat[k + 2], i: k / 3 });
    return out;
  }, [data]);
  const introMs = dots.length * DOT_STAGGER_MS + 550;
  const pulses = dots.filter((d) => d.r >= PULSE_MIN_RADIUS);

  return (
    <section className="bg-white border-y border-surface-container py-16">
      <div className="px-4 md:px-10 max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-5 gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="md:col-span-2"
        >
          <span className="inline-flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest mb-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="kd-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            {label}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface leading-tight">{title}</h2>
          {subtitle && <p className="text-on-surface-variant text-base md:text-lg leading-relaxed mt-4">{subtitle}</p>}
        </motion.div>

        <div
          ref={ref}
          role="img"
          aria-label={mapLabel}
          className="kd-map md:col-span-3 relative w-full overflow-hidden rounded-3xl border border-surface-container shadow-ambient bg-[#d4ebf5]"
          style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}
          data-play={seen && data ? '' : undefined}
          data-paused={visible ? undefined : ''}
        >
          <img
            src="/images/india-presence-map.svg"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute inset-0 w-full h-full select-none"
          />
          {data && (
            <>
              <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true" className="absolute inset-0 w-full h-full">
                <g fill="#f0602c" fillOpacity="0.5" stroke="#c43d10" strokeOpacity="0.7" strokeWidth="0.8">
                  {dots.map(({ x, y, r, i }) => (
                    <circle key={i} className="kd-map-dot" cx={x} cy={y} r={r} style={{ animationDelay: `${Math.round(i * DOT_STAGGER_MS)}ms` }} />
                  ))}
                </g>
                <g fontSize="9.5" fontWeight="600" fill="#3f4a40" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" paintOrder="stroke">
                  {data.PRESENCE_CITIES.map((c) => (
                    <g key={c.name}>
                      <circle cx={c.x} cy={c.y} r="1.8" stroke="none" />
                      <text x={c.left ? c.x - 4 : c.x + 4} y={c.y + 3.2} textAnchor={c.left ? 'end' : 'start'}>{c.name}</text>
                    </g>
                  ))}
                </g>
              </svg>
              {pulses.map(({ x, y, r, i }, n) => (
                <span
                  key={i}
                  className="kd-map-pulse"
                  style={{
                    left: `${((x - r) / MAP_W) * 100}%`,
                    top: `${((y - r) / MAP_H) * 100}%`,
                    width: `${((2 * r) / MAP_W) * 100}%`,
                    animationDelay: `${introMs + n * 380}ms`,
                  }}
                />
              ))}
            </>
          )}
          <span className="absolute bottom-1.5 right-3 text-[9px] text-on-surface-variant/70 pointer-events-none">
            Map data: Natural Earth, DataMeet (CC BY 4.0)
          </span>
        </div>
      </div>
    </section>
  );
}
