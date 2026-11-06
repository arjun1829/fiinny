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
  getCountFromServer,
  getDoc,
  increment,
  orderBy,
  query,
  updateDoc,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
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

/** Reports with `status` ("all" = every status), newest first, for a paged list. */
export function contentReportsQuery(status: ContentReportStatus | "all"): Query<DocumentData> {
  const reports = collection(db, "contentReports");
  return status === "all"
    ? query(reports, orderBy("createdAt", "desc"))
    : query(reports, where("status", "==", status), orderBy("createdAt", "desc"));
}

export function toContentReport(d: QueryDocumentSnapshot<DocumentData>): ContentReport {
  return { id: d.id, ...(d.data() as object) } as ContentReport;
}

/** Reports still waiting for an admin (a count read, not the reports). */
export async function countPendingReports(): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, "contentReports"), where("status", "==", "pending")));
  return snap.data().count;
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
