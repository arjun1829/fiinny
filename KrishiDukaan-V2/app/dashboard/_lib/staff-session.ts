import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db, getUserProfile } from "../../firebase";
import type { StaffPermission } from "../../lib/shop-team";
import type { StaffSession } from "../_context/effective-user-context";

/**
 * Entering the dashboard as a shop helper (app/lib/shop-team.ts): one call to
 * /api/team/me for the permissions, a token refresh the first time (so
 * firestore.rules see the kdStaff claim), then the owner's profile — the
 * dashboard then loads the shop exactly like the admin "view seller" mode.
 */

export type StaffEntry =
  | { kind: "ok"; session: StaffSession; ownerUid: string; ownerProfile: any }
  | { kind: "blocked"; reason: "paused" | "unpaid"; ownerName: string }
  | { kind: "none" };

type MeResponse = {
  staff: null | {
    ownerPhone: string;
    ownerUid: string;
    ownerName: string;
    ownerIsPaid: boolean;
    staffName: string;
    permissions: StaffPermission[];
    status: "active" | "paused";
  };
  refreshToken?: boolean;
};

export async function enterStaffSession(user: User): Promise<StaffEntry> {
  const res = await fetch("/api/team/me", {
    method: "POST",
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!res.ok) return { kind: "none" };
  const me = (await res.json()) as MeResponse;
  const s = me.staff;
  if (!s) return { kind: "none" };
  if (s.status !== "active") return { kind: "blocked", reason: "paused", ownerName: s.ownerName };
  if (!s.ownerIsPaid) return { kind: "blocked", reason: "unpaid", ownerName: s.ownerName };
  if (me.refreshToken) await user.getIdToken(true);

  // The owner's uid when they have one (uid-keyed data), else their phone —
  // the same fallback the admin view uses for accounts that never signed in.
  const ownerProfile = s.ownerUid
    ? await getUserProfile(s.ownerUid)
    : await getDoc(doc(db, "users", s.ownerPhone)).then((d) => (d.exists() ? d.data() : null));
  if (!ownerProfile) return { kind: "none" };
  return {
    kind: "ok",
    ownerUid: s.ownerUid || s.ownerPhone,
    ownerProfile,
    session: { ownerPhone: s.ownerPhone, ownerName: s.ownerName, staffName: s.staffName, permissions: s.permissions },
  };
}
