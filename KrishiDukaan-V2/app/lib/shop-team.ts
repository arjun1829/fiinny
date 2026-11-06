/**
 * Shop team ("helpers"): people a retailer or manufacturer lets manage their
 * shop with their OWN phone login. Shared by the website, the server API and
 * (mirrored in) the app — safe to import anywhere.
 *
 * Firestore layout (all writes go through /api/team with the Admin SDK):
 *   shopTeams/{ownerPhone}/members/{helperPhone}   the owner's team list
 *   shopTeams/{ownerPhone}/activity/{id}           who added/changed/removed whom
 *   staffIndex/{helperPhone}                       what firestore.rules trust
 *   users/{helperPhone}.shopStaff                  login hint, so web/app spot
 *                                                  staff mode with no extra read
 */

export const STAFF_PERMISSIONS = ["products", "orders", "reels", "shopPage", "analytics"] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const STAFF_PERMISSION_INFO: Record<StaffPermission, { label: string; hint: string }> = {
  products: { label: "Products & stock", hint: "Add and edit products, prices, offers and stock" },
  orders: { label: "Orders", hint: "See orders, accept, reject and dispatch them" },
  reels: { label: "Agri Reels", hint: "Upload and delete reels for the shop" },
  shopPage: { label: "Shop page", hint: "Edit the shop's public page: photos, tagline, highlights" },
  analytics: { label: "Sales & analytics", hint: "See views, sales and reports" },
};

export const STAFF_PRESETS: { key: string; label: string; permissions: StaffPermission[] }[] = [
  { key: "helper", label: "Store helper", permissions: ["products", "reels"] },
  { key: "orders", label: "Order manager", permissions: ["orders"] },
  { key: "manager", label: "Manager", permissions: [...STAFF_PERMISSIONS] },
];

export type StaffStatus = "active" | "paused";

export type TeamMember = {
  phone: string;
  name: string;
  permissions: StaffPermission[];
  status: StaffStatus;
  addedBy: "owner" | "admin";
  /** Set once the helper has logged in and opened the shop dashboard. */
  lastActiveAt?: string | null;
  createdAt?: string | null;
};

/** What the helper's own profile carries (users/{helper}.shopStaff). */
export type ShopStaffHint = {
  ownerPhone: string;
  ownerName: string;
  ownerRole: "retailer" | "manufacturer";
};

/** staffIndex/{helperPhone} — the record firestore.rules check. */
export type StaffRecord = ShopStaffHint & {
  ownerUid: string;
  staffName: string;
  permissions: StaffPermission[];
  status: StaffStatus;
};

/** "+91XXXXXXXXXX" for any Indian mobile form (10 digits, 91…, +91…), else null. */
export function toIndianE164(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? `+91${ten}` : null;
}

/** Last 10 digits — compares phones stored as +91… or 10-digit. */
export function phoneKey(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "").slice(-10);
}

export function cleanPermissions(raw: unknown): StaffPermission[] {
  if (!Array.isArray(raw)) return [];
  return STAFF_PERMISSIONS.filter((p) => raw.includes(p));
}

export function staffCan(record: { permissions?: unknown; status?: unknown } | null | undefined, perm: StaffPermission): boolean {
  return !!record && record.status === "active" && cleanPermissions(record.permissions).includes(perm);
}

/** Dashboard pages a helper may open, by the permission each needs. Anything unlisted is owner-only. */
export const STAFF_PAGE_PERMISSIONS: { prefix: string; perm: StaffPermission | null }[] = [
  { prefix: "/dashboard/inventory", perm: "products" },
  { prefix: "/dashboard/orders", perm: "orders" },
  { prefix: "/dashboard/enquiry", perm: "orders" },
  { prefix: "/dashboard/reels", perm: "reels" },
  { prefix: "/dashboard/brand-page", perm: "shopPage" },
  { prefix: "/dashboard/company", perm: "shopPage" },
  { prefix: "/dashboard/reviews", perm: "shopPage" },
  { prefix: "/dashboard/analytics", perm: "analytics" },
];

/** True when a helper with [permissions] may open [pathname]. The overview is open to every helper. */
export function staffMayOpen(pathname: string, permissions: StaffPermission[]): boolean {
  if (pathname === "/dashboard" || pathname === "/dashboard/") return true;
  const rule = STAFF_PAGE_PERMISSIONS.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return !!rule && (rule.perm === null || permissions.includes(rule.perm));
}
