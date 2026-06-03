"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "../../dashboard/_lib/cn";

// Generic typeahead with a searchable dropdown list. Used by the admin product
// assignment UI. Shows a selected-preview card when collapsed.
export function SearchableDropdown<T extends { id: string }>({
  label,
  placeholder,
  items,
  selectedId,
  onSelect,
  renderOption,
  renderSelected,
  filterFn,
  loading,
}: {
  label?: string;
  placeholder: string;
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  renderOption: (item: T) => React.ReactNode;
  renderSelected: (item: T) => React.ReactNode;
  filterFn: (item: T, query: string) => boolean;
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = items.find(i => i.id === selectedId) ?? null;

  const filtered = query.trim()
    ? items.filter(i => filterFn(i, query.trim().toLowerCase()))
    : items;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(id: string) {
    onSelect(id);
    setQuery("");
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect("");
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{label}</label>
      )}

      <div ref={wrapRef} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline" />
          <input
            type="text"
            placeholder={selected ? "" : placeholder}
            value={selected && !open ? "" : query}
            onFocus={() => setOpen(true)}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            className="w-full rounded-xl border border-outline-variant/40 bg-white pl-9 pr-9 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {selected && (
            <button
              type="button"
              onMouseDown={clear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-on-surface-variant hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {selected && !open && (
          <div
            className="mt-1 cursor-pointer rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 hover:border-primary/40 transition-colors"
            onClick={() => setOpen(true)}
          >
            {renderSelected(selected)}
          </div>
        )}

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-outline-variant/40 bg-white shadow-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-4 text-sm text-on-surface-variant text-center">
                {query ? `No results for "${query}"` : "Nothing found."}
              </p>
            ) : (
              <ul className="max-h-60 overflow-y-auto divide-y divide-outline-variant/10">
                {filtered.slice(0, 50).map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onMouseDown={() => pick(item.id)}
                      className={cn(
                        "w-full px-3 py-2.5 text-left hover:bg-surface-container-low transition-colors",
                        item.id === selectedId && "bg-primary/5",
                      )}
                    >
                      {renderOption(item)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
