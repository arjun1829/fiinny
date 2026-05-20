"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoPoint } from "firebase/firestore";
import { Link2, Loader2, LocateFixed, MapPin, Search, UserPlus, X } from "lucide-react";
import {
  createNetworkRetailer,
  linkExistingRetailerToNetwork,
  type NetworkRetailerAddress,
} from "../../_lib/manufacturer-retailers-firestore";
import { fetchAllUsers, fetchAllRetailers, fetchStores } from "../../../firebase";

declare global {
  interface Window {
    google?: any;
  }
}

type AddRetailerModalProps = {
  manufacturerId: string;
  manufacturerName: string;
  /** totalSeats - non-revoked row count. Negative means no subscription. */
  seatsRemaining: number;
  onRetailerAdded: (payload: {
    inviteCode: string;
    shopName: string;
    retailerEmail: string;
    retailerPhone: string;
  }) => Promise<void>;
  onClose: () => void;
};

const emptyAddress: NetworkRetailerAddress = {
  line1: "",
  city: "",
  state: "",
  pincode: "",
};

/**
 * Parse lat/lng from common Google Maps URL formats:
 * - https://maps.google.com/?q=18.52,73.85
 * - https://www.google.com/maps/@18.52,73.85,15z
 * - https://www.google.com/maps/place/Name/@18.52,73.85,15z
 * - https://maps.google.com/maps?q=18.52,73.85
 */
export function parseGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  try {
    const u = new URL(url);
    // ?q=lat,lng
    const q = u.searchParams.get("q");
    if (q) {
      const m = q.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
      if (m) return { lat: parseFloat(m[1]!), lng: parseFloat(m[2]!) };
    }
    // /@lat,lng,zoom or /@lat,lng,15z
    const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) return { lat: parseFloat(atMatch[1]!), lng: parseFloat(atMatch[2]!) };
  } catch { /* invalid URL */ }
  return null;
}

/** Extract structured address fields from a Google Places result. */
function extractAddressFields(place: {
  formatted_address?: string;
  address_components?: { long_name: string; short_name: string; types: string[] }[];
}): Partial<NetworkRetailerAddress & { line1: string }> {
  const fields: Partial<NetworkRetailerAddress> = {};
  const parts = place?.address_components ?? [];

  const cityPriority = [
    "locality",
    "postal_town",
    "sublocality_level_1",
    "administrative_area_level_2",
    "neighborhood",
  ];
  for (const want of cityPriority) {
    for (const part of parts) {
      if (part.types?.includes(want) && part.long_name) {
        fields.city = part.long_name;
        break;
      }
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

type Tab = "new" | "existing";

type RegisteredRetailer = {
  id: string;
  name?: string;
  shopName?: string;
  ownerName?: string;
  email?: string;
  phone?: string;
  role?: string;
};

export function AddRetailerModal({
  manufacturerId,
  manufacturerName,
  seatsRemaining,
  onRetailerAdded,
  onClose,
}: AddRetailerModalProps) {
  const [tab, setTab] = useState<Tab>("new");

  // "New retailer" state
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<NetworkRetailerAddress>(emptyAddress);
  const [geo, setGeo] = useState<GeoPoint | null>(null);

  // "Link existing" state
  const [existingUsers, setExistingUsers] = useState<RegisteredRetailer[]>([]);
  const [existingSearch, setExistingSearch] = useState("");
  const [selectedExisting, setSelectedExisting] = useState<RegisteredRetailer | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Load registered retailers on mount for suggestions
  useEffect(() => {
    setLoadingExisting(true);
    const load = async () => {
      try {
        const [users, retailers, stores] = await Promise.all([
          fetchAllUsers().catch(() => []),
          fetchAllRetailers().catch(() => []),
          fetchStores().catch(() => [])
        ]);
        
        const map = new Map<string, RegisteredRetailer>();
        
        // Process users with retailer role
        users.forEach((u: any) => {
          if (u.role === "retailer") {
            const id = u.id || u.uid || u.docId; // Support multiple possible ID fields
            if (!id) return;
            
            const email = (u.email || "").toLowerCase();
            const phone = u.phone || "";
            const key = id;
            map.set(key, {
              id: id,
              name: u.name,
              shopName: u.shopName || u.name,
              ownerName: u.ownerName || u.name,
              email: u.email,
              phone: u.phone,
              role: u.role
            });
          }
        });

        // Add from retailers collection
        retailers.forEach((r: any) => {
          const id = r.id || r.uid || r.docId;
          if (!id) return;
          
          const email = (r.email || "").toLowerCase();
          const phone = r.phone || "";
          const key = id;
          if (!map.has(key)) {
            map.set(key, {
              id: id,
              shopName: r.shopName,
              ownerName: r.ownerName,
              email: r.email,
              phone: r.phone,
              role: "retailer"
            });
          }
        });

        // Add from stores collection (seeded stores often go here)
        stores.forEach((s: any) => {
          const id = s.id || s.uid || s.docId;
          if (!id) return;
          
          const key = id;
          if (!map.has(key)) {
            map.set(key, {
              id: id,
              shopName: s.name,
              ownerName: s.ownerName || s.name,
              phone: s.phone,
              email: s.email,
              role: "retailer"
            });
          }
        });
        
        setExistingUsers(Array.from(map.values()));
      } catch (err) {
        console.error("Failed to load existing retailers", err);
      } finally {
        setLoadingExisting(false);
      }
    };
    load();
  }, []);

  const filteredExisting = existingUsers.filter((u) => {
    const q = (tab === "existing" ? existingSearch : shopName).toLowerCase();
    if (!q) return false;
    // Don't suggest if it's an exact match already (prevents redundant dropdown)
    if (tab === "new" && u.shopName?.toLowerCase() === shopName.toLowerCase()) return true; 
    return [u.shopName, u.ownerName, u.name, u.email, u.phone].join(" ").toLowerCase().includes(q);
  });

  const handleLinkExisting = async (retailerToLink?: RegisteredRetailer) => {
    const target = retailerToLink || selectedExisting;
    console.log("Linking retailer:", { manufacturerId, target });
    if (!target) return;
    setError(null);
    setSubmitting(true);
    setShowSuggestions(false);
    try {
      await linkExistingRetailerToNetwork({
        manufacturerId,
        manufacturerName,
        retailerUid: target.id,
        shopName: target.shopName || target.name || "Retailer",
        ownerName: target.ownerName || target.name || "",
        email: target.email || "",
        phone: target.phone || "",
      });
      await onRetailerAdded({
        inviteCode: "",
        shopName: target.shopName || target.name || "Retailer",
        retailerEmail: target.email || "",
        retailerPhone: target.phone || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link retailer.");
      setSubmitting(false);
    }
  };

  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteListenerRef = useRef<unknown>(null);

  const applyPlaceGeometry = useCallback(
    (place: { geometry?: { location?: { lat: () => number; lng: () => number } } }) => {
      const lat = place?.geometry?.location?.lat?.();
      const lng = place?.geometry?.location?.lng?.();
      if (typeof lat === "number" && typeof lng === "number") {
        setGeo(new GeoPoint(lat, lng));
      }
    },
    [],
  );

  // Load Google Maps Places and wire up autocomplete on the address input.
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setMapsError("Google Maps key not configured.");
      return;
    }

    const setupAutocomplete = () => {
      if (!addressInputRef.current || !window.google?.maps?.places) return;
      if (autocompleteListenerRef.current && window.google?.maps?.event) {
        window.google.maps.event.removeListener(autocompleteListenerRef.current);
      }
      // Use establishment + geocode so the manufacturer can search by business name
      // (e.g. "Ramesh Agro Store Pune") or by address. Place Details returns the
      // business name in place.name which we use to auto-fill the Shop name field.
      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["name", "formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });
      autocompleteListenerRef.current = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place) return;
        // Only auto-fill shop name if the user hasn't typed one yet
        if (place.name && !shopName.trim()) setShopName(place.name);
        if (place.address_components?.length) {
          const fields = extractAddressFields(
            place as Parameters<typeof extractAddressFields>[0],
          );
          setAddress((prev) => ({ ...prev, ...fields }));
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
      script.onload = () => {
        script.dataset.loaded = "true";
        runWhenReady();
      };
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
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
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
                const fields = extractAddressFields(
                  results[0] as Parameters<typeof extractAddressFields>[0],
                );
                setAddress((prev) => ({ ...prev, ...fields }));
              }
            },
          );
        }
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(err.message || "Unable to access location.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const mapUrl = useMemo(() => {
    if (!geo) return "";
    return `https://maps.google.com/maps?q=${geo.latitude},${geo.longitude}&z=15&output=embed`;
  }, [geo]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError("Phone number is required.");
      return;
    }

    setSubmitting(true);
    try {
      const { inviteCode } = await createNetworkRetailer({
        manufacturerId,
        shopName: shopName.trim(),
        ownerName: ownerName.trim(),
        phone: trimmedPhone,
        email: email.trim(),
        address,
        geo,
      });

      const trimmedEmail = email.trim().toLowerCase();

      // Fire-and-forget: send invite email if retailer has an email address
      if (trimmedEmail) {
        fetch("/api/email/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            retailerEmail: trimmedEmail,
            shopName: shopName.trim(),
            inviteCode,
            manufacturerName,
          }),
        }).catch(() => {/* email failure is non-fatal */});
      }

      await onRetailerAdded({
        inviteCode,
        shopName: shopName.trim(),
        retailerEmail: trimmedEmail,
        retailerPhone: trimmedPhone,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add retailer. Try again.");
      setSubmitting(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const inputCls =
    "rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 disabled:opacity-60 w-full";
  const labelCls = "flex flex-col gap-1.5 text-sm";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center p-0 sm:p-4"
      onClick={handleBackdrop}
    >
      <div className="flex w-full max-w-xl flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl max-h-[92dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-on-surface">Add Retailer</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Creates a retailer profile and generates a signup invite link.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant/20 shrink-0">
          {(["new", "existing"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(null); }}
              className={[
                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t
                  ? "border-b-2 border-primary text-primary"
                  : "text-on-surface-variant hover:text-on-surface",
              ].join(" ")}
            >
              {t === "new" ? (
                <><UserPlus className="h-4 w-4" /> New Retailer</>
              ) : (
                <><Link2 className="h-4 w-4" /> Link Existing</>
              )}
            </button>
          ))}
        </div>

        {/* Seat guard (new retailer tab only) */}
        {tab === "new" && seatsRemaining <= 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="rounded-full bg-harvest/10 p-3">
              <UserPlus className="h-6 w-6 text-harvest" />
            </div>
            <div>
              <p className="font-semibold text-on-surface">No seats available</p>
              <p className="mt-1 text-sm text-on-surface-variant max-w-xs mx-auto">
                You have used all your retailer network seats. Upgrade your subscription to add
                more retailers.
              </p>
            </div>
            <a
              href="/dashboard/upgrade"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            >
              Upgrade subscription
            </a>
          </div>
        ) : tab === "existing" ? (
          /* ── Link existing registered retailer ── */
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
            <p className="text-sm text-on-surface-variant">
              Search for a retailer who already has a KrishiDukan account and link them to your network.
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2">
              <Search className="h-4 w-4 text-outline shrink-0" />
              <input
                type="text"
                placeholder="Search by name, shop, or email…"
                value={existingSearch}
                onChange={(e) => setExistingSearch(e.target.value)}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant"
              />
            </div>
            {loadingExisting ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-xl border border-outline-variant/30 divide-y divide-outline-variant/10">
                {filteredExisting.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-on-surface-variant">
                    {existingSearch ? "No matching retailers found." : "No registered retailers on the platform yet."}
                  </p>
                ) : (
                  filteredExisting.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedExisting(u)}
                      className={[
                        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                        selectedExisting?.id === u.id ? "bg-primary/10" : "hover:bg-surface-container",
                      ].join(" ")}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">
                          {u.shopName || u.name || "Retailer"}
                        </p>
                        <p className="text-xs text-on-surface-variant truncate">
                          {u.ownerName || u.name} {u.email ? `· ${u.email}` : ""}
                        </p>
                      </div>
                      {selectedExisting?.id === u.id && (
                        <span className="text-xs font-bold text-primary shrink-0 mt-0.5">Selected</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
            <div className="flex items-center justify-end gap-3 border-t border-outline-variant/20 pt-4">
              <button type="button" onClick={onClose} disabled={submitting}
                className="rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60">
                Cancel
              </button>
              <button type="button" onClick={() => handleLinkExisting()}
                disabled={!selectedExisting || submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60">
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Linking…</>
                ) : (
                  <><Link2 className="h-4 w-4" /> Link to Network</>
                )}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 overflow-y-auto px-5 py-5"
          >
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {/* Row 1: Shop name + Owner name */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls + " relative"}>
                <span className="font-medium text-on-surface">Shop name</span>
                <input
                  required
                  disabled={submitting}
                  value={shopName}
                  onChange={(e) => {
                    setShopName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Retailer shop name"
                  className={inputCls}
                />
                {tab === "new" && showSuggestions && shopName && filteredExisting.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-outline-variant/40 bg-white shadow-lg">
                    <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant bg-surface-container-low border-b border-outline-variant/10">
                      Existing retailers found
                    </p>
                    <ul className="divide-y divide-outline-variant/10">
                      {filteredExisting.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => handleLinkExisting(u)}
                            className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-primary/5 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-on-surface truncate">
                                {u.shopName || u.name}
                              </p>
                              <p className="text-[10px] text-on-surface-variant truncate">
                                {u.ownerName || u.name} · {u.phone}
                              </p>
                            </div>
                            <span className="text-[9px] font-bold text-primary px-1.5 py-0.5 bg-primary/10 rounded">Link</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </label>
              <label className={labelCls}>
                <span className="font-medium text-on-surface">Owner name</span>
                <input
                  required
                  disabled={submitting}
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Owner or contact person"
                  className={inputCls}
                />
              </label>
            </div>

            {/* Row 2: Phone + Email */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                <span className="font-medium text-on-surface">
                  Phone <span className="text-red-500">*</span>
                </span>
                <input
                  required
                  type="tel"
                  disabled={submitting}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91…"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span className="font-medium text-on-surface">
                  Email{" "}
                  <span className="font-normal text-on-surface-variant">(optional)</span>
                </span>
                <input
                  type="email"
                  disabled={submitting}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="retailer@example.com"
                  className={inputCls}
                />
              </label>
            </div>

            {/* Business / address search — autocomplete fills shopName + address fields */}
            <label className={labelCls}>
              <span className="font-medium text-on-surface">
                Search shop on Google Maps
                <span className="ml-1 font-normal text-on-surface-variant">
                  — auto-fills name & address
                </span>
              </span>
              <input
                ref={addressInputRef}
                required
                disabled={submitting}
                value={address.line1}
                onChange={(e) => setAddress((p) => ({ ...p, line1: e.target.value }))}
                placeholder="Type shop name or address (e.g. Ramesh Agro Store Pune)"
                autoComplete="off"
                className={inputCls}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className={labelCls}>
                <span className="font-medium text-on-surface">City</span>
                <input
                  required
                  disabled={submitting}
                  value={address.city}
                  onChange={(e) => setAddress((p) => ({ ...p, city: e.target.value }))}
                  placeholder="City"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span className="font-medium text-on-surface">State</span>
                <input
                  required
                  disabled={submitting}
                  value={address.state}
                  onChange={(e) => setAddress((p) => ({ ...p, state: e.target.value }))}
                  placeholder="State"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span className="font-medium text-on-surface">Pincode</span>
                <input
                  required
                  disabled={submitting}
                  value={address.pincode}
                  onChange={(e) => setAddress((p) => ({ ...p, pincode: e.target.value }))}
                  placeholder="PIN"
                  className={inputCls}
                />
              </label>
            </div>

            {/* Location helpers */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locating || submitting}
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60"
              >
                {locating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LocateFixed className="h-4 w-4" />
                )}
                Use current location
              </button>
              {mapsError ? (
                <p className="text-xs text-harvest">{mapsError}</p>
              ) : null}
            </div>

            {/* Paste Google Maps link */}
            <label className={labelCls}>
              <span className="font-medium text-on-surface">
                Paste Google Maps link
                <span className="ml-1 font-normal text-on-surface-variant">— pins location from a shared Maps URL</span>
              </span>
              <input
                type="url"
                disabled={submitting}
                placeholder="https://maps.google.com/maps?q=18.52,73.85 or share link…"
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
              {geo ? (
                <p className="text-xs text-primary">
                  Coordinates detected: {geo.latitude.toFixed(5)}, {geo.longitude.toFixed(5)}
                </p>
              ) : null}
            </label>

            {geo ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <MapPin className="h-3.5 w-3.5" />
                  Location pinned
                </div>
                <div className="overflow-hidden rounded-xl border border-outline-variant/30">
                  <iframe
                    title="Location preview"
                    src={mapUrl}
                    className="h-40 w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            ) : null}

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-3 border-t border-outline-variant/20 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Add Retailer
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
