"use client";

import { useCallback, useMemo, useState } from 'react';
import {
  GoogleMap,
  Marker,
  Polyline,
  InfoWindow,
  useJsApiLoader,
} from '@react-google-maps/api';
import { sortVisits } from '../../app/sales/dealers/dealer-visit-service';
import type { DaySession } from '../../app/sales/day-session-service';
import type { DealerVisit } from '../../app/sales/dealers/dealer-visit-service';

// Constant refs outside the component — prevents useJsApiLoader from re-triggering
const LIBRARIES: ('geometry' | 'drawing' | 'places' | 'visualization')[] = ['geometry'];
const MAP_CONTAINER_STYLE = { width: '100%', height: '360px' };
const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
};

const C_START = '#16a34a';
const C_VISIT = '#2563eb';
const C_END   = '#dc2626';

type ActivePin =
  | { type: 'start' }
  | { type: 'visit'; ordinal: number }  // ordinal = 1-based display number
  | { type: 'end' };

export interface RouteMapProps {
  session: DaySession;
  visits: DealerVisit[];
}

function fmtTime(ts: unknown): string {
  if (!ts || typeof (ts as any).toDate !== 'function') return '—';
  return (ts as any).toDate().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function svgPin(color: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5"/><text x="16" y="21" font-size="13" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial,sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function pinIcon(color: string, label: string): google.maps.Icon {
  return {
    url: svgPin(color, label),
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  };
}

export default function RouteMap({ session, visits }: RouteMapProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: LIBRARIES,
  });

  const [activePin, setActivePin] = useState<ActivePin | null>(null);

  const startPos = { lat: session.startGeo.latitude,  lng: session.startGeo.longitude };
  const endPos   = session.endGeo
    ? { lat: session.endGeo.latitude, lng: session.endGeo.longitude }
    : null;

  // Visits in canonical route order (matches the order used at end-of-day calculation)
  const orderedVisits = useMemo(() => sortVisits(visits), [visits]);

  // Points for bounds fitting
  const allPoints = useMemo(() => [
    startPos,
    ...orderedVisits.filter(v => v.geo).map(v => ({ lat: v.geo!.latitude, lng: v.geo!.longitude })),
    ...(endPos ? [endPos] : []),
  ], [orderedVisits, endPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Decode stored road polyline if available; fallback to straight-line coords
  const polylinePath = useMemo(() => {
    if (!isLoaded) return [];
    if (session.encodedPolyline) {
      try {
        return google.maps.geometry.encoding
          .decodePath(session.encodedPolyline)
          .map(ll => ({ lat: ll.lat(), lng: ll.lng() }));
      } catch {
        // corrupted polyline — fall through to straight-line
      }
    }
    return allPoints;
  }, [isLoaded, session.encodedPolyline, allPoints]);

  const onLoad = useCallback((map: google.maps.Map) => {
    if (allPoints.length < 2) { map.setCenter(startPos); map.setZoom(13); return; }
    const bounds = new google.maps.LatLngBounds();
    allPoints.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, 56);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-2xl bg-surface-container ring-1 ring-outline/10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-outline/10">
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={startPos}
        zoom={13}
        onLoad={onLoad}
        options={MAP_OPTIONS}
        onClick={() => setActivePin(null)}
      >
        {/* Road route polyline (or straight-line fallback) */}
        {polylinePath.length >= 2 && (
          <Polyline
            path={polylinePath}
            options={{ strokeColor: '#3b82f6', strokeOpacity: 0.8, strokeWeight: 3, geodesic: false }}
          />
        )}

        {/* Start marker */}
        <Marker
          position={startPos}
          icon={pinIcon(C_START, 'S')}
          zIndex={200}
          onClick={() => setActivePin({ type: 'start' })}
        />

        {/* Visit markers — numbered in route order */}
        {orderedVisits.map((visit, i) => {
          if (!visit.geo) return null;
          const pos = { lat: visit.geo.latitude, lng: visit.geo.longitude };
          const ordinal = i + 1;
          return (
            <Marker
              key={visit.id}
              position={pos}
              icon={pinIcon(C_VISIT, String(ordinal))}
              zIndex={ordinal}
              onClick={() => setActivePin({ type: 'visit', ordinal })}
            />
          );
        })}

        {/* End marker */}
        {endPos && (
          <Marker
            position={endPos}
            icon={pinIcon(C_END, 'E')}
            zIndex={200}
            onClick={() => setActivePin({ type: 'end' })}
          />
        )}

        {/* ── Info windows ───────────────────────────────────────────────── */}

        {activePin?.type === 'start' && (
          <InfoWindow position={startPos} onCloseClick={() => setActivePin(null)}>
            <div style={{ padding: '3px 2px', minWidth: 120 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13, color: C_START }}>
                Start of Day
              </p>
              <p style={{ margin: '0 0 2px', fontSize: 12, color: '#333' }}>
                <strong>Started At</strong>
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#555' }}>
                {fmtTime(session.startedAt)}
              </p>
            </div>
          </InfoWindow>
        )}

        {activePin?.type === 'visit' && (() => {
          const visit = orderedVisits[activePin.ordinal - 1];
          if (!visit?.geo) return null;
          const pos = { lat: visit.geo.latitude, lng: visit.geo.longitude };
          const purpose = visit.purpose === 'Other' && visit.purposeOther
            ? visit.purposeOther
            : visit.purpose;
          return (
            <InfoWindow position={pos} onCloseClick={() => setActivePin(null)}>
              <div style={{ padding: '3px 2px', minWidth: 160, maxWidth: 220 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13, color: C_VISIT }}>
                  Visit {activePin.ordinal}
                </p>
                <p style={{ margin: '0 0 3px', fontWeight: 600, fontSize: 13, color: '#111' }}>
                  {visit.dealerName}
                </p>
                {purpose && (
                  <p style={{ margin: '0 0 3px', fontSize: 12, color: '#555' }}>{purpose}</p>
                )}
                <p style={{ margin: 0, fontSize: 12, color: '#777' }}>
                  {fmtTime(visit.visitedAt)}
                </p>
              </div>
            </InfoWindow>
          );
        })()}

        {activePin?.type === 'end' && endPos && (
          <InfoWindow position={endPos} onCloseClick={() => setActivePin(null)}>
            <div style={{ padding: '3px 2px', minWidth: 120 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13, color: C_END }}>
                End of Day
              </p>
              <p style={{ margin: '0 0 2px', fontSize: 12, color: '#333' }}>
                <strong>Ended At</strong>
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#555' }}>
                {fmtTime(session.endedAt)}
              </p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}
