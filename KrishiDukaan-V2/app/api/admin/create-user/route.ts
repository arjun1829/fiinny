import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";
import { requireAdmin } from "../../../lib/admin-auth";
import { FieldValue } from "firebase-admin/firestore";
import { ADMIN_SECTIONS, type AdminSection } from "../../../admin/_context/admin-sections";

// ─── POST /api/admin/create-user ─────────────────────────────────────────────
//
// Handles ADMIN, "team" (limited-access admin-portal staff), and
// salesExecutive account creation (email + password → Firebase Auth).
// Non-admin-portal roles (retailer / manufacturer / consumer) are written
// directly to Firestore from the browser — the admin client token satisfies
// the rules and no server hop is needed.

export async function POST(req: NextRequest) {
  try {
    // The caller is whoever holds the verified ID token, never whoever the
    // request body claims to be. This route previously read `callerUid` from
    // the body and looked the admin up with it, so anyone who knew an
    // administrator's uid could mint themselves an admin account.
    const caller = await requireAdmin(req);
    if (caller instanceof NextResponse) return caller;

    const body = await req.json();
    const { name, email, password, role: rawRole, adminSections: rawSections } = body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      adminSections?: string[];
    };

    // Email/password roles this route can provision. All live at users/{uid}.
    const role =
      rawRole === "salesExecutive" ? "salesExecutive" :
      rawRole === "team" ? "team" :
      "admin";

    // Team accounts need at least one granted section — an admin account
    // with zero tabs would just be a dead login. "team" itself is never
    // grantable — it would let a team member manage/create other team
    // accounts, i.e. self-escalate past the whole point of the role.
    const GRANTABLE_SECTIONS = (ADMIN_SECTIONS as readonly string[]).filter((s) => s !== "team");
    const adminSections: AdminSection[] = role === "team"
      ? (Array.isArray(rawSections) ? rawSections : []).filter(
          (s): s is AdminSection => GRANTABLE_SECTIONS.includes(s),
        )
      : [];
    if (role === "team" && adminSections.length === 0) {
      return NextResponse.json({ error: "Select at least one section for this team member." }, { status: 400 });
    }

    if (!email?.trim())  return NextResponse.json({ error: "Email is required." },                       { status: 400 });
    if (!password || password.length < 6)
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    const adminDb   = getAdminDb();
    const adminAuth = getAdminAuth();

    // ── Create Firebase Auth user (email + password) ──────────────────────────
    let newUser;
    try {
      newUser = await adminAuth.createUser({
        email: email.trim().toLowerCase(),
        password,
        displayName: (name || "").trim() || undefined,
      });
    } catch (e: any) {
      if (e?.code === "auth/email-already-exists") {
        return NextResponse.json({ error: "A Firebase account with this email already exists." }, { status: 409 });
      }
      throw e;
    }

    const uid = newUser.uid;
    const now = FieldValue.serverTimestamp();

    // Email-based accounts (admin + team + salesExecutive) live at
    // users/{uid} (uid as doc ID) — matching the existing admin schema.
    await adminDb.collection("users").doc(uid).set({
      uid,
      name: (name || "").trim(),
      email: email.trim().toLowerCase(),
      role,
      // Admins are treated as paid; team/sales-exec accounts are internal
      // staff, not subscribers.
      isPaid: role === "admin",
      totalSeats: 0,
      productCount: 0,
      ...(role === "team" ? { adminSections } : {}),
      createdByAdmin: caller.uid,
      createdAt: now,
      updatedAt: now,
    });

    await adminDb.collection("adminLogs").doc().set({
      action:
        role === "salesExecutive" ? "admin_create_sales_executive" :
        role === "team" ? "admin_create_team_user" :
        "admin_create_admin_user",
      targetUid: uid,
      targetEmail: email.trim().toLowerCase(),
      performedBy: caller.uid,
      ...(role === "team" ? { adminSections } : {}),
      createdAt: now,
    });

    const loginPath = role === "salesExecutive" ? "/sales/login" : "/admin-login";
    const label     = role === "salesExecutive" ? "Sales Executive" : role === "team" ? "Team" : "Admin";
    return NextResponse.json({
      success: true,
      uid,
      message: `${label} account created. They can log in at ${loginPath} with ${email.trim().toLowerCase()}.`,
    });

  } catch (e: unknown) {
    console.error("[create-admin-user]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create admin user." },
      { status: 500 },
    );
  }
}
