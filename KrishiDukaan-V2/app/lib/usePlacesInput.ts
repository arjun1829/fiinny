"use client";

import { useEffect, useRef } from "react";

export type PlaceResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

let placesLoading = false;
let placesLoaded = false;
const placesCallbacks: (() => void)[] = [];

function ensurePlacesLoaded(cb: () => void) {
  if (placesLoaded && (window as any).google?.maps?.places) { cb(); return; }
  placesCallbacks.push(cb);
  if (placesLoading) return;
  placesLoading = true;

  const SCRIPT_ID = "gm-places-script";
  if (document.getElementById(SCRIPT_ID)) {
    const interval = setInterval(() => {
      if ((window as any).google?.maps?.places) {
        clearInterval(interval);
        placesLoaded = true;
        placesCallbacks.splice(0).forEach(fn => fn());
      }
    }, 100);
    return;
  }

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    placesLoaded = true;
    placesLoading = false;
    placesCallbacks.splice(0).forEach(fn => fn());
  };
  document.head.appendChild(script);
}

export function usePlacesInput(
  inputRef: React.RefObject<HTMLInputElement | null>,
  onPlace: (result: PlaceResult) => void
) {
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  useEffect(() => {
    ensurePlacesLoaded(() => {
      if (!inputRef.current) return;
      const g = (window as any).google;
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
    });
  }, [inputRef]);
}
