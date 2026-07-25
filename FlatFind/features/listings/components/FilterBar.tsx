'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { SORT_OPTIONS } from '@/constants/filters';
import type { ListingFilters } from '../lib/filter-state';
import { countActiveFilters } from '../lib/filter-state';
import { FilterPanel } from './FilterPanel';

interface FilterBarProps {
  filters: ListingFilters;
  onChange: (patch: Partial<ListingFilters>) => void;
  onClear: () => void;
}

// Mirrors the location-search + filter-button + sort-select row and the
// #filter-panel drawer trigger (index (1).html). Now fully wired to real
// state (Phase 5) — city/type/budget/tag/furnishing/availability/tenant/
// amenity/sort all drive filtering.ts/sorting.ts via URL search params
// (ListingsExplorer). Location autocomplete (the loc-input/loc-suggestions
// Nominatim-backed feature) is Phase 6 (Maps) scope — the search box here
// is a free-text multi-field search (filterListings()'s buildSearchHaystack,
// checking title/description/city/type/tag/owner/furnishing/availability/
// tenant/amenities — see filtering.ts), not the location-autocomplete
// input; the original actually had both as separate UI elements occupying
// the same visual position, which was confusing — this keeps only the one
// filtering.ts implements today, and Phase 6 adds the autocomplete
// alongside it.
export function FilterBar({ filters, onChange, onClear }: FilterBarProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  return (
    <div className="relative mb-3 flex flex-wrap items-center gap-[10px]">
      <div className="relative min-w-[200px] flex-1">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[#aaaaaa]"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Search city, locality, title, amenities…"
          autoComplete="off"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          className="w-full rounded-xl border-[1.5px] border-border bg-white py-[11px] pl-[38px] pr-3 text-sm text-ink outline-none transition-colors focus:border-brand"
        />
      </div>

      <Button
        variant={activeCount > 0 ? 'ghost' : 'outline'}
        className="flex-shrink-0 gap-2 whitespace-nowrap"
        onClick={() => setPanelOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="min-w-[20px] rounded-full bg-brand px-2 py-px text-center text-[11px] font-extrabold text-white">
            {activeCount}
          </span>
        )}
      </Button>

      <select
        value={filters.sort}
        onChange={(e) => onChange({ sort: e.target.value as ListingFilters['sort'] })}
        className="flex-shrink-0 cursor-pointer rounded-xl border-[1.5px] border-border bg-white px-[14px] py-[11px] text-[13.5px] font-semibold text-ink outline-none transition-colors focus:border-brand"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <FilterPanel
        open={panelOpen}
        filters={filters}
        onChange={onChange}
        onClear={() => {
          onClear();
        }}
        onClose={() => setPanelOpen(false)}
      />
    </div>
  );
}
