"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoPoint, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Instagram, Facebook, Youtube, MessageCircle, Loader2, LocateFixed, MapPin, Save, Pencil, Settings, Truck, X, TrendingUp, ExternalLink, Building2, Globe, Image as ImageIcon } from "lucide-react";
import { auth, db, requestRoleUpgrade } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import { HelperIcon } from "../../../components/helpers";
import {
  fetchDashboardUserRole,
  loadProfileState,
  resolveManufacturerDocId,
  saveManufacturerProfile,
  saveRetailerProfile,
  type DashboardProfileRole,
  type ProfileFormValues,
  type RetailerProfileExtras,
} from "../_lib/profile-persistence";
import { useI18n } from "../../i18n/I18nContext";
import { StatusToast } from "../../components/shared/status-toast";
import { fetchManufacturerCatalogueRows } from "../_lib/inventory-firestore";
import type { ManufacturerProductRow } from "../_types/inventory";

declare global { interface Window { google?: any; } }

const initialForm: ProfileFormValues = {
  businessName: "", ownerName: "", phone: "", secondaryPhone: "", email: "",
  line1: "", city: "", state: "", pincode: "",
  website: "", logoUrl: "", bannerUrl: "",
};

type SocialLinks = {
  instagram: string;
  facebook:  string;
  whatsapp:  string;
  youtube:   string;
};

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

function SocialBadge({ href, icon: Icon, label, colorClass }: { href: string; icon: any; label: string; colorClass: string }) {
  if (!href) return null;
  const url = href.startsWith("http") ? href : `https://${href}`;
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
          // eslint-disable-next-line @next/next/no-img-element
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

type ActiveTab = "profile" | "settings";

function ProfilePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab,  setActiveTab] = useState<ActiveTab>(
    searchParams?.get("tab") === "settings" ? "settings" : "profile",
  );
  const [uid,       setUid]       = useState<string | null>(null);
  const [mfrDocId,  setMfrDocId]  = useState<string | null>(null); // phone-based doc ID for manufacturers
  const [userRole,  setUserRole]  = useState<DashboardProfileRole | null>(null);
  const [form,      setForm]      = useState<ProfileFormValues>(initialForm);
  const [social,    setSocial]    = useState<SocialLinks>(emptySocial);
  const [geo,       setGeo]       = useState<GeoPoint | null>(null);
  const [retailerExtras,         setRetailerExtras]         = useState<RetailerProfileExtras | null>(null);
  const [manufacturerCreatedAt,  setManufacturerCreatedAt]  = useState<unknown | null>(null);
  const [products,  setProducts]  = useState<ManufacturerProductRow[]>([]);
  const [onlineDelivery, setOnlineDelivery] = useState(false);
  const [tagline,        setTagline]        = useState("");
  const [totalSeats,     setTotalSeats]     = useState(0);

  const [slug,      setSlug]      = useState<string>("");
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [locating,  setLocating]  = useState(false);
  const [editMode,  setEditMode]  = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [status,    setStatus]    = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [mapLinkInput,     setMapLinkInput]     = useState("");
  const [resolvingMapLink, setResolvingMapLink] = useState(false);
  const [mapLinkError,     setMapLinkError]     = useState<string | null>(null);
  const [locationMethod,   setLocationMethod]   = useState<"search" | "link">("search");
  const [upgradeBusinessName, setUpgradeBusinessName] = useState("");
  const [upgrading, setUpgrading] = useState(false);

  const addressInputRef         = useRef<HTMLInputElement | null>(null);
  const autocompleteListenerRef = useRef<unknown>(null);

  const applyPlaceGeometry = useCallback((place: { geometry?: { location?: { lat: () => number; lng: () => number } } }) => {
    const lat = place?.geometry?.location?.lat?.();
    const lng = place?.geometry?.location?.lng?.();
    if (typeof lat === "number" && typeof lng === "number") setGeo(new GeoPoint(lat, lng));
  }, []);

  // Load social links, tagline, onlineDelivery from Firestore
  const loadSocial = useCallback(async (userId: string, role: DashboardProfileRole) => {
    try {
      const col = role === "manufacturer" ? "manufacturers" : "retailers";

      // For manufacturers: resolve phone-based doc ID (new schema), fall back to uid
      let docId = userId;
      if (role === "manufacturer") {
        const resolved = await resolveManufacturerDocId(userId);
        docId = resolved;
        setMfrDocId(resolved !== userId ? resolved : null);
      }

      let snap = await getDoc(doc(db, col, docId));
      // Fallback for manufacturers: try uid-keyed legacy doc
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
      // onlineDelivery and totalSeats live on users/{phone} (new schema) — resolve via uidIndex
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
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setUid(user.uid);
      setLoading(true);
      setStatus(null);
      try {
        const role = await fetchDashboardUserRole(user.uid);
        setUserRole(role);
        if (!role) return;

        const [loaded] = await Promise.all([
          loadProfileState(user.uid, role, user.email),
          loadSocial(user.uid, role),
        ]);
        setForm(loaded.form);
        setGeo(loaded.geo);
        setRetailerExtras(loaded.retailerExtras);
        setManufacturerCreatedAt(loaded.manufacturerCreatedAt);

        // Fetch products for manufacturer profile grid
        if (role === "manufacturer") {
          try {
            const prods = await fetchManufacturerCatalogueRows(user.uid);
            setProducts(prods.filter((p) => p.isActive));
          } catch { /* non-critical */ }
        }
      } catch (err) {
        setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to load profile." });
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [loadSocial]);

  // Google Maps Autocomplete (only in edit mode)
  useEffect(() => {
    if (!editMode || !uid || !userRole) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) { setMapsError("Google Maps key not configured."); return; }

    const setupAutocomplete = () => {
      if (!addressInputRef.current || !window.google?.maps?.places) return;
      if (autocompleteListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(autocompleteListenerRef.current);
      autocompleteListenerRef.current = null;
      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["name", "formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });
      const listener = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place) return;
        const addressFields = extractAddressFields(place as any);
        // Set the uncontrolled input value imperatively so the user sees the selection
        if (addressInputRef.current && addressFields.line1)
          addressInputRef.current.value = addressFields.line1;
        setForm((p) => ({ ...p, ...addressFields }));
        applyPlaceGeometry(place);
      });
      autocompleteListenerRef.current = listener;
    };

    const scriptId = "google-maps-places-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const runWhenReady = () => requestAnimationFrame(() => setupAutocomplete());

    if (window.google?.maps?.places) { runWhenReady(); }
    else if (existing) {
      if (existing.dataset.loaded === "true") runWhenReady();
      else existing.addEventListener("load", runWhenReady, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true; script.defer = true;
      script.onload = () => { script.dataset.loaded = "true"; runWhenReady(); };
      script.onerror = () => setMapsError("Unable to load Google Maps.");
      document.head.appendChild(script);
    }

    return () => {
      if (autocompleteListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(autocompleteListenerRef.current);
      autocompleteListenerRef.current = null;
    };
  }, [editMode, uid, userRole, applyPlaceGeometry]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) { setStatus({ type: "error", message: "Geolocation not supported." }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setGeo(new GeoPoint(lat, lng));
        if (window.google?.maps?.Geocoder)
          new window.google.maps.Geocoder().geocode({ location: { lat, lng } }, (results: any, status: string) => {
            if (status === "OK" && results?.[0]) setForm((p) => ({ ...p, ...extractAddressFields(results[0]) }));
          });
        setLocating(false);
      },
      (err) => { setLocating(false); setStatus({ type: "error", message: err.message || "Unable to access location." }); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleResolveMapLink = async () => {
    const url = mapLinkInput.trim();
    if (!url) return;
    setResolvingMapLink(true);
    setMapLinkError(null);
    try {
      const res = await fetch(`/api/resolve-maps-url?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.lat && data.lng) {
        const resolved = new GeoPoint(data.lat, data.lng);
        setGeo(resolved);
        // Reverse-geocode to fill city/state/pincode if available
        if (window.google?.maps?.Geocoder) {
          new window.google.maps.Geocoder().geocode(
            { location: { lat: data.lat, lng: data.lng } },
            (results: any, status: string) => {
              if (status === "OK" && results?.[0]) {
                setForm((p) => ({ ...p, ...extractAddressFields(results[0]) }));
              }
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

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uid || !userRole) return;
    // Capture the uncontrolled address input's current DOM value before saving
    const currentLine1 = addressInputRef.current?.value?.trim() || form.line1;
    const formToSave = { ...form, line1: currentLine1 };
    // Allow saving with just city/state typed manually — geo is resolved later if available
    setSaving(true); setStatus(null);
    let resolvedGeo = geo;
    if (!resolvedGeo && (formToSave.city || formToSave.state)) {
      // Geocode from city + state if no geo has been set yet
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
      } catch { /* non-critical — save without geo */ }
    }
    try {
      const col = userRole === "manufacturer" ? "manufacturers" : "retailers";
      // For manufacturers use phone-based doc ID; for retailers fall back to uid
      const profileDocId = (userRole === "manufacturer" && mfrDocId) ? mfrDocId : uid!;
      // Save social links alongside profile
      await setDoc(doc(db, col, profileDocId), { socialLinks: social, updatedAt: serverTimestamp() }, { merge: true });

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

  const { t } = useI18n();
  const pageDescription =
    userRole === "manufacturer"
      ? t('profileDescMfg')
      : userRole === "retailer"
        ? t('profileDescRetailer')
        : t('profileDescGeneral');
  const inputCls = "rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary/30 focus:ring-2 w-full text-sm";

  if (loading) return (
    <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-on-surface-variant">
      <Loader2 className="h-5 w-5 animate-spin" /> {t('loadingProfile')}
    </div>
  );

  const handleUpgradeToManufacturer = async () => {
    if (!uid) return;
    if (totalSeats <= 0) {
      router.push("/dashboard/upgrade");
      return;
    }
    if (!upgradeBusinessName.trim()) {
      setStatus({ type: "error", message: "Please enter your business / brand name." });
      return;
    }
    setUpgrading(true);
    setStatus(null);
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

  const handleOnlineDeliveryToggle = async () => {
    if (!uid || !userRole) return;
    const newValue = !onlineDelivery;
    setOnlineDelivery(newValue);
    try {
      const idxSnap = await getDoc(doc(db, "uidIndex", uid));
      const phone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") : "";
      const col = userRole === "manufacturer" ? "manufacturers" : "retailers";
      const profileDocId = (userRole === "manufacturer" && mfrDocId) ? mfrDocId : (phone || uid!);
      await setDoc(doc(db, col, profileDocId), { onlineDelivery: newValue, updatedAt: serverTimestamp() }, { merge: true });
      const userTarget = phone ? doc(db, "users", phone) : doc(db, "users", uid);
      await setDoc(userTarget, { onlineDelivery: newValue, updatedAt: serverTimestamp() }, { merge: true });
    } catch {
      setOnlineDelivery(!newValue); // revert on error
    }
  };

  const handleSettingsSave = async () => {
    if (!uid || !userRole) return;
    setSettingsSaving(true);
    setStatus(null);
    try {
      // Resolve phone first so we can key public docs by phone (publicly readable)
      const idxSnap = await getDoc(doc(db, "uidIndex", uid));
      const phone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") : "";

      const col = userRole === "manufacturer" ? "manufacturers" : "retailers";
      // Manufacturers: use phone-based mfrDocId; Retailers: use phone (publicly readable, matches fetchStoreOnlineDelivery)
      const profileDocId = (userRole === "manufacturer" && mfrDocId) ? mfrDocId : (phone || uid!);
      await setDoc(doc(db, col, profileDocId), { tagline, onlineDelivery, updatedAt: serverTimestamp() }, { merge: true });

      // Also write to users/{phone} (private schema)
      const userTarget = phone ? doc(db, "users", phone) : doc(db, "users", uid);
      await setDoc(userTarget, { onlineDelivery, updatedAt: serverTimestamp() }, { merge: true });

      setStatus({ type: "success", message: "Settings saved." });
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to save settings." });
    } finally {
      setSettingsSaving(false);
    }
  };

  // ── Tab bar ─────────────────────────────────────────────────────────────────
  const TabBar = () => (
    <div className="mb-6 flex gap-1 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-1 w-fit">
      {([["profile", t('profileTab')] as const, ["settings", t('settingsTab')] as const]).map(([tab, label]) => (
        <button key={tab} type="button" onClick={() => { setActiveTab(tab); setEditMode(false); setStatus(null); }}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === tab ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"
          }`}>
          {tab === "settings" ? <Settings className="h-3.5 w-3.5" /> : null}
          {label}
        </button>
      ))}
    </div>
  );

  // ── View mode ──────────────────────────────────────────────────────────────
  if (!editMode && !loading) {
    if (activeTab === "settings") {
      return (
        <>
          <TabBar />
          <StatusToast
            message={status?.message ?? null}
            type={status?.type}
            onDismiss={() => setStatus(null)}
            autoClose={status?.type === "error" ? 0 : 3500}
          />
          <div className="space-y-6">
            {/* Online delivery toggle */}
            <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-ambient">
              <h2 className="mb-1 text-sm font-semibold text-on-surface flex items-center gap-2">
                <Truck className="h-4 w-4" /> {t('onlineDelivery')}
                <HelperIcon
                  size="xs"
                  variant="ghost"
                  side="right"
                  textKey="dashSettings"
                  ariaLabel={`${t('settingsTab')} help`}
                />
              </h2>
              <p className="mb-4 text-xs text-on-surface-variant">{t('onlineDeliveryDesc')}</p>
              <label className="flex items-center gap-3 cursor-pointer w-fit">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={onlineDelivery}
                    onChange={(e) => setOnlineDelivery(e.target.checked)} />
                  <div className={`h-6 w-11 rounded-full transition-colors ${onlineDelivery ? "bg-primary" : "bg-surface-container-highest"}`} />
                  <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${onlineDelivery ? "translate-x-5" : ""}`} />
                </div>
                <span className="text-sm font-medium text-on-surface">{onlineDelivery ? t('enabledLabel') : t('disabledLabel')}</span>
              </label>
            </section>

            {/* Tagline */}
            <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-ambient">
              <h2 className="mb-1 text-sm font-semibold text-on-surface">{t('shopTagline')}</h2>
              <p className="mb-3 text-xs text-on-surface-variant">{t('shopTaglineDesc')}</p>
              <input type="text" value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                placeholder={t('shopTaglinePlaceholder')} maxLength={80} />
            </section>

            <button type="button" onClick={handleSettingsSave} disabled={settingsSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-70">
              {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {settingsSaving ? t('savingText') : t('saveSettingsBtn')}
            </button>

            {/* Upgrade to Manufacturer — only for retailers */}
            {userRole === "retailer" && (
              <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-ambient">
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
                    <input
                      type="text"
                      value={upgradeBusinessName}
                      onChange={(e) => setUpgradeBusinessName(e.target.value)}
                      placeholder="Business / Brand name"
                      className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                    />
                    <button
                      type="button"
                      onClick={handleUpgradeToManufacturer}
                      disabled={upgrading || !upgradeBusinessName.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
                    >
                      {upgrading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                      {upgrading ? "Upgrading…" : "Upgrade to Manufacturer"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-on-surface-variant bg-surface-container rounded-xl px-4 py-3">
                      You have no seats. Purchase a plan first to unlock the upgrade.
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/dashboard/upgrade")}
                      className="inline-flex items-center gap-2 rounded-xl border border-primary bg-white px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
                    >
                      Buy seats to upgrade
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      );
    }

    return (
      <>
        <TabBar />
        <StatusToast
          message={status?.message ?? null}
          type={status?.type}
          onDismiss={() => setStatus(null)}
          autoClose={status?.type === "error" ? 0 : 3500}
        />

        {/* Profile header card */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
          {/* Cover band */}
          <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5 overflow-hidden relative">
            {form.bannerUrl && (
              <img src={form.bannerUrl} alt="Banner" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
          </div>

          <div className="px-5 pb-5">
            {/* Avatar + edit button row */}
            <div className="relative z-10 flex items-end justify-between -mt-10 mb-4">
              <div className="h-20 w-20 rounded-full border-4 border-white bg-primary flex items-center justify-center shadow-lg overflow-hidden">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="Logo" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <span className="text-xl font-bold text-white">
                    {initials(form.businessName || form.ownerName || "?")}
                  </span>
                )}
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
              {/* Online delivery quick toggle */}
              <div className="ml-auto flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />
                <span className="text-[10px] text-on-surface-variant">{t('onlineDelivery')}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={onlineDelivery}
                  onClick={handleOnlineDeliveryToggle}
                  className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none"
                  style={{ backgroundColor: onlineDelivery ? "var(--color-primary)" : "var(--color-surface-container-highest)" }}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${onlineDelivery ? "translate-x-4" : ""}`} />
                </button>
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

        {/* Company Page section — manufacturers only */}
        {userRole === "manufacturer" && (
          <section className="mb-6 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-ambient">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Company Page
              </h2>
              {slug && (
                <a
                  href={`/brand/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> View live
                </a>
              )}
            </div>
            <p className="mb-4 text-xs text-on-surface-variant">
              Your public brand page. Customize it with a tagline, about section, products, videos, and more.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/company"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Brand Page
              </Link>
              {slug && (
                <a
                  href={`/brand/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-4 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View Brand Page
                </a>
              )}
              {!slug && (
                <p className="text-xs text-on-surface-variant italic">
                  Save your profile once to generate your brand page URL.
                </p>
              )}
            </div>
          </section>
        )}

        {/* Products grid */}
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
      </>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  return (
    <>
      <TabBar />
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title={t('editProfileTitle')} description={t('editProfileDesc')} helperKey="dashProfile" />
        <button type="button" onClick={() => setEditMode(false)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container">
          <X className="h-4 w-4" /> {t('cancelBtn')}
        </button>
      </div>

      <StatusToast
        message={status?.message ?? null}
        type={status?.type}
        onDismiss={() => setStatus(null)}
        autoClose={status?.type === "error" ? 0 : 3500}
      />

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
                <input required type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className={inputCls} placeholder={t('phonePlaceholder')} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">
                  Secondary Mobile
                  <span className="ml-1 font-normal text-on-surface-variant text-xs">(optional)</span>
                </span>
                <input type="tel" value={form.secondaryPhone} onChange={(e) => setForm((p) => ({ ...p, secondaryPhone: e.target.value }))}
                  className={inputCls} placeholder="+91 98765 43210" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">
                  {t('emailLabel')}
                  <span className="ml-1 font-normal text-on-surface-variant text-xs">{t('emailOptionalNote')}</span>
                </span>
                <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className={inputCls} placeholder={t('emailPlaceholder')} />
              </label>
            </div>
          </section>

          {/* ── Location (primary identity field) ──────────────────────────── */}
          <section className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 md:p-5">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <h3 className="text-xs font-black uppercase tracking-wider text-primary">{t('locationHeading')}</h3>
              <span className="ml-auto shrink-0 text-[10px] font-semibold text-primary/70 bg-primary/10 px-2 py-0.5 rounded-full">Required</span>
            </div>
            <p className="mb-4 text-xs text-on-surface-variant leading-relaxed">
              Your physical business location — used to pin your store on the map and connect you with nearby customers.
            </p>

            {/* Method toggle */}
            <div className="flex rounded-xl border border-primary/20 bg-white p-1 gap-1 mb-5">
              <button
                type="button"
                onClick={() => { setLocationMethod("search"); setMapLinkError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  locationMethod === "search"
                    ? "bg-primary text-white shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                Search Place
              </button>
              <button
                type="button"
                onClick={() => { setLocationMethod("link"); setMapsError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  locationMethod === "link"
                    ? "bg-primary text-white shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                Paste Maps Link
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Option A — Google Places Autocomplete */}
              {locationMethod === "search" && (
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">
                    Search your business or place
                    <span className="ml-1.5 font-normal text-on-surface-variant text-xs">— auto-fills city, state, pincode &amp; sets pin</span>
                  </span>
                  {/* Uncontrolled: Google Maps Autocomplete writes to the DOM directly.
                      A React-controlled input fights Maps for ownership and breaks dropdown selection. */}
                  <input
                    ref={addressInputRef}
                    autoComplete="off"
                    defaultValue={form.line1}
                    className={`${inputCls} bg-white`}
                    placeholder="e.g. Sharma Agro Centre, Nagpur…"
                  />
                  {mapsError && <p className="text-xs text-red-500 mt-0.5">{mapsError}</p>}
                </div>
              )}

              {/* Option B — Paste Google Maps link */}
              {locationMethod === "link" && (
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">
                    Paste a Google Maps link
                    <span className="ml-1.5 font-normal text-on-surface-variant text-xs">— extracts coordinates &amp; sets pin</span>
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={mapLinkInput}
                      onChange={(e) => { setMapLinkInput(e.target.value); setMapLinkError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleResolveMapLink(); } }}
                      className={`${inputCls} bg-white flex-1`}
                      placeholder="https://maps.app.goo.gl/…  or  https://maps.google.com/…"
                    />
                    <button
                      type="button"
                      onClick={handleResolveMapLink}
                      disabled={resolvingMapLink || !mapLinkInput.trim()}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {resolvingMapLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                      Set Pin
                    </button>
                  </div>
                  {mapLinkError && <p className="text-xs text-red-500 mt-0.5">{mapLinkError}</p>}
                </div>
              )}

              {/* Use Current Location — always available */}
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

              {/* City / State / Pincode — always editable, auto-filled after selection */}
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

              {/* Map preview */}
              {geo && (
                <div className="overflow-hidden rounded-xl border border-primary/20">
                  <iframe title="Location preview" src={mapUrl} className="h-44 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div>
              )}
            </div>
          </section>

          {/* ── Website ────────────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Website</h3>
            <label className="flex flex-col gap-1.5 text-sm max-w-sm">
              <span className="font-medium text-on-surface flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Website URL
                <span className="font-normal text-on-surface-variant text-xs">(optional)</span>
              </span>
              <input type="url" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                className={inputCls} placeholder="https://yoursite.com" />
            </label>
          </section>

          {/* ── Logo & Banner ──────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Logo &amp; Banner</h3>
            <p className="mb-3 text-xs text-on-surface-variant">These appear on your profile and brand page. Paste a public image URL.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Logo URL</span>
                <input type="url" value={form.logoUrl} onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
                  className={inputCls} placeholder="https://... or /images/logo.png" />
                {form.logoUrl && (
                  <img src={form.logoUrl} alt="Logo preview" className="mt-1 h-12 w-auto object-contain rounded-lg border border-outline-variant/20"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Banner URL</span>
                <input type="url" value={form.bannerUrl} onChange={(e) => setForm((p) => ({ ...p, bannerUrl: e.target.value }))}
                  className={inputCls} placeholder="https://... or /images/banner.jpg" />
                {form.bannerUrl && (
                  <img src={form.bannerUrl} alt="Banner preview" className="mt-1 h-16 w-full object-cover rounded-lg border border-outline-variant/20"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </label>
            </div>
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

          <div className="pt-2 border-t border-outline-variant/20">
            <button type="submit" disabled={saving}
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
