"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeoPoint } from "firebase/firestore";
import { doc, getDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  X, Save, Loader2, MapPin, LocateFixed, ExternalLink, Camera, Upload,
  Truck, Globe, Instagram, Facebook, MessageCircle, Youtube,
  AlertTriangle,
} from "lucide-react";
import {
  db, storage, auth,
  adminSaveProfile,
  adminFetchSubscriptionsByPhone,
  adminRevokeSubscription,
  adminExtendSubscription,
  adminUpdateSubscriptionSeats,
  adminActivateSubscriptionForPhone,
  type AdminSaveProfileInput,
} from "../../firebase";
import { isValidGstinFormat } from "../../dashboard/_lib/profile-persistence";

declare global { interface Window { google?: any } }

const ROLE_BADGE: Record<string, string> = {
  admin:        "bg-red-100 text-red-700",
  manufacturer: "bg-blue-100 text-blue-700",
  retailer:     "bg-green-100 text-green-700",
  consumer:     "bg-gray-100 text-gray-600",
  customer:     "bg-gray-100 text-gray-600",
};

type Social = { instagram: string; facebook: string; whatsapp: string; youtube: string };
type ProfileForm = {
  businessName: string; ownerName: string; email: string;
  secondaryPhone: string; gstin: string;
  line1: string; city: string; state: string; pincode: string;
  website: string; logoUrl: string; bannerUrl: string;
};

function extractAddressFields(place: any): Partial<ProfileForm> {
  const out: Partial<ProfileForm> = {};
  const parts: { long_name: string; types: string[] }[] = place?.address_components || [];
  const cityPriority = ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_2"];
  for (const want of cityPriority) {
    const m = parts.find(p => p.types.includes(want));
    if (m) { out.city = m.long_name; break; }
  }
  const st = parts.find(p => p.types.includes("administrative_area_level_1"));
  if (st) out.state = st.long_name;
  const pin = parts.find(p => p.types.includes("postal_code"));
  if (pin) out.pincode = pin.long_name;
  if (place?.formatted_address) out.line1 = place.formatted_address;
  return out;
}

async function uploadImage(file: File, prefix: string): Promise<string> {
  const path = `${prefix}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const snap = await uploadBytes(storageRef(storage, path), file);
  return getDownloadURL(snap.ref);
}

function isSubExpired(sub: any): boolean {
  return !sub?.expiryDate?.toDate || sub.expiryDate.toDate() < new Date();
}

function fmtDate(ts: any): string {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export interface AdminUserEditPanelProps {
  user: any;
  onClose: () => void;
  onSaved: () => void;
}

export function AdminUserEditPanel({ user, onClose, onSaved }: AdminUserEditPanelProps) {
  const phone    = String(user.phone || (/^\+?\d{10,13}$/.test(user.id) ? user.id : "")).trim();
  const role     = String(user.role || "consumer").toLowerCase();
  const isSeller = role === "retailer" || role === "manufacturer";

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState<ProfileForm>({
    businessName:   user.shopName || user.businessName || user.name || "",
    ownerName:      user.name      || "",
    email:          user.email     || "",
    secondaryPhone: user.secondaryPhone || "",
    gstin:          user.gstin     || "",
    line1:          user.address   || "",
    city:           user.city      || "",
    state:          user.state     || "",
    pincode:        user.pincode   || "",
    website:        user.website   || "",
    logoUrl:        user.logoUrl   || "",
    bannerUrl:      user.bannerUrl || "",
  });
  const [social, setSocial] = useState<Social>({
    instagram: user.socialLinks?.instagram || "",
    facebook:  user.socialLinks?.facebook  || "",
    whatsapp:  user.socialLinks?.whatsapp  || "",
    youtube:   user.socialLinks?.youtube   || "",
  });
  const [geo, setGeo]               = useState<GeoPoint | null>(
    user.latitude && user.longitude ? new GeoPoint(user.latitude, user.longitude) : null,
  );
  const [onlineDelivery, setOnlineDelivery] = useState(!!user.onlineDelivery);
  const [gstOdError,     setGstOdError]     = useState<string | null>(null);

  // ── Maps ────────────────────────────────────────────────────────────────────
  const [locationMethod, setLocationMethod] = useState<"search" | "link">("search");
  const [mapLinkInput,   setMapLinkInput]   = useState("");
  const [resolvingLink,  setResolvingLink]  = useState(false);
  const [linkError,      setLinkError]      = useState<string | null>(null);
  const [locating,       setLocating]       = useState(false);
  const [mapsError,      setMapsError]      = useState<string | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const acListenerRef   = useRef<any>(null);
  const gstinInputRef   = useRef<HTMLInputElement>(null);

  // ── Image uploads ──────────────────────────────────────────────────────────
  const [uploadingLogo,   setUploadingLogo]   = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const logoFileRef   = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  // ── Profile save ───────────────────────────────────────────────────────────
  const [saving,   setSaving]  = useState(false);
  const [saveMsg,  setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Subscription ────────────────────────────────────────────────────────────
  const [subs,       setSubs]      = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subSaving,  setSubSaving]  = useState(false);
  const [subError,   setSubError]   = useState<string | null>(null);
  const [activationSeats, setActivationSeats] = useState("1");
  const [activationDur,   setActivationDur]   = useState<1|3|6|12>(12);
  const [editingSeats,    setEditingSeats]    = useState(false);
  const [newSeatsInput,   setNewSeatsInput]   = useState("");
  const [extendDur,       setExtendDur]       = useState<1|3|6|12>(3);
  const [extending,       setExtending]       = useState(false);

  // ── Load extended profile data from role collection ─────────────────────────
  useEffect(() => {
    if (!phone || !isSeller) return;
    const col = role === "manufacturer" ? "manufacturers" : "retailers";
    getDoc(doc(db, col, phone)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data() as any;
      const addr = d.address || {};
      const lat = d.geo?.latitude ?? d.latitude ?? null;
      const lng = d.geo?.longitude ?? d.longitude ?? null;
      if (lat && lng) setGeo(new GeoPoint(lat, lng));
      setForm(prev => ({
        ...prev,
        businessName:   d.businessName || d.shopName    || prev.businessName,
        ownerName:      d.ownerName                     || prev.ownerName,
        email:          d.email                         || prev.email,
        secondaryPhone: d.secondaryPhone                || prev.secondaryPhone,
        gstin:          d.gstin                         || prev.gstin,
        line1:          addr.line1 || d.address         || prev.line1,
        city:           addr.city  || d.city            || prev.city,
        state:          addr.state || d.state           || prev.state,
        pincode:        addr.pincode || d.pincode       || prev.pincode,
        website:        d.website                       || prev.website,
        logoUrl:        d.logoUrl                       || prev.logoUrl,
        bannerUrl:      d.bannerUrl                     || prev.bannerUrl,
      }));
      if (d.socialLinks) setSocial({
        instagram: d.socialLinks.instagram || "",
        facebook:  d.socialLinks.facebook  || "",
        whatsapp:  d.socialLinks.whatsapp  || "",
        youtube:   d.socialLinks.youtube   || "",
      });
      setOnlineDelivery(!!d.onlineDelivery);
    }).catch(() => { /* non-critical */ });
  }, [phone, role, isSeller]);

  // ── Load subscriptions ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!phone || !isSeller) return;
    setSubLoading(true);
    adminFetchSubscriptionsByPhone(phone)
      .then(setSubs).catch(() => setSubs([]))
      .finally(() => setSubLoading(false));
  }, [phone, isSeller]);

  // ── Google Maps autocomplete ────────────────────────────────────────────────
  useEffect(() => {
    if (!isSeller || locationMethod !== "search") return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;
    let cancelled = false;

    const setup = () => {
      if (cancelled || !addressInputRef.current || !window.google?.maps?.places) {
        if (!cancelled) setTimeout(setup, 200);
        return;
      }
      if (acListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(acListenerRef.current);
      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });
      acListenerRef.current = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place) return;
        const fields = extractAddressFields(place);
        if (addressInputRef.current && fields.line1)
          addressInputRef.current.value = fields.line1;
        setForm(p => ({ ...p, ...fields }));
        const lat = place.geometry?.location?.lat?.();
        const lng = place.geometry?.location?.lng?.();
        if (typeof lat === "number" && typeof lng === "number")
          setGeo(new GeoPoint(lat, lng));
      });
      setMapsError(null);
    };

    const scriptId = "google-maps-places-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (window.google?.maps?.places) { setTimeout(setup, 50); }
    else if (existing) {
      if (existing.dataset.loaded === "true") setTimeout(setup, 50);
      else existing.addEventListener("load", () => setTimeout(setup, 50), { once: true });
    } else {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      s.async = true; s.defer = true;
      s.onload = () => { s.dataset.loaded = "true"; setTimeout(setup, 50); };
      s.onerror = () => setMapsError("Could not load Google Maps.");
      document.head.appendChild(s);
    }
    return () => {
      cancelled = true;
      if (acListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(acListenerRef.current);
      acListenerRef.current = null;
    };
  }, [isSeller, locationMethod]);

  // ── Body scroll lock ────────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ── Location helpers ────────────────────────────────────────────────────────
  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setGeo(new GeoPoint(lat, lng));
        setLocating(false);
        if (window.google?.maps?.Geocoder) {
          new window.google.maps.Geocoder().geocode({ location: { lat, lng } }, (results: any, status: string) => {
            if (status === "OK" && results?.[0]) setForm(p => ({ ...p, ...extractAddressFields(results[0]) }));
          });
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  const handleResolveMapLink = async () => {
    if (!mapLinkInput.trim()) return;
    setResolvingLink(true); setLinkError(null);
    try {
      const res  = await fetch(`/api/resolve-maps-url?url=${encodeURIComponent(mapLinkInput.trim())}`);
      const data = await res.json();
      if (data.lat && data.lng) {
        setGeo(new GeoPoint(data.lat, data.lng));
        setMapLinkInput("");
        if (window.google?.maps?.Geocoder) {
          new window.google.maps.Geocoder().geocode({ location: { lat: data.lat, lng: data.lng } }, (results: any, status: string) => {
            if (status === "OK" && results?.[0]) setForm(p => ({ ...p, ...extractAddressFields(results[0]) }));
          });
        }
      } else {
        setLinkError("Couldn't extract coordinates from that link.");
      }
    } catch { setLinkError("Failed to resolve the Maps link."); }
    finally { setResolvingLink(false); }
  };

  // ── Image uploads ──────────────────────────────────────────────────────────
  const handleLogoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploadingLogo(true);
    try { const url = await uploadImage(file, "profile-images/logos"); setForm(p => ({ ...p, logoUrl: url })); }
    catch { /* silent */ } finally { setUploadingLogo(false); }
  };
  const handleBannerFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploadingBanner(true);
    try { const url = await uploadImage(file, "profile-images/banners"); setForm(p => ({ ...p, bannerUrl: url })); }
    catch { /* silent */ } finally { setUploadingBanner(false); }
  };

  // ── Profile save ───────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!phone) { setSaveMsg({ ok: false, text: "No phone number — cannot save." }); return; }
    setSaving(true); setSaveMsg(null);
    try {
      const line1 = addressInputRef.current?.value?.trim() || form.line1;
      const payload: AdminSaveProfileInput = {
        ...form, line1, social,
        geo: geo ? { latitude: geo.latitude, longitude: geo.longitude } : null,
        onlineDelivery,
      };
      await adminSaveProfile(phone, role, payload);
      setSaveMsg({ ok: true, text: "Profile saved." });
      onSaved();
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed." });
    } finally { setSaving(false); }
  };

  // ── Subscription helpers ────────────────────────────────────────────────────
  const activeSub = subs.find(s => s.subscriptionStatus === "active" && !isSubExpired(s));
  const isActive  = !!activeSub;
  const callerUid = auth.currentUser?.uid ?? "admin";

  const refreshSubs = async () => {
    const fresh = await adminFetchSubscriptionsByPhone(phone);
    setSubs(fresh);
    onSaved();
  };

  const handleActivate = async () => {
    if (!phone) return;
    const seats = Math.max(1, parseInt(activationSeats) || 1);
    setSubSaving(true); setSubError(null);
    try {
      await adminActivateSubscriptionForPhone(phone, role, seats, activationDur, callerUid);
      await refreshSubs();
    } catch (e) {
      setSubError(e instanceof Error ? e.message : "Activation failed.");
    } finally { setSubSaving(false); }
  };

  const handleRevoke = async () => {
    if (!phone || !window.confirm("Deactivate this user's subscription?")) return;
    setSubSaving(true); setSubError(null);
    try {
      await adminRevokeSubscription(phone);
      setSubs(prev => prev.map(s => s.id === activeSub?.id ? { ...s, subscriptionStatus: "revoked" } : s));
      onSaved();
    } catch (e) {
      setSubError(e instanceof Error ? e.message : "Revoke failed.");
    } finally { setSubSaving(false); }
  };

  const handleExtend = async () => {
    if (!activeSub || !phone) return;
    setExtending(true); setSubError(null);
    try {
      await adminExtendSubscription(activeSub.id, phone, extendDur);
      await refreshSubs();
    } catch (e) {
      setSubError(e instanceof Error ? e.message : "Extend failed.");
    } finally { setExtending(false); }
  };

  const handleSaveSeats = async () => {
    if (!activeSub || !phone) return;
    const seats = Math.max(0, parseInt(newSeatsInput) || 0);
    setSubSaving(true); setSubError(null);
    try {
      await adminUpdateSubscriptionSeats(activeSub.id, phone, seats);
      await refreshSubs();
      setEditingSeats(false);
    } catch (e) {
      setSubError(e instanceof Error ? e.message : "Update failed.");
    } finally { setSubSaving(false); }
  };

  const mapUrl = geo ? `https://maps.google.com/maps?q=${geo.latitude},${geo.longitude}&z=15&output=embed` : "";
  const inputCls = "rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 w-full";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-end bg-black/40 backdrop-blur-sm">
      {/* Click-away */}
      <div className="flex-1 cursor-pointer" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-xl h-full bg-white flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-on-surface truncate">
                {form.businessName || form.ownerName || phone || "User"}
              </h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${ROLE_BADGE[role] || ROLE_BADGE.consumer}`}>
                {role}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant font-mono mt-0.5">{phone || user.id}</p>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {saveMsg && (
            <div className={`mx-5 mt-4 rounded-xl border px-3 py-2 text-sm font-medium ${
              saveMsg.ok
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}>
              {saveMsg.text}
            </div>
          )}

          <div className="p-5 space-y-6">

            {/* Hidden file inputs */}
            <input ref={logoFileRef}   type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }} />
            <input ref={bannerFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleBannerFile(f); }} />

            {/* ── Basic Info ── */}
            <section>
              <SL>{isSeller ? "Business Info" : "Basic Info"}</SL>
              <div className="grid gap-4 sm:grid-cols-2">
                {isSeller && (
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-on-surface">{role === "retailer" ? "Shop Name" : "Business Name"}</span>
                    <input value={form.businessName} onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))} className={inputCls} />
                  </label>
                )}
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">Owner Name</span>
                  <input value={form.ownerName} onChange={e => setForm(p => ({ ...p, ownerName: e.target.value }))} className={inputCls} placeholder="Full name" />
                </label>

                {/* Phone — read-only */}
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">Phone</span>
                  <div className="flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container px-3 py-2 text-sm">
                    <span className="font-mono text-on-surface-variant flex-1">{phone || "—"}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">Read-only</span>
                  </div>
                </div>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">Secondary Mobile <span className="font-normal text-xs text-on-surface-variant">(optional)</span></span>
                  <input type="tel" inputMode="numeric" maxLength={10}
                    value={form.secondaryPhone}
                    onChange={e => setForm(p => ({ ...p, secondaryPhone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    className={inputCls} placeholder="10-digit" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-on-surface">Email <span className="font-normal text-xs text-on-surface-variant">(optional)</span></span>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="email@example.com" />
                </label>

                {isSeller && (
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-on-surface">GSTIN <span className="font-normal text-xs text-on-surface-variant">(optional)</span></span>
                    <div className="relative">
                      <input ref={gstinInputRef} type="text"
                        value={form.gstin}
                        onChange={e => {
                          const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15);
                          setForm(p => ({ ...p, gstin: val }));
                          if (isValidGstinFormat(val)) setGstOdError(null);
                        }}
                        className={`${inputCls} font-mono pr-8 ${
                          form.gstin
                            ? isValidGstinFormat(form.gstin) ? "border-green-400" : "border-red-300"
                            : ""
                        }`}
                        placeholder="27AAAAA0000A1Z5" maxLength={15} />
                      {form.gstin && (
                        <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-sm font-bold pointer-events-none ${isValidGstinFormat(form.gstin) ? "text-green-500" : "text-red-400"}`}>
                          {isValidGstinFormat(form.gstin) ? "✓" : "✕"}
                        </span>
                      )}
                    </div>
                  </label>
                )}
              </div>
            </section>

            {/* ── Location ── */}
            {isSeller && (
              <section className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-primary">Location</h3>
                  {geo && <span className="ml-auto text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">Pinned</span>}
                </div>

                {/* Tab row */}
                <div className="flex rounded-xl border border-primary/20 bg-white p-1 gap-1 mb-4">
                  {(["search", "link"] as const).map(m => (
                    <button key={m} type="button"
                      onClick={() => { setLocationMethod(m); setLinkError(null); setMapsError(null); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                        locationMethod === m ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                      }`}>
                      {m === "search"
                        ? <><MapPin className="h-3.5 w-3.5 shrink-0" /> Search Place</>
                        : <><ExternalLink className="h-3.5 w-3.5 shrink-0" /> Paste Maps Link</>}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  {locationMethod === "search" && (
                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-on-surface">Search address or landmark</span>
                      <input ref={addressInputRef} autoComplete="off" defaultValue={form.line1}
                        className={`${inputCls} bg-white`} placeholder="e.g. Sharma Agro, Nagpur…" />
                      {mapsError && <p className="text-xs text-red-500">{mapsError}</p>}
                    </div>
                  )}
                  {locationMethod === "link" && (
                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-on-surface">Paste a Google Maps link</span>
                      <div className="flex gap-2">
                        <input type="url" value={mapLinkInput}
                          onChange={e => { setMapLinkInput(e.target.value); setLinkError(null); }}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleResolveMapLink(); } }}
                          className={`${inputCls} bg-white flex-1`} placeholder="https://maps.app.goo.gl/…" />
                        <button type="button" onClick={handleResolveMapLink} disabled={resolvingLink || !mapLinkInput.trim()}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                          {resolvingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                          Set
                        </button>
                      </div>
                      {linkError && <p className="text-xs text-red-500">{linkError}</p>}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1 border-t border-primary/10 flex-wrap">
                    <button type="button" onClick={handleUseCurrentLocation} disabled={locating}
                      className="inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-white px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-60 transition-colors">
                      {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                      Use Current Location
                    </button>
                    {geo && (
                      <span className="text-xs text-primary font-medium bg-primary/10 rounded-lg px-2.5 py-1.5">
                        📍 {geo.latitude.toFixed(4)}, {geo.longitude.toFixed(4)}
                      </span>
                    )}
                  </div>

                  <div className="grid gap-2 grid-cols-3">
                    {(["city", "state", "pincode"] as const).map(k => (
                      <label key={k} className="flex flex-col gap-1.5 text-sm">
                        <span className="font-medium text-on-surface capitalize">{k}</span>
                        <input value={(form as any)[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                          className={`${inputCls} bg-white`} placeholder={k} />
                      </label>
                    ))}
                  </div>

                  {geo && mapUrl && (
                    <div className="overflow-hidden rounded-xl border border-primary/20">
                      <iframe title="Location preview" src={mapUrl} className="h-36 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Branding ── */}
            {isSeller && (
              <section>
                <SL>Branding</SL>
                <div className="flex gap-6 flex-wrap">
                  {/* Logo */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-on-surface">Logo</span>
                    <div
                      className="group relative h-20 w-20 rounded-full border-2 border-dashed border-outline-variant/40 bg-surface-container cursor-pointer hover:border-primary overflow-hidden flex items-center justify-center"
                      onClick={() => logoFileRef.current?.click()}>
                      {form.logoUrl
                        ? <img src={form.logoUrl} alt="Logo" className="h-full w-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        : <Camera className="h-7 w-7 text-on-surface-variant/40" />}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 rounded-full transition-colors">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {uploadingLogo ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Upload className="h-5 w-5 text-white" />}
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">{uploadingLogo ? "Uploading…" : form.logoUrl ? "Click to replace" : "Click to upload"}</p>
                  </div>
                  {/* Banner */}
                  <div className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
                    <span className="text-sm font-medium text-on-surface">Banner</span>
                    <div
                      className="group relative h-20 w-full rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container cursor-pointer hover:border-primary overflow-hidden flex items-center justify-center"
                      onClick={() => bannerFileRef.current?.click()}>
                      {form.bannerUrl
                        ? <img src={form.bannerUrl} alt="Banner" className="absolute inset-0 h-full w-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        : <Camera className="h-7 w-7 text-on-surface-variant/40" />}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {uploadingBanner ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Upload className="h-5 w-5 text-white" />}
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">{uploadingBanner ? "Uploading…" : form.bannerUrl ? "Click to replace" : "Click to upload"}</p>
                  </div>
                </div>
              </section>
            )}

            {/* ── Website ── */}
            {isSeller && (
              <section>
                <SL>Website</SL>
                <label className="flex flex-col gap-1.5 text-sm max-w-sm">
                  <span className="font-medium text-on-surface flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" /> URL
                    <span className="font-normal text-xs text-on-surface-variant">(optional)</span>
                  </span>
                  <input type="url" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
                    className={inputCls} placeholder="https://yoursite.com" />
                </label>
              </section>
            )}

            {/* ── Social Links ── */}
            <section>
              <SL>Social Links</SL>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  { key: "instagram" as const, icon: Instagram,     label: "Instagram", placeholder: "instagram.com/page" },
                  { key: "facebook"  as const, icon: Facebook,      label: "Facebook",  placeholder: "facebook.com/page" },
                  { key: "whatsapp"  as const, icon: MessageCircle, label: "WhatsApp",  placeholder: "+91 98765 43210" },
                  { key: "youtube"   as const, icon: Youtube,       label: "YouTube",   placeholder: "youtube.com/@channel" },
                ]).map(({ key, icon: Icon, label, placeholder }) => (
                  <label key={key} className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-on-surface flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </span>
                    <input type="text" value={social[key]}
                      onChange={e => setSocial(p => ({ ...p, [key]: e.target.value }))}
                      className={inputCls} placeholder={placeholder} />
                  </label>
                ))}
              </div>
            </section>

            {/* ── Delivery Settings ── */}
            {isSeller && (
              <section>
                <SL>Delivery Settings</SL>
                <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className="h-4 w-4 text-on-surface-variant" />
                    <span className="text-sm font-medium text-on-surface">Online Delivery</span>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-3">Allow customers to place orders for home delivery.</p>
                  <label className="flex items-center gap-3 cursor-pointer w-fit">
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={onlineDelivery}
                        onChange={e => {
                          const enabling = e.target.checked;
                          if (enabling && !isValidGstinFormat(form.gstin)) {
                            setGstOdError("Please add a valid GST number before enabling Online Delivery.");
                            return;
                          }
                          setGstOdError(null);
                          setOnlineDelivery(enabling);
                        }} />
                      <div className={`h-6 w-11 rounded-full transition-colors ${onlineDelivery ? "bg-primary" : "bg-surface-container-highest"}`} />
                      <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${onlineDelivery ? "translate-x-5" : ""}`} />
                    </div>
                    <span className="text-sm font-medium text-on-surface">{onlineDelivery ? "Enabled" : "Disabled"}</span>
                  </label>
                  {gstOdError && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                      <span>
                        {gstOdError}{" "}
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
            )}

            {/* ── Subscription & Access (admin-only, sellers only) ── */}
            {isSeller && (
              <section>
                <SL>Subscription &amp; Access</SL>

                {subLoading ? (
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading subscription…
                  </div>
                ) : (
                  <div className="space-y-3">
                    {subError && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {subError}
                      </div>
                    )}

                    {/* Status banner */}
                    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                      isActive ? "border-green-200 bg-green-50" : "border-outline-variant/40 bg-surface-container-low"
                    }`}>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-0.5">Status</p>
                        <p className={`text-sm font-bold ${isActive ? "text-green-700" : "text-on-surface-variant"}`}>
                          {isActive ? "Active" : "Inactive"}
                        </p>
                      </div>
                      {isActive && activeSub && (
                        <div className="text-right">
                          <p className="text-[10px] text-on-surface-variant">Expires</p>
                          <p className="text-sm font-semibold text-on-surface">{fmtDate(activeSub.expiryDate)}</p>
                        </div>
                      )}
                    </div>

                    {/* Active: details card */}
                    {isActive && activeSub && (
                      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest divide-y divide-outline-variant/10">

                        {/* Seats */}
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex-1">
                            <p className="text-xs text-on-surface-variant">Seats Purchased</p>
                            {editingSeats ? (
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="text" inputMode="numeric"
                                  value={newSeatsInput}
                                  onChange={e => setNewSeatsInput(e.target.value.replace(/\D/g, ""))}
                                  className="w-24 rounded-lg border border-outline-variant/40 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                  autoFocus
                                />
                                <button type="button" onClick={handleSaveSeats} disabled={subSaving}
                                  className="px-3 py-1 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-60">
                                  {subSaving ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Save"}
                                </button>
                                <button type="button" onClick={() => setEditingSeats(false)}
                                  className="text-xs text-on-surface-variant hover:text-on-surface">Cancel</button>
                              </div>
                            ) : (
                              <p className="text-sm font-bold text-on-surface mt-0.5">
                                {activeSub.seatsPurchased ?? user.totalSeats ?? "—"}
                              </p>
                            )}
                          </div>
                          {!editingSeats && (
                            <button type="button"
                              onClick={() => {
                                setEditingSeats(true);
                                setNewSeatsInput(String(activeSub.seatsPurchased ?? user.totalSeats ?? 1));
                              }}
                              className="text-xs text-primary font-semibold hover:underline shrink-0">
                              Edit
                            </button>
                          )}
                        </div>

                        {/* Plan */}
                        <div className="px-4 py-3">
                          <p className="text-xs text-on-surface-variant">Plan</p>
                          <p className="text-sm font-medium text-on-surface mt-0.5">{activeSub.planName || "Standard"}</p>
                        </div>

                        {/* Extend */}
                        <div className="px-4 py-3 space-y-2">
                          <p className="text-xs font-semibold text-on-surface-variant">Extend Expiry</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {([1, 3, 6, 12] as const).map(m => (
                              <button key={m} type="button"
                                onClick={() => setExtendDur(m)}
                                className={`flex-1 min-w-[3.5rem] py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                  extendDur === m
                                    ? "bg-primary text-white border-primary shadow-sm"
                                    : "bg-white text-on-surface-variant border-outline-variant/40 hover:bg-surface-container"
                                }`}>
                                {m === 12 ? "1 Yr" : `${m} Mo`}
                              </button>
                            ))}
                            <button type="button" onClick={handleExtend} disabled={extending}
                              className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 disabled:opacity-60 whitespace-nowrap transition-colors">
                              {extending ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "+ Extend"}
                            </button>
                          </div>
                        </div>

                        {/* Deactivate */}
                        <div className="px-4 py-3">
                          <button type="button" onClick={handleRevoke} disabled={subSaving}
                            className="text-xs text-red-600 font-semibold hover:underline disabled:opacity-60">
                            Deactivate subscription
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inactive: activation form */}
                    {!isActive && (
                      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-3">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Activate Subscription</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-on-surface">Seats</span>
                            <input type="text" inputMode="numeric"
                              value={activationSeats}
                              onChange={e => setActivationSeats(e.target.value.replace(/\D/g, ""))}
                              placeholder="e.g. 5"
                              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20" />
                          </div>
                          <div className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-on-surface">Duration</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {([1, 3, 6, 12] as const).map(m => (
                                <button key={m} type="button" onClick={() => setActivationDur(m)}
                                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                                    activationDur === m
                                      ? "bg-primary text-white border-primary"
                                      : "bg-white text-on-surface-variant border-outline-variant/40 hover:bg-surface-container"
                                  }`}>
                                  {m === 12 ? "1 Yr" : `${m}Mo`}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <button type="button" onClick={handleActivate} disabled={subSaving}
                          className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                          {subSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {subSaving ? "Activating…" : "Activate Subscription"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-outline-variant/20 px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60 transition-colors">
            Close
          </button>
          <button type="button" onClick={handleSaveProfile} disabled={saving || uploadingLogo || uploadingBanner}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-70 transition-opacity">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SL({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
      {children}
    </p>
  );
}
