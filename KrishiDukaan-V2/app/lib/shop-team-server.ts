import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { phoneKey, staffCan, type StaffPermission, type StaffRecord } from "./shop-team";

/**
 * Server half of the shop team feature (see ./shop-team.ts): who is calling,
 * whether a phone is an active helper of a shop, and the in-app + push
 * notification sent when a team changes.
 */

export type TeamCaller = {
  uid: string;
  /** E.164 phone from uidIndex (or the sign-in token), "" for email accounts. */
  phone: string;
  role: string;
  isAdmin: boolean;
  /** Admin, or an admin-portal team account with the "users" section. */
  canManageAnyShop: boolean;
  /** The sign-in token already carries the kdStaff claim (firestore.rules pre-check). */
  hasStaffClaim: boolean;
};

/** Verifies the Bearer token and loads the caller's role. null = not signed in. */
export async function resolveTeamCaller(request: Request): Promise<TeamCaller | null> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  let uid: string;
  let tokenPhone = "";
  let hasStaffClaim = false;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
    tokenPhone = String(decoded.phone_number ?? "");
    hasStaffClaim = decoded.kdStaff === true;
  } catch {
    return null;
  }
  const db = getAdminDb();
  const idx = await db.collection("uidIndex").doc(uid).get();
  const phone = (idx.exists ? String(idx.data()?.phone ?? "") : "") || tokenPhone;
  const docs = await Promise.all([
    db.collection("users").doc(uid).get(),
    ...(phone ? [db.collection("users").doc(phone).get()] : []),
  ]);
  let role = "";
  let sections: string[] = [];
  for (const d of docs) {
    const u = d.exists ? d.data() ?? {} : {};
    if (u.role) {
      role = String(u.role);
      sections = Array.isArray(u.adminSections) ? u.adminSections.map(String) : [];
      if (role === "admin" || role === "team") break;
    }
  }
  const isAdmin = role === "admin";
  return {
    uid,
    phone,
    role,
    isAdmin,
    canManageAnyShop: isAdmin || (role === "team" && sections.includes("users")),
    hasStaffClaim,
  };
}

/**
 * Sets or clears the kdStaff sign-in claim. It only lets firestore.rules
 * skip their staff checks for everyone else at no cost — access itself is
 * always decided by the live staffIndex record. Keeps any other claims.
 * Returns true when it changed (the client must then refresh its token).
 */
export async function setStaffClaim(uid: string | null | undefined, on: boolean): Promise<boolean> {
  if (!uid) return false;
  try {
    const user = await getAdminAuth().getUser(uid);
    const claims = { ...(user.customClaims ?? {}) };
    if ((claims.kdStaff === true) === on) return false;
    if (on) claims.kdStaff = true;
    else delete claims.kdStaff;
    await getAdminAuth().setCustomUserClaims(uid, claims);
    return true;
  } catch (err) {
    // No auth account yet (helper never signed in): /api/team/me sets it later.
    console.warn("[shop-team] claim update skipped", err);
    return false;
  }
}

/** staffIndex/{phone} when it exists — stored as +91…, so both forms are tried. */
export async function getStaffRecord(phone: string): Promise<(StaffRecord & { id: string }) | null> {
  const key = phoneKey(phone);
  if (!key) return null;
  const db = getAdminDb();
  for (const id of [`+91${key}`, key]) {
    const snap = await db.collection("staffIndex").doc(id).get();
    if (snap.exists) return { id, ...(snap.data() as StaffRecord) };
  }
  return null;
}

/**
 * True when [callerPhone] is an ACTIVE helper of the shop [ownerPhone] with
 * [perm]. Order routes call this only after their owner check fails, so an
 * owner's request never pays the extra read.
 */
export async function isStaffOf(callerPhone: string | null | undefined, ownerPhone: unknown, perm: StaffPermission): Promise<boolean> {
  if (!callerPhone || !phoneKey(ownerPhone)) return false;
  const rec = await getStaffRecord(callerPhone).catch(() => null);
  return !!rec && phoneKey(rec.ownerPhone) === phoneKey(ownerPhone) && staffCan(rec, perm);
}

/**
 * In-app notification (notifications/{id}, the same doc shape the Cloud
 * Functions' notify() writes) plus an FCM push when the recipient has a
 * device token. Never throws — a team change must not fail on a push.
 */
export async function notifyPhone(
  phone: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<void> {
  const key = phoneKey(phone);
  if (!key) return;
  const db = getAdminDb();
  const variants = [`+91${key}`, key];
  try {
    await db.collection("notifications").add({
      recipientPhone: variants[0],
      recipientPhones: variants,
      type,
      title,
      body,
      data,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[shop-team] notification doc failed", err);
  }
  try {
    let token = "";
    for (const id of variants) {
      const snap = await db.collection("users").doc(id).get();
      token = String(snap.data()?.fcmToken ?? "");
      if (token) break;
    }
    if (!token) return;
    await getMessaging().send({
      token,
      notification: { title, body },
      data: { type, ...data },
      android: { priority: "high" },
      apns: {
        headers: { "apns-priority": "10", "apns-push-type": "alert" },
        payload: { aps: { sound: "default" } },
      },
    });
  } catch (err) {
    console.warn("[shop-team] push failed", err);
  }
}
