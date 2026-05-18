const BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f4f7f0;
  margin: 0;
  padding: 0;
`;

function wrapper(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KrishiDukan</title>
</head>
<body style="${BASE_STYLES}">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <!-- Logo / Brand -->
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:22px;font-weight:700;color:#2d6a4f;letter-spacing:-0.5px;">KrishiDukan</span>
    </div>
    <!-- Card -->
    <div style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.07);">
      ${content}
    </div>
    <!-- Footer -->
    <p style="text-align:center;margin-top:24px;font-size:12px;color:#6b7280;">
      © KrishiDukan · You are receiving this because a manufacturer added you to their network.
    </p>
  </div>
</body>
</html>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:#2d6a4f;color:#ffffff;font-size:15px;font-weight:600;border-radius:10px;text-decoration:none;">${label}</a>`;
}

// ─── Retailer Invitation ──────────────────────────────────────────────────────

export function buildInviteEmail(params: {
  shopName: string;
  inviteCode: string;
  inviteLink: string;
  manufacturerName: string;
}) {
  const { shopName, inviteCode, inviteLink, manufacturerName } = params;
  const displayName = shopName || "your shop";

  const html = wrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">You're invited to KrishiDukan!</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;">
      <strong>${manufacturerName}</strong> has added <strong>${displayName}</strong> to their retailer network on KrishiDukan.
      Create your free account to start selling their products directly to farmers.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Your Invite Code</p>
      <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;color:#15803d;font-family:monospace;">${inviteCode}</p>
    </div>

    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">Or click the button below — the code is pre-filled for you:</p>
    ${button(inviteLink, "Create my account →")}

    <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb;" />
    <p style="margin:0;font-size:13px;color:#9ca3af;">
      This invite link is unique to your shop. If you did not expect this email, you can safely ignore it.
    </p>
  `);

  const text = `You're invited to KrishiDukan!\n\n${manufacturerName} has added ${displayName} to their retailer network.\n\nYour invite code: ${inviteCode}\n\nSign up here: ${inviteLink}`;

  return { html, text };
}

// ─── Product Assignment Notification ─────────────────────────────────────────

export function buildProductAssignedEmail(params: {
  shopName: string;
  productName: string;
  manufacturerName: string;
  signupLink: string;
}) {
  const { shopName, productName, manufacturerName, signupLink } = params;
  const displayName = shopName || "your shop";

  const html = wrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">New product assigned to you</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;">
      <strong>${manufacturerName}</strong> has assigned the product <strong>"${productName}"</strong> to <strong>${displayName}</strong>.
      You have been opted in for production notifications for this product.
    </p>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#1e40af;text-transform:uppercase;letter-spacing:0.05em;">Product Assigned</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:#1d4ed8;">${productName}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#3b82f6;">by ${manufacturerName}</p>
    </div>

    <p style="margin:0 0 4px;font-size:14px;color:#374151;">
      Log in to your KrishiDukan dashboard to manage your inventory and start selling this product.
    </p>
    ${button(signupLink, "Go to my dashboard →")}

    <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb;" />
    <p style="margin:0;font-size:13px;color:#9ca3af;">
      You received this because you are part of ${manufacturerName}'s retailer network on KrishiDukan.
    </p>
  `);

  const text = `New product assigned: "${productName}" by ${manufacturerName}.\n\nYou have been opted in for production notifications for this product.\n\nLog in here: ${signupLink}`;

  return { html, text };
}
