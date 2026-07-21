'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useJsApiLoader } from '@react-google-maps/api';
import type { Listing } from '@/types/listing';
import { filterListings } from '../lib/filtering';
import { sortListings } from '../lib/sorting';
import { isWithinAnyAnchorRadius } from '../lib/location-radius';
import { filtersFromSearchParams, filtersToSearchParams, type ListingFilters } from '../lib/filter-state';
import { useUserLocation } from '@/features/map/hooks/useUserLocation';
import { MapView } from '@/features/map/components/MapView';
import { LocationAutocomplete, type LocationAnchor } from '@/features/map/components/LocationAutocomplete';
import { FilterBar } from './FilterBar';
import { ResultsBar } from './ResultsBar';
import { ListingGrid } from './ListingGrid';

interface ListingsExplorerProps {
  listings: Listing[];
}

const MAPS_LIBRARIES: 'places'[] = ['places'];

// Owns the interactive filter/sort/map layer for the homepage. Replaces the
// original's module-global `S.f`/`FP`/`S.mapOpen`/`_locSelected` mutation +
// `renderListings()` DOM rebuild (index (1).html) with URL search params as
// the single source of truth for filters (architecture doc §3.10) plus
// local component state for map-toggle and location-radius anchors (neither
// of which meaningfully benefits from being shareable via URL — the
// original never persisted map-open state or location anchors across a
// reload either, since _locSelected/saveLocations were never actually
// wired up — architecture report §1.5).
//
// The Google Maps JS API script is loaded once, here, via useJsApiLoader —
// both MapView and LocationAutocomplete need it, so it's centralized at
// this level rather than each component loading its own <script> tag.
export function ListingsExplorer({ listings }: ListingsExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const userLocation = useUserLocation();

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: 'flatfind-google-maps',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: MAPS_LIBRARIES,
  });

  const [mapOpen, setMapOpen] = useState(false);
  const [locationAnchors, setLocationAnchors] = useState<LocationAnchor[]>([]);

  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);

  const updateFilters = useCallback(
    (patch: Partial<ListingFilters>) => {
      const next = filtersToSearchParams({ ...filters, ...patch });
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
    setLocationAnchors([]);
  }, [pathname, router]);

  const addAnchor = useCallback((anchor: LocationAnchor) => {
    setLocationAnchors((prev) => [...prev, anchor]);
  }, []);

  const removeAnchor = useCallback((index: number) => {
    setLocationAnchors((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const filtered = useMemo(() => {
    const byFilters = filterListings(listings, filters);
    return byFilters.filter((listing) => isWithinAnyAnchorRadius(listing, locationAnchors));
  }, [listings, filters, locationAnchors]);

  const sorted = useMemo(
    () => sortListings(filtered, filters.sort, userLocation),
    [filtered, filters.sort, userLocation],
  );

  return (
    <>
      <div className="mb-2">
        <LocationAutocomplete
          anchors={locationAnchors}
          onAdd={addAnchor}
          onRemove={removeAnchor}
          mapsLoaded={mapsLoaded}
        />
      </div>
      <FilterBar filters={filters} onChange={updateFilters} onClear={clearFilters} />
      <ResultsBar count={sorted.length} mapOpen={mapOpen} onToggleMap={() => setMapOpen((v) => !v)} />
      {mapOpen && (
        <MapView
          listings={sorted}
          userLocation={userLocation}
          onSelectListing={(id) => {
            // Detail-view click-through is still Phase 9/10 scope (no route
            // exists yet — see ListingCard's file header from Phase 4);
            // scrolling the corresponding card into view is a reasonable
            // interim affordance instead of a dead link.
            document.getElementById(`listing-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      )}
      <ListingGrid listings={sorted} userLocation={userLocation} />
    </>
  );
}
