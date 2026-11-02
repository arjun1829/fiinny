"use client";

import { useEffect, useState } from "react";
import { Heart, MessageCircle, Pencil, Plus, Trash2, Video, Eye } from "lucide-react";

import { useEffectiveUser } from "../_context/effective-user-context";
import { PageHeader } from "../_components/page-header";
import { ReelFormModal } from "../_components/reel-form-modal";
import { fetchMyReels, deleteReel, resolveReelsPhone, type ReelDoc } from "../_lib/reels-firestore";

export default function SellerReelsPage() {
  const { uid, profile, staff } = useEffectiveUser();
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneResolved, setPhoneResolved] = useState(false);
  const shopName: string = profile?.shopName || profile?.businessName || profile?.name || phone || "";
  const profilePic: string | undefined = profile?.profilePic;

  const [reels, setReels] = useState<ReelDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editReel, setEditReel] = useState<ReelDoc | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReelDoc | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // The profile often lacks `phone` (see resolveReelsPhone), which used to
  // leave this page spinning forever with Upload disabled.
  useEffect(() => {
    let cancelled = false;
    resolveReelsPhone(uid, profile?.phone, staff?.ownerPhone).then((p) => {
      if (cancelled) return;
      setPhone(p);
      setPhoneResolved(true);
    });
    return () => { cancelled = true; };
  }, [uid, profile?.phone, staff?.ownerPhone]);

  const load = () => {
    if (!phone) return;
    setLoading(true);
    setError(null);
    fetchMyReels(phone)
      .then(setReels)
      .catch((err) => {
        console.error("[reels] load failed", err);
        setError("Could not load your reels. Check your connection and try again.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!phoneResolved) return;
    if (!phone) {
      setLoading(false);
      setError("We couldn't find the phone number for this shop, so its reels can't be loaded.");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, phoneResolved]);

  const performDelete = async (r: ReelDoc) => {
    setDeleting(r.id);
    try {
      await deleteReel(r.id);
      setReels((prev) => prev.filter((x) => x.id !== r.id));
      setConfirmDelete(null);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Reels" description="Short product videos shown in AgriReels — on web and in the mobile app." />
        <button
          onClick={() => {
            setEditReel(null);
            setShowForm(true);
          }}
          disabled={!phone}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-container disabled:opacity-50 shrink-0"
        >
          <Plus className="h-4 w-4" /> Upload Reel
        </button>
      </div>

      {error && !loading && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-800">{error}</p>
          {phone && (
            <button onClick={load} className="rounded-xl border border-red-300 px-4 py-2 text-xs font-bold text-red-800 hover:bg-red-100">
              Try again
            </button>
          )}
        </div>
      )}

      {error && !loading ? null : loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reels.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/40 py-16 text-center">
          <Video className="h-10 w-10 text-on-surface-variant/40" />
          <p className="text-sm font-semibold text-on-surface">No reels yet</p>
          <p className="text-xs text-on-surface-variant max-w-xs">
            Upload a short video of your product — it&apos;ll show up in AgriReels for buyers browsing the app.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {reels.map((r) => (
            <div key={r.id} className="group relative overflow-hidden rounded-2xl bg-surface-container-lowest border border-outline-variant/20">
              <div className="relative aspect-[9/16] bg-black">
                {r.thumbnailUrl ? (
                  <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={r.videoUrl} className="h-full w-full object-cover" muted />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 flex items-center gap-3 text-[10px] font-bold text-white">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {r.viewsCount}</span>
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {r.likesCount}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {r.commentsCount}</span>
                </div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditReel(r);
                      setShowForm(true);
                    }}
                    className="p-1.5 rounded-lg bg-white/90 text-on-surface hover:bg-white transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(r)}
                    disabled={deleting === r.id}
                    className="p-1.5 rounded-lg bg-white/90 text-red-600 hover:bg-white transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-2">
                <p className="text-xs font-semibold text-on-surface truncate">{r.title || r.caption}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && phone && (
        <ReelFormModal
          mode={editReel ? "edit" : "create"}
          reel={editReel ?? undefined}
          sellerPhone={phone}
          sellerName={shopName}
          sellerProfilePic={profilePic}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-end justify-center bg-on-surface/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 text-red-600 mb-4">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-on-surface">Delete Reel</h3>
              <p className="text-sm text-on-surface-variant mt-2">
                Are you sure you want to delete this reel? This action cannot be undone.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting === confirmDelete.id}
                className="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => performDelete(confirmDelete)}
                disabled={deleting === confirmDelete.id}
                className="flex-1 py-3 bg-red-600 text-white text-sm font-bold rounded-2xl hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting === confirmDelete.id ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deleting…
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
