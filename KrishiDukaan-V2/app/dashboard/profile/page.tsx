"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoPoint } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, LocateFixed, MapPin, Save } from "lucide-react";
import { auth } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import {
  fetchDashboardUserRole,
  loadProfileState,
  saveManufacturerProfile,
  saveRetailerProfile,
  type DashboardProfileRole,
  type ProfileFormValues,
  type RetailerProfileExtras,
} from "../_lib/profile-persistence";

declare global {
  interface Window {
    google?: any;
  }
}

const initialForm: ProfileFormValues = {
  businessName: "",
  ownerName: "",
  phone: "",
  email: "",
  line1: "",
  city: "",
  state: "",
  pincode: "",
};

/** Parse Google Places `address_components` into line1 / city / state / pincode. */
function extractAddressFields(place: {
  formatted_address?: string;
  address_components?: { long_name: string; short_name: string; types: string[] }[];
}): Partial<ProfileFormValues> {
  const fields: Partial<ProfileFormValues> = {};
  const parts = place?.address_components || [];

  const cityTypePriority = [
    "locality",
    "postal_town",
    "sublocality_level_1",
    "administrative_area_level_2",
    "neighborhood",
  ];
  for (const want of cityTypePriority) {
    for (const part of parts) {
      if (part.types?.includes(want) && part.long_name) {
        fields.city = part.long_name;
        break;
      }
    }
    if (fields.city) break;
  }

  for (const part of parts) {
    const types = part.types || [];
    if (types.includes("administrative_area_level_1")) fields.state = part.long_name;
    if (types.includes("postal_code")) fields.pincode = part.long_name;
  }

  if (place?.formatted_address) {
    fields.line1 = place.formatted_address;
  }

  return fields;
}

export default function ProfilePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<DashboardProfileRole | null>(null);
  const [form, setForm] = useState<ProfileFormValues>(initialForm);
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [retailerExtras, setRetailerExtras] = useState<RetailerProfileExtras | null>(null);
  const [manufacturerCreatedAt, setManufacturerCreatedAt] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteListenerRef = useRef<unknown>(null);

  const applyPlaceGeometry = useCallback((place: { geometry?: { location?: { lat: () => number; lng: () => number } } }) => {
    const lat = place?.geometry?.location?.lat?.();
    const lng = place?.geometry?.location?.lng?.();
    if (typeof lat === "number" && typeof lng === "number") {
      setGeo(new GeoPoint(lat, lng));
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUid(null);
        setUserRole(null);
        setLoading(false);
        return;
      }

      setUid(user.uid);
      setLoading(true);
      setStatus(null);

      try {
        const role = await fetchDashboardUserRole(user.uid);
        setUserRole(role);

        if (!role) {
          setStatus({
            type: "error",
            message: "Profile is only available for retailer or manufacturer accounts.",
          });
          setForm((prev) => ({ ...prev, email: user.email || prev.email }));
          setGeo(null);
          setRetailerExtras(null);
          setManufacturerCreatedAt(null);
          return;
        }

        const loaded = await loadProfileState(user.uid, role, user.email);
        setForm(loaded.form);
        setGeo(loaded.geo);
        setRetailerExtras(loaded.retailerExtras);
        setManufacturerCreatedAt(loaded.manufacturerCreatedAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load profile.";
        setStatus({ type: "error", message });
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (loading || !uid || !userRole) return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setMapsError("Google Maps key not configured. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.");
      return;
    }

    const setupAutocomplete = () => {
      if (!addressInputRef.current || !window.google?.maps?.places) return;

      if (autocompleteListenerRef.current && window.google?.maps?.event) {
        window.google.maps.event.removeListener(autocompleteListenerRef.current);
      }
      autocompleteListenerRef.current = null;

      // Include establishment type so users can search their own business by name.
      // place.name auto-fills businessName; address_components fill address fields.
      const autocomplete = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["name", "formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });

      const listener = autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place) return;
        if (place.name) {
          setForm((prev) => ({ ...prev, businessName: place.name }));
        }
        if (place.address_components?.length) {
          const nextFields = extractAddressFields(place as Parameters<typeof extractAddressFields>[0]);
          setForm((prev) => ({ ...prev, ...nextFields }));
        }
        applyPlaceGeometry(place);
      });

      autocompleteListenerRef.current = listener;
    };

    const scriptId = "google-maps-places-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

    const runWhenReady = () => {
      requestAnimationFrame(() => setupAutocomplete());
    };

    if (window.google?.maps?.places) {
      runWhenReady();
    } else if (existing) {
      if (existing.dataset.loaded === "true") {
        runWhenReady();
      } else {
        existing.addEventListener("load", runWhenReady, { once: true });
      }
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        runWhenReady();
      };
      script.onerror = () => setMapsError("Unable to load Google Maps Places.");
      document.head.appendChild(script);
    }

    return () => {
      if (autocompleteListenerRef.current && window.google?.maps?.event) {
        window.google.maps.event.removeListener(autocompleteListenerRef.current);
      }
      autocompleteListenerRef.current = null;
    };
  }, [loading, uid, userRole, applyPlaceGeometry]);

  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setStatus({ type: "error", message: "Geolocation is not supported in this browser." });
      return;
    }

    setLocating(true);
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setGeo(new GeoPoint(lat, lng));

        if (window.google?.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results, geoStatus) => {
            if (geoStatus === "OK" && results?.[0]) {
              const parsed = extractAddressFields(results[0] as Parameters<typeof extractAddressFields>[0]);
              setForm((prev) => ({ ...prev, ...parsed }));
            }
          });
        }
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setStatus({ type: "error", message: error.message || "Unable to access current location." });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const mapUrl = useMemo(() => {
    if (!geo) return "";
    return `https://maps.google.com/maps?q=${geo.latitude},${geo.longitude}&z=15&output=embed`;
  }, [geo]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uid || !userRole) {
      setStatus({ type: "error", message: "Please sign in to save your profile." });
      return;
    }
    if (!geo) {
      setStatus({
        type: "error",
        message: "Please select an address from autocomplete or use current location.",
      });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      if (userRole === "manufacturer") {
        await saveManufacturerProfile(uid, form, geo, manufacturerCreatedAt);
        setStatus({ type: "success", message: "Profile saved successfully." });
      } else {
        const extras = retailerExtras ?? {
          createdAt: null,
          onboardingType: null,
          manufacturerId: null,
          active: true,
          subscriptionStatus: "free",
        };
        await saveRetailerProfile(uid, form, geo, extras);
        setStatus({ type: "success", message: "Profile saved successfully." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save profile.";
      setStatus({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  const pageDescription =
    userRole === "manufacturer"
      ? "Manage your business profile, address, and mapped location."
      : userRole === "retailer"
        ? "Manage your shop profile, address, and mapped location."
        : "Manage your profile, address, and mapped location.";

  return (
    <>
      <PageHeader title="Profile" description={pageDescription} helperKey="dashProfile" />

      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading profile…
          </div>
        ) : !uid ? (
          <p className="text-sm text-red-600">You must be signed in to access this page.</p>
        ) : !userRole ? (
          <p className="text-sm text-on-surface-variant">
            This page is available for retailer and manufacturer accounts only.
          </p>
        ) : (
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSave}>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">Business name</span>
              <input
                required
                value={form.businessName}
                onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
                placeholder={userRole === "retailer" ? "Shop or business name" : "Registered business name"}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">Owner name</span>
              <input
                required
                value={form.ownerName}
                onChange={(e) => setForm((p) => ({ ...p, ownerName: e.target.value }))}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
                placeholder="Owner or primary contact"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">Phone</span>
              <input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
                placeholder="+91…"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">Email</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
                placeholder="email@example.com"
              />
            </label>

            <label className="md:col-span-2 flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">
                Search business on Google Maps
                <span className="ml-1 font-normal text-on-surface-variant">
                  — auto-fills name & address
                </span>
              </span>
              <input
                ref={addressInputRef}
                required
                value={form.line1}
                onChange={(e) => setForm((p) => ({ ...p, line1: e.target.value }))}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
                placeholder="Type your business name or address to search Google Maps"
                autoComplete="off"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">City</span>
              <input
                required
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
                placeholder="City"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">State</span>
              <input
                required
                value={form.state}
                onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
                placeholder="State"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-on-surface">Pincode</span>
              <input
                required
                value={form.pincode}
                onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2"
                placeholder="PIN or postal code"
              />
            </label>

            <div className="md:col-span-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locating}
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-70"
              >
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                Use current location
              </button>
              {mapsError ? <p className="text-xs text-harvest">{mapsError}</p> : null}
            </div>

            {geo ? (
              <div className="md:col-span-2 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <MapPin className="h-3.5 w-3.5" />
                  Location selected
                </div>
                <div className="overflow-hidden rounded-xl border border-outline-variant/30">
                  <iframe
                    title="Selected location preview"
                    src={mapUrl}
                    className="h-52 w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            ) : null}

            <div className="md:col-span-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-70"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>
        )}
      </section>

      {status ? (
        <div
          className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
            status.type === "success"
              ? "border border-primary/30 bg-primary/10 text-primary"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {status.message}
        </div>
      ) : null}
    </>
  );
}
