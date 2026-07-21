'use client';

import { useEffect, useState } from 'react';
import type { LatLng } from '@/utils/haversine';
import { getCurrentPosition } from '@/utils/geolocation';

// Requests the browser's geolocation once on mount — same one-shot,
// silent-on-denial behavior as the original (index (1).html init()).
// Consumed by ListingsExplorer for "Nearest First" sort and by MapView for
// centering; both were previously reading directly from the module-global
// S.userLat/userLng.
export function useUserLocation(): LatLng | null {
  const [location, setLocation] = useState<LatLng | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentPosition().then((coords) => {
      if (!cancelled) setLocation(coords);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return location;
}
