import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";

// POST /api/admin/delete-user
// Deletes the Firebase Auth account for the given uid.
// Firestore cleanup is done client-side by adminDeleteUser() in firebase.ts.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetUid, callerUid } = body as { targetUid?: string; callerUid?: string };

    if (!targetUid)  return NextResponse.json({ error: "targetUid required." }, { status: 400 });
    if (!callerUid)  return NextResponse.json({ error: "Unauthorized."        }, { status: 401 });

    const adminDb   = getAdminDb();
    const adminAuth = getAdminAuth();

    // Verify caller is admin
    const [callerDoc, idxDoc] = await Promise.all([
      adminDb.collection("users").doc(callerUid).get(),
      adminDb.collection("uidIndex").doc(callerUid).get(),
    ]);
    let isAdmin = callerDoc.exists && callerDoc.data()?.role === "admin";
    if (!isAdmin && idxDoc.exists) {
      const callerPhone = idxDoc.data()?.phone;
      if (callerPhone) {
        const phoneDoc = await adminDb.collection("users").doc(callerPhone).get();
        isAdmin = phoneDoc.exists && phoneDoc.data()?.role === "admin";
      }
    }
    if (!isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

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
