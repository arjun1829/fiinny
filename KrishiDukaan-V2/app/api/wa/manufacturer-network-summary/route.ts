import { NextResponse } from "next/server";
import { queueWaNotification } from "../../../lib/wa-notify";
import { getAdminDb } from "../../../lib/firebase-admin";

/** Resolves the best available display name for a manufacturer doc. */
function extractName(d: Record<string, unknown>): { ownerName: string; businessName: string; shopName: string } {
  return {
    ownerName:   String(d.ownerName   ?? "").trim(),
    businessName: String(d.businessName ?? d.name ?? "").trim(),
    shopName:    String(d.shopName    ?? "").trim(),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      manufacturerId?: string;
      manufacturerPhone?: string;
      count?: number;
    };

    const { manufacturerId = "", count = 0 } = body;
    let { manufacturerPhone = "" } = body;

    const db = getAdminDb();

    // Resolve phone from uidIndex → users if not provided directly
    if (!manufacturerPhone && manufacturerId) {
      try {
        const idxSnap = await db.collection("uidIndex").doc(manufacturerId).get();
        if (idxSnap.exists) manufacturerPhone = String(idxSnap.data()?.phone ?? "").trim();
      } catch { /* ignore */ }

      if (!manufacturerPhone) {
        try {
          const userSnap = await db.collection("users").doc(manufacturerId).get();
          if (userSnap.exists) manufacturerPhone = String(userSnap.data()?.phone ?? "").trim();
        } catch { /* ignore */ }
      }
    }

    if (!manufacturerPhone || count <= 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Resolve name fields — try manufacturers then users, by phone then by UID
    let nameFields = { ownerName: "", businessName: "", shopName: "" };
    const lookupKeys = [
      ...(manufacturerPhone ? [manufacturerPhone] : []),
      ...(manufacturerId ? [manufacturerId] : []),
    ];
    outer: for (const key of lookupKeys) {
      for (const col of ["manufacturers", "users"]) {
        try {
          const snap = await db.collection(col).doc(key).get();
          if (!snap.exists) continue;
          const fields = extractName(snap.data() as Record<string, unknown>);
          if (fields.ownerName || fields.businessName || fields.shopName) {
            nameFields = fields;
            break outer;
          }
        } catch { /* keep trying */ }
      }
    }

    await queueWaNotification(
      manufacturerPhone,
      `${count} नवीन रिटेलर्स तुमच्या Network मध्ये सहभागी करण्यात आले आहेत.`,
      {
        template: "manufacturer_network_summary",
        type: "general",
        payload: {
          ownerName:    nameFields.ownerName,
          businessName: nameFields.businessName,
          shopName:     nameFields.shopName,
          retailerCount: String(count),
        },
        source: { event: "bulk_retailer_upload", entityType: "manufacturer", entityId: manufacturerId },
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[wa/manufacturer-network-summary] Failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
