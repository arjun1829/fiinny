"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { SEAT_STEP, normalizeSeatCount } from "../../lib/pricing";

/**
 * "How many products?" price calculator for /sell.
 *
 * Seats are sold in blocks of SEAT_STEP with a SEAT_STEP minimum, and
 * /api/payment/create-order snaps every request through normalizeSeatCount.
 * This uses the same function, so the total shown here is the total checkout
 * will charge for the same count (before GST and any promo code).
 *
 * Prices arrive as props from the server page, which reads them from
 * settings/pricing. Nothing here is typed by hand.
 */

export type CalcPlan = {
  label: string;
  months: number;
  /** Price of one listing for the whole period. */
  price: number;
  badge?: string;
};

export type CalcStandardPlan = {
  label: string;
  months: number;
  price: number;
  products: number;
};

const PRESETS = [10, 30, 50, 100];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function SeatCalculator({
  plans,
  standard,
}: {
  plans: CalcPlan[];
  standard: CalcStandardPlan[];
}) {
  const [count, setCount] = useState<number>(SEAT_STEP);

  const set = (n: number) => setCount(normalizeSeatCount(n));

  // A Standard pack is worth pointing out only when it covers this many
  // products for less than the per-product plan of the same length.
  const cheaperPack = standard.find((s) => {
    if (count > s.products) return false;
    const same = plans.find((p) => p.months === s.months);
    return same ? s.price < same.price * count : false;
  });

  return (
    <div className="rounded-3xl border border-surface-container bg-white p-5 sm:p-7 shadow-sm">
      <p className="text-sm font-black text-on-surface">How many products will you list?</p>
      <p className="mt-1 text-xs text-on-surface-variant">
        Listings are sold in blocks of {SEAT_STEP}.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-2xl border border-surface-container">
          <button
            type="button"
            aria-label={`${SEAT_STEP} fewer products`}
            onClick={() => set(count - SEAT_STEP)}
            disabled={count <= SEAT_STEP}
            className="flex h-11 w-11 items-center justify-center text-primary disabled:opacity-30"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span
            aria-live="polite"
            className="min-w-[4.5rem] text-center text-xl font-black text-on-surface tabular-nums"
          >
            {count}
          </span>
          <button
            type="button"
            aria-label={`${SEAT_STEP} more products`}
            onClick={() => set(count + SEAT_STEP)}
            className="flex h-11 w-11 items-center justify-center text-primary"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set(n)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                count === n
                  ? "bg-primary text-white"
                  : "bg-surface-container-low text-on-surface hover:bg-surface-container"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-5 divide-y divide-surface-container">
        {plans.map((p) => {
          const total = p.price * count;
          const best = p.badge?.toLowerCase().includes("best");
          return (
            <li key={p.label} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-on-surface">{p.label}</span>
                {p.badge ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                      best ? "bg-yellow-300 text-primary" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {p.badge}
                  </span>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-base font-black text-on-surface tabular-nums">
                  {inr(total / p.months)}
                  <span className="text-xs font-bold text-on-surface-variant">/month</span>
                </p>
                <p className="text-[11px] text-on-surface-variant tabular-nums">
                  {inr(total)} for {p.months === 1 ? "1 month" : `${p.months} months`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {cheaperPack ? (
        <p className="mt-3 rounded-2xl bg-lime-100 px-4 py-3 text-xs font-semibold text-primary">
          Tip: the Standard {cheaperPack.label} plan gives you up to {cheaperPack.products}{" "}
          listings for {inr(cheaperPack.price)}, which is less than this.
        </p>
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-on-surface-variant">
        Subscription prices before GST. Online sales also carry the platform fee and
        payment gateway charges shown below.
      </p>
    </div>
  );
}
