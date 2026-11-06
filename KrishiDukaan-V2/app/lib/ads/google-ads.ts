/**
 * Google Ads conversions for completed purchases. Two conversion actions, one
 * fire point each:
 *
 *  - "Product Purchase — KrishiDukan": reportProductPurchase, called only from
 *    app/page.tsx createOrdersAfterPayment, which only runs after our own server
 *    has confirmed the payment (/api/payment/verify returned ok, or
 *    /api/payment/attempt-failed found the payment captured at Razorpay).
 *  - "Subscription Purchase – KrishiDukan": reportSubscriptionPurchase, called
 *    only from app/success/page.tsx, which only gets a purchase to report after
 *    SubscriptionView has had the payment verified AND the subscription
 *    activated (its paymentLogged guard).
 *
 * Failed or cancelled payments reach neither. The two flows never share a
 * call site, so a product order cannot count as a subscription or vice versa.
 *
 * The conversion ID and labels come from the Google Ads conversion actions.
 * They are public by design (they ship in every page's HTML), so they live in
 * code rather than in a secret.
 */

export const GOOGLE_ADS_ID = "AW-18461273625";
export const GOOGLE_ADS_PURCHASE_LABEL = "yGFZCKO8o5gdEJncguNE";
export const GOOGLE_ADS_SUBSCRIPTION_LABEL = "YRn-CNv_iKgdEJncguNE";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

// One conversion per payment, even if the confirmation runs twice (a refresh
// can't re-run it, but a retry after a slow response or a second tab could).
// localStorage survives reloads and tabs; the Set covers browsers where storage
// is blocked, for the lifetime of the page.
const STORAGE_PREFIX = "kd_gads_purchase:";
const SUBSCRIPTION_STORAGE_PREFIX = "kd_gads_subscription:";
const firedThisPage = new Set<string>();

/** Sends one conversion unless this payment already sent one. */
function sendConversion(
  label: string,
  storagePrefix: string,
  value: number,
  transactionId: string,
): boolean {
  if (typeof window === "undefined") return false;

  const id = String(transactionId ?? "").trim();
  // No id or no real amount: send nothing rather than an invented value.
  if (!id || !Number.isFinite(value) || value <= 0) return false;

  const key = storagePrefix + id;
  if (firedThisPage.has(key)) return false;
  // The tag is loaded by components/shared/google-ads-tag.tsx. If it isn't
  // ready (blocked, or still loading), leave the guard unset so nothing is lost
  // by a later attempt.
  if (typeof window.gtag !== "function") return false;

  try {
    if (window.localStorage.getItem(key)) {
      firedThisPage.add(key);
      return false;
    }
    window.localStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage unavailable: the in-page Set still prevents a repeat */
  }
  firedThisPage.add(key);

  window.gtag("event", "conversion", {
    send_to: `${GOOGLE_ADS_ID}/${label}`,
    value: Math.round(value * 100) / 100,
    currency: "INR",
    transaction_id: id,
  });
  return true;
}

/**
 * Reports one product purchase. Returns true only if a conversion was sent.
 *
 * @param orderValue    what the customer actually paid, in rupees (all sellers'
 *                      orders for this payment together, delivery and GST included)
 * @param transactionId unique per payment: the Razorpay payment id. Google also
 *                      uses it to drop duplicate conversions on its side.
 */
export function reportProductPurchase({
  orderValue,
  transactionId,
}: {
  orderValue: number;
  transactionId: string;
}): boolean {
  return sendConversion(
    GOOGLE_ADS_PURCHASE_LABEL,
    STORAGE_PREFIX,
    Number(orderValue),
    transactionId,
  );
}

// /success reports as soon as it mounts, which can be before the afterInteractive
// tag script has defined window.gtag. Unlike the product flow there is no later
// attempt (the handoff is consumed on read), so wait for the tag a little while.
const GTAG_WAIT_MS = 10_000;
const GTAG_POLL_MS = 250;

/**
 * Reports one paid subscription. Fire-and-forget: never throws, never blocks
 * the caller, and gives up silently if the tag never loads (blocked script).
 *
 * @param amountPaise   what Razorpay charged for this subscription, in paise, as
 *                      returned by /api/payment/verify (`amountPaidPaise`)
 * @param transactionId the Razorpay payment id of this subscription payment
 */
export function reportSubscriptionPurchase({
  amountPaise,
  transactionId,
}: {
  amountPaise: number;
  transactionId: string;
}): void {
  try {
    if (typeof window === "undefined") return;
    const value = Number(amountPaise) / 100;
    const id = String(transactionId ?? "").trim();
    if (!id || !Number.isFinite(value) || value <= 0) return;

    const deadline = Date.now() + GTAG_WAIT_MS;
    const attempt = () => {
      try {
        if (typeof window.gtag === "function") {
          sendConversion(GOOGLE_ADS_SUBSCRIPTION_LABEL, SUBSCRIPTION_STORAGE_PREFIX, value, id);
        } else if (Date.now() < deadline) {
          window.setTimeout(attempt, GTAG_POLL_MS);
        }
      } catch {
        /* measurement must never affect the success screen */
      }
    };
    attempt();
  } catch {
    /* measurement must never affect the success screen */
  }
}
