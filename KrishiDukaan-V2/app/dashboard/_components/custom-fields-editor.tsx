"use client";

import { Plus, X } from "lucide-react";

export type CustomFieldEntry = { title: string; value: string };

const inputCls =
  "rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

interface Props {
  entries: CustomFieldEntry[];
  onChange: (entries: CustomFieldEntry[]) => void;
  disabled?: boolean;
}

export function CustomFieldsEditor({ entries, onChange, disabled }: Props) {
  const set = (i: number, patch: Partial<CustomFieldEntry>) =>
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const add = () => onChange([...entries, { title: "", value: "" }]);

  return (
    <div className="flex flex-col gap-2">
      {entries.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant px-1">
          <span>Field Title</span>
          <span>Field Value</span>
          <span className="w-8" />
        </div>
      )}
      {entries.map((e, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <input
            className={inputCls}
            placeholder="e.g. Yield Potential"
            value={e.title}
            disabled={disabled}
            onChange={(ev) => set(i, { title: ev.target.value })}
          />
          <input
            className={inputCls}
            placeholder="e.g. Up to 56 Quintals/Acre"
            value={e.value}
            disabled={disabled}
            onChange={(ev) => set(i, { value: ev.target.value })}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => remove(i)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error disabled:opacity-40 transition-colors"
            aria-label="Remove field"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="flex w-fit items-center gap-2 rounded-xl border border-dashed border-outline-variant/50 bg-white px-4 py-2 text-sm text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors"
      >
        <Plus className="h-4 w-4" /> Add Custom Field
      </button>
    </div>
  );
}
