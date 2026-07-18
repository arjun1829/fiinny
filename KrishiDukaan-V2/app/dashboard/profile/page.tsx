"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoPoint, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { signOut } from "firebase/auth";
import { useEffectiveUser } from "../_context/effective-user-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Instagram, Facebook, Youtube, MessageCircle, Loader2, LocateFixed, MapPin, Save,
  Pencil, Truck, X, TrendingUp, ExternalLink, Building2, Globe, Image as ImageIcon,
  Upload, Camera, Receipt, AlertTriangle,
} from "lucide-react";
import { auth, db, storage, requestRoleUpgrade } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import { HelperIcon } from "../../../components/helpers";
import {
  disableOnlineDelivery,
  enableOnlineDeliveryWithGst,
  fetchDashboardUserRole,
  isValidGstinFormat,
  loadProfileState,
  resolveManufacturerDocId,
  saveManufacturerProfile,
  saveRetailerProfile,
  updateGstNumber,
  type DashboardProfileRole,
  type ProfileFormValues,
  type RetailerProfileExtras,
} from "../_lib/profile-persistence";
import { useI18n } from "../../i18n/I18nContext";
import { StatusToast } from "../../components/shared/status-toast";
import { fetchManufacturerCatalogueRows } from "../_lib/inventory-firestore";
import type { ManufacturerProductRow } from "../_types/inventory";
import { compressImage } from "../../utils/compressImage";

declare global { interface Window { google?: any; } }

const initialForm: ProfileFormValues = {
  businessName: "", ownerName: "", phone: "", secondaryPhone: "", email: "",
  line1: "", city: "", state: "", pincode: "",
  website: "", logoUrl: "", bannerUrl: "", gstin: "",
};

type SocialLinks = { instagram: string; facebook: string; whatsapp: string; youtube: string };
const emptySocial: SocialLinks = { instagram: "", facebook: "", whatsapp: "", youtube: "" };

function extractAddressFields(place: {
  formatted_address?: string;
  address_components?: { long_name: string; short_name: string; types: string[] }[];
}): Partial<ProfileFormValues> {
  const fields: Partial<ProfileFormValues> = {};
  const parts = place?.address_components || [];
  const cityPriority = ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_2", "neighborhood"];
  for (const want of cityPriority) {
    for (const p of parts) {
      if (p.types?.includes(want) && p.long_name) { fields.city = p.long_name; break; }
    }
    if (fields.city) break;
  }
  for (const p of parts) {
    if (p.types?.includes("administrative_area_level_1")) fields.state = p.long_name;
    if (p.types?.includes("postal_code")) fields.pincode = p.long_name;
  }
  if (place?.formatted_address) fields.line1 = place.formatted_address;
  return fields;
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/** Alias so existing call sites in this file don't change. */
const isValidGstin = isValidGstinFormat;

function toSocialUrl(href: string, label: string): string {
  if (href.startsWith("http")) return href;
  // WhatsApp: user enters a phone number — convert to wa.me deep link
  if (label === "WhatsApp") {
    const digits = href.replace(/\D/g, "");
    // Prepend 91 if it looks like a 10-digit Indian number
    const e164 = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${e164}`;
  }
  return `https://${href}`;
}

function SocialBadge({ href, icon: Icon, label, colorClass }: { href: string; icon: any; label: string; colorClass: string }) {
  if (!href) return null;
  const url = toSocialUrl(href, label);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${colorClass}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function ProductCard({ product }: { product: ManufacturerProductRow }) {
  const { t } = useI18n();
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient hover:shadow-md transition-shadow">
      <div className="aspect-square bg-surface-container flex items-center justify-center overflow-hidden">
        {product.image ? (
          <img src={product.image} alt={product.productName}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <span className="text-3xl text-on-surface-variant/20">🌿</span>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-on-surface truncate">{product.productName}</p>
        <p className="text-[10px] text-on-surface-variant">{product.category}</p>
        <p className="text-xs font-bold text-primary mt-0.5">₹{product.price.toFixed(0)}</p>
        {!product.isActive && (
          <span className="mt-1 inline-block text-[9px] rounded-full bg-surface-container px-1.5 py-0.5 text-on-surface-variant">
            {t('inactiveStatus')}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Online Delivery Toggle (shared) ──────────────────────────────────────────

function OnlineDeliveryToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useI18n();
  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-ambient">
      <h2 className="mb-1 text-sm font-semibold text-on-surface flex items-center gap-2">
        <Truck className="h-4 w-4" /> {t('onlineDelivery')}
        <HelperIcon size="xs" variant="ghost" side="right" textKey="dashSettings" ariaLabel="Online delivery help" />
      </h2>
      <p className="mb-4 text-xs text-on-surface-variant">{t('onlineDeliveryDesc')}</p>
      <label className="flex items-center gap-3 cursor-pointer w-fit">
        <div className="relative">
          <input type="checkbox" className="sr-only" checked={value} onChange={(e) => onChange(e.target.checked)} />
          <div className={`h-6 w-11 rounded-full transition-colors ${value ? "bg-primary" : "bg-surface-container-highest"}`} />
          <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : ""}`} />
        </div>
        <span className="text-sm font-medium text-on-surface">{value ? t('enabledLabel') : t('disabledLabel')}</span>
      </label>
    </section>
  );
}

// ─── Image Upload helpers ──────────────────────────────────────────────────────

async function uploadImageToStorage(file: File, pathPrefix: string): Promise<string> {
  const toUpload = await compressImage(file);
  const path = `${pathPrefix}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const contentType = toUpload.type || file.type || "image/jpeg";
  const snap = await uploadBytes(storageRef(storage, path), toUpload, { contentType });
  return getDownloadURL(snap.ref);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProfilePageInner() {
  const router = useRouter();
  const { t } = useI18n();
  const { uid: effectiveUid, profile: effectiveProfile, isAdminView } = useEffectiveUser();

  const [uid,       setUid]       = useState<string | null>(null);
  const [mfrDocId,  setMfrDocId]  = useState<string | null>(null);
  const [userRole,  setUserRole]  = useState<DashboardProfileRole | null>(null);
  const [form,      setForm]      = useState<ProfileFormValues>(initialForm);
  const [social,    setSocial]    = useState<SocialLinks>(emptySocial);
  const [geo,       setGeo]       = useState<GeoPoint | null>(null);
  const [retailerExtras,        setRetailerExtras]        = useState<RetailerProfileExtras | null>(null);
  const [manufacturerCreatedAt, setManufacturerCreatedAt] = useState<unknown | null>(null);
  const [products,  setProducts]  = useState<ManufacturerProductRow[]>([]);
  const [onlineDelivery, setOnlineDelivery] = useState(false);
  const [tagline,        setTagline]        = useState("");
  const [totalSeats,     setTotalSeats]     = useState(0);
  const [slug,      setSlug]      = useState<string>("");

  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [locating,  setLocating]  = useState(false);
  const [editMode,  setEditMode]  = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [status,    setStatus]    = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Delete-account flow
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount,   setDeletingAccount]   = useState(false);
  const [deleteError,       setDeleteError]       = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    if (!auth.currentUser) {
      setDeleteError("Please log in again to delete your account.");
      return;
    }
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to delete account.");
      await signOut(auth);
      window.location.href = "/";
    } catch (e: unknown) {
      setDeletingAccount(false);
      setDeleteError(e instanceof Error ? e.message : "Failed to delete account.");
    }
  };

  // GST inline flow state
  const [gstFlowMode,       setGstFlowMode]       = useState<"pending-enable" | "update" | null>(null);
  const [pendingGstin,      setPendingGstin]      = useState("");
  const [gstSaving,         setGstSaving]         = useState(false);
  const [gstInputError,     setGstInputError]     = useState<string | null>(null);
  const [disablingDelivery, setDisablingDelivery] = useState(false);

  const [mapLinkInput,     setMapLinkInput]     = useState("");
  const [resolvingMapLink, setResolvingMapLink] = useState(false);
  const [mapLinkError,     setMapLinkError]     = useState<string | null>(null);
  const [locationMethod,   setLocationMethod]   = useState<"search" | "link">("search");

  const [uploadingLogo,   setUploadingLogo]   = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const [upgradeBusinessName, setUpgradeBusinessName] = useState("");
  const [upgrading, setUpgrading] = useState(false);

  const addressInputRef         = useRef<HTMLInputElement | null>(null);
  const autocompleteListenerRef = useRef<unknown>(null);
  const logoFileRef             = useRef<HTMLInputElement>(null);
  const bannerFileRef           = useRef<HTMLInputElement>(null);
  const gstinInputRef           = useRef<HTMLInputElement>(null);

  const applyPlaceGeometry = useCallback((place: { geometry?: { location?: { lat: () => number; lng: () => number } } }) => {
    const lat = place?.geometry?.location?.lat?.();
    const lng = place?.geometry?.location?.lng?.();
    if (typeof lat === "number" && typeof lng === "number") setGeo(new GeoPoint(lat, lng));
  }, []);

  const loadSocial = useCallback(async (userId: string, role: DashboardProfileRole) => {
    try {
      const col = role === "manufacturer" ? "manufacturers" : "retailers";
      let docId = userId;
      if (role === "manufacturer") {
        const resolved = await resolveManufacturerDocId(userId);
        docId = resolved;
        setMfrDocId(resolved !== userId ? resolved : null);
      }
      let snap = await getDoc(doc(db, col, docId));
      if (!snap.exists() && role === "manufacturer" && docId !== userId) {
        snap = await getDoc(doc(db, col, userId));
      }
      if (snap.exists()) {
        const d = snap.data() as any;
        setSocial({
          instagram: d.socialLinks?.instagram ?? "",
          facebook:  d.socialLinks?.facebook  ?? "",
          whatsapp:  d.socialLinks?.whatsapp  ?? "",
          youtube:   d.socialLinks?.youtube   ?? "",
        });
        setTagline(d.tagline ?? "");
        if (role === "manufacturer") setSlug(String(d.slug ?? ""));
      }
      try {
        const idxSnap = await getDoc(doc(db, "uidIndex", userId));
        if (idxSnap.exists()) {
          const phone = String(idxSnap.data().phone ?? "");
          if (phone) {
            const userSnap = await getDoc(doc(db, "users", phone));
            if (userSnap.exists()) {
              setOnlineDelivery(!!(userSnap.data() as any).onlineDelivery);
              setTotalSeats(Number((userSnap.data() as any).totalSeats) || 0);
            }
          }
        }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!effectiveUid || !effectiveProfile) return;
    setUid(effectiveUid);
    setLoading(true);
    setStatus(null);
    const role: DashboardProfileRole | null =
      effectiveProfile.role === "manufacturer" ? "manufacturer"
      : effectiveProfile.role === "retailer" ? "retailer"
      : null;
    (async () => {
      try {
        setUserRole(role);
        if (!role) return;
        const [loaded] = await Promise.all([
          loadProfileState(effectiveUid, role, (effectiveProfile as any).email ?? null),
          loadSocial(effectiveUid, role),
        ]);
        setForm(loaded.form);
        setGeo(loaded.geo);
        setRetailerExtras(loaded.retailerExtras);
        setManufacturerCreatedAt(loaded.manufacturerCreatedAt);
        if (role === "manufacturer") {
          try {
            const prods = await fetchManufacturerCatalogueRows(effectiveUid);
            setProducts(prods.filter((p) => p.isActive));
          } catch { /* non-critical */ }
        }
      } catch (err) {
        setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to load profile." });
      } finally {
        setLoading(false);
      }
    })();
  }, [effectiveUid, effectiveProfile, loadSocial]);

  // Preload Maps script as soon as edit mode opens so Geocoder is available
  // for "Use Current Location" regardless of which location tab is active.
  useEffect(() => {
    if (!editMode) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || window.google?.maps?.places) return;
    const scriptId = "google-maps-places-script";
    if (document.getElementById(scriptId)) return;
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true; script.defer = true;
    script.onload = () => { script.dataset.loaded = "true"; };
    document.head.appendChild(script);
  }, [editMode]);

  // Google Maps Autocomplete — re-runs when locationMethod switches back to "search"
  // so the autocomplete is re-attached to the freshly-mounted input element.
  useEffect(() => {
    if (!editMode || !uid || !userRole || locationMethod !== "search") return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) { setMapsError("Google Maps key not configured."); return; }

    let cancelled = false;

    const setupAutocomplete = () => {
      if (cancelled) return;
      if (!addressInputRef.current || !window.google?.maps?.places) {
        setMapsError("Google Maps failed to load. Try refreshing.");
        return;
      }
      // Remove any previous listener before attaching a new one
      if (autocompleteListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(autocompleteListenerRef.current);
      autocompleteListenerRef.current = null;

      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });
      const listener = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place) return;
        const addressFields = extractAddressFields(place as any);
        if (addressInputRef.current && addressFields.line1)
          addressInputRef.current.value = addressFields.line1;
        setForm((p) => ({ ...p, ...addressFields }));
        applyPlaceGeometry(place);
      });
      autocompleteListenerRef.current = listener;
      setMapsError(null);
    };

    // Use setTimeout so React has committed the input to the DOM before we access it
    const attachWhenReady = () => { setTimeout(setupAutocomplete, 50); };

    const scriptId = "google-maps-places-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (window.google?.maps?.places) {
      attachWhenReady();
    } else if (existing) {
      if (existing.dataset.loaded === "true") attachWhenReady();
      else existing.addEventListener("load", attachWhenReady, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true; script.defer = true;
      script.onload = () => { script.dataset.loaded = "true"; attachWhenReady(); };
      script.onerror = () => setMapsError("Unable to load Google Maps. Check your API key and network.");
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (autocompleteListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(autocompleteListenerRef.current);
      autocompleteListenerRef.current = null;
    };
  }, [editMode, uid, userRole, locationMethod, applyPlaceGeometry]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatus({ type: "error", message: "Your browser does not support location. Use 'Search Place' or paste a Maps link instead." });
      return;
    }
    setLocating(true);

    const applyCoords = (lat: number, lng: number) => {
      setGeo(new GeoPoint(lat, lng));
      setLocating(false);
      // Reverse-geocode to fill city/state/pincode. Maps may still be loading,
      // so retry after 1.5 s if the Geocoder isn't ready yet.
      const doGeocode = () => {
        if (window.google?.maps?.Geocoder) {
          new window.google.maps.Geocoder().geocode({ location: { lat, lng } }, (results: any, status: string) => {
            if (status === "OK" && results?.[0]) setForm((p) => ({ ...p, ...extractAddressFields(results[0]) }));
          });
        }
      };
      if (window.google?.maps?.Geocoder) doGeocode();
      else setTimeout(doGeocode, 1500);
    };

    const onFinalError = (err: GeolocationPositionError) => {
      setLocating(false);
      const isInApp = /instagram|fban|fbav|twitter|line\/|micromessenger|wv\b/i.test(navigator.userAgent);
      if (isInApp) {
        setStatus({ type: "error", message: "Location is blocked in this in-app browser. Open in Safari or Chrome, or use 'Search Place' / 'Paste Maps Link' instead." });
      } else if (err.code === err.PERMISSION_DENIED) {
        setStatus({ type: "error", message: "Location access denied. Enable it in browser settings, or use 'Search Place' / 'Paste Maps Link' instead." });
      } else {
        setStatus({ type: "error", message: "Couldn't detect your location. Use 'Search Place' or 'Paste Maps Link' instead." });
      }
    };

    // Try high accuracy first; fall back to low accuracy on timeout
    navigator.geolocation.getCurrentPosition(
      (pos) => applyCoords(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        if (err.code === err.TIMEOUT) {
          // High-accuracy timed out (common on first request or poor GPS signal) — retry low accuracy
          navigator.geolocation.getCurrentPosition(
            (pos) => applyCoords(pos.coords.latitude, pos.coords.longitude),
            onFinalError,
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
          );
        } else {
          onFinalError(err);
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  const handleResolveMapLink = async () => {
    const url = mapLinkInput.trim();
    if (!url) return;
    setResolvingMapLink(true); setMapLinkError(null);
    try {
      const res = await fetch(`/api/resolve-maps-url?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.lat && data.lng) {
        const resolved = new GeoPoint(data.lat, data.lng);
        setGeo(resolved);
        if (window.google?.maps?.Geocoder) {
          new window.google.maps.Geocoder().geocode(
            { location: { lat: data.lat, lng: data.lng } },
            (results: any, status: string) => {
              if (status === "OK" && results?.[0]) setForm((p) => ({ ...p, ...extractAddressFields(results[0]) }));
            },
          );
        }
        setMapLinkInput("");
      } else {
        setMapLinkError("Couldn't extract coordinates from that link. Try a direct Google Maps link.");
      }
    } catch {
      setMapLinkError("Failed to resolve the Maps link. Please check the URL.");
    } finally {
      setResolvingMapLink(false);
    }
  };

  const mapUrl = useMemo(() => {
    if (!geo) return "";
    return `https://maps.google.com/maps?q=${geo.latitude},${geo.longitude}&z=15&output=embed`;
  }, [geo]);

  // ── Image uploads ─────────────────────────────────────────────────────────────

  const handleLogoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploadingLogo(true);
    try {
      const url = await uploadImageToStorage(file, "profile-images/logos");
      setForm((p) => ({ ...p, logoUrl: url }));
    } catch {
      setStatus({ type: "error", message: "Logo upload failed. Please try again." });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBannerFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploadingBanner(true);
    try {
      const url = await uploadImageToStorage(file, "profile-images/banners");
      setForm((p) => ({ ...p, bannerUrl: url }));
    } catch {
      setStatus({ type: "error", message: "Banner upload failed. Please try again." });
    } finally {
      setUploadingBanner(false);
    }
  };

  // ── GST inline flow handlers ──────────────────────────────────────────────────

  const handleSaveGstAndEnable = useCallback(async () => {
    const trimmed = pendingGstin.trim().toUpperCase();
    if (!trimmed) {
      setGstInputError("GST Number is required to enable Online Delivery.");
      return;
    }
    if (!isValidGstin(trimmed)) {
      setGstInputError("Invalid GST format — expected 15 characters, e.g. 27AAAAA0000A1Z5.");
      return;
    }
    if (!uid || !userRole) return;
    setGstSaving(true);
    setGstInputError(null);
    try {
      await enableOnlineDeliveryWithGst(uid, userRole, trimmed);
      setForm((p) => ({ ...p, gstin: trimmed }));
      setOnlineDelivery(true);
      setGstFlowMode(null);
      setPendingGstin("");
    } catch (e) {
      setGstInputError(e instanceof Error ? e.message : "Failed to save. Please try again.");
    } finally {
      setGstSaving(false);
    }
  }, [pendingGstin, uid, userRole]);

  const handleUpdateGst = useCallback(async () => {
    const trimmed = pendingGstin.trim().toUpperCase();
    if (!trimmed) {
      setGstInputError("GST Number cannot be removed while Online Delivery is active.");
      return;
    }
    if (!isValidGstin(trimmed)) {
      setGstInputError("Invalid GST format — expected 15 characters, e.g. 27AAAAA0000A1Z5.");
      return;
    }
    if (!uid || !userRole) return;
    setGstSaving(true);
    setGstInputError(null);
    try {
      await updateGstNumber(uid, userRole, trimmed);
      setForm((p) => ({ ...p, gstin: trimmed }));
      setGstFlowMode(null);
      setPendingGstin("");
    } catch (e) {
      setGstInputError(e instanceof Error ? e.message : "Failed to save. Please try again.");
    } finally {
      setGstSaving(false);
    }
  }, [pendingGstin, uid, userRole]);

  const cancelGstFlow = useCallback(() => {
    setGstFlowMode(null);
    setPendingGstin("");
    setGstInputError(null);
  }, []);

  // ── Save profile + settings together ──────────────────────────────────────────

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uid || !userRole) return;
    const currentLine1 = addressInputRef.current?.value?.trim() || form.line1;
    const formToSave = { ...form, line1: currentLine1 };
    setSaving(true); setStatus(null);

    let resolvedGeo = geo;
    if (!resolvedGeo && (formToSave.city || formToSave.state)) {
      try {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        const q = encodeURIComponent([formToSave.city, formToSave.state, formToSave.pincode].filter(Boolean).join(', '));
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${q}&key=${apiKey}`);
        const data = await res.json();
        if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
          const { lat, lng } = data.results[0].geometry.location;
          resolvedGeo = new GeoPoint(lat, lng);
          setGeo(resolvedGeo);
        }
      } catch { /* non-critical */ }
    }

    try {
      const col = userRole === "manufacturer" ? "manufacturers" : "retailers";

      // Resolve phone for public doc key
      const idxSnap = await getDoc(doc(db, "uidIndex", uid));
      const phone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") : "";

      // Resolve the correct publicly-readable Firestore doc ID.
      // Manufacturers: mfrDocId is already phone-keyed.
      // Retailers: resolve via users/{phone}.retailerDocId (same path as saveRetailerProfile).
      //   Using uid here would write onlineDelivery to retailers/{uid}, but
      //   fetchStoreOnlineDelivery reads retailers/{phone} — causing the Order button to never appear.
      let profileDocId: string;
      if (userRole === "manufacturer") {
        profileDocId = mfrDocId || uid!;
      } else {
        let rDocId = "";
        if (phone) {
          try {
            const userSnap = await getDoc(doc(db, "users", phone));
            if (userSnap.exists()) rDocId = String(userSnap.data()?.retailerDocId ?? "").trim();
          } catch { /* ignore — fall through to phone fallback */ }
        }
        profileDocId = rDocId || phone || uid!;
      }

      // Save social links, tagline, onlineDelivery to the role-specific collection
      await setDoc(doc(db, col, profileDocId), {
        socialLinks: social,
        tagline,
        onlineDelivery,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Mirror to profiles/{phone} so the unified public profile is always in sync.
      // saveManufacturerProfile/saveRetailerProfile already mirror structural fields;
      // this write adds the frequently-updated display fields.
      const profilesMirrorId = phone || uid;
      await setDoc(doc(db, "profiles", profilesMirrorId), {
        socialLinks: social,
        tagline,
        onlineDelivery,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Write completion fields + onlineDelivery to users/{phone}.
      // getUserProfile reads from this doc — writing these fields here ensures the
      // dashboard layout's profile-completion check sees the latest data.
      const userTarget = phone ? doc(db, "users", phone) : doc(db, "users", uid);
      await setDoc(userTarget, {
        businessName: formToSave.businessName.trim(),
        ownerName:    formToSave.ownerName.trim(),
        phone:        formToSave.phone.trim(),
        city:         formToSave.city.trim(),
        onlineDelivery,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      if (userRole === "manufacturer") {
        await saveManufacturerProfile(uid, formToSave, resolvedGeo, manufacturerCreatedAt);
      } else {
        await saveRetailerProfile(uid, formToSave, resolvedGeo, retailerExtras ?? {
          createdAt: null, onboardingType: null, manufacturerId: null, active: true, subscriptionStatus: "free",
        });
      }
      setStatus({ type: "success", message: "Profile saved successfully." });
      setEditMode(false);
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to save profile." });
    } finally {
      setSaving(false);
    }
  };

  const handleUpgradeToManufacturer = async () => {
    if (!uid) return;
    if (totalSeats <= 0) { router.push("/dashboard/upgrade"); return; }
    if (!upgradeBusinessName.trim()) { setStatus({ type: "error", message: "Please enter your business / brand name." }); return; }
    setUpgrading(true); setStatus(null);
    try {
      await requestRoleUpgrade(uid, "manufacturer", { businessName: upgradeBusinessName.trim() });
      setStatus({ type: "success", message: "Upgraded to Manufacturer! Reloading dashboard…" });
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Upgrade failed." });
    } finally {
      setUpgrading(false);
    }
  };

  const inputCls = "rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2 w-full text-sm";

  if (loading) return (
    <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-on-surface-variant">
      <Loader2 className="h-5 w-5 animate-spin" /> {t('loadingProfile')}
    </div>
  );

  // ── View mode ──────────────────────────────────────────────────────────────

  // Compute which required fields are still missing
  const missingBusinessName = !form.businessName.trim();
  const missingPhone        = !form.phone.trim();
  const missingLocation     = !form.city.trim() && !form.state.trim() && !geo;
  const isProfileIncomplete = missingBusinessName || missingPhone || missingLocation;

  if (!editMode) {
    return (
      <>
        <StatusToast message={status?.message ?? null} type={status?.type} onDismiss={() => setStatus(null)} autoClose={status?.type === "error" ? 0 : 3500} />

        {/* Hidden file inputs */}
        <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }} />
        <input ref={bannerFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBannerFile(f); }} />

        {/* Profile completion banner */}
        {isProfileIncomplete && (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800 mb-2">Complete your profile to continue</p>
            <ul className="text-xs text-amber-700 space-y-1 mb-3">
              {missingBusinessName && <li>• Business name is required</li>}
              {missingPhone        && <li>• Contact number is required</li>}
              {missingLocation     && <li>• Location is required — search your shop, paste a Maps link, or use current location</li>}
            </ul>
            <button type="button" onClick={() => setEditMode(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition-colors">
              <Pencil className="h-3.5 w-3.5" /> Fill in missing details
            </button>
          </div>
        )}

        {/* Profile header card */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
          {/* Banner — clickable for upload */}
          <div
            className="h-28 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5 overflow-hidden relative group cursor-pointer"
            onClick={() => bannerFileRef.current?.click()}
            title="Click to change banner"
          >
            {form.bannerUrl ? (
              <img src={form.bannerUrl} alt="Banner" className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : null}
            {/* Upload overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white">
                {uploadingBanner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {uploadingBanner ? "Uploading…" : "Change banner"}
              </div>
            </div>
          </div>

          <div className="px-5 pb-5">
            {/* Avatar + edit button row */}
            <div className="relative z-10 flex items-end justify-between -mt-10 mb-4">
              {/* Avatar — clickable for upload */}
              <div
                className="group relative h-20 w-20 rounded-full border-4 border-white bg-primary flex items-center justify-center shadow-lg overflow-hidden cursor-pointer"
                onClick={() => logoFileRef.current?.click()}
                title="Click to change photo"
              >
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="Logo" className="h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <span className="text-xl font-bold text-white">{initials(form.businessName || form.ownerName || "?")}</span>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors rounded-full">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingLogo ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setEditMode(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors">
                <Pencil className="h-3.5 w-3.5" /> {t('editProfileBtn')}
              </button>
            </div>

            {/* Name & info */}
            <div className="mb-3">
              <h1 className="text-lg font-bold text-on-surface">{form.businessName || "—"}</h1>
              {form.ownerName && <p className="text-sm text-on-surface-variant">{form.ownerName}</p>}
              {(form.city || form.state) && (
                <a
                  href={geo
                    ? `https://www.google.com/maps?q=${geo.latitude},${geo.longitude}`
                    : `https://www.google.com/maps/search/${encodeURIComponent([form.city, form.state].filter(Boolean).join(", "))}`}
                  target="_blank" rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors"
                >
                  <MapPin className="h-3 w-3" />
                  {[form.city, form.state].filter(Boolean).join(", ")}
                </a>
              )}
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-on-surface-variant">
                {form.phone && <span>{form.phone}</span>}
                {form.secondaryPhone && <span>· {form.secondaryPhone}</span>}
                {form.email && <span>{form.email}</span>}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-6 mb-4 py-3 border-y border-outline-variant/20">
              <div className="text-center">
                <p className="text-base font-bold text-on-surface">{products.length}</p>
                <p className="text-[10px] text-on-surface-variant">{t('productsStatLabel')}</p>
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-on-surface capitalize">{userRole ?? "—"}</p>
                <p className="text-[10px] text-on-surface-variant">{t('accountTypeLabel')}</p>
              </div>
            </div>

            {/* Social links */}
            <div className="flex flex-wrap gap-2">
              {form.website && (
                <SocialBadge href={form.website} icon={Globe} label="Website"
                  colorClass="bg-surface-container text-on-surface-variant border border-outline-variant/40" />
              )}
              <SocialBadge href={social.instagram} icon={Instagram} label="Instagram"
                colorClass="bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-pink-600 border border-pink-200" />
              <SocialBadge href={social.facebook} icon={Facebook} label="Facebook"
                colorClass="bg-blue-50 text-blue-600 border border-blue-200" />
              <SocialBadge href={social.whatsapp} icon={MessageCircle} label="WhatsApp"
                colorClass="bg-green-50 text-green-600 border border-green-200" />
              <SocialBadge href={social.youtube} icon={Youtube} label="YouTube"
                colorClass="bg-red-50 text-red-600 border border-red-200" />
              {!form.website && !social.instagram && !social.facebook && !social.whatsapp && !social.youtube && (
                <button type="button" onClick={() => setEditMode(true)}
                  className="text-xs text-on-surface-variant underline underline-offset-2 hover:text-primary">
                  {t('addSocialLinksBtn')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Company Page — manufacturers */}
        {userRole === "manufacturer" && (
          <section className="mb-6 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-ambient">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Company Page
              </h2>
              {slug && (
                <a href={`/brand/${slug}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> View live
                </a>
              )}
            </div>
            <p className="mb-4 text-xs text-on-surface-variant">
              Your public brand page. Customize it with a tagline, about section, products, videos, and more.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/company"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95">
                <Pencil className="h-3.5 w-3.5" /> Edit Brand Page
              </Link>
              {slug && (
                <a href={`/brand/${slug}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-4 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> View Brand Page
                </a>
              )}
              {!slug && <p className="text-xs text-on-surface-variant italic">Save your profile once to generate your brand page URL.</p>}
            </div>
          </section>
        )}

        {/* ── Online Delivery + GST — coupled inline workflow ── */}
        <section className="mb-6 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient overflow-hidden">

          {/* Toggle row */}
          <div className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-on-surface flex items-center gap-2">
              <Truck className="h-4 w-4" /> {t('onlineDelivery')}
              <HelperIcon size="xs" variant="ghost" side="right" textKey="dashSettings" ariaLabel="Online delivery help" />
            </h2>
            <p className="mb-4 text-xs text-on-surface-variant">{t('onlineDeliveryDesc')}</p>
            <label className={`flex items-center gap-3 w-fit ${disablingDelivery ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}>
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={onlineDelivery}
                  disabled={disablingDelivery}
                  onChange={async (e) => {
                    if (e.target.checked) {
                      setPendingGstin(form.gstin || "");
                      setGstFlowMode("pending-enable");
                      setGstInputError(null);
                    } else {
                      if (!uid || !userRole) return;
                      cancelGstFlow();
                      setDisablingDelivery(true);
                      try {
                        await disableOnlineDelivery(uid, userRole);
                        setOnlineDelivery(false);
                      } catch {
                        setStatus({ type: "error", message: "Failed to disable Online Delivery. Please try again." });
                      } finally {
                        setDisablingDelivery(false);
                      }
                    }
                  }}
                />
                <div className={`h-6 w-11 rounded-full transition-colors ${onlineDelivery ? "bg-primary" : "bg-surface-container-highest"}`} />
                <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${onlineDelivery ? "translate-x-5" : ""}`}>
                  {disablingDelivery && <Loader2 className="h-3 w-3 animate-spin text-outline absolute inset-1" />}
                </div>
              </div>
              <span className="text-sm font-medium text-on-surface">{onlineDelivery ? t('enabledLabel') : t('disabledLabel')}</span>
            </label>
            {gstFlowMode === "pending-enable" && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Enter your GST Number below to complete enabling Online Delivery.
              </p>
            )}
          </div>

          {/* GST entry panel — enable flow (delivery is OFF, awaiting GST) */}
          {gstFlowMode === "pending-enable" && (
            <div className="border-t border-amber-200 bg-amber-50/60 px-5 pb-5 pt-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-amber-700 shrink-0" />
                <p className="text-sm font-semibold text-on-surface">GST Number Required</p>
              </div>
              <p className="text-xs text-on-surface-variant">
                Your GSTIN is required for Online Delivery, invoicing, and GST compliance. It will be stored on your account.
              </p>
              <div className="flex flex-col gap-1.5">
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={pendingGstin}
                    onChange={(e) => { setPendingGstin(e.target.value.toUpperCase()); setGstInputError(null); }}
                    maxLength={15}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    className={`w-full rounded-xl border bg-white px-3 py-2.5 font-mono text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 pr-9 ${
                      pendingGstin
                        ? isValidGstin(pendingGstin)
                          ? "border-green-400 focus:border-green-500"
                          : "border-red-300 focus:border-red-400"
                        : "border-outline-variant/40 focus:border-primary"
                    }`}
                  />
                  {pendingGstin && (
                    <span className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${
                      isValidGstin(pendingGstin) ? "text-green-500" : "text-red-400"
                    }`}>
                      {isValidGstin(pendingGstin) ? "✓" : "✕"}
                    </span>
                  )}
                </div>
                {gstInputError && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> {gstInputError}
                  </p>
                )}
                {pendingGstin && !isValidGstin(pendingGstin) && !gstInputError && (
                  <p className="text-xs text-on-surface-variant">
                    Must be 15 characters — state code + PAN + entity type + check digit.
                  </p>
                )}
                {isValidGstin(pendingGstin) && (
                  <p className="text-xs text-green-700 font-medium">Valid GST Number ✓</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSaveGstAndEnable}
                  disabled={gstSaving || !isValidGstin(pendingGstin)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50 transition-all"
                >
                  {gstSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {gstSaving ? "Saving…" : "Save & Enable Delivery"}
                </button>
                <button
                  type="button"
                  onClick={cancelGstFlow}
                  disabled={gstSaving}
                  className="inline-flex items-center rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* GST summary row — delivery is ON and no active edit */}
          {onlineDelivery && gstFlowMode === null && (
            <div className="border-t border-outline-variant/20 px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Receipt className="h-4 w-4 text-on-surface-variant shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">GST Number</p>
                  {isValidGstin(form.gstin) ? (
                    <p className="text-sm font-mono font-semibold text-on-surface tracking-widest truncate">
                      {form.gstin.toUpperCase()}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700 font-medium">Missing — add your GSTIN</p>
                  )}
                </div>
                {isValidGstin(form.gstin) ? (
                  <span className="shrink-0 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✓ Registered</span>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> Incomplete
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setPendingGstin(form.gstin || ""); setGstFlowMode("update"); setGstInputError(null); }}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Pencil className="h-3 w-3" /> {form.gstin ? "Update" : "Add"}
              </button>
            </div>
          )}

          {/* GST update panel — delivery is ON, user clicked Update */}
          {gstFlowMode === "update" && (
            <div className="border-t border-outline-variant/20 bg-surface-container-low/40 px-5 pb-5 pt-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm font-semibold text-on-surface">Update GST Number</p>
              </div>
              <p className="text-xs text-on-surface-variant">
                GST Number cannot be removed while Online Delivery is active.
              </p>
              <div className="flex flex-col gap-1.5">
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={pendingGstin}
                    onChange={(e) => { setPendingGstin(e.target.value.toUpperCase()); setGstInputError(null); }}
                    maxLength={15}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    className={`w-full rounded-xl border bg-white px-3 py-2.5 font-mono text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 pr-9 ${
                      pendingGstin
                        ? isValidGstin(pendingGstin)
                          ? "border-green-400 focus:border-green-500"
                          : "border-red-300 focus:border-red-400"
                        : "border-outline-variant/40 focus:border-primary"
                    }`}
                  />
                  {pendingGstin && (
                    <span className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${
                      isValidGstin(pendingGstin) ? "text-green-500" : "text-red-400"
                    }`}>
                      {isValidGstin(pendingGstin) ? "✓" : "✕"}
                    </span>
                  )}
                </div>
                {gstInputError && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> {gstInputError}
                  </p>
                )}
                {isValidGstin(pendingGstin) && (
                  <p className="text-xs text-green-700 font-medium">Valid GST Number ✓</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleUpdateGst}
                  disabled={gstSaving || !isValidGstin(pendingGstin)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50 transition-all"
                >
                  {gstSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {gstSaving ? "Saving…" : "Save GST Number"}
                </button>
                <button
                  type="button"
                  onClick={cancelGstFlow}
                  disabled={gstSaving}
                  className="inline-flex items-center rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Upgrade to Manufacturer — retailers only */}
        {userRole === "retailer" && (
          <section className="mb-6 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-ambient">
            <h2 className="mb-1 text-sm font-semibold text-on-surface flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Upgrade to Manufacturer
            </h2>
            <p className="mb-4 text-xs text-on-surface-variant">
              Distribute your own products to retailers across the network. This uses one of your seats.
            </p>
            {totalSeats > 0 ? (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  {totalSeats} seat{totalSeats !== 1 ? "s" : ""} available — upgrade is free
                </div>
                <input type="text" value={upgradeBusinessName} onChange={(e) => setUpgradeBusinessName(e.target.value)}
                  placeholder="Business / Brand name"
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
                <button type="button" onClick={handleUpgradeToManufacturer} disabled={upgrading || !upgradeBusinessName.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60">
                  {upgrading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                  {upgrading ? "Upgrading…" : "Upgrade to Manufacturer"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-on-surface-variant bg-surface-container rounded-xl px-4 py-3">
                  You have no seats. Purchase a plan first to unlock the upgrade.
                </p>
                <button type="button" onClick={() => router.push("/dashboard/upgrade")}
                  className="inline-flex items-center gap-2 rounded-xl border border-primary bg-white px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors">
                  Buy seats to upgrade
                </button>
              </div>
            )}
          </section>
        )}

        {/* Products grid — manufacturers */}
        {userRole === "manufacturer" && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-on-surface">
              {t('yourProductsHeading')}{products.length > 0 ? ` · ${products.length}` : ""}
            </h2>
            {products.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-12 text-center">
                <p className="text-sm text-on-surface-variant">{t('noActiveProducts')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {products.map((p) => <ProductCard key={p.productId} product={p} />)}
              </div>
            )}
          </section>
        )}

        {/* Danger zone — hidden while an admin is viewing another user's dashboard */}
        {!isAdminView && (
          <section className="mt-8 rounded-2xl border border-red-200 bg-white p-5 shadow-ambient">
            <h2 className="mb-1 text-sm font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Delete Account
            </h2>
            <p className="mb-4 text-xs text-on-surface-variant">
              Permanently deletes your profile, listings, subscriptions, reels, reviews, and other account
              data. Past orders and payments are kept for records. This cannot be undone.
            </p>
            <button type="button" onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors">
              Delete My Account
            </button>
          </section>
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl md:p-8">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-red-600" />
                <h3 className="text-xl font-bold text-on-surface">Delete Account</h3>
              </div>
              <p className="mb-4 text-sm text-on-surface-variant">
                This will permanently delete your account and cannot be undone. Type DELETE below to confirm.
              </p>
              <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE" disabled={deletingAccount}
                className="mb-4 w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
              {deleteError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {deleteError}
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" disabled={deletingAccount}
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); setDeleteError(null); }}
                  className="flex-1 rounded-xl bg-surface-container-low px-5 py-3 font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60">
                  Cancel
                </button>
                <button type="button" onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || deletingAccount}
                  className="flex-1 rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40">
                  {deletingAccount ? "Deleting…" : "Confirm Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title={t('editProfileTitle')} description={t('editProfileDesc')} helperKey="dashProfile" />
        <button type="button" onClick={() => setEditMode(false)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container">
          <X className="h-4 w-4" /> {t('cancelBtn')}
        </button>
      </div>

      <StatusToast message={status?.message ?? null} type={status?.type} onDismiss={() => setStatus(null)} autoClose={status?.type === "error" ? 0 : 3500} />

      {/* Hidden file inputs */}
      <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }} />
      <input ref={bannerFileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBannerFile(f); }} />

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-ambient md:p-6">
        <form className="flex flex-col gap-6" onSubmit={handleSave}>

          {/* ── Basic info ─────────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{t('basicInfoHeading')}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">{t('businessNameLabel')}</span>
                <input required value={form.businessName} onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
                  className={inputCls} placeholder={userRole === "retailer" ? t('businessNamePlaceholderRetailer') : t('businessNamePlaceholderMfg')} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">{t('ownerNameLabel')}</span>
                <input required value={form.ownerName} onChange={(e) => setForm((p) => ({ ...p, ownerName: e.target.value }))}
                  className={inputCls} placeholder={t('ownerNamePlaceholder')} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">{t('phoneLabelDash')}</span>
                <input required type="tel" inputMode="numeric" maxLength={10}
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                  className={inputCls} placeholder="10-digit mobile number" />
                {form.phone.length > 0 && form.phone.length < 10 && (
                  <p className="text-xs text-red-600">Enter exactly 10 digits ({form.phone.length}/10)</p>
                )}
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">
                  Secondary Mobile
                  <span className="ml-1 font-normal text-on-surface-variant text-xs">(optional)</span>
                </span>
                <input type="tel" inputMode="numeric" maxLength={10}
                  value={form.secondaryPhone}
                  onChange={(e) => setForm((p) => ({ ...p, secondaryPhone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                  className={inputCls} placeholder="10-digit mobile number" />
                {form.secondaryPhone.length > 0 && form.secondaryPhone.length < 10 && (
                  <p className="text-xs text-red-600">Enter exactly 10 digits ({form.secondaryPhone.length}/10)</p>
                )}
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">
                  {t('emailLabel')}
                  <span className="ml-1 font-normal text-on-surface-variant text-xs">{t('emailOptionalNote')}</span>
                </span>
                <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className={inputCls} placeholder={t('emailPlaceholder')} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">
                  {t('gstinLabel')}
                  <span className="ml-1 font-normal text-on-surface-variant text-xs">(required for Online Delivery)</span>
                </span>
                <div className="relative">
                  <input ref={gstinInputRef} type="text" value={form.gstin ?? ""}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setForm((p) => ({ ...p, gstin: val }));
                      if (isValidGstin(val)) setGstInputError(null);
                    }}
                    className={`${inputCls} pr-8 ${
                      form.gstin
                        ? isValidGstin(form.gstin)
                          ? "border-green-400 focus:border-green-500"
                          : "border-red-300 focus:border-red-400"
                        : ""
                    }`}
                    placeholder="e.g. 27AAAAA0000A1Z5" maxLength={15} />
                  {form.gstin && (
                    <span className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm font-bold ${
                      isValidGstin(form.gstin) ? "text-green-500" : "text-red-400"
                    }`}>
                      {isValidGstin(form.gstin) ? "✓" : "✕"}
                    </span>
                  )}
                </div>
                {form.gstin && !isValidGstin(form.gstin) && (
                  <p className="text-xs text-red-500">Invalid GST format — must be 15 characters (e.g. 27AAAAA0000A1Z5).</p>
                )}
                {form.gstin && isValidGstin(form.gstin) && (
                  <p className="text-xs text-green-600">Valid GST Number — Online Delivery can be enabled.</p>
                )}
              </label>
            </div>
          </section>

          {/* ── Location ───────────────────────────────────────────────────── */}
          <section className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 md:p-5">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <h3 className="text-xs font-black uppercase tracking-wider text-primary">{t('locationHeading')}</h3>
              <span className="ml-auto shrink-0 text-[10px] font-semibold text-primary/70 bg-primary/10 px-2 py-0.5 rounded-full">Required</span>
            </div>
            <p className="mb-4 text-xs text-on-surface-variant leading-relaxed">
              Your physical business location — used to pin your store on the map and connect you with nearby customers.
            </p>
            <div className="flex rounded-xl border border-primary/20 bg-white p-1 gap-1 mb-5">
              <button type="button" onClick={() => { setLocationMethod("search"); setMapLinkError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${locationMethod === "search" ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
                <MapPin className="h-3.5 w-3.5 shrink-0" /> Search Place
              </button>
              <button type="button" onClick={() => { setLocationMethod("link"); setMapsError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${locationMethod === "link" ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" /> Paste Maps Link
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {locationMethod === "search" && (
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">
                    Search your business or place
                    <span className="ml-1.5 font-normal text-on-surface-variant text-xs">— auto-fills city, state, pincode &amp; sets pin</span>
                  </span>
                  <input ref={addressInputRef} autoComplete="off" defaultValue={form.line1}
                    className={`${inputCls} bg-white`} placeholder="e.g. Sharma Agro Centre, Nagpur…" />
                  {mapsError && <p className="text-xs text-red-500 mt-0.5">{mapsError}</p>}
                </div>
              )}
              {locationMethod === "link" && (
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">
                    Paste a Google Maps link
                    <span className="ml-1.5 font-normal text-on-surface-variant text-xs">— extracts coordinates &amp; sets pin</span>
                  </span>
                  <div className="flex gap-2">
                    <input type="url" value={mapLinkInput}
                      onChange={(e) => { setMapLinkInput(e.target.value); setMapLinkError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleResolveMapLink(); } }}
                      className={`${inputCls} bg-white flex-1`} placeholder="https://maps.app.goo.gl/…" />
                    <button type="button" onClick={handleResolveMapLink} disabled={resolvingMapLink || !mapLinkInput.trim()}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                      {resolvingMapLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />} Set Pin
                    </button>
                  </div>
                  {mapLinkError && <p className="text-xs text-red-500 mt-0.5">{mapLinkError}</p>}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-primary/10">
                <button type="button" onClick={handleUseCurrentLocation} disabled={locating}
                  className="inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-white px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-60 transition-colors">
                  {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                  {t('useCurrentLocation')}
                </button>
                {geo && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">
                    <MapPin className="h-3 w-3" /> Location pinned
                  </span>
                )}
              </div>
              <div className="grid gap-3 grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">{t('cityLabel')}</span>
                  <input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                    className={`${inputCls} bg-white`} placeholder={t('cityPlaceholder')} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">{t('stateLabel')}</span>
                  <input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                    className={`${inputCls} bg-white`} placeholder={t('statePlaceholder')} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">{t('pincodeLabel')}</span>
                  <input value={form.pincode} onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))}
                    className={`${inputCls} bg-white`} placeholder={t('pincodePlaceholder')} />
                </label>
              </div>
              {geo && (
                <div className="overflow-hidden rounded-xl border border-primary/20">
                  <iframe title="Location preview" src={mapUrl} className="h-44 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div>
              )}
            </div>
          </section>

          {/* ── Logo & Banner ──────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Logo &amp; Banner</h3>
            <p className="mb-4 text-xs text-on-surface-variant">Click to upload an image. Tap again to replace.</p>
            <div className="grid gap-6 md:grid-cols-2">

              {/* Logo */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-on-surface">Profile Logo</span>
                <div
                  className="group relative h-24 w-24 rounded-full border-2 border-dashed border-outline-variant/40 bg-surface-container cursor-pointer hover:border-primary overflow-hidden flex items-center justify-center"
                  onClick={() => logoFileRef.current?.click()}
                >
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="Logo" className="h-full w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <Camera className="h-8 w-8 text-on-surface-variant/40" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors rounded-full">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploadingLogo ? <Loader2 className="h-6 w-6 text-white animate-spin" /> : <Upload className="h-6 w-6 text-white" />}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  {uploadingLogo ? "Uploading…" : form.logoUrl ? "Click to replace" : "Click to upload"}
                </p>
              </div>

              {/* Banner */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-on-surface">Banner Image</span>
                <div
                  className="group relative h-24 w-full rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container cursor-pointer hover:border-primary overflow-hidden flex items-center justify-center"
                  onClick={() => bannerFileRef.current?.click()}
                >
                  {form.bannerUrl ? (
                    <img src={form.bannerUrl} alt="Banner" className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <Camera className="h-8 w-8 text-on-surface-variant/40" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploadingBanner ? <Loader2 className="h-6 w-6 text-white animate-spin" /> : <Upload className="h-6 w-6 text-white" />}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  {uploadingBanner ? "Uploading…" : form.bannerUrl ? "Click to replace" : "Click to upload"}
                </p>
              </div>
            </div>
          </section>

          {/* ── Website ────────────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Website</h3>
            <label className="flex flex-col gap-1.5 text-sm max-w-sm">
              <span className="font-medium text-on-surface flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Website URL <span className="font-normal text-on-surface-variant text-xs">(optional)</span>
              </span>
              <input type="url" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                className={inputCls} placeholder="https://yoursite.com" />
            </label>
          </section>

          {/* ── Social links ───────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{t('socialLinksHeading')}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {([
                { key: "instagram", icon: Instagram,     label: "Instagram", placeholder: "instagram.com/yourpage" },
                { key: "facebook",  icon: Facebook,      label: "Facebook",  placeholder: "facebook.com/yourpage" },
                { key: "whatsapp",  icon: MessageCircle, label: "WhatsApp",  placeholder: "+91 98765 43210" },
                { key: "youtube",   icon: Youtube,       label: "YouTube",   placeholder: "youtube.com/@channel" },
              ] as const).map(({ key, icon: Icon, label, placeholder }) => (
                <label key={key} className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </span>
                  <input type="text" value={social[key]}
                    onChange={(e) => setSocial((p) => ({ ...p, [key]: e.target.value }))}
                    className={inputCls} placeholder={placeholder} />
                </label>
              ))}
            </div>
          </section>

          {/* ── Online Delivery toggle (edit mode) ───────────────────────────── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Delivery Settings</h3>
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-on-surface-variant" />
                <span className="text-sm font-medium text-on-surface">{t('onlineDelivery')}</span>
                <HelperIcon size="xs" variant="ghost" side="right" textKey="dashSettings" ariaLabel="Online delivery help" />
              </div>
              <p className="text-xs text-on-surface-variant">{t('onlineDeliveryDesc')}</p>
              <label className="flex items-center gap-3 cursor-pointer w-fit">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={onlineDelivery}
                    onChange={(e) => {
                      const enabling = e.target.checked;
                      if (enabling && !isValidGstin(form.gstin)) {
                        setGstInputError("A valid GST Number is required to enable Online Delivery.");
                        return;
                      }
                      setGstInputError(null);
                      setOnlineDelivery(enabling);
                    }}
                  />
                  <div className={`h-6 w-11 rounded-full transition-colors ${onlineDelivery ? "bg-primary" : "bg-surface-container-highest"}`} />
                  <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${onlineDelivery ? "translate-x-5" : ""}`} />
                </div>
                <span className="text-sm font-medium text-on-surface">{onlineDelivery ? t('enabledLabel') : t('disabledLabel')}</span>
              </label>
              {gstInputError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    {gstInputError}{" "}
                    <button type="button"
                      onClick={() => {
                        gstinInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        gstinInputRef.current?.focus();
                      }}
                      className="font-semibold underline hover:no-underline">
                      Add GST Number
                    </button>
                  </span>
                </div>
              )}
            </div>
          </section>

          <div className="pt-2 border-t border-outline-variant/20">
            <button type="submit" disabled={saving || uploadingLogo || uploadingBanner}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-70">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? t('savingProfile') : t('saveProfileBtn')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfilePageInner />
    </Suspense>
  );
}
