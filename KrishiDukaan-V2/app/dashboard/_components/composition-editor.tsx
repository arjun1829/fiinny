"use client";

import { Plus, X } from "lucide-react";

export type CompositionEntry = { name: string; value: string };

const inputCls =
  "rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

interface Props {
  entries: CompositionEntry[];
  onChange: (entries: CompositionEntry[]) => void;
  disabled?: boolean;
}

export function CompositionEditor({ entries, onChange, disabled }: Props) {
  const set = (i: number, patch: Partial<CompositionEntry>) =>
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const add = () => onChange([...entries, { name: "", value: "" }]);

  return (
    <div className="flex flex-col gap-2">
      {entries.length > 0 && (
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant px-1">
          <span>Component / Ingredient</span>
          <span className="w-28">Value / %</span>
          <span className="w-8" />
        </div>
      )}
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            disabled={disabled}
            placeholder="e.g. Iron, Chlorpyrifos, Zinc…"
            value={entry.name}
            onChange={(e) => set(i, { name: e.target.value })}
            className={`${inputCls} flex-1`}
          />
          <input
            type="text"
            disabled={disabled}
            placeholder="e.g. 2.5%"
            value={entry.value}
            onChange={(e) => set(i, { value: e.target.value })}
            className={`${inputCls} w-28`}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => remove(i)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-red-50 hover:text-red-500 disabled:opacity-30 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="flex w-fit items-center gap-1.5 rounded-xl border border-dashed border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add ingredient
      </button>
    </div>
  );
}

/** Categories that support the Composition field. */
export const COMPOSITION_CATEGORIES = new Set([
  "Fertilizers",
  "Pesticides",
  "Herbicides",
  "Bio-Stimulants",
  "Seeds",
  "Other",
]);
