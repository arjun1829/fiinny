'use client';

import { ICONS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import { LatLng } from '../utils/haversine';
import { cacheLocation, reverseGeocodeToDisplay } from '../utils/geolocation';
import { filterStoresByQuery, storeAddressToDisplayString, StoreWithDistance } from '../utils/nearby';
import { HelperIcon, HelperTooltip } from '../../components/helpers';
import { useI18n } from '../i18n/I18nContext';
import { ReviewSection } from '../../components/shared/ReviewSection';

interface StoreLocatorViewProps {
  onBack: () => void;
  selectedStoreId?: string | null;
  onStoreSelect?: (storeId: string) => void;
  stores?: any[];
  location?: string;
  onLocationChange?: (location: string, coordinates?: { lat: number, lng: number }) => void;
  userCoords?: { lat: number, lng: number };
}

function makePinSvg(color: string, selected: boolean): string {
  const r = selected ? 14 : 11;
  const cx = selected ? 18 : 15;
  const total = cx * 2;
  const tailH = selected ? 10 : 8;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total + tailH}" viewBox="0 0 ${total} ${total + tailH}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="${color}" stroke="white" stroke-width="2.5"/>
    <polygon points="${cx - 5},${cx + r - 2} ${cx},${total + tailH} ${cx + 5},${cx + r - 2}" fill="${color}"/>
    <circle cx="${cx}" cy="${cx}" r="${Math.round(r * 0.38)}" fill="white" fill-opacity="0.9"/>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

export default function StoreLocatorView({ 
  onBack, 
  selectedStoreId, 
  onStoreSelect,
  stores = [], 
  location = 'Pune, Maharashtra',
  onLocationChange,
  userCoords = { lat: 18.5204, lng: 73.8567 }
}: StoreLocatorViewProps) {
  const { t } = useI18n();
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [storeSearch, setStoreSearch] = useState('');
  const [mobileMapOverlay, setMobileMapOverlay] = useState(false);
  const [detailStore, setDetailStore] = useState<any | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  });

  // stripMapRef keeps the strip/desktop map instance so controls work after the overlay unmounts
  const stripMapRef = useRef<google.maps.Map | null>(null);

  const displayedStores = useMemo(() => {
    return filterStoresByQuery(stores as StoreWithDistance[], storeSearch);
  }, [stores, storeSearch]);

  const activeStoreId = selectedStoreId || (displayedStores[0]?.id ?? null);
  const focusedStore =
    displayedStores.find(s => s.id === activeStoreId) || displayedStores[0] || null;

  // Calculate center: use focusedStore if available, else userCoords
  const getCenter = () => {
    if (focusedStore) {
      const loc = focusedStore.location as
        | { lat?: number; lng?: number; latitude?: number; longitude?: number }
        | undefined;
      const lat = loc?.lat ?? loc?.latitude;
      const lng = loc?.lng ?? loc?.longitude;
      if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
    }
    return userCoords;
  };

  const center = getCenter();

  const onUnmount = useCallback(function callback() {
    setMap(null);
    stripMapRef.current = null;
  }, []);

  // When the overlay map unmounts, restore the strip/desktop map reference
  const onOverlayUnmount = useCallback(function callback() {
    if (stripMapRef.current) setMap(stripMapRef.current);
    // else leave map as-is — don't null it
  }, []);

  // Effect to pan map when store selection or user coords change
  useEffect(() => {
    if (map && center) {
      map.panTo(center);
    }
  }, [map, center]);

  // Scroll sidebar to selected store card when map marker is clicked
  useEffect(() => {
    if (!activeStoreId) return;
    const card = cardRefs.current.get(activeStoreId);
    if (card && listRef.current) {
      const container = listRef.current;
      const cardTop = card.offsetTop - container.offsetTop;
      container.scrollTo({ top: cardTop - 16, behavior: 'smooth' });
    }
  }, [activeStoreId]);

  const handleStoreClick = (storeId: string, showMap = false) => {
    onStoreSelect?.(storeId);
    if (showMap) setMobileMapOverlay(true);
  };

  const handleGetDirections = (store: StoreWithDistance) => {
    const loc = store.location as any;
    const lat = loc?.lat ?? loc?.latitude;
    const lng = loc?.lng ?? loc?.longitude;

    if (lat && lng) {
      const link = document.createElement('a');
      link.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      return;
    }

    // Fallback: use a Maps short URL stored in the address line
    const line1: string = (store as any).address?.line1 ?? (store as any).line1 ?? '';
    if (line1.includes('maps.app.goo.gl') || line1.includes('maps.google.com')) {
      const link = document.createElement('a');
      link.href = line1;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      return;
    }

    // Last resort: text search by name + city + state
    const city = (store as any).address?.city ?? (store as any).city ?? '';
    const state = (store as any).address?.state ?? (store as any).state ?? '';
    const query = [store.name, city, state].filter(Boolean).join(', ');
    if (query) {
      const link = document.createElement('a');
      link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const label = await reverseGeocodeToDisplay(
          coords.lat,
          coords.lng,
          process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        );
        cacheLocation(coords, label);
        onLocationChange?.(label, coords);
      },
      () => {
        // silently ignore — keep current location
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  if (stores.length === 0) {
    return (
      <div className="p-20 text-center">
        <div className="flex flex-col items-center gap-4">
          <ICONS.Location className="w-12 h-12 text-outline" />
          <p className="text-lg font-bold text-on-surface">{t('noStoresNearby')}</p>
          <p className="text-sm text-on-surface-variant">{t('noStoresNearbyHint')}</p>
        </div>
      </div>
    );
  }

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onLocationChange) onLocationChange(e.target.value);
  };

  const handleLocationSubmit = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && location) {
      try {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
        );
        const data = await response.json();
        
        if (data.status === 'OK' && data.results.length > 0) {
          const { lat, lng } = data.results[0].geometry.location;
          const formattedAddress = data.results[0].formatted_address;
          if (onLocationChange) onLocationChange(formattedAddress, { lat, lng });
        }
      } catch (error) {
        console.error('Manual geocoding error:', error);
      }
    }
  };

  const mapContainerStyle = {
    width: '100%',
    height: '100%'
  };

  const mapOptions = {
    disableDefaultUI: true,
    zoomControl: false,
    // 'cooperative' requires Ctrl+scroll on desktop (shows hint overlay) so the page scrolls normally
    // and pinch-to-zoom on mobile — prevents the map eating scroll events
    gestureHandling: 'cooperative',
    styles: [
      {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }]
      }
    ]
  };

  // Shared map markers renderer
  const renderMarkers = () => (
    <>
      <MarkerF
        position={userCoords}
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeWeight: 4,
          strokeColor: '#FFFFFF',
          scale: 8,
        }}
      />
      {displayedStores.map((store) => {
        const loc = store.location as { lat?: number; lng?: number; latitude?: number; longitude?: number } | undefined;
        const lat = loc?.lat ?? loc?.latitude;
        const lng = loc?.lng ?? loc?.longitude;
        if (lat == null || lng == null || Number(lat) === 0 || Number(lng) === 0) return null;
        const pos = { lat: Number(lat), lng: Number(lng) };
        const isSelected = store.id === activeStoreId;
        const pinUrl = makePinSvg(isSelected ? '#16A34A' : '#DC2626', isSelected);
        const pinSize = isSelected ? new google.maps.Size(36, 46) : new google.maps.Size(30, 38);
        const pinAnchor = isSelected ? new google.maps.Point(18, 46) : new google.maps.Point(15, 38);
        return (
          <MarkerF
            key={store.id}
            position={pos}
            title={store.name}
            icon={{ url: pinUrl, scaledSize: pinSize, anchor: pinAnchor }}
            onClick={() => { handleStoreClick(store.id); map?.panTo(pos); map?.setZoom(15); }}
          />
        );
      })}
    </>
  );

  return (
    <>

    {/* ── MOBILE LAYOUT ──────────────────────────────────────────────────────── */}
    <div className="md:hidden flex flex-col">

      {/* Map strip — scrolls away naturally as user scrolls down */}
      <div className="h-[45vw] min-h-[200px] max-h-[260px] relative bg-surface-container-high overflow-hidden">
        {isLoaded ? (
          <GoogleMap mapContainerStyle={mapContainerStyle} center={center} zoom={13}
            onLoad={(m) => { stripMapRef.current = m; setMap(m); }} onUnmount={onUnmount} options={mapOptions}>
            {renderMarkers()}
          </GoogleMap>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container-low">
            <div className="animate-spin w-7 h-7 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        )}
        {/* Compact map controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-10">
          <button type="button" onClick={() => map?.panTo(userCoords)}
            className="w-8 h-8 bg-white rounded-lg shadow-lg flex items-center justify-center text-primary border border-surface-container">
            <ICONS.MyPosition className="w-4 h-4" />
          </button>
          <div className="flex flex-col bg-white rounded-lg shadow-lg border border-surface-container overflow-hidden">
            <button type="button" onClick={() => map?.setZoom((map.getZoom() || 13) + 1)}
              className="w-8 h-8 flex items-center justify-center text-on-surface-variant border-b border-surface-container">
              <ICONS.Plus className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => map?.setZoom((map.getZoom() || 13) - 1)}
              className="w-8 h-8 flex items-center justify-center text-on-surface-variant">
              <ICONS.Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Sticky search + filter header */}
      <div className="sticky top-0 z-20 bg-white border-b border-surface-container px-3 pt-3 pb-2 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={onBack} className="p-1.5 hover:bg-surface-container-low rounded-full shrink-0">
            <ICONS.ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <h2 className="text-base font-bold text-on-surface flex-1">{t('nearbyStores')}</h2>
          <HelperTooltip side="bottom" textKey="storeLocateMe">
            <button onClick={handleLocateMe}
              className="flex items-center gap-1.5 text-[10px] font-bold text-primary bg-primary/8 px-2.5 py-1 rounded-full shrink-0">
              <ICONS.MyPosition className="w-3 h-3" /> {location.split(',')[0]}
            </button>
          </HelperTooltip>
        </div>
        <div data-tour="store-search"
          className="flex items-center bg-surface-container-low rounded-xl px-3 py-2 border border-outline-variant focus-within:border-primary transition-all mb-2">
          <ICONS.Search className="w-3.5 h-3.5 text-outline mr-2 shrink-0" />
          <input type="text" value={storeSearch} onChange={(e) => setStoreSearch(e.target.value)}
            placeholder={t('searchStoresPlaceholder')}
            className="bg-transparent border-none w-full focus:ring-0 text-sm text-on-surface placeholder:font-normal" />
          {storeSearch && (
            <button onClick={() => setStoreSearch('')} className="text-outline ml-1">
              <ICONS.Minus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-0.5">
          <button className="whitespace-nowrap px-4 py-1.5 rounded-full bg-primary text-white text-xs font-bold flex items-center gap-1.5 shrink-0">
            <ICONS.Check className="w-3.5 h-3.5" /> {t('openNow')}
          </button>
          <button className="whitespace-nowrap px-4 py-1.5 rounded-full border border-surface-container-highest text-on-surface text-xs font-bold shrink-0">
            {t('ureaInStock')}
          </button>
          <button className="whitespace-nowrap px-4 py-1.5 rounded-full border border-surface-container-highest text-on-surface text-xs font-bold shrink-0">
            {t('npkFertilizer')}
          </button>
        </div>
      </div>

      {/* Store count */}
      <div className="px-4 py-2 bg-surface-container-low">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          {displayedStores.length} {displayedStores.length !== 1 ? t('storesFound') : t('storeFound')}
        </p>
      </div>

      {/* Store list — scrolls naturally with page */}
      <div className="flex flex-col gap-3 px-3 py-3 bg-surface-container-lowest">
        {displayedStores.map((store, i) => {
          const addressLine = storeAddressToDisplayString(store.address);
          const isActive = store.id === activeStoreId;
          return (
            <div
              key={store.id}
              className={`rounded-2xl border-2 overflow-hidden transition-all ${
                isActive ? 'border-primary bg-white shadow-md' : 'border-surface-container bg-white shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3 p-3.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isActive ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface-variant'}`}>
                  <ICONS.Market className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0" onClick={() => handleStoreClick(store.id)}>
                  <p className={`font-bold text-sm truncate ${isActive ? 'text-primary' : 'text-on-surface'}`}>{store.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-on-surface-variant flex items-center gap-0.5">
                      <ICONS.Location className="w-2.5 h-2.5" /> {(store as any).distanceLabel || store.distance || t('nearby')}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${(store.status || '').includes('Open') ? 'bg-green-500' : 'bg-red-400'}`} />
                    <span className="text-[10px] text-on-surface-variant">{(store.status || '').split('•')[0].trim()}</span>
                  </div>
                  {(store.averageRating ?? 0) > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-amber-400 text-[10px] leading-none">{'★'.repeat(Math.round(store.averageRating!))}</span>
                      <span className="text-[10px] font-semibold text-on-surface-variant tabular-nums">
                        {store.averageRating!.toFixed(1)}{store.totalReviews ? ` · ${store.totalReviews} review${store.totalReviews !== 1 ? 's' : ''}` : ''}
                      </span>
                    </div>
                  )}
                </div>
                {/* MAP button — shows map overlay from top */}
                <button
                  onClick={() => { handleStoreClick(store.id, true); }}
                  className="shrink-0 flex items-center gap-1 bg-primary text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest"
                >
                  <ICONS.Directions className="w-3 h-3" /> MAP
                </button>
              </div>
              {addressLine && (
                <p className="px-3.5 pb-2 text-[11px] text-on-surface-variant font-medium -mt-1">{addressLine}</p>
              )}
              {/* Action buttons — mirror desktop: primary "Get Directions" + secondary "Details" (opens shared details modal) */}
              <div className="flex gap-2 px-3.5 pb-3">
                <button
                  onClick={(e) => { e.stopPropagation(); handleGetDirections(store); }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-white py-2 rounded-xl text-[11px] font-bold"
                >
                  <ICONS.Directions className="w-3 h-3" /> {t('getDirections')}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDetailStore(store); }}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-outline-variant text-on-surface py-2 rounded-xl text-[11px] font-bold"
                >
                  {t('detailsLabel')}
                </button>
              </div>
            </div>
          );
        })}
        {displayedStores.length === 0 && storeSearch && (
          <div className="p-8 text-center">
            <ICONS.Search className="w-8 h-8 text-outline mx-auto mb-3" />
            <p className="text-sm font-bold text-on-surface-variant">{t('noStoresMatch')} &ldquo;{storeSearch}&rdquo;</p>
          </div>
        )}
        <div className="h-6" />
      </div>
    </div>

    {/* Mobile Map Overlay — slides down from top when MAP button tapped */}
    <AnimatePresence>
      {mobileMapOverlay && (
        <motion.div
          initial={{ y: '-100%' }}
          animate={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed inset-0 z-[120] md:hidden flex flex-col bg-white"
        >
          {/* Map fills top portion */}
          <div className="flex-1 relative bg-surface-container-high">
            {isLoaded ? (
              <GoogleMap mapContainerStyle={mapContainerStyle} center={center} zoom={15}
                onLoad={(m) => setMap(m)} onUnmount={onOverlayUnmount} options={mapOptions}>
                {renderMarkers()}
              </GoogleMap>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            )}
            {/* Map controls */}
            <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
              <button type="button" onClick={() => map?.panTo(userCoords)}
                className="w-9 h-9 bg-white rounded-xl shadow-xl flex items-center justify-center text-primary border border-surface-container">
                <ICONS.MyPosition className="w-4 h-4" />
              </button>
              <div className="flex flex-col bg-white rounded-xl shadow-xl border border-surface-container overflow-hidden">
                <button type="button" onClick={() => map?.setZoom((map.getZoom() || 13) + 1)}
                  className="w-9 h-9 flex items-center justify-center text-on-surface-variant border-b border-surface-container">
                  <ICONS.Plus className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => map?.setZoom((map.getZoom() || 13) - 1)}
                  className="w-9 h-9 flex items-center justify-center text-on-surface-variant">
                  <ICONS.Minus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom drawer with selected store + back button */}
          {focusedStore && (
            <div className="bg-white border-t border-surface-container px-4 py-4 flex flex-col gap-3 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-on-surface text-base truncate">{focusedStore.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${(focusedStore.status || '').includes('Open') ? 'bg-green-500' : 'bg-red-400'}`} />
                    <span className="text-xs text-on-surface-variant">{(focusedStore.status || '').split('•')[0].trim()}</span>
                    <span className="text-xs text-on-surface-variant">·</span>
                    <span className="text-xs text-on-surface-variant flex items-center gap-0.5">
                      <ICONS.Location className="w-3 h-3" /> {(focusedStore as any).distanceLabel || focusedStore.distance || t('nearby')}
                    </span>
                  </div>
                  {storeAddressToDisplayString(focusedStore.address) && (
                    <p className="text-xs text-on-surface-variant mt-1">{storeAddressToDisplayString(focusedStore.address)}</p>
                  )}
                </div>
                <button
                  onClick={() => setMobileMapOverlay(false)}
                  className="shrink-0 flex items-center gap-1.5 bg-surface-container-low text-on-surface px-3 py-2 rounded-xl text-xs font-bold border border-surface-container"
                >
                  <ICONS.ChevronRight className="w-3.5 h-3.5 rotate-[270deg]" /> Back to list
                </button>
              </div>
              <button
                onClick={() => handleGetDirections(focusedStore)}
                className="w-full bg-primary text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                <ICONS.Directions className="w-4 h-4" /> {t('getDirections')}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── DESKTOP LAYOUT ─────────────────────────────────────────────────────── */}
    <div className="hidden md:flex flex-row h-[calc(100vh-64px)] overflow-hidden">

      {/* Sidebar */}
      <div className="w-[400px] bg-white border-r border-surface-container flex flex-col z-20 shadow-xl overflow-hidden shrink-0">
        <div className="p-6 border-b border-surface-container shrink-0">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-2xl font-bold text-on-surface">{t('nearbyStores')}</h2>
          </div>

          {/* Location label */}
          <div className="flex items-center gap-2 mb-2 md:mb-3">
            <HelperTooltip side="bottom" textKey="storeLocateMe">
              <button
                onClick={handleLocateMe}
                className="flex items-center gap-2 text-xs font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
              >
                <ICONS.MyPosition className="w-3.5 h-3.5" />
                {location}
              </button>
            </HelperTooltip>
          </div>

          {/* Location search (geocode on Enter) */}
          <div className="flex items-center bg-surface-container-low rounded-2xl px-3 py-2 md:px-4 md:py-3 mb-2 md:mb-3 border border-outline-variant group focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
            <ICONS.Location className="w-4 h-4 text-outline mr-3 shrink-0" />
            <input
              type="text"
              value={location}
              onChange={handleLocationChange}
              onKeyDown={handleLocationSubmit}
              placeholder={t('enterLocation')}
              className="bg-transparent border-none w-full focus:ring-0 text-sm text-on-surface font-semibold placeholder:font-normal"
            />
          </div>

          {/* Store name / area search */}
          <div
            data-tour="store-search"
            className="flex items-center bg-surface-container-low rounded-2xl px-3 py-2 md:px-4 md:py-3 mb-2 md:mb-4 border border-outline-variant group focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all"
          >
            <ICONS.Search className="w-4 h-4 text-outline mr-3 group-focus-within:text-primary transition-colors shrink-0" />
            <input
              type="text"
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
              placeholder={t('searchStoresPlaceholder')}
              className="bg-transparent border-none w-full focus:ring-0 text-sm text-on-surface font-semibold placeholder:font-normal"
            />
            {storeSearch ? (
              <button
                type="button"
                onClick={() => setStoreSearch('')}
                className="text-outline hover:text-on-surface transition-colors ml-2 shrink-0"
                aria-label="Clear store search"
              >
                <ICONS.Minus className="w-4 h-4" />
              </button>
            ) : (
              <HelperIcon
                size="xs"
                variant="ghost"
                side="bottom"
                textKey="storeSearch"
                ariaLabel="Store search help"
              />
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-4 hide-scrollbar">
            <HelperTooltip
              side="bottom"
              textKey="storeOpenNow"
            >
              <button className="whitespace-nowrap px-5 py-2 rounded-full bg-primary text-white text-xs font-bold shadow-lg shadow-primary/20 flex items-center gap-2">
                <ICONS.Check className="w-4 h-4" /> {t('openNow')}
              </button>
            </HelperTooltip>
            <button className="whitespace-nowrap px-5 py-2 rounded-full border border-surface-container-highest text-on-surface text-xs font-bold hover:bg-surface-container-low">
              {t('ureaInStock')}
            </button>
            <button className="whitespace-nowrap px-5 py-2 rounded-full border border-surface-container-highest text-on-surface text-xs font-bold hover:bg-surface-container-low">
              {t('npkFertilizer')}
            </button>
          </div>

          {/* Stores count */}
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            {displayedStores.length} {displayedStores.length !== 1 ? t('storesFound') : t('storeFound')}
          </p>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-surface-container-lowest">
          {displayedStores.map((store, i) => {
            const addressLine = storeAddressToDisplayString(store.address);
            return (
            <motion.div
              key={store.id}
              ref={(el) => {
                if (el) cardRefs.current.set(store.id, el);
                else cardRefs.current.delete(store.id);
              }}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.07 }}
              onClick={() => handleStoreClick(store.id)}
              className={`p-5 rounded-3xl border-2 transition-all cursor-pointer group hover:scale-[1.02] ${
                store.id === activeStoreId
                  ? 'border-primary bg-primary/10 shadow-lg scale-[1.03]'
                  : store.isHot
                  ? 'border-primary/40 bg-primary/5 shadow-sm'
                  : 'border-surface-container bg-white hover:border-outline-variant shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className={`text-xl font-bold ${store.id === activeStoreId || store.isHot ? 'text-primary' : 'text-on-surface'}`}>
                    {store.name}
                  </h3>
                  <div onClick={(e) => e.stopPropagation()} className="mt-1 self-start">
                    <HelperTooltip side="bottom" textKey="storeDistance">
                      <p className="flex items-center gap-1 text-xs font-bold text-on-surface-variant cursor-help">
                        <ICONS.Location className="w-3 h-3" /> {store.distanceLabel || store.distance || t('nearby')}
                      </p>
                    </HelperTooltip>
                  </div>
                </div>
                {(store.id === activeStoreId || store.isHot) && (
                  store.id === activeStoreId ? (
                    <span className="bg-primary text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                      {t('selected')}
                    </span>
                  ) : (
                    <HelperTooltip
                      side="left"
                      textKey="storeClosest"
                    >
                      <span
                        className="bg-primary text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full cursor-help"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t('closest')}
                      </span>
                    </HelperTooltip>
                  )
                )}
              </div>

              <div className="mb-6 space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${store.status?.includes('Open') ? 'bg-green-500' : 'bg-error'}`} />
                  <span className="text-xs font-bold text-on-surface-variant">{store.status || t('active')}</span>
                </div>
                {addressLine ? (
                  <p className="text-[11px] text-on-surface-variant font-medium truncate">{addressLine}</p>
                ) : null}
                {store.stock && store.stock.length > 0 ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <HelperTooltip side="top" textKey="storeInventory">
                      <div className="flex flex-wrap gap-2 cursor-help">
                        {store.stock.map((item: string) => (
                          <span key={item} className="px-2 py-0.5 rounded-lg bg-surface-container-high text-on-surface-variant text-[9px] font-black uppercase tracking-widest border border-surface-container-highest">
                            {item}
                          </span>
                        ))}
                      </div>
                    </HelperTooltip>
                  </div>
                ) : null}
              </div>

              <div className={`flex gap-2 transition-all duration-300 ${store.id === activeStoreId ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0 group-hover:opacity-100 group-hover:translate-y-0'}`}>
                <div onClick={(e) => e.stopPropagation()} className="flex-1">
                  <HelperTooltip side="top" textKey="storeDirections">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGetDirections(store); }}
                      className="w-full bg-primary text-white py-2.5 rounded-xl text-xs font-bold hover:scale-[1.02] active:scale-95 transition-transform flex items-center justify-center gap-2"
                    >
                      <ICONS.Directions className="w-4 h-4" /> {t('getDirections')}
                    </button>
                  </HelperTooltip>
                </div>
                <div onClick={(e) => e.stopPropagation()} className="flex-1">
                  <HelperTooltip side="top" textKey="storeDetails">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailStore(store); }}
                      className="w-full border border-outline-variant text-on-surface py-2.5 rounded-xl text-xs font-bold hover:bg-white transition-colors"
                    >
                      {t('detailsLabel')}
                    </button>
                  </HelperTooltip>
                </div>
              </div>
            </motion.div>
            );
          })}

          {displayedStores.length === 0 && storeSearch && (
            <div className="p-8 text-center">
              <ICONS.Search className="w-8 h-8 text-outline mx-auto mb-3" />
              <p className="text-sm font-bold text-on-surface-variant">{t('noStoresMatch')} &ldquo;{storeSearch}&rdquo;</p>
              <p className="text-xs text-outline mt-1">{t('tryDifferentSearch')}</p>
            </div>
          )}

          <div className="h-20" />
        </div>
      </div>

      {/* Map panel */}
      <div className="flex-1 relative bg-surface-container-high">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={13}
            onLoad={(m) => { stripMapRef.current = m; setMap(m); }}
            onUnmount={onUnmount}
            options={mapOptions}
          >
            {renderMarkers()}
          </GoogleMap>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container-low">
            <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        )}
        {/* Zoom controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
          <button
            type="button"
            onClick={() => map?.panTo(userCoords)}
            className="w-10 h-10 bg-white rounded-xl shadow-xl flex items-center justify-center text-primary border border-surface-container hover:bg-surface-container-low transition-colors"
          >
            <ICONS.MyPosition className="w-4 h-4" />
          </button>
          <div className="flex flex-col bg-white rounded-xl shadow-xl border border-surface-container overflow-hidden">
            <button
              type="button"
              onClick={() => map?.setZoom((map.getZoom() || 13) + 1)}
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant border-b border-surface-container hover:bg-surface-container-low transition-colors"
            >
              <ICONS.Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => map?.setZoom((map.getZoom() || 13) - 1)}
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors"
            >
              <ICONS.Minus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

    </div>

    {/* Store Details Modal */}
    <AnimatePresence>
      {detailStore && (
        <div
          className="fixed inset-0 z-[120] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-4 pb-20 md:pb-4"
          onClick={() => setDetailStore(null)}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[calc(100vh-7rem)] md:max-h-[85vh] overflow-y-auto overscroll-contain"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-2xl font-bold text-on-surface">{detailStore.name || detailStore.shopName}</h2>
                  {detailStore.ownerName && (
                    <p className="text-sm text-on-surface-variant mt-1">{t('owner')}: {detailStore.ownerName}</p>
                  )}
                  {(detailStore.averageRating ?? 0) > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-amber-400 text-sm leading-none">{'★'.repeat(Math.round(detailStore.averageRating))}</span>
                      <span className="text-sm font-bold text-on-surface tabular-nums">{detailStore.averageRating.toFixed(1)}</span>
                      {detailStore.totalReviews > 0 && (
                        <span className="text-xs text-on-surface-variant">({detailStore.totalReviews} review{detailStore.totalReviews !== 1 ? 's' : ''})</span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setDetailStore(null)}
                  className="p-2 hover:bg-surface-container-low rounded-full transition-colors ml-2 shrink-0"
                >
                  <svg className="w-5 h-5 text-on-surface-variant" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="space-y-4">
                {detailStore.address && (
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <ICONS.Location className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-0.5">{t('address')}</p>
                      <p className="text-sm text-on-surface font-semibold">{storeAddressToDisplayString(detailStore.address)}</p>
                      {(detailStore.city || detailStore.state) && (
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {[detailStore.city, detailStore.state, detailStore.pincode].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {detailStore.phone && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-green-50 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.04 6.04l1.86-1.86a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-0.5">{t('phoneLabel')}</p>
                      <a href={`tel:${detailStore.phone}`} className="text-sm font-semibold text-green-600 hover:underline">{detailStore.phone}</a>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-surface-container-low flex items-center justify-center shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${(detailStore.status || '').includes('Open') ? 'bg-green-500' : 'bg-amber-500'}`} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-0.5">{t('status')}</p>
                    <p className="text-sm font-semibold text-on-surface">{detailStore.status || t('active')}</p>
                  </div>
                </div>

                {(detailStore.stock || []).length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">{t('productsInStock')}</p>
                    <div className="flex flex-wrap gap-2">
                      {(detailStore.stock || []).map((item: string) => (
                        <span key={item} className="px-3 py-1 rounded-xl bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <HelperTooltip side="top" textKey="storeDirections">
                  <button
                    onClick={() => handleGetDirections(detailStore)}
                    className="flex-1 bg-primary text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
                  >
                    <ICONS.Directions className="w-4 h-4" /> {t('getDirections')}
                  </button>
                </HelperTooltip>
                {detailStore.phone && (
                  <HelperTooltip side="top" textKey="storeCallAction">
                    <a
                      href={`tel:${detailStore.phone}`}
                      className="flex-1 border border-outline-variant text-on-surface py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-surface-container transition-colors"
                    >
                      {t('callStore')}
                    </a>
                  </HelperTooltip>
                )}
              </div>

              {/* Store Reviews */}
              {detailStore.phone && (
                <div className="mt-2">
                  <ReviewSection targetId={detailStore.phone} targetType="store" />
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
}
