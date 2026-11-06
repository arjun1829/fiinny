"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, ImagePlus, Loader2, Plus, Save, Store, X } from "lucide-react";
import { useEffectiveUser } from "../_context/effective-user-context";
import { PageHeader } from "../_components/page-header";
import { BrandPosterButton } from "../_components/brand-poster-dialog";
import { useI18n } from "../../i18n/I18nContext";
import {
  EMPTY_RETAILER_BRAND,
  RB_LIMITS,
  SUGGESTED_HIGHLIGHTS,
  type RetailerBrandPage,
  type RetailerBrandProfile,
} from "../../lib/retailer-brand";
import {
  fetchRetailerBrand,
  fetchRetailerBrandProfile,
  resolveRetailerPhone,
  saveRetailerBrand,
  uploadRetailerBrandPhoto,
} from "../_lib/retailer-brand-firestore";
import { shopShareUrl } from "../../lib/share-links";
import { posterCount, type BrandPosterData, type BrandPosterStat } from "../../lib/brand-poster";
import { fetchRetailerProducts } from "../../firebase";

const input =
  "w-full rounded-xl border border-outline-variant/50 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function RetailerBrandPageEditor() {
  const { t } = useI18n();
  const { uid, profile: userProfile } = useEffectiveUser();
  const [phone, setPhone] = useState<string | null>(null);
  const [brand, setBrand] = useState<RetailerBrandPage>(EMPTY_RETAILER_BRAND);
  const [exists, setExists] = useState(false);
  const [profile, setProfile] = useState<RetailerBrandProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newHighlight, setNewHighlight] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!uid || !userProfile) return;
    let alive = true;
    (async () => {
      try {
        if (userProfile.role !== "retailer") {
          setError(t("rbOnlyRetailer"));
          return;
        }
        const p = await resolveRetailerPhone(uid, userProfile.phone);
        if (!p) {
          setError(t("rbNoPhone"));
          return;
        }
        const [b, prof] = await Promise.all([fetchRetailerBrand(p), fetchRetailerBrandProfile(p)]);
        if (!alive) return;
        setPhone(p);
        setBrand(b.brand);
        setExists(b.exists);
        setProfile(prof);
      } catch (e) {
        console.error(e);
        if (alive) setError(t("rbSaveFailed"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, userProfile]);

  const set = <K extends keyof RetailerBrandPage>(k: K, v: RetailerBrandPage[K]) =>
    setBrand((b) => ({ ...b, [k]: v }));

  const addHighlight = (h: string) => {
    const v = h.trim().slice(0, RB_LIMITS.highlight);
    if (!v || brand.highlights.includes(v) || brand.highlights.length >= RB_LIMITS.highlights) return;
    set("highlights", [...brand.highlights, v]);
    setNewHighlight("");
  };

  const onPickPhoto = async (files: FileList | null) => {
    if (!files || !phone) return;
    const room = RB_LIMITS.photos - brand.photos.length;
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (!picked.length) return;
    setUploading(true);
    setMessage(null);
    try {
      const urls = await Promise.all(picked.map((f) => uploadRetailerBrandPhoto(phone, f)));
      setBrand((b) => ({ ...b, photos: [...b.photos, ...urls].slice(0, RB_LIMITS.photos) }));
    } catch (e) {
      console.error(e);
      setMessage({ ok: false, text: t("rbPhotoFailed") });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async (next: RetailerBrandPage = brand) => {
    if (!phone) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveRetailerBrand(phone, next, !exists);
      setExists(true);
      setMessage({ ok: true, text: t("rbSaved") });
    } catch (e) {
      console.error(e);
      setMessage({ ok: false, text: t("rbSaveFailed") });
    } finally {
      setSaving(false);
    }
  };

  // The switch saves straight away — it's the one control people expect to "just work".
  const toggleVisible = () => {
    const next = { ...brand, enabled: !brand.enabled };
    setBrand(next);
    void save(next);
  };

  const pageUrl = phone ? shopShareUrl(phone) : null;
  const poster: BrandPosterData | null = useMemo(() => {
    if (!profile || !pageUrl) return null;
    return {
      shopName: profile.name || "My shop",
      tagline: brand.tagline,
      place: [profile.city, profile.state].filter(Boolean).join(", "),
      phone: profile.phone,
      logoUrl: profile.logo,
      bannerUrl: profile.banner,
      photos: brand.photos,
      highlights: brand.highlights,
      link: pageUrl.replace(/^https?:\/\//, ""),
    };
  }, [profile, pageUrl, brand.tagline, brand.photos, brand.highlights]);

  // The product count is read only when the poster opens, not on page load.
  const loadPosterStats = async (): Promise<BrandPosterStat[]> => {
    if (!uid) return [];
    const n = (await fetchRetailerProducts(uid)).length;
    return n > 0 ? [{ value: posterCount(n), label: "Products" }] : [];
  };

  if (loading && !error) {
    return (
      <div className="flex h-60 items-center justify-center text-on-surface-variant">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (error) {
    return <p className="rounded-2xl bg-surface-container-low p-6 text-sm text-on-surface-variant">{error}</p>;
  }

  return (
    <div className="max-w-3xl space-y-6 pb-16">
      <PageHeader title={t("rbTitle")} description={t("rbDesc")} />

      {/* Visibility + share */}
      <section className="rounded-2xl border border-outline-variant/30 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-on-surface">
              {t("rbVisible")}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                  brand.enabled ? "bg-green-100 text-green-700" : "bg-surface-container text-on-surface-variant"
                }`}
              >
                {brand.enabled ? t("rbStatusLive") : t("rbStatusHidden")}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-on-surface-variant">{t("rbVisibleHint")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={brand.enabled}
            disabled={saving}
            onClick={toggleVisible}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${brand.enabled ? "bg-green-600" : "bg-outline-variant"}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${brand.enabled ? "translate-x-5" : ""}`} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <BrandPosterButton data={poster} loadStats={loadPosterStats} />
          {pageUrl && brand.enabled ? (
            <Link
              href={pageUrl.replace(/^https?:\/\/[^/]+/, "")}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-bold text-on-surface hover:bg-surface-container"
            >
              <ExternalLink className="h-4 w-4" /> {t("rbViewPage")}
            </Link>
          ) : null}
        </div>
      </section>

      {/* From the profile */}
      <section className="flex items-center gap-4 rounded-2xl border border-outline-variant/30 bg-white p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-container">
          {profile?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <Store className="h-6 w-6 text-on-surface-variant" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-on-surface">{profile?.name || "—"}</p>
          <p className="text-xs text-on-surface-variant">
            {t("rbLogoBanner")} · {t("rbLogoBannerHint")}
          </p>
        </div>
        <Link href="/dashboard/profile" className="shrink-0 text-sm font-bold text-primary hover:underline">
          {t("rbEditProfile")}
        </Link>
      </section>

      {/* Details */}
      <section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-white p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-on-surface">{t("rbTagline")}</span>
          <input
            className={input}
            maxLength={RB_LIMITS.tagline}
            placeholder={t("rbTaglinePh")}
            value={brand.tagline}
            onChange={(e) => set("tagline", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-on-surface">{t("rbAbout")}</span>
          <textarea
            className={`${input} min-h-[120px]`}
            maxLength={RB_LIMITS.about}
            placeholder={t("rbAboutPh")}
            value={brand.about}
            onChange={(e) => set("about", e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-on-surface">{t("rbEstablished")}</span>
            <input
              className={input}
              inputMode="numeric"
              maxLength={4}
              placeholder="1998"
              value={brand.establishedYear}
              onChange={(e) => set("establishedYear", e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-on-surface">{t("rbHours")}</span>
            <input
              className={input}
              maxLength={RB_LIMITS.openingHours}
              placeholder={t("rbHoursPh")}
              value={brand.openingHours}
              onChange={(e) => set("openingHours", e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* Highlights */}
      <section className="rounded-2xl border border-outline-variant/30 bg-white p-5">
        <p className="text-sm font-bold text-on-surface">{t("rbHighlights")}</p>
        <p className="text-xs text-on-surface-variant">{t("rbHighlightsHint")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {brand.highlights.map((h) => (
            <span key={h} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white">
              {h}
              <button type="button" aria-label={`Remove ${h}`} onClick={() => set("highlights", brand.highlights.filter((x) => x !== h))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {SUGGESTED_HIGHLIGHTS.filter((h) => !brand.highlights.includes(h)).map((h) => (
            <button
              key={h}
              type="button"
              disabled={brand.highlights.length >= RB_LIMITS.highlights}
              onClick={() => addHighlight(h)}
              className="rounded-full border border-dashed border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-40"
            >
              + {h}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className={input}
            maxLength={RB_LIMITS.highlight}
            value={newHighlight}
            onChange={(e) => setNewHighlight(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addHighlight(newHighlight);
              }
            }}
          />
          <button
            type="button"
            onClick={() => addHighlight(newHighlight)}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-outline-variant px-3 text-sm font-bold"
          >
            <Plus className="h-4 w-4" /> {t("rbAdd")}
          </button>
        </div>
      </section>

      {/* Photos */}
      <section className="rounded-2xl border border-outline-variant/30 bg-white p-5">
        <p className="text-sm font-bold text-on-surface">{t("rbPhotos")}</p>
        <p className="text-xs text-on-surface-variant">{t("rbPhotosHint")}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {brand.photos.map((src) => (
            <div key={src} className="relative aspect-square overflow-hidden rounded-xl bg-surface-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => set("photos", brand.photos.filter((p) => p !== src))}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {brand.photos.length < RB_LIMITS.photos ? (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-outline-variant text-xs font-bold text-on-surface-variant hover:border-primary hover:text-primary"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {uploading ? t("rbUploading") : t("rbAddPhoto")}
            </button>
          ) : null}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onPickPhoto(e.target.files)} />
      </section>

      {/* Contact & socials */}
      <section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-white p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-on-surface">{t("rbWhatsapp")}</span>
          <input
            className={input}
            inputMode="tel"
            maxLength={16}
            placeholder={profile?.phone ?? ""}
            value={brand.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value.replace(/[^\d+]/g, ""))}
          />
          <span className="mt-1 block text-[11px] text-on-surface-variant">{t("rbWhatsappHint")}</span>
        </label>
        <p className="text-xs font-bold text-on-surface">{t("rbSocials")}</p>
        {(["instagram", "facebook", "youtube"] as const).map((k) => (
          <input
            key={k}
            className={input}
            placeholder={`https://${k === "youtube" ? "youtube.com/@" : `${k}.com/`}yourshop`}
            value={brand.socialLinks[k] ?? ""}
            onChange={(e) => set("socialLinks", { ...brand.socialLinks, [k]: e.target.value.trim() })}
          />
        ))}
      </section>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-2xl border border-outline-variant/30 bg-white/95 p-3 shadow-lg backdrop-blur">
        <button
          type="button"
          disabled={saving || uploading}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? t("rbSaving") : t("rbSave")}
        </button>
        {message ? (
          <p className={`text-sm font-semibold ${message.ok ? "text-primary" : "text-red-600"}`}>{message.text}</p>
        ) : null}
      </div>
    </div>
  );
}
