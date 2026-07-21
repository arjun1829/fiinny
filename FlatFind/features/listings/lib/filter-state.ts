import type { Amenity, Availability, Furnishing, ListingCity, ListingTag, ListingType, TenantPreference } from '@/types/listing';
import type { SortKey } from '@/constants/filters';

// Mirrors S.f / FP (index (1).html) — the filter selection shape — but as a
// single source of truth serialized to/from URL search params instead of a
// module-global mutable object. Per the architecture doc (§3.10): "Filter/
// sort selection: URL search params... Makes filtered views shareable/
// bookmarkable — the current app has zero URL state."
export interface ListingFilters {
  city: ListingCity | 'All';
  type: ListingType | 'All';
  budgetIndex: number; // index into BUDGET_OPTIONS, matches the original's S.f.bi
  search: string;
  tag: ListingTag | 'All';
  furnishing: Furnishing | 'All';
  availability: Availability | 'All';
  tenant: TenantPreference | 'All';
  amenity: Amenity | 'All';
  sort: SortKey;
}

export const DEFAULT_FILTERS: ListingFilters = {
  city: 'All',
  type: 'All',
  budgetIndex: 0,
  search: '',
  tag: 'All',
  furnishing: 'All',
  availability: 'All',
  tenant: 'All',
  amenity: 'All',
  sort: 'newest',
};

const PARAM_KEYS: Record<keyof Omit<ListingFilters, 'budgetIndex'>, string> = {
  city: 'city',
  type: 'type',
  search: 'q',
  tag: 'tag',
  furnishing: 'furnish',
  availability: 'avail',
  tenant: 'tenant',
  amenity: 'amenity',
  sort: 'sort',
};

/** Parses filter state from URLSearchParams, falling back to defaults for anything absent/invalid. */
export function filtersFromSearchParams(params: URLSearchParams): ListingFilters {
  const get = (key: string, fallback: string) => params.get(key) ?? fallback;
  const budgetIndex = Number(params.get('budget'));

  return {
    city: get(PARAM_KEYS.city, DEFAULT_FILTERS.city) as ListingFilters['city'],
    type: get(PARAM_KEYS.type, DEFAULT_FILTERS.type) as ListingFilters['type'],
    budgetIndex: Number.isInteger(budgetIndex) && budgetIndex >= 0 ? budgetIndex : DEFAULT_FILTERS.budgetIndex,
    search: get(PARAM_KEYS.search, DEFAULT_FILTERS.search),
    tag: get(PARAM_KEYS.tag, DEFAULT_FILTERS.tag) as ListingFilters['tag'],
    furnishing: get(PARAM_KEYS.furnishing, DEFAULT_FILTERS.furnishing) as ListingFilters['furnishing'],
    availability: get(PARAM_KEYS.availability, DEFAULT_FILTERS.availability) as ListingFilters['availability'],
    tenant: get(PARAM_KEYS.tenant, DEFAULT_FILTERS.tenant) as ListingFilters['tenant'],
    amenity: get(PARAM_KEYS.amenity, DEFAULT_FILTERS.amenity) as ListingFilters['amenity'],
    sort: get(PARAM_KEYS.sort, DEFAULT_FILTERS.sort) as SortKey,
  };
}

/** Serializes filter state to URLSearchParams, omitting anything at its default value to keep URLs clean. */
export function filtersToSearchParams(filters: ListingFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.city !== DEFAULT_FILTERS.city) params.set(PARAM_KEYS.city, filters.city);
  if (filters.type !== DEFAULT_FILTERS.type) params.set(PARAM_KEYS.type, filters.type);
  if (filters.budgetIndex !== DEFAULT_FILTERS.budgetIndex) params.set('budget', String(filters.budgetIndex));
  if (filters.search !== DEFAULT_FILTERS.search) params.set(PARAM_KEYS.search, filters.search);
  if (filters.tag !== DEFAULT_FILTERS.tag) params.set(PARAM_KEYS.tag, filters.tag);
  if (filters.furnishing !== DEFAULT_FILTERS.furnishing) params.set(PARAM_KEYS.furnishing, filters.furnishing);
  if (filters.availability !== DEFAULT_FILTERS.availability) params.set(PARAM_KEYS.availability, filters.availability);
  if (filters.tenant !== DEFAULT_FILTERS.tenant) params.set(PARAM_KEYS.tenant, filters.tenant);
  if (filters.amenity !== DEFAULT_FILTERS.amenity) params.set(PARAM_KEYS.amenity, filters.amenity);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set(PARAM_KEYS.sort, filters.sort);
  return params;
}

/** Count of non-default filter dimensions — mirrors _caf() (index (1).html, head script), used for the "Filters (n)" badge. */
export function countActiveFilters(filters: ListingFilters): number {
  let n = 0;
  if (filters.city !== 'All') n++;
  if (filters.type !== 'All') n++;
  if (filters.budgetIndex > 0) n++;
  if (filters.tag !== 'All') n++;
  if (filters.furnishing !== 'All') n++;
  if (filters.availability !== 'All') n++;
  if (filters.tenant !== 'All') n++;
  if (filters.amenity !== 'All') n++;
  return n;
}
