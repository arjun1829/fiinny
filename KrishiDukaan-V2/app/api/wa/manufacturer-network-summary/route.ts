import { NextResponse } from "next/server";
import { queueWaNotification } from "../../../lib/wa-notify";
import { getAdminDb } from "../../../lib/firebase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      manufacturerId?: string;
      manufacturerPhone?: string;
      count?: number;
    };

    const { manufacturerId = "", count = 0 } = body;
    let { manufacturerPhone = "" } = body;

    if (!manufacturerPhone && manufacturerId) {
      const db = getAdminDb();
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

    const dashboardLink = "https://krishidukan.com/dashboard/manufacturer/retailers";
    await queueWaNotification(
      manufacturerPhone,
      `✅ Retailer Network अपडेट\n\n${count} नवीन रिटेलर्स तुमच्या Network मध्ये सहभागी करण्यात आले आहेत.\n\nतुमचे Retailer Network पाहण्यासाठी Dashboard ला भेट द्या:\n${dashboardLink}`,
      {
        template: "generic",
        type: "general",
        source: { event: "bulk_retailer_upload", entityType: "manufacturer", entityId: manufacturerId },
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[wa/manufacturer-network-summary] Failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
