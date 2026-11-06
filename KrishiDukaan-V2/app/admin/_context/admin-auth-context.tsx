"use client";

/**
 * The resolved admin-portal identity for the current session — computed once
 * in app/admin/layout.tsx (which already fetches the profile to gate access)
 * and shared down to the sidebar (tab filtering) and individual pages
 * (hiding role-escalation controls from limited-access team members)
 * instead of every consumer re-fetching the same Firestore doc.
 *
 * Plain data/types (ADMIN_SECTIONS, AdminSection, AdminIdentity, hasSection)
 * live in admin-sections.ts, NOT here — that file has no "use client"
 * directive so server code (API routes) can import them directly. Re-exported
 * below so existing client imports from this file keep working.
 */

import { createContext, useContext } from "react";
import type { AdminIdentity } from "./admin-sections";

export {
  ADMIN_SECTIONS,
  hasSection,
  pathForSection,
  sectionsForPath,
  type AdminSection,
  type AdminIdentity,
} from "./admin-sections";

export const AdminAuthContext = createContext<AdminIdentity | null>(null);

export function useAdminAuth(): AdminIdentity {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    // Layout always provides this before rendering children — a null context
    // means a page was rendered outside app/admin/layout.tsx.
    throw new Error("useAdminAuth() called outside AdminLayout");
  }
  return ctx;
}
