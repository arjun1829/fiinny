/**
 * Network size quoted in seller-facing marketing (/sell's logo strip and the
 * /dashboard/upgrade trust bar).
 *
 * Hand-maintained: these mirror the stats on the About page
 * (app/views/AboutView.tsx), which are also typed by hand. Update all of them
 * together, and only with figures you can stand behind.
 */
export const NETWORK_STATS = {
  retailers: "275+",
  manufacturers: "35+",
} as const;
