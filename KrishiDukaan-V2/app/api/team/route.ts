import { NextResponse } from "next/server";
import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "../../lib/firebase-admin";
import {
  STAFF_PERMISSION_INFO,
  cleanPermissions,
  phoneKey,
  toIndianE164,
  type ShopStaffHint,
  type StaffPermission,
  type StaffRecord,
  type TeamMember,
} from "../../lib/shop-team";
import { getStaffRecord, notifyPhone, resolveTeamCaller, setStaffClaim, type TeamCaller } from "../../lib/shop-team-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/team?owner=+91…   the shop's helpers (owner, or admin for any shop)
 * POST /api/team              { action: "add" | "update" | "remove", owner?, phone, name?, permissions?, status? }
 *
 * A shop may have any number of helpers.
 *
 * The only writer of shopTeams/, staffIndex/ and users/{helper}.shopStaff
 * (firestore.rules deny clients). Owners manage their own shop; admins (and
 * admin-team accounts with the "users" section) manage any shop on the
 * owner's behalf, and the owner is told.
 */

const SELLER_ROLES = ["retailer", "manufacturer"];
// A number that already runs its own shop or works in admin can't be a helper.
const BLOCKED_HELPER_ROLES = ["retailer", "manufacturer", "admin", "team", "salesExecutive", "salesManager"];

type Owner = { phone: string; uid: string; name: string; role: "retailer" | "manufacturer" };

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** users/{phone} in either stored form (+91… first). */
async function userDoc(phone: string): Promise<DocumentSnapshot | null> {
  const key = phoneKey(phone);
  if (!key) return null;
  const db = getAdminDb();
  for (const id of [`+91${key}`, key]) {
    const snap = await db.collection("users").doc(id).get();
    if (snap.exists) return snap;
  }
  return null;
}

async function loadOwner(phone: string): Promise<Owner | null> {
  const snap = await userDoc(phone);
  const d = snap?.data();
  if (!snap || !d || !SELLER_ROLES.includes(String(d.role))) return null;
  return {
    phone: `+91${phoneKey(snap.id)}`,
    uid: String(d.uid ?? "") || "",
    name: String(d.shopName || d.businessName || d.name || "Your shop").trim(),
    role: d.role,
  };
}

/** The shop this caller may manage, or an error response. */
async function authorize(caller: TeamCaller, requestedOwner: unknown): Promise<Owner | NextResponse> {
  const wanted = requestedOwner ? toIndianE164(requestedOwner) : null;
  if (requestedOwner && !wanted) return bad(400, "Invalid shop phone number.");
  const ownerPhone = wanted ?? toIndianE164(caller.phone);
  if (!ownerPhone) return bad(400, "No shop phone number on this account.");
  const isSelf = phoneKey(ownerPhone) === phoneKey(caller.phone);
  if (!isSelf && !caller.canManageAnyShop) return bad(403, "You can only manage your own shop's team.");
  const owner = await loadOwner(ownerPhone);
  if (!owner) return bad(404, "No retailer or manufacturer account found for this number.");
  return owner;
}

function toMember(snap: FirebaseFirestore.QueryDocumentSnapshot): TeamMember {
  const d = snap.data();
  const iso = (v: unknown) =>
    v && typeof (v as FirebaseFirestore.Timestamp).toDate === "function"
      ? (v as FirebaseFirestore.Timestamp).toDate().toISOString()
      : null;
  return {
    phone: snap.id,
    name: String(d.name ?? ""),
    permissions: cleanPermissions(d.permissions),
    status: d.status === "paused" ? "paused" : "active",
    addedBy: d.addedBy === "admin" ? "admin" : "owner",
    lastActiveAt: iso(d.lastActiveAt),
    createdAt: iso(d.createdAt),
  };
}

function permissionText(perms: StaffPermission[]): string {
  return perms.map((p) => STAFF_PERMISSION_INFO[p].label).join(", ") || "no sections yet";
}

export async function GET(request: Request) {
  const caller = await resolveTeamCaller(request);
  if (!caller) return bad(401, "Please sign in again.");
  const owner = await authorize(caller, new URL(request.url).searchParams.get("owner"));
  if (owner instanceof NextResponse) return owner;
  const snap = await getAdminDb().collection("shopTeams").doc(owner.phone).collection("members").get();
  return NextResponse.json({
    owner: { phone: owner.phone, name: owner.name, role: owner.role },
    members: snap.docs.map(toMember).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "")),
  });
}

export async function POST(request: Request) {
  const caller = await resolveTeamCaller(request);
  if (!caller) return bad(401, "Please sign in again.");

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* handled below */ }
  const action = String(body.action ?? "");

  const owner = await authorize(caller, body.owner);
  if (owner instanceof NextResponse) return owner;

  const db = getAdminDb();
  const teamRef = db.collection("shopTeams").doc(owner.phone);
  const byAdmin = phoneKey(caller.phone) !== phoneKey(owner.phone);
  const actor = byAdmin ? "KrishiDukan admin" : owner.name;

  const staffPhone = toIndianE164(body.phone);
  if (!staffPhone) return bad(400, "Enter a valid 10-digit mobile number.");
  if (phoneKey(staffPhone) === phoneKey(owner.phone)) return bad(400, "That's the shop owner's own number.");
  const memberRef = teamRef.collection("members").doc(staffPhone);
  const indexRef = db.collection("staffIndex").doc(staffPhone);
  const now = FieldValue.serverTimestamp();
  const activity = () => teamRef.collection("activity").doc();

  if (action === "add") {
    const name = String(body.name ?? "").trim().slice(0, 60);
    if (!name) return bad(400, "Enter the helper's name.");
    const permissions = cleanPermissions(body.permissions);
    if (permissions.length === 0) return bad(400, "Choose at least one thing the helper can do.");

    const [staffUser, existingRec, memberSnap] = await Promise.all([
      userDoc(staffPhone),
      getStaffRecord(staffPhone),
      memberRef.get(),
    ]);
    if (memberSnap.exists) return bad(409, "This number is already in the team.");
    const staffRole = String(staffUser?.data()?.role ?? "");
    if (BLOCKED_HELPER_ROLES.includes(staffRole)) {
      return bad(409, "This number already has its own KrishiDukan seller or staff account, so it can't be a helper.");
    }
    if (existingRec && phoneKey(existingRec.ownerPhone) !== phoneKey(owner.phone)) {
      return bad(409, "This number is already a helper for another shop.");
    }

    const hint: ShopStaffHint = { ownerPhone: owner.phone, ownerName: owner.name, ownerRole: owner.role };
    const record: StaffRecord = { ...hint, ownerUid: owner.uid, staffName: name, permissions, status: "active" };
    const batch = db.batch();
    batch.set(memberRef, {
      phone: staffPhone, name, permissions, status: "active",
      addedBy: byAdmin ? "admin" : "owner", addedByUid: caller.uid,
      createdAt: now, updatedAt: now,
    });
    batch.set(indexRef, { ...record, updatedAt: now });
    if (staffUser) {
      batch.update(staffUser.ref, { shopStaff: hint, updatedAt: now });
    } else {
      // Pre-created like an admin-created account, so the helper's first OTP
      // login goes straight in (web LoginView / app OTP screen link the uid).
      batch.set(db.collection("users").doc(staffPhone), {
        phone: staffPhone, uid: null, name, email: null, role: "customer",
        isPaid: false, totalSeats: 0, productCount: 0,
        shopStaff: hint, preCreatedForShopTeam: owner.phone,
        createdAt: now, updatedAt: now,
      });
    }
    batch.set(activity(), { type: "added", phone: staffPhone, name, permissions, by: caller.uid, byAdmin, at: now });
    await batch.commit();
    // A helper who already has a login gets the claim now; others on first visit.
    await setStaffClaim(staffUser?.data()?.uid, true);

    await Promise.all([
      notifyPhone(staffPhone, "shop_team", `You're on ${owner.name}'s team`,
        `${actor} added you as a helper on KrishiDukan (${permissionText(permissions)}). Log in with this number to manage the shop.`,
        { route: "/dashboard" }),
      byAdmin
        ? notifyPhone(owner.phone, "shop_team", "New helper added to your shop",
          `KrishiDukan added ${name} (${staffPhone}) to your team with access to ${permissionText(permissions)}. You can change or remove this anytime from Team.`,
          { route: "/dashboard/team" })
        : Promise.resolve(),
    ]);
    return NextResponse.json({ ok: true });
  }

  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) return bad(404, "This helper is not in the team.");
  const member = memberSnap.data() ?? {};

  if (action === "update") {
    const patch: Record<string, unknown> = { updatedAt: now };
    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 60);
      if (!name) return bad(400, "Enter the helper's name.");
      patch.name = name;
    }
    if (body.permissions !== undefined) {
      const permissions = cleanPermissions(body.permissions);
      if (permissions.length === 0) return bad(400, "Choose at least one thing the helper can do.");
      patch.permissions = permissions;
    }
    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "paused") return bad(400, "Invalid status.");
      patch.status = body.status;
    }
    const batch = db.batch();
    batch.update(memberRef, patch);
    // The whole record every time, so staffIndex can never drift from the member doc.
    const record: StaffRecord = {
      ownerPhone: owner.phone, ownerName: owner.name, ownerRole: owner.role, ownerUid: owner.uid,
      staffName: String(patch.name ?? member.name ?? ""),
      permissions: (patch.permissions as StaffPermission[] | undefined) ?? cleanPermissions(member.permissions),
      status: ((patch.status ?? member.status) === "paused" ? "paused" : "active"),
    };
    batch.set(indexRef, { ...record, updatedAt: now });
    batch.set(activity(), { type: "updated", phone: staffPhone, changes: { ...patch, updatedAt: null }, by: caller.uid, byAdmin, at: now });
    await batch.commit();
    if (patch.status && patch.status !== member.status) {
      await notifyPhone(staffPhone, "shop_team",
        patch.status === "paused" ? `Access to ${owner.name} paused` : `Access to ${owner.name} restored`,
        patch.status === "paused"
          ? `${actor} paused your helper access on KrishiDukan.`
          : `${actor} restored your helper access. Open the dashboard to continue.`,
        { route: "/dashboard" });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    const staffUser = await userDoc(staffPhone);
    const batch = db.batch();
    batch.delete(memberRef);
    batch.delete(indexRef);
    if (staffUser && phoneKey(staffUser.data()?.shopStaff?.ownerPhone) === phoneKey(owner.phone)) {
      batch.update(staffUser.ref, { shopStaff: FieldValue.delete(), updatedAt: now });
    }
    batch.set(activity(), { type: "removed", phone: staffPhone, name: String(member.name ?? ""), by: caller.uid, byAdmin, at: now });
    await batch.commit();
    await setStaffClaim(staffUser?.data()?.uid, false);
    await Promise.all([
      notifyPhone(staffPhone, "shop_team", `Removed from ${owner.name}'s team`,
        `${actor} removed your helper access on KrishiDukan.`),
      byAdmin
        ? notifyPhone(owner.phone, "shop_team", "Helper removed",
          `KrishiDukan removed ${String(member.name ?? staffPhone)} from your team.`, { route: "/dashboard/team" })
        : Promise.resolve(),
    ]);
    return NextResponse.json({ ok: true });
  }

  return bad(400, "Unknown action.");
}
