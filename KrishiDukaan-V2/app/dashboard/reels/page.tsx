"use client";

import { useEffect, useState } from "react";
import { Heart, MessageCircle, Pencil, Plus, Trash2, Video, Eye } from "lucide-react";

import { useEffectiveUser } from "../_context/effective-user-context";
import { PageHeader } from "../_components/page-header";
import { ReelFormModal } from "../_components/reel-form-modal";
import { fetchMyReels, deleteReel, type ReelDoc } from "../_lib/reels-firestore";
import { auth } from "../../firebase";

export default function SellerReelsPage() {
  const { profile } = useEffectiveUser();
  // The shop's phone keys its reels (reels.shopOwnerId). Fall back to the
  // signed-in phone when the profile has none, so the page never waits forever.
  const phone: string | undefined = profile?.phone || auth.currentUser?.phoneNumber || undefined;
  const shopName: string = profile?.shopName || profile?.businessName || profile?.name || phone || "";
  const profilePic: string | undefined = profile?.profilePic;

  const [reels, setReels] = useState<ReelDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editReel, setEditReel] = useState<ReelDoc | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReelDoc | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    if (!phone) {
      // No shop phone yet (profile still loading or missing): stop the spinner
      // rather than spin forever; the effect re-runs once a phone arrives.
      setLoading(!profile);
      return;
    }
    setLoading(true);
    setLoadError(false);
    fetchMyReels(phone)
      .then(setReels)
      .catch((err) => {
        // Used to fail silently and show "No reels yet" as if there were none.
        console.error("[dashboard/reels] could not load reels", err);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, profile]);

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

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/40 py-16 text-center">
          <p className="text-sm font-semibold text-on-surface">Couldn&apos;t load your reels</p>
          <p className="text-xs text-on-surface-variant max-w-xs">Check your internet connection and try again.</p>
          <button
            onClick={load}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-container"
          >
            Retry
          </button>
        </div>
      ) : !phone ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/40 py-16 text-center">
          <p className="text-sm font-semibold text-on-surface">Your shop phone number is missing</p>
          <p className="text-xs text-on-surface-variant max-w-xs">Add it in your profile to see and upload reels.</p>
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
