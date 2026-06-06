"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoPoint } from "firebase/firestore";
import { Loader2, LocateFixed, MapPin, Save, X } from "lucide-react";
import { useI18n } from "../../../i18n/I18nContext";
import type { ManufacturerRetailerRow } from "../../_types/manufacturer-retailers";
import { updateNetworkRetailer } from "../../_lib/manufacturer-retailers-firestore";
import { parseGoogleMapsUrl } from "./add-retailer-form";

declare global {
  interface Window { google?: any; }
}

function extractAddressFields(place: {
  formatted_address?: string;
  address_components?: { long_name: string; short_name: string; types: string[] }[];
}): Partial<{ line1: string; city: string; state: string; pincode: string }> {
  const fields: Partial<{ line1: string; city: string; state: string; pincode: string }> = {};
  const parts = place?.address_components ?? [];
  const cityPriority = ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_2", "neighborhood"];
  for (const want of cityPriority) {
    for (const part of parts) {
      if (part.types?.includes(want) && part.long_name) { fields.city = part.long_name; break; }
    }
    if (fields.city) break;
  }
  for (const part of parts) {
    if (part.types?.includes("administrative_area_level_1")) fields.state = part.long_name;
    if (part.types?.includes("postal_code")) fields.pincode = part.long_name;
  }
  if (place?.formatted_address) fields.line1 = place.formatted_address;
  return fields;
}

export function EditRetailerModal({ row, onClose, onSaved }: {
  row: ManufacturerRetailerRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [shopName,  setShopName]  = useState(row.shopName);
  const [ownerName, setOwnerName] = useState(row.ownerName);
  const [phone,     setPhone]     = useState(row.retailerPhone);
  const [email,     setEmail]     = useState(row.retailerEmail);

  const [line1,    setLine1]    = useState(row.address?.line1    ?? "");
  const [city,     setCity]     = useState(row.address?.city     ?? "");
  const [state,    setState]    = useState(row.address?.state    ?? "");
  const [pincode,  setPincode]  = useState(row.address?.pincode  ?? "");
  const [geo,      setGeo]      = useState<GeoPoint | null>(
    row.geo ? new GeoPoint(row.geo.latitude, row.geo.longitude) : null,
  );

  const [saving,   setSaving]   = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const addressInputRef         = useRef<HTMLInputElement | null>(null);
  const autocompleteListenerRef = useRef<unknown>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const applyPlaceGeometry = useCallback(
    (place: { geometry?: { location?: { lat: () => number; lng: () => number } } }) => {
      const lat = place?.geometry?.location?.lat?.();
      const lng = place?.geometry?.location?.lng?.();
      if (typeof lat === "number" && typeof lng === "number") setGeo(new GeoPoint(lat, lng));
    },
    [],
  );

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) { setMapsError("Google Maps key not configured."); return; }

    const setupAutocomplete = () => {
      if (!addressInputRef.current || !window.google?.maps?.places) return;
      if (autocompleteListenerRef.current && window.google?.maps?.event) {
        window.google.maps.event.removeListener(autocompleteListenerRef.current);
      }
      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["name", "formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });
      autocompleteListenerRef.current = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place) return;
        if (place.name) setShopName(place.name);
        if (place.address_components?.length) {
          const f = extractAddressFields(place as Parameters<typeof extractAddressFields>[0]);
          if (f.line1)   setLine1(f.line1);
          if (f.city)    setCity(f.city);
          if (f.state)   setState(f.state);
          if (f.pincode) setPincode(f.pincode);
        }
        applyPlaceGeometry(place);
      });
    };

    const scriptId = "google-maps-places-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const runWhenReady = () => requestAnimationFrame(() => setupAutocomplete());

    if (window.google?.maps?.places) {
      runWhenReady();
    } else if (existing) {
      if (existing.dataset.loaded === "true") runWhenReady();
      else existing.addEventListener("load", runWhenReady, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => { script.dataset.loaded = "true"; runWhenReady(); };
      script.onerror = () => setMapsError("Unable to load Google Maps.");
      document.head.appendChild(script);
    }

    return () => {
      if (autocompleteListenerRef.current && window.google?.maps?.event) {
        window.google.maps.event.removeListener(autocompleteListenerRef.current);
      }
      autocompleteListenerRef.current = null;
    };
  }, [applyPlaceGeometry]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) { setError("Geolocation not supported."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGeo(new GeoPoint(lat, lng));
        if (window.google?.maps?.Geocoder) {
          new window.google.maps.Geocoder().geocode(
            { location: { lat, lng } },
            (results: any, status: string) => {
              if (status === "OK" && results?.[0]) {
                const f = extractAddressFields(results[0] as Parameters<typeof extractAddressFields>[0]);
                if (f.line1)   setLine1(f.line1);
                if (f.city)    setCity(f.city);
                if (f.state)   setState(f.state);
                if (f.pincode) setPincode(f.pincode);
              }
            },
          );
        }
        setLocating(false);
      },
      (err) => { setLocating(false); setError(err.message || "Unable to access location."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const mapUrl = useMemo(() => {
    if (!geo) return "";
    return `https://maps.google.com/maps?q=${geo.latitude},${geo.longitude}&z=15&output=embed`;
  }, [geo]);

  const handleSave = async () => {
    if (!shopName.trim() || !ownerName.trim()) {
      setError("Shop name and owner name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateNetworkRetailer(row.id, row.retailerDocId, {
        shopName,
        ownerName,
        phone,
        email,
        address: { line1, city, state, pincode },
        geo,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-full";
  const labelCls = "flex flex-col gap-1.5 text-sm";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl sm:rounded-l-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-bold text-on-surface">{t('rnEditRetailer')}</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">{row.shopName}</p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>
          )}

          {/* ── Basic info ── */}
          <section className="flex flex-col gap-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{t('rnBasicInfo')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                <span className="font-medium text-on-surface">{t('rnShopNameLabel')} <span className="text-red-500">*</span></span>
                <input type="text" value={shopName} onChange={(e) => setShopName(e.target.value)} className={inputCls} />
              </label>
              <label className={labelCls}>
                <span className="font-medium text-on-surface">{t('rnOwnerNameLabel')} <span className="text-red-500">*</span></span>
                <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                <span className="font-medium text-on-surface">{t('rnPhoneLabel')}</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </label>
              <label className={labelCls}>
                <span className="font-medium text-on-surface">{t('rnEmailLabel')}</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </label>
            </div>
          </section>

          {/* ── Location ── */}
          <section className="flex flex-col gap-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{t('rnLocationSection')}</h3>

            {/* Google Maps search autocomplete */}
            <label className={labelCls}>
              <span className="font-medium text-on-surface">
                {t('rnSearchGoogleMaps')}
                <span className="ml-1 font-normal text-on-surface-variant">{t('rnAutoFillsAddress')}</span>
              </span>
              <input
                ref={addressInputRef}
                type="text"
                defaultValue={line1}
                placeholder={t('rnAddressPlaceholder')}
                autoComplete="off"
                className={inputCls}
              />
            </label>

            {/* Address fields */}
            <label className={labelCls}>
              <span className="font-medium text-on-surface">{t('rnAddressLine1')}</span>
              <input type="text" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder={t('rnStreetLocality')} className={inputCls} />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className={labelCls}>
                <span className="font-medium text-on-surface">{t('rnCityLabel')}</span>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('rnCityLabel')} className={inputCls} />
              </label>
              <label className={labelCls}>
                <span className="font-medium text-on-surface">{t('rnStateLabel')}</span>
                <input type="text" value={state} onChange={(e) => setState(e.target.value)} placeholder={t('rnStateLabel')} className={inputCls} />
              </label>
              <label className={labelCls}>
                <span className="font-medium text-on-surface">{t('rnPincodeLabel')}</span>
                <input type="text" value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="PIN" className={inputCls} />
              </label>
            </div>

            {/* Location helpers */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locating}
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60"
              >
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                {t('rnUseCurrentLocation')}
              </button>
              {mapsError ? <p className="text-xs text-harvest">{mapsError}</p> : null}
            </div>

            {/* Paste Maps link */}
            <label className={labelCls}>
              <span className="font-medium text-on-surface">
                {t('rnPasteGoogleMaps')}
                <span className="ml-1 font-normal text-on-surface-variant">{t('rnPinsLocation')}</span>
              </span>
              <input
                type="url"
                placeholder="https://maps.google.com/maps?q=18.52,73.85"
                className={inputCls}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  const coords = parseGoogleMapsUrl(text);
                  if (coords) {
                    e.preventDefault();
                    setGeo(new GeoPoint(coords.lat, coords.lng));
                    (e.target as HTMLInputElement).value = text;
                  }
                }}
                onChange={(e) => {
                  const coords = parseGoogleMapsUrl(e.target.value);
                  if (coords) setGeo(new GeoPoint(coords.lat, coords.lng));
                }}
              />
            </label>

            {/* Map preview */}
            {geo ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <MapPin className="h-3.5 w-3.5" />
                  {t('rnLocationPinned')} · {geo.latitude.toFixed(5)}, {geo.longitude.toFixed(5)}
                </div>
                <div className="overflow-hidden rounded-xl border border-outline-variant/30">
                  <iframe
                    title="Location preview"
                    src={mapUrl}
                    className="h-44 w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            ) : null}
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-outline-variant/30 px-5 py-4 shrink-0">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors">
            {t('cancelBtn')}
          </button>
          <button type="button" disabled={saving} onClick={handleSave}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50 transition-all">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? t('formSavingLabel') : t('rnSaveChanges')}
          </button>
        </div>
      </div>
    </>
  );
}
