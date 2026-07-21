'use client';

import { useState } from 'react';
import { GoogleMap, MarkerF, InfoWindowF, useJsApiLoader } from '@react-google-maps/api';
import type { Listing } from '@/types/listing';
import type { LatLng } from '@/utils/haversine';

interface MapViewProps {
  listings: Listing[];
  userLocation: LatLng | null;
  onSelectListing: (id: string) => void;
}

// Replaces Leaflet/OpenStreetMap (architecture doc §3.8, Phase 0 decision:
// Google Maps JavaScript API). Height (420px) matches #leaflet-map exactly
// (index (1).html). This component only ever mounts while the map view is
// toggled on (see ListingsExplorer) — @react-google-maps/api's GoogleMap
// measures its container at mount time, so the original's zero-width-at-
// first-paint retry loop (initLeafletMap's tryInit poll, itself never
// actually defined in the source — architecture report §1.6) has no
// equivalent problem to work around here.
const MAP_CONTAINER_STYLE = { height: '420px', width: '100%' };
const DEFAULT_CENTER: LatLng = { lat: 12.9716, lng: 77.5946 }; // Bangalore — matches the app's primary market

const LIBRARIES: 'places'[] = ['places'];

export function MapView({ listings, userLocation, onSelectListing }: MapViewProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'flatfind-google-maps',
    googleMapsApiKey: apiKey ?? '',
    libraries: LIBRARIES,
  });
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  if (!apiKey) {
    return (
      <div className="mb-[22px] flex h-[420px] w-full items-center justify-center rounded-r2 border-[1.5px] border-border bg-[#e8f4f0] text-center text-sm text-muted">
        <div>
          <div className="mb-2 text-2xl">🗺️</div>
          Map view requires a Google Maps API key.
          <br />
          Set <code className="rounded bg-code-bg px-1 py-0.5 text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in{' '}
          <code className="rounded bg-code-bg px-1 py-0.5 text-xs">.env.local</code>.
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mb-[22px] flex h-[420px] w-full items-center justify-center rounded-r2 border-[1.5px] border-border bg-red-50 text-center text-sm text-red-700">
        Failed to load Google Maps. Check the API key and enabled APIs (Maps JavaScript API, Places API).
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="mb-[22px] flex h-[420px] w-full items-center justify-center rounded-r2 border-[1.5px] border-border bg-[#e8f4f0] text-sm text-muted">
        Loading map…
      </div>
    );
  }

  const plottable = listings.filter((l): l is Listing & { lat: number; lng: number } => l.lat != null && l.lng != null);
  const center = userLocation ?? DEFAULT_CENTER;
  const activeListing = plottable.find((l) => l.id === activeMarkerId) ?? null;

  return (
    <div className="mb-[22px] overflow-hidden rounded-r2 border-[1.5px] border-border">
      <GoogleMap mapContainerStyle={MAP_CONTAINER_STYLE} center={center} zoom={11}>
        {userLocation && (
          <MarkerF
            position={userLocation}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#1c4532',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            }}
            title="Your location"
          />
        )}
        {plottable.map((listing) => (
          <MarkerF
            key={listing.id}
            position={{ lat: listing.lat, lng: listing.lng }}
            onClick={() => setActiveMarkerId(listing.id)}
          />
        ))}
        {activeListing && (
          <InfoWindowF
            position={{ lat: activeListing.lat, lng: activeListing.lng }}
            onCloseClick={() => setActiveMarkerId(null)}
          >
            <button
              type="button"
              onClick={() => onSelectListing(activeListing.id)}
              className="cursor-pointer border-none bg-transparent p-0 text-left"
            >
              <div className="text-[12.5px] font-bold text-ink">{activeListing.location.split(',')[0]}</div>
              <div className="text-[13px] font-extrabold text-brand-2">
                ₹{(activeListing.rent / 1000).toFixed(0)}K/mo
              </div>
            </button>
          </InfoWindowF>
        )}
      </GoogleMap>
    </div>
  );
}
