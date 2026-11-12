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
  "whatsapp", "support", "blog", "team", "salesTeam", "referrals", "payouts", "routePayouts", "moderation",
  "appVersion", "aboutPage",
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

/**
 * The sections that may open an admin page (any one is enough). Page paths
 * and section names differ for a few ("sales-team" is salesTeam), and Seller
 * payments serves both payout sections.
 */
export function sectionsForPath(pathname: string): AdminSection[] {
  const seg = pathname.split("/")[2] ?? "";
  if (!seg) return ["overview"];
  if (seg === "sales-team") return ["salesTeam"];
  if (seg === "route-payouts") return ["routePayouts"];
  if (seg === "payouts") return ["payouts", "routePayouts"];
  if (seg === "app-version") return ["appVersion"];
  if (seg === "about-page") return ["aboutPage"];
  if (seg === "search-insights" || seg === "search-links") return ["analytics"];
  return (ADMIN_SECTIONS as readonly string[]).includes(seg) ? [seg as AdminSection] : ["overview"];
}

/** The page a section lives on. */
export function pathForSection(section: AdminSection): string {
  if (section === "overview") return "/admin";
  if (section === "salesTeam") return "/admin/sales-team";
  if (section === "routePayouts") return "/admin/payouts?tab=overview";
  if (section === "appVersion") return "/admin/app-version";
  if (section === "aboutPage") return "/admin/about-page";
  return `/admin/${section}`;
}
