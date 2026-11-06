/**
 * Share links for a seller's shop profile and a manufacturer's brand page.
 *
 *   https://krishidukan.com/shop/+919876543210
 *   https://krishidukan.com/brand/+919876543210
 *
 * The phone number is the seller's public business number (already shown on
 * their store page), and it is what makes these links work everywhere:
 *  - Android (App Links) and iPhone (Universal Links, see
 *    app/.well-known/apple-app-site-association) open them in the app, where
 *    /shop/{phone} and /brand/{phone} are the shop and brand screens — in every
 *    app version already installed, not only new ones.
 *  - Anywhere else the website answers: /shop/{phone} redirects to the shop's
 *    store page, /brand/{phone} to the brand page (app/shop, app/brand).
 * Same format as mobile/lib/core/utils/web_links.dart.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

/** "+91" + the last 10 digits, or null when the value is not a phone number. */
export function sharePhone(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 12) return null;
  if (!/^\+?[\d\s-]+$/.test(value)) return null;
  return `+91${digits.slice(-10)}`;
}

export function shopShareUrl(phone: string): string | null {
  const p = sharePhone(phone);
  return p ? `${SITE_URL}/shop/${p}` : null;
}

export function brandShareUrl(phone: string): string | null {
  const p = sharePhone(phone);
  return p ? `${SITE_URL}/brand/${p}` : null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // execCommand works without clipboard permission on all mobile browsers.
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Opens the device share sheet (WhatsApp, Instagram, SMS…) where the browser
 * has one, else copies the link.
 */
export async function shareLink(opts: {
  title: string;
  text: string;
  url: string;
}): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(opts);
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // fall through to copying
    }
  }
  return (await copyText(opts.url)) ? "copied" : "failed";
}
