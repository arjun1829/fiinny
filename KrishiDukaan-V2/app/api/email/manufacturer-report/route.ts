import { NextResponse } from "next/server";
import { sendEmail } from "../../../lib/email/mailer";
import { buildWeeklyReportEmail } from "../../../lib/email/report-template";
import type { ManufacturerReportData } from "../../../lib/reports/manufacturer-report-data";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      // Path A (admin UI): full report data pre-built client-side — no firebase-admin needed
      reportData?: ManufacturerReportData;
      // Path B (cron / server-side): just the ID — API fetches data using ADC
      manufacturerId?: string;
      sentBy?: "admin" | "cron";
    };

    const { sentBy = "admin" } = body;
    let data: ManufacturerReportData | null = null;

    if (body.reportData) {
      // Path A: use pre-built data from the admin page
      data = body.reportData;
    } else if (body.manufacturerId) {
      // Path B: fetch data server-side using firebase-admin + ADC
      const { fetchManufacturerReportData } = await import("../../../lib/reports/manufacturer-report-data");
      data = await fetchManufacturerReportData(body.manufacturerId);
    }

    if (!data || !data.manufacturerEmail) {
      return NextResponse.json(
        { ok: false, error: "No report data or manufacturer email." },
        { status: 400 },
      );
    }

    const { html, text } = buildWeeklyReportEmail(data);
    await sendEmail({
      to: data.manufacturerEmail,
      subject: `Your Weekly KrishiDukan Network Report — ${data.manufacturerName}`,
      html,
      text,
    });

    // Record in Firestore (best-effort — don't fail the response if this errors)
    try {
      const { recordReportSent } = await import("../../../lib/reports/manufacturer-report-data");
      await recordReportSent(data.manufacturerId, sentBy);
    } catch {
      // Non-fatal — ADC may not be available locally
    }

    return NextResponse.json({ ok: true, sentTo: data.manufacturerEmail });
  } catch (error) {
    console.error("[email/manufacturer-report]", error);
    return NextResponse.json({ ok: false, error: "Failed to send report." }, { status: 500 });
  }
}
