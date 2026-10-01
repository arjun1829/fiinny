/**
 * Plain data/types — deliberately NOT "use client" so server code (API
 * routes like app/api/admin/create-user/route.ts) can import ADMIN_SECTIONS
 * directly. Importing it from admin-auth-context.tsx (a "use client" file)
 * into a server route turns the export into an unusable client reference
 * proxy — calling .filter()/.includes() on it throws "Attempted to call
 * filter() from the server but filter is on the client."
 */

export const ADMIN_SECTIONS = [
  "overview", "analytics", "orders", "payments", "users", "subscriptions", "pricing", "products",
  "reels", "discounts", "inventory", "companies", "hubs", "banners", "reports", "messages",
  "whatsapp", "blog", "team", "salesTeam", "referrals", "payouts", "routePayouts", "moderation",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export type AdminIdentity = {
  uid: string;
  role: "admin" | "team";
  /** Only meaningful for role === "team"; admins implicitly have every section. */
  adminSections: AdminSection[];
};

/** True when the current identity may see/act on [section]. Admins always can. */
export function hasSection(identity: AdminIdentity, section: AdminSection): boolean {
  return identity.role === "admin" || identity.adminSections.includes(section);
}
