/**
 * Admin -> Moderation: the queue Apple's App Store review (Guideline 1.2)
 * requires — a place a human at KrishiDukan can see every report/block filed
 * against user-generated content (AgriReels videos + comments) and act on it
 * within 24 hours.
 *
 * Reads/writes `contentReports`, which is written by:
 *   - reportReel (mobile) / an equivalent web report action, in parallel with
 *     the existing `reel_reports` (which only ever fed the auto-hide-after-3
 *     counter and was never visible to a human — see flagReelOnReports in
 *     functions/src/index.ts)
 *   - reportComment (mobile) — comments never had a report path before
 *   - blockUser (mobile) — Apple requires a block to also notify the
 *     developer of the content that triggered it, not just hide it from the
 *     blocker
 *
 * firestore.rules restricts contentReports to admin read/update/delete; a
 * reporter can only create a 'pending' row naming themselves.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { deleteReel } from "../../dashboard/_lib/reels-firestore";

export type ContentReportType = "reel" | "comment" | "block";
export type ContentReportStatus = "pending" | "actioned" | "dismissed";

export type ContentReport = {
  id: string;
  type: ContentReportType;
  reelId?: string;
  commentId?: string;
  reportedUserId: string;
  reporterId: string;
  reason: string;
  contentSnippet?: string;
  status: ContentReportStatus;
  createdAt?: { toDate: () => Date } | null;
  resolvedAt?: { toDate: () => Date } | null;
  resolvedBy?: string;
};

/** All reports, newest first. Filtered client-side by status/search — the
 *  queue is not expected to grow large enough to need pagination, and this
 *  avoids a composite index for what is otherwise a single-admin-page read. */
export async function fetchContentReports(): Promise<ContentReport[]> {
  const snap = await getDocs(
    query(collection(db, "contentReports"), orderBy("createdAt", "desc")),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as ContentReport);
}

export async function resolveContentReport(
  reportId: string,
  status: "actioned" | "dismissed",
  resolvedBy: string,
): Promise<void> {
  await updateDoc(doc(db, "contentReports", reportId), {
    status,
    resolvedAt: new Date(),
    resolvedBy,
  });
}

/** Removes the reported reel (video + thumbnail + doc — see deleteReel). */
export async function removeReportedReel(reelId: string): Promise<void> {
  await deleteReel(reelId);
}

/** Removes the reported comment and keeps the parent reel's commentsCount in
 *  sync, mirroring mobile's ReelsRepository.deleteComment. */
export async function removeReportedComment(
  reelId: string,
  commentId: string,
): Promise<void> {
  await deleteDoc(doc(db, "reels", reelId, "reel_comments", commentId));
  await updateDoc(doc(db, "reels", reelId), {
    commentsCount: increment(-1),
  });
}

export type ReportedUserBrief = {
  uid: string | null;
  role: string;
};

/** Looks up the account behind a reported phone, for the "eject user" action
 *  — which reuses the existing adminDeleteUser flow (app/firebase.ts) rather
 *  than inventing a separate ban mechanism. */
export async function fetchReportedUserBrief(
  phone: string,
): Promise<ReportedUserBrief | null> {
  const snap = await getDoc(doc(db, "users", phone));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid: (data.uid as string | undefined) ?? null,
    role: (data.role as string | undefined) ?? "consumer",
  };
}
