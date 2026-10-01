import { useCallback, useMemo, useState } from 'react';
import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import {
  METRIC_BY_KEY,
  NOT_SET,
  type DemographicRow,
  type MetricKey,
} from '../lib/demographics';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
} from '../lib/googleMaps';
import { formatMetric } from '../lib/format';

// Metrics shown in the click info panel (per spec).
const INFO_METRICS: MetricKey[] = [
  'activeUsers',
  'newUsers',
  'engagedSessions',
  'engagementRate',
  'engagedSessionsPerActiveUser',
  'averageEngagementTimePerActiveUser',
  'eventCount',
  'keyEvents',
  'userKeyEventRate',
];

// Bubble radius in *pixels* (constant on screen regardless of zoom). Square-root
// scaling against the dataset max keeps very large cities/states from swamping
// the map; the hard max keeps a single bubble from covering its neighbours.
const MIN_RADIUS_PX = 6;
const MAX_RADIUS_PX = 30;

// India-focused default viewport. Stable refs so the map is not re-centred on
// every render (users keep their own pan/zoom after the initial view).
const INDIA_CENTER = { lat: 22.5, lng: 79.5 };
const INDIA_ZOOM = 5;

/** A single plottable bubble (one city, or one aggregated state). */
export interface MapPoint {
  key: string;
  lat: number;
  lng: number;
  value: number; // selected-metric value (drives bubble size)
  row: DemographicRow; // full metrics for the info panel (city field = label)
}

export interface CityMapProps {
  points: MapPoint[];
  metric: MetricKey;
  resolving?: boolean;
  /** Selected-metric value for `(not set)`, summarised off-map. */
  notSetValue?: number;
  /** Labels (cities/states) with data but no coordinates — listed, not plotted. */
  unresolved?: { label: string; value: number }[];
  /** When provided (state mode), the info panel offers a drill-down action. */
  onDrill?: (label: string) => void;
}

export default function CityMap({
  points,
  metric,
  resolving = false,
  notSetValue = 0,
  unresolved = [],
  onDrill,
}: CityMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [selected, setSelected] = useState<DemographicRow | null>(null);

  const maxValue = useMemo(
    () => points.reduce((m, p) => Math.max(m, p.value), 0),
    [points],
  );

  const radiusFor = useCallback(
    (value: number) => {
      if (maxValue <= 0 || value <= 0) return MIN_RADIUS_PX;
      const px = MIN_RADIUS_PX + (MAX_RADIUS_PX - MIN_RADIUS_PX) * Math.sqrt(value / maxValue);
      return Math.min(MAX_RADIUS_PX, px);
    },
    [maxValue],
  );

  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
      gestureHandling: 'cooperative',
    }),
    [],
  );

  const metricDef = METRIC_BY_KEY[metric];
  const hasMap = isLoaded && (points.length > 0 || resolving);

  const bubbleIcon = (value: number, isSel: boolean): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale: radiusFor(value),
    fillColor: '#f4511e',
    fillOpacity: isSel ? 0.8 : 0.5,
    strokeColor: '#bf360c',
    strokeOpacity: 0.9,
    strokeWeight: isSel ? 2.5 : 1,
  });

  return (
    <div className="map-section">
      <div className="map-main">
        {resolving && (
          <div className="map-toolbar">
            <span className="map-status">Resolving locations…</span>
          </div>
        )}

        <div className="map">
          {loadError ? (
            <div className="map-state error-text">
              Could not load Google Maps. Verify the API key and its allowed HTTP
              referrers in Google Cloud Console.
            </div>
          ) : !isLoaded ? (
            <div className="map-state">Loading map…</div>
          ) : hasMap ? (
            <GoogleMap
              mapContainerClassName="gmap"
              center={INDIA_CENTER}
              zoom={INDIA_ZOOM}
              options={mapOptions}
              onClick={() => setSelected(null)}
            >
              {points.map((p) => {
                const isSel = selected?.city === p.row.city;
                return (
                  <MarkerF
                    key={p.key}
                    position={{ lat: p.lat, lng: p.lng }}
                    icon={bubbleIcon(p.value, isSel)}
                    zIndex={isSel ? 1000 : Math.round(p.value)}
                    title={`${p.row.city}: ${formatMetric(metricDef.kind, p.value)} ${metricDef.short}`}
                    onClick={() => setSelected(p.row)}
                  />
                );
              })}
            </GoogleMap>
          ) : (
            <div className="map-state">No mappable locations for this period.</div>
          )}
        </div>

        <div className="map-legend">
          <span className="legend-bubbles" aria-hidden>
            <i className="b1" />
            <i className="b2" />
            <i className="b3" />
          </span>
          <span>
            Bubble size = <strong>{metricDef.label}</strong>. Aggregated at city /
            state centres — not individual user locations.
          </span>
        </div>
      </div>

      <aside className="map-aside">
        {selected ? (
          <div className="info-panel">
            <div className="info-head">
              <h4>{selected.city === NOT_SET ? NOT_SET : selected.city}</h4>
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <dl className="info-grid">
              {INFO_METRICS.map((key) => {
                const def = METRIC_BY_KEY[key];
                return (
                  <div className="info-row" key={key}>
                    <dt>{def.label}</dt>
                    <dd>{formatMetric(def.kind, selected[key])}</dd>
                  </div>
                );
              })}
            </dl>
            {onDrill && (
              <button className="drill-btn" onClick={() => onDrill(selected.city)}>
                View cities in {selected.city} →
              </button>
            )}
          </div>
        ) : (
          <div className="info-placeholder">
            <p>Click a bubble to see its full metrics.</p>
          </div>
        )}

        {notSetValue > 0 && (
          <div className="map-stat">
            <span className="map-stat-label">{NOT_SET} (not mapped)</span>
            <span className="map-stat-value">
              {formatMetric(metricDef.kind, notSetValue)} {metricDef.short}
            </span>
          </div>
        )}

        {unresolved.length > 0 && (
          <details className="unmapped">
            <summary>{unresolved.length} without map location</summary>
            <ul>
              {unresolved.map((u) => (
                <li key={u.label}>
                  {u.label} — {formatMetric(metricDef.kind, u.value)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </aside>
    </div>
  );
}
