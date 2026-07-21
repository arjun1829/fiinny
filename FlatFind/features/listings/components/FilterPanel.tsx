'use client';

import { Pill } from '@/components/ui';
import {
  CITY_OPTIONS,
  TYPE_OPTIONS,
  BUDGET_OPTIONS,
  TAG_OPTIONS,
  TAG_LABELS,
  FURNISHING_OPTIONS,
  AVAILABILITY_OPTIONS,
  TENANT_OPTIONS,
  AMENITY_OPTIONS,
} from '@/constants/filters';
import type { ListingFilters } from '../lib/filter-state';
import { countActiveFilters } from '../lib/filter-state';

interface FilterPanelProps {
  open: boolean;
  filters: ListingFilters;
  onChange: (patch: Partial<ListingFilters>) => void;
  onClear: () => void;
  onClose: () => void;
}

// Mirrors #filter-panel + buildFilterDrawer()/fpSelect() (index (1).html,
// head script) — the slide-out drawer with 8 pill groups: City, Property
// Type, Budget, Listing Type, Furnishing, Availability, Preferred Tenants,
// Amenities. All 8 are wired to real filtering.ts logic (Phase 5) — in the
// original, the last 4 groups rendered and toggled visually but had no
// effect on getFiltered() (architecture report §1.5).
export function FilterPanel({ open, filters, onChange, onClear, onClose }: FilterPanelProps) {
  if (!open) return null;

  const activeCount = countActiveFilters(filters);

  return (
    <>
      <div className="fixed inset-0 z-[500]" onClick={onClose} aria-hidden />
      <div className="absolute right-0 top-[54px] z-[600] w-[380px] max-w-[95vw] overflow-hidden rounded-r2 border-[1.5px] border-border bg-white shadow-card-lg">
        <div className="flex items-center justify-between border-b-[1.5px] border-border px-5 py-4">
          <div className="flex items-center gap-[10px]">
            <span className="font-display text-lg font-extrabold">Filters</span>
            {activeCount > 0 && (
              <span className="rounded-full bg-brand px-[9px] py-[2px] text-[11px] font-extrabold text-white">
                {activeCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              className="rounded-[10px] border-[1.5px] border-border px-[14px] py-[6px] text-[13px] font-bold text-muted"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-[#f5f4f2] text-lg text-[#666666]"
              aria-label="Close filters"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="flex max-h-[62vh] flex-col gap-[22px] overflow-y-auto p-5">
          <FilterGroup label="CITY">
            {CITY_OPTIONS.map((city) => (
              <Pill key={city} active={filters.city === city} onClick={() => onChange({ city })}>
                {city}
              </Pill>
            ))}
          </FilterGroup>

          <FilterGroup label="PROPERTY TYPE">
            {TYPE_OPTIONS.map((type) => (
              <Pill key={type} active={filters.type === type} onClick={() => onChange({ type })}>
                {type}
              </Pill>
            ))}
          </FilterGroup>

          <FilterGroup label="BUDGET">
            {BUDGET_OPTIONS.map((budget, i) => (
              <Pill key={budget.label} active={filters.budgetIndex === i} onClick={() => onChange({ budgetIndex: i })}>
                {budget.label}
              </Pill>
            ))}
          </FilterGroup>

          <FilterGroup label="LISTING TYPE">
            {TAG_OPTIONS.map((tag) => (
              <Pill key={tag} active={filters.tag === tag} onClick={() => onChange({ tag })}>
                {TAG_LABELS[tag]}
              </Pill>
            ))}
          </FilterGroup>

          <FilterGroup label="FURNISHING">
            {FURNISHING_OPTIONS.map((option) => (
              <Pill key={option} active={filters.furnishing === option} onClick={() => onChange({ furnishing: option })}>
                {option}
              </Pill>
            ))}
          </FilterGroup>

          <FilterGroup label="AVAILABILITY">
            {AVAILABILITY_OPTIONS.map((option) => (
              <Pill key={option} active={filters.availability === option} onClick={() => onChange({ availability: option })}>
                {option}
              </Pill>
            ))}
          </FilterGroup>

          <FilterGroup label="PREFERRED TENANTS">
            {TENANT_OPTIONS.map((option) => (
              <Pill key={option} active={filters.tenant === option} onClick={() => onChange({ tenant: option })}>
                {option}
              </Pill>
            ))}
          </FilterGroup>

          <FilterGroup label="AMENITIES">
            {AMENITY_OPTIONS.map((option) => (
              <Pill key={option} active={filters.amenity === option} onClick={() => onChange({ amenity: option })}>
                {option}
              </Pill>
            ))}
          </FilterGroup>
        </div>

        <div className="border-t-[1.5px] border-border p-[14px]">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-brand py-3 text-sm font-extrabold text-white"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[10px] text-[11px] font-extrabold tracking-[0.1em] text-[#a8a29e]">{label}</div>
      <div className="flex flex-wrap gap-[7px]">{children}</div>
    </div>
  );
}
