import { NextResponse } from "next/server";
import { sendEmail } from "../../../lib/email/mailer";
import { buildWeeklyReportEmail } from "../../../lib/email/report-template";
import {
  fetchAllManufacturerIds,
  fetchManufacturerReportData,
  recordReportSent,
} from "../../../lib/reports/manufacturer-report-data";

// Secured by CRON_SECRET header. Call from admin UI or an external scheduler.
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const manufacturerIds = await fetchAllManufacturerIds();
  const results = { sent: 0, skipped: 0, failed: 0, errors: [] as string[] };

  for (const manufacturerId of manufacturerIds) {
    try {
      const data = await fetchManufacturerReportData(manufacturerId);
      if (!data || !data.manufacturerEmail) {
        results.skipped++;
        continue;
      }

      const { html, text } = buildWeeklyReportEmail(data);
      await sendEmail({
        to: data.manufacturerEmail,
        subject: `Your Weekly KrishiDukan Network Report — ${data.manufacturerName}`,
        html,
        text,
      });

      await recordReportSent(manufacturerId, "cron");
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${manufacturerId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
