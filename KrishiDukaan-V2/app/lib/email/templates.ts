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

  const isExisting = !inviteCode;

  const html = wrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">${isExisting ? "You've been added to a new network!" : "You're invited to KrishiDukan!"}</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;">
      <strong>${manufacturerName}</strong> has added <strong>${displayName}</strong> to their retailer network on KrishiDukan.
      ${isExisting ? "Log in to your account to start selling their products directly to farmers." : "Create your free account to start selling their products directly to farmers."}
    </p>

    ${!isExisting ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Your Invite Code</p>
      <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;color:#15803d;font-family:monospace;">${inviteCode}</p>
    </div>
    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">Or click the button below — the code is pre-filled for you:</p>
    ` : `
    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">Click the button below to log in and access your new products:</p>
    `}
    
    ${button(inviteLink, isExisting ? "Log in to my account →" : "Create my account →")}

    <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb;" />
    <p style="margin:0;font-size:13px;color:#9ca3af;">
      This invite link is unique to your shop. If you did not expect this email, you can safely ignore it.
    </p>
  `);

  const text = isExisting
    ? `You've been added to a new network!\n\n${manufacturerName} has added ${displayName} to their retailer network.\n\nLog in here: ${inviteLink}`
    : `You're invited to KrishiDukan!\n\n${manufacturerName} has added ${displayName} to their retailer network.\n\nYour invite code: ${inviteCode}\n\nSign up here: ${inviteLink}`;

  return { html, text };
}

// ─── Subscription Confirmation ───────────────────────────────────────────────

export function buildSubscriptionConfirmationEmail(params: {
  userName: string;
  userEmail: string;
  seatsPurchased: number;
  amountPaid: number;
  planName: string;
  startDate: string;
  expiryDate: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
}) {
  const {
    userName,
    seatsPurchased,
    amountPaid,
    planName,
    startDate,
    expiryDate,
    razorpayPaymentId,
    razorpayOrderId,
  } = params;
  const displayName = userName || "Valued User";

  const html = wrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Payment Successful!</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;">
      Hello <strong>${displayName}</strong>, your subscription purchase on KrishiDukan was successful.
      Your product listing seats are now active and ready to use.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Subscription Details</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;width:50%;">Plan</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#111827;">${planName}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">Seats Purchased</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#111827;">${seatsPurchased}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">Amount Paid</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#111827;">₹${amountPaid}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">Valid From</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#111827;">${startDate}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#374151;">Expires On</td><td style="padding:4px 0;font-size:13px;font-weight:700;color:#15803d;">${expiryDate}</td></tr>
      </table>
    </div>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Payment Reference</p>
      <p style="margin:0;font-size:12px;color:#374151;">Order ID: <span style="font-family:monospace;">${razorpayOrderId}</span></p>
      <p style="margin:4px 0 0;font-size:12px;color:#374151;">Payment ID: <span style="font-family:monospace;">${razorpayPaymentId}</span></p>
    </div>

    <p style="margin:0 0 4px;font-size:14px;color:#374151;">
      You can now list up to <strong>${seatsPurchased} product${seatsPurchased !== 1 ? "s" : ""}</strong> in your catalogue or assign them to your retailer network.
    </p>
    ${button("https://krishidukan-e8315.web.app/dashboard", "Go to my Dashboard →")}

    <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb;" />
    <p style="margin:0;font-size:13px;color:#9ca3af;">
      If you have any questions about your subscription, reply to this email or contact support.
    </p>
  `);

  const text = `Payment Successful!\n\nHello ${displayName}, your KrishiDukan subscription is now active.\n\nPlan: ${planName}\nSeats: ${seatsPurchased}\nAmount: ₹${amountPaid}\nValid From: ${startDate}\nExpires: ${expiryDate}\nPayment ID: ${razorpayPaymentId}\n\nGo to your dashboard: https://krishidukan-e8315.web.app/dashboard`;

  return { html, text };
}

// ─── Product Assignment Notification ─────────────────────────────────────────

export function buildProductAssignedEmail(params: {
  shopName: string;
  productName: string;
  manufacturerName: string;
  actionLink: string;
  inviteCode?: string;
  retailerStatus?: string;
}) {
  const { shopName, productName, manufacturerName, actionLink, inviteCode = "", retailerStatus = "active" } = params;
  const displayName = shopName || "your shop";
  const isNew = Boolean(inviteCode && retailerStatus === "invited");

  const html = wrapper(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">New product assigned to you</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;">
      <strong>${manufacturerName}</strong> has assigned the product <strong>"${productName}"</strong> to <strong>${displayName}</strong>.
      ${isNew ? "Create your free account to start selling it directly to farmers." : "Log in to your dashboard to manage your inventory and start selling."}
    </p>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#1e40af;text-transform:uppercase;letter-spacing:0.05em;">Product Assigned</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:#1d4ed8;">${productName}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#3b82f6;">by ${manufacturerName}</p>
    </div>

    ${isNew ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Your Invite Code</p>
      <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;color:#15803d;font-family:monospace;">${inviteCode}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#166534;">The button below signs you up and applies this code automatically.</p>
    </div>
    ` : ""}

    ${button(actionLink, isNew ? "Create my account & accept →" : "Go to my inventory →")}

    <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb;" />
    <p style="margin:0;font-size:13px;color:#9ca3af;">
      You received this because you are part of ${manufacturerName}'s retailer network on KrishiDukan.
    </p>
  `);

  const text = isNew
    ? `New product assigned: "${productName}" by ${manufacturerName}.\n\nYour invite code: ${inviteCode}\n\nCreate your account and start selling:\n${actionLink}`
    : `New product assigned: "${productName}" by ${manufacturerName}.\n\nLog in to your inventory here:\n${actionLink}`;

  return { html, text };
}
