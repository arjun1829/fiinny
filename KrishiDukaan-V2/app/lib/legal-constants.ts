/**
 * Legal identity, routes and versioning — the client-safe half of app/lib/legal.ts.
 *
 * WHY IT IS SPLIT OUT
 * -------------------
 * legal.ts reads settings/route through firebase/firestore/lite so the fee rates
 * quoted on a legal page cannot drift from the rates the payment split applies.
 * That is right for a server component, and wrong for the footer and the
 * subscription checkout, which are client components that need nothing but the
 * three URLs and the version string. Importing legal.ts there would pull the
 * Firestore lite SDK into the client bundle to read four constants.
 *
 * So: pure constants here, Firestore-backed rate lookups in legal.ts (which
 * re-exports everything below, so a server component can keep importing one
 * module).
 *
 * NOTHING IN COMPANY IS INVENTED. Every field is copied from what the site
 * already publishes, with the reference noted. A fact that is missing stays
 * missing rather than becoming plausible fiction in a document a court could
 * read — see the note on the deliberate omissions.
 */

/** Canonical public origin (kept in sync with app/layout.tsx and app/sitemap.ts). */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

/**
 * Operator identity, as already published on the site.
 *
 * `name` and `supportEmail` are taken verbatim from app/privacy/page.tsx, which
 * has been live as the Privacy Policy's "Contact Us" block.
 *
 * DELIBERATELY ABSENT: registered office address, CIN, GSTIN and a nominated
 * seat of jurisdiction. None of those appear anywhere in this codebase. The
 * governing-law clause therefore says "the laws of India" and points at courts
 * of competent jurisdiction in India, which is true, rather than naming a city
 * nobody has confirmed. Add them here once confirmed and both legal pages pick
 * them up.
 */
export const COMPANY = {
  /** Operating entity, per app/privacy/page.tsx. */
  name: "Karanarjun Technologies",
  /** The brand the platform trades under. */
  brand: "KrishiDukan",
  /** Support address, per app/privacy/page.tsx. */
  supportEmail: "support@krishidukan.com",
} as const;

/** Route slugs for the three legal documents, so links cannot typo apart. */
export const LEGAL_ROUTES = {
  terms: "/terms",
  privacy: "/privacy",
  sellerTerms: "/seller-terms",
  /**
   * Google Merchant Center asks for a single URL "where your return policy can
   * be read by customers" and fetches it. /terms clause 8 covers the substance,
   * but pointing a reviewer at one clause inside a long agreement is how a
   * verification fails, so the policy also stands alone here.
   */
  returns: "/return-policy",
} as const;

/**
 * Effective date shown on the legal pages.
 *
 * One constant for both documents: they were drafted together, and a reader
 * comparing two different dates on interlocking documents reasonably wonders
 * which one supersedes the other.
 */
export const LEGAL_EFFECTIVE_DATE = "26 August 2026";

/**
 * The version of the Terms and Seller Terms recorded against a subscription
 * purchase, so that "which terms did this seller actually accept" is answerable
 * later from the data rather than from git history.
 *
 * BUMP THIS whenever the substance of either document changes. It is stamped
 * onto the subscription and payment records at the moment of purchase, and an
 * unchanged version string across a substantive edit would make those records
 * claim acceptance of text the seller never saw.
 */
export const TERMS_VERSION = "2026-08-26";

/**
 * Version of the Online Delivery commercial terms a seller accepts before
 * switching Online Delivery on (components/shared/online-delivery-terms-dialog).
 *
 * Separate from TERMS_VERSION on purpose: these terms cover the listing fee and
 * the per-transaction split, and they will change on a different clock from the
 * site-wide Terms. Recording one version string for both would make it
 * impossible to answer "which fee schedule did this seller actually agree to".
 *
 * BUMP THIS whenever the substance of that dialog changes. Sellers who accepted
 * an older version keep that version on their account, which is the record of
 * what they were shown.
 */
export const DELIVERY_TERMS_VERSION = "2026-08-26";

/** "1%" / "1.5%" — trims a trailing ".0" so whole rates read cleanly. */
export function pct(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}
