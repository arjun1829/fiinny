import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "../../../lib/firebase-admin";
import { requireAdmin } from "../../../lib/admin-auth";

// POST /api/admin/delete-user
// Deletes the Firebase Auth account for the given uid.
// Firestore cleanup is done client-side by adminDeleteUser() in firebase.ts.
export async function POST(req: NextRequest) {
  try {
    // Deleting an auth account on the say-so of a uid in the request body is
    // the same hole create-user had. The token decides who the caller is.
    const caller = await requireAdmin(req);
    if (caller instanceof NextResponse) return caller;

    const body = await req.json();
    const { targetUid } = body as { targetUid?: string };
    if (!targetUid) return NextResponse.json({ error: "targetUid required." }, { status: 400 });

    const adminAuth = getAdminAuth();

    // Delete Firebase Auth user
    try {
      await adminAuth.deleteUser(targetUid);
    } catch (e: any) {
      if (e?.code !== "auth/user-not-found") throw e;
      // Already gone — not an error
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[delete-user]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete auth user." },
      { status: 500 },
    );
  }
}
