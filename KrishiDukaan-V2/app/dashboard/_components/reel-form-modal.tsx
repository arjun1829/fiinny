"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Upload, User, Video, X } from "lucide-react";

import { fetchStoreSources } from "../../firebase";
import {
  createReel,
  fetchSellerProductsForPicker,
  updateReel,
  type ReelDoc,
} from "../_lib/reels-firestore";
import { getVideoDuration, captureThumbnail, MAX_REEL_DURATION_SECONDS } from "../_lib/reel-media";

type SellerOption = { phone: string; name: string; role: string };

type Props = {
  mode: "create" | "edit";
  onClose: () => void;
  onSaved: () => void;
  /** Seller mode: identity is fixed to the logged-in seller. */
  sellerPhone?: string;
  sellerName?: string;
  sellerProfilePic?: string;
  /** Admin mode: shows a seller picker (create) so admin can upload on a seller's behalf. */
  adminMode?: boolean;
  /** Required for edit mode. */
  reel?: ReelDoc;
};

export function ReelFormModal({
  mode,
  onClose,
  onSaved,
  sellerPhone,
  sellerName,
  sellerProfilePic,
  adminMode,
  reel,
}: Props) {
  // ── Seller identity (fixed for seller-mode; picked for admin-create) ──
  const [chosenSeller, setChosenSeller] = useState<SellerOption | null>(
    mode === "edit" && reel
      ? { phone: reel.shopOwnerId, name: reel.shopName, role: "" }
      : sellerPhone
      ? { phone: sellerPhone, name: sellerName || sellerPhone, role: "" }
      : null,
  );
  const needsSellerPicker = adminMode && mode === "create" && !chosenSeller;
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [sellersLoaded, setSellersLoaded] = useState(false);
  const [sellerSearch, setSellerSearch] = useState("");

  useEffect(() => {
    if (!needsSellerPicker || sellersLoaded) return;
    // Sellers from the store directory (1–2 reads) rather than every users doc.
    fetchStoreSources().then(({ profiles, retailers, manufacturers }) => {
      const byPhone = new Map<string, SellerOption>();
      const add = (id: string, d: Record<string, any>, role: string) => {
        const phone = d.phone || id;
        if (byPhone.has(phone)) return;
        byPhone.set(phone, { phone, name: d.shopName || d.businessName || d.name || d.ownerName || phone, role });
      };
      profiles.docs.forEach((doc) => add(doc.id, doc.data(), doc.data().role));
      retailers.docs.forEach((doc) => add(doc.id, doc.data(), "retailer"));
      manufacturers.docs.forEach((doc) => add(doc.id, doc.data(), "manufacturer"));
      setSellers(Array.from(byPhone.values()).sort((a, b) => a.name.localeCompare(b.name)));
      setSellersLoaded(true);
    });
  }, [needsSellerPicker, sellersLoaded]);

  // ── Form fields ──
  const [title, setTitle] = useState(reel?.title ?? "");
  const [caption, setCaption] = useState(reel?.caption ?? "");
  const [linkedProductId, setLinkedProductId] = useState(reel?.linkedProductId ?? "");
  const [linkedProductName, setLinkedProductName] = useState(reel?.linkedProductName ?? "");
  const [linkedProductImageUrl, setLinkedProductImageUrl] = useState(reel?.linkedProductImageUrl ?? "");

  const [products, setProducts] = useState<{ id: string; name: string; image: string }[]>([]);
  useEffect(() => {
    if (!chosenSeller?.phone) return;
    fetchSellerProductsForPicker(chosenSeller.phone).then(setProducts).catch(() => setProducts([]));
  }, [chosenSeller?.phone]);

  // ── Video (create only — mobile's own edit flow doesn't support replacing the video either) ──
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [thumbBlob, setThumbBlob] = useState<Blob | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [processingVideo, setProcessingVideo] = useState(false);

  const handlePickVideo = async (file: File) => {
    setVideoError(null);
    setProcessingVideo(true);
    try {
      const duration = await getVideoDuration(file);
      if (duration > MAX_REEL_DURATION_SECONDS) {
        setVideoError(`Video is too long — max ${MAX_REEL_DURATION_SECONDS / 60} minutes.`);
        return;
      }
      const thumb = await captureThumbnail(file);
      setVideoFile(file);
      setThumbBlob(thumb);
      setVideoPreviewUrl(URL.createObjectURL(file));
    } catch {
      setVideoError("Could not read this video file. Try a different file.");
    } finally {
      setProcessingVideo(false);
    }
  };

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = useMemo(() => {
    if (!chosenSeller) return false;
    if (!caption.trim()) return false;
    if (mode === "create" && !videoFile) return false;
    return true;
  }, [chosenSeller, caption, mode, videoFile]);

  const handleSave = async () => {
    if (!chosenSeller || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        await createReel({
          shopOwnerId: chosenSeller.phone,
          shopName: chosenSeller.name,
          shopProfilePic: sellerProfilePic,
          title: title.trim(),
          caption: caption.trim(),
          linkedProductId: linkedProductId || undefined,
          linkedProductName: linkedProductName || undefined,
          linkedProductImageUrl: linkedProductImageUrl || undefined,
          videoFile: videoFile!,
          thumbBlob,
        });
      } else if (reel) {
        await updateReel(reel.id, {
          title: title.trim(),
          caption: caption.trim(),
          linkedProductId: linkedProductId || undefined,
          linkedProductName: linkedProductName || undefined,
          linkedProductImageUrl: linkedProductImageUrl || undefined,
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const pickProduct = (p: { id: string; name: string; image: string } | null) => {
    setLinkedProductId(p?.id ?? "");
    setLinkedProductName(p?.name ?? "");
    setLinkedProductImageUrl(p?.image ?? "");
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-end justify-center bg-on-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100dvh-64px)] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-container px-5 py-4 shrink-0">
          <h2 className="text-base font-bold text-on-surface">
            {mode === "create" ? "Upload Reel" : "Edit Reel"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-container transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {needsSellerPicker ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-outline" />
                <input
                  type="text"
                  placeholder="Search seller by name or phone…"
                  value={sellerSearch}
                  onChange={(e) => setSellerSearch(e.target.value)}
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low pl-9 pr-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-outline-variant/10">
                {!sellersLoaded ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  sellers
                    .filter((s) => {
                      const q = sellerSearch.toLowerCase();
                      return !q || s.name.toLowerCase().includes(q) || s.phone.includes(q);
                    })
                    .map((s) => (
                      <button
                        key={s.phone}
                        onClick={() => setChosenSeller(s)}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-container-low rounded-xl transition-colors"
                      >
                        <User className="h-4 w-4 text-on-surface-variant shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-on-surface truncate">{s.name}</p>
                          <p className="text-[10px] text-on-surface-variant font-mono">{s.phone}</p>
                        </div>
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-surface-container text-on-surface-variant">
                          {s.role}
                        </span>
                      </button>
                    ))
                )}
              </div>
            </>
          ) : (
            <>
              {adminMode && chosenSeller && (
                <div className="flex items-center gap-2 rounded-xl bg-secondary/10 px-3 py-2 text-xs font-semibold text-secondary">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  {mode === "create" ? "Uploading for" : "Editing reel for"} {chosenSeller.name} ({chosenSeller.phone})
                </div>
              )}

              {mode === "create" && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                    Video
                  </label>
                  {videoPreviewUrl ? (
                    <div className="relative w-40 mx-auto">
                      <video src={videoPreviewUrl} className="w-full rounded-2xl aspect-[9/16] object-cover bg-black" controls />
                      <button
                        onClick={() => {
                          setVideoFile(null);
                          setVideoPreviewUrl(null);
                          setThumbBlob(null);
                        }}
                        className="absolute -top-2 -right-2 rounded-full bg-white p-1 shadow-md"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant/40 py-8 cursor-pointer hover:bg-surface-container-low transition-colors">
                      {processingVideo ? (
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      ) : (
                        <>
                          <Upload className="h-6 w-6 text-on-surface-variant" />
                          <span className="text-xs font-semibold text-on-surface-variant">
                            Tap to select a video (max {MAX_REEL_DURATION_SECONDS / 60} min)
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handlePickVideo(f);
                        }}
                      />
                    </label>
                  )}
                  {videoError && <p className="mt-1.5 text-xs font-semibold text-red-600">{videoError}</p>}
                </div>
              )}

              {mode === "edit" && reel && (
                <div className="flex justify-center">
                  {reel.thumbnailUrl ? (
                    <img src={reel.thumbnailUrl} alt="" className="w-24 rounded-2xl aspect-[9/16] object-cover bg-black" />
                  ) : (
                    <div className="w-24 aspect-[9/16] rounded-2xl bg-surface-container flex items-center justify-center">
                      <Video className="h-6 w-6 text-on-surface-variant/40" />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. New arrival: hybrid seeds"
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                  Caption
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  placeholder="Tell buyers about this product…"
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                  Linked product (optional)
                </label>
                <select
                  value={linkedProductId}
                  onChange={(e) => pickProduct(products.find((p) => p.id === e.target.value) ?? null)}
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">No linked product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 font-semibold">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {!needsSellerPicker && (
          <div className="flex items-center justify-end gap-3 border-t border-surface-container px-5 py-4 shrink-0">
            <button
              onClick={onClose}
              className="rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-bold hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-container transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "create" ? "Upload" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
