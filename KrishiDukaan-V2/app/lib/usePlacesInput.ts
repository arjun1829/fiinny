"use client";

import { useEffect, useRef } from "react";

export type PlaceResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

// True only when Autocomplete is a callable constructor — google.maps.places
// is created as an empty namespace object before the library populates its
// classes, so checking the namespace alone fires too early.
function placesReady(): boolean {
  return typeof (window as any).google?.maps?.places?.Autocomplete === "function";
}

// Module-level promise so concurrent callers share a single load attempt
// rather than each kicking off their own.
let _loadPromise: Promise<void> | null = null;

async function ensurePlacesLoaded(): Promise<void> {
  if (placesReady()) return;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const g = (window as any).google;

    if (g?.maps?.importLibrary) {
      // ── Primary path ───────────────────────────────────────────────────────
      // The Maps JS SDK (loaded by @react-google-maps/api or any other
      // bootstrapper) is already on the page.  importLibrary is the official
      // way to load an additional library without injecting a second <script>
      // tag — available in Maps JS API v3.52+ (2023).
      await g.maps.importLibrary("places");
      return;
    }

    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      // ── Fallback A ─────────────────────────────────────────────────────────
      // A Maps script is present but pre-dates importLibrary.  Poll until
      // Autocomplete appears (e.g. the script was loaded with &libraries=places
      // by something else).
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (placesReady()) { clearInterval(timer); resolve(); }
        }, 100);
      });
      return;
    }

    // ── Fallback B ────────────────────────────────────────────────────────────
    // No Maps SDK on the page at all — inject one with places included.
    // This path runs only when usePlacesInput is used in complete isolation,
    // without @react-google-maps/api managing the SDK load.
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.id = "gm-places-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  })().catch((err) => {
    // Allow a retry on the next call.
    _loadPromise = null;
    throw err;
  });

  return _loadPromise;
}

export function usePlacesInput(
  inputRef: React.RefObject<HTMLInputElement | null>,
  onPlace: (result: PlaceResult) => void
) {
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  useEffect(() => {
    let cancelled = false;

    ensurePlacesLoaded()
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const g = (window as any).google;
        if (!g?.maps?.places?.Autocomplete) return;

        const ac = new g.maps.places.Autocomplete(inputRef.current, {
          types: ["establishment", "geocode"],
          componentRestrictions: { country: "in" },
          fields: ["formatted_address", "geometry", "name"],
        });

        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.geometry?.location) return;
          onPlaceRef.current({
            name: place.name || "",
            address: place.formatted_address || "",
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
        });
      })
      .catch(() => {
        // Places failed to load — autocomplete silently unavailable,
        // geocode-on-Enter fallback in the component still works.
      });

    return () => { cancelled = true; };
  }, [inputRef]);
}
