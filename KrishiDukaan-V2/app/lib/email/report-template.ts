import type { ManufacturerReportData } from "../reports/manufacturer-report-data";

function fmt(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statBox(label: string, value: string | number, color: string) {
  return `
    <td style="padding:0 8px 0 0;width:25%;">
      <div style="background:${color};border-radius:12px;padding:14px 16px;text-align:center;">
        <p style="margin:0;font-size:26px;font-weight:800;color:#111827;">${value}</p>
        <p style="margin:4px 0 0;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${label}</p>
      </div>
    </td>`;
}

function statusBadge(status: string): string {
  const isActive = status === "active";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:${isActive ? "#dcfce7" : "#fef9c3"};color:${isActive ? "#15803d" : "#854d0e"};">${isActive ? "Active" : "Invited"}</span>`;
}

export function buildWeeklyReportEmail(data: ManufacturerReportData): { html: string; text: string } {
  const weekEndDate = fmt(data.reportGeneratedAt);
  const hasActivity = data.newRetailersThisWeek > 0 || data.newAssignmentsThisWeek > 0;
  const dashboardLink = process.env.NEXT_PUBLIC_BASE_URL
    ? `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/manufacturer/retailers`
    : "/dashboard/manufacturer/retailers";

  const retailerRows = data.retailers
    .map(
      (r) => `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 12px;">
          <p style="margin:0;font-size:13px;font-weight:600;color:#111827;">${r.shopName || r.ownerName || "—"}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#9ca3af;">${r.retailerEmail || "No email"}</p>
        </td>
        <td style="padding:10px 12px;text-align:center;">${statusBadge(r.status)}</td>
        <td style="padding:10px 12px;text-align:center;font-size:13px;font-weight:600;color:#374151;">${r.productsAssigned}</td>
        <td style="padding:10px 12px;font-size:11px;color:#9ca3af;">${fmt(r.addedAt)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weekly Report — KrishiDukan</title>
</head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:8px;">
      <span style="font-size:22px;font-weight:800;color:#2d6a4f;letter-spacing:-0.5px;">KrishiDukan</span>
    </div>
    <p style="text-align:center;margin:0 0 24px;font-size:13px;color:#6b7280;">Weekly Network Report · ${weekEndDate}</p>

    <!-- Card -->
    <div style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

      <!-- Greeting -->
      <div style="background:linear-gradient(135deg,#2d6a4f 0%,#40916c 100%);padding:28px 28px 24px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#b7e4c7;">Weekly Summary</p>
        <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">Hello, ${data.manufacturerName}!</h1>
        <p style="margin:8px 0 0;font-size:14px;color:#d8f3dc;">Here's how your retailer network performed this week.</p>
      </div>

      <div style="padding:24px 28px;">

        <!-- Stats row -->
        <table style="width:100%;border-collapse:separate;border-spacing:0 0;margin-bottom:24px;" cellpadding="0" cellspacing="0">
          <tr>
            ${statBox("Retailers", data.activeRetailers, "#f0fdf4")}
            ${statBox("Assigned Products", data.activeAssignments, "#eff6ff")}
            ${statBox("Seats Used", `${data.seatsUsed}/${data.seatsPurchased}`, "#fefce8")}
            ${statBox("Sub. Status", data.subscriptionStatus === "active" ? "Active" : "Expired", data.subscriptionStatus === "active" ? "#f0fdf4" : "#fff7ed")}
          </tr>
        </table>

        ${
          data.subscriptionExpiry
            ? `<p style="margin:-12px 0 20px;font-size:12px;color:#9ca3af;text-align:center;">Subscription expires on <strong>${fmt(data.subscriptionExpiry)}</strong></p>`
            : ""
        }

        <!-- This week highlight -->
        ${
          hasActivity
            ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.06em;">This Week's Activity</p>
            <div style="display:flex;gap:24px;flex-wrap:wrap;">
              ${data.newRetailersThisWeek > 0 ? `<div><span style="font-size:24px;font-weight:800;color:#15803d;">${data.newRetailersThisWeek}</span><span style="font-size:12px;color:#4ade80;"> &uarr;</span><br/><span style="font-size:12px;color:#166534;">New Retailer${data.newRetailersThisWeek !== 1 ? "s" : ""}</span></div>` : ""}
              ${data.newAssignmentsThisWeek > 0 ? `<div><span style="font-size:24px;font-weight:800;color:#15803d;">${data.newAssignmentsThisWeek}</span><span style="font-size:12px;color:#4ade80;"> &uarr;</span><br/><span style="font-size:12px;color:#166534;">Product Assignment${data.newAssignmentsThisWeek !== 1 ? "s" : ""}</span></div>` : ""}
            </div>
          </div>`
            : `<div style="background:#f9fafb;border-radius:12px;padding:14px 18px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#9ca3af;">No new activity this week. Add retailers or assign products to grow your network.</p>
          </div>`
        }

        <!-- Retailer table -->
        ${
          data.retailers.length > 0
            ? `<div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">
            <div style="background:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;">Your Retailer Network</p>
            </div>
            <table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">
              <thead>
                <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb;">
                  <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:0.06em;">Retailer</th>
                  <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:0.06em;">Status</th>
                  <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:0.06em;">Products</th>
                  <th style="padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:0.06em;">Added</th>
                </tr>
              </thead>
              <tbody>${retailerRows}</tbody>
            </table>
            ${data.totalRetailers > 20 ? `<div style="padding:10px 16px;background:#f9fafb;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">Showing 20 of ${data.totalRetailers} retailers. View all in your dashboard.</p></div>` : ""}
          </div>`
            : `<p style="font-size:13px;color:#9ca3af;margin-bottom:24px;">No retailers in your network yet.</p>`
        }

        <!-- CTA -->
        <div style="text-align:center;">
          <a href="${dashboardLink}" style="display:inline-block;padding:13px 32px;background:#2d6a4f;color:#ffffff;font-size:15px;font-weight:700;border-radius:12px;text-decoration:none;">
            Open My Dashboard →
          </a>
        </div>

      </div>
    </div>

    <!-- Footer -->
    <p style="text-align:center;margin-top:24px;font-size:11px;color:#9ca3af;line-height:1.6;">
      © KrishiDukan · You receive this because you are a manufacturer on our platform.<br/>
      Report generated on ${fmt(data.reportGeneratedAt)}.
    </p>

  </div>
</body>
</html>`;

  const text = `KrishiDukan Weekly Report — ${weekEndDate}

Hello ${data.manufacturerName},

NETWORK SUMMARY
• Active Retailers: ${data.activeRetailers}
• Assigned Products: ${data.activeAssignments}
• Seats Used: ${data.seatsUsed}/${data.seatsPurchased}
• Subscription: ${data.subscriptionStatus}${data.subscriptionExpiry ? ` (expires ${fmt(data.subscriptionExpiry)})` : ""}

THIS WEEK
• New Retailers Added: ${data.newRetailersThisWeek}
• New Product Assignments: ${data.newAssignmentsThisWeek}

Open your dashboard: ${dashboardLink}`;

  return { html, text };
}
