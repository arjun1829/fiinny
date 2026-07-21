'use client';

import { useRef, useState } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import type { LatLng } from '@/utils/haversine';

export interface LocationAnchor {
  name: string;
  lat: number;
  lng: number;
}

interface LocationAutocompleteProps {
  anchors: LocationAnchor[];
  onAdd: (anchor: LocationAnchor) => void;
  onRemove: (index: number) => void;
  mapsLoaded: boolean;
}

const MAX_ANCHORS = 3; // matches _locSelected's cap in the original (index (1).html)

// Replaces the Nominatim-backed loc-input/loc-suggestions/fetchSuggestions
// flow (index (1).html, LOCATION SEARCH block) with Google Places
// Autocomplete, per Phase 0's decision. The original's underlying feature —
// pinning up to 3 named locations as distance-radius filter anchors via
// `_locSelected` — was referenced throughout the codebase but the array was
// never declared anywhere (architecture report §1.5), so this is a working
// implementation of what the dead code implied, not a port of functioning
// behavior. Distinct from the plain text search box in FilterBar (which
// filters by substring match on title/location) — this restricts results to
// a radius around 1-3 chosen points (wired into filtering in
// features/listings/lib once combined with isWithinRadius-equivalent logic,
// see the "radius filter" note in filter-state.ts).
export function LocationAutocomplete({ anchors, onAdd, onRemove, mapsLoaded }: LocationAutocompleteProps) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState('');

  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    const location = place?.geometry?.location;
    if (!place || !location) return;

    if (anchors.length >= MAX_ANCHORS) {
      setInputValue('');
      return;
    }
    const name = place.name || place.formatted_address || 'Selected location';
    if (anchors.some((a) => a.name === name)) {
      setInputValue('');
      return;
    }
    onAdd({ name, lat: location.lat(), lng: location.lng() });
    setInputValue('');
  };

  return (
    <div className="flex flex-wrap gap-[6px]">
      {anchors.map((anchor, i) => (
        <span
          key={anchor.name}
          className="flex items-center gap-1 rounded-full border-[1.5px] border-[#86efac] bg-brand-light px-3 py-1 text-xs font-bold text-brand-2"
        >
          📍 {anchor.name}
          <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${anchor.name}`} className="ml-1">
            ×
          </button>
        </span>
      ))}
      {anchors.length < MAX_ANCHORS &&
        (mapsLoaded ? (
          <Autocomplete
            onLoad={(ac) => {
              autocompleteRef.current = ac;
              ac.setOptions({ componentRestrictions: { country: 'in' }, fields: ['name', 'formatted_address', 'geometry'] });
            }}
            onPlaceChanged={handlePlaceChanged}
          >
            <input
              type="text"
              placeholder="Pin up to 3 locations to search near…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="min-w-[220px] flex-1 rounded-xl border-[1.5px] border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
          </Autocomplete>
        ) : (
          <input
            type="text"
            placeholder="Loading location search…"
            disabled
            className="min-w-[220px] flex-1 rounded-xl border-[1.5px] border-border bg-white px-3 py-2 text-sm text-muted outline-none disabled:opacity-70"
          />
        ))}
    </div>
  );
}
