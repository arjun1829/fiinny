"use client";

/**
 * Browser side of referral links (see lib/referrals.ts for the model).
 *
 * A link like /subscribe?ref=RAHUL&plan=standard-yearly often lands on someone
 * who is not signed in yet. The pending referral is kept in localStorage so it
 * survives the login / signup hop and reaches the checkout. It is cleared once
 * a purchase is made with it, and expires after a week. It is NOT stored on
 * the account: credit goes only to the code applied at that checkout.
 */

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const KEY = "kd_referral_v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingReferral = {
  code: string;
  /** Plan key from an offer link (validated against the live ladder at checkout). */
  plan?: string;
  /** Seat count from an offer link (normalised at checkout). */
  seats?: number;
  savedAt: number;
};

const normalize = (raw: unknown) =>
  String(raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export function isReferralCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{3,20}$/.test(code);
}

export function savePendingReferral(input: { code: string; plan?: string | null; seats?: number | null }) {
  const code = normalize(input.code);
  if (!isReferralCodeFormat(code)) return;
  const value: PendingReferral = {
    code,
    ...(input.plan ? { plan: String(input.plan).slice(0, 40) } : {}),
    ...(input.seats && input.seats > 0 ? { seats: Math.floor(input.seats) } : {}),
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* private mode — the link still works on this page load via the URL */
  }
}

export function readPendingReferral(): PendingReferral | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PendingReferral;
    if (!v?.code || !isReferralCodeFormat(v.code) || Date.now() - Number(v.savedAt) > TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function clearPendingReferral() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Flat shape on purpose: this project builds with `strict: false`, where a
 * discriminated union does not narrow. `valid` true ⇒ code + ownerName set;
 * false ⇒ error set.
 */
export type ReferralCheck = { valid: boolean; code?: string; ownerName?: string; error?: string };

/** Server-side check (referralCodes/ is not client-readable). */
export async function validateReferralCode(raw: string): Promise<ReferralCheck> {
  const code = normalize(raw);
  if (!isReferralCodeFormat(code)) return { valid: false, error: "Enter a valid referral code." };
  try {
    const res = await fetch(`/api/referral/validate?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    const data = await res.json();
    if (data?.valid) return { valid: true, code: String(data.code), ownerName: String(data.ownerName ?? "") };
    return { valid: false, error: String(data?.error ?? "This referral code is not valid.") };
  } catch {
    return { valid: false, error: "Could not check the referral code. Try again." };
  }
}

/**
 * Funnel event. "open" is logged once per code per browser session so reloads
 * don't inflate it; "checkout_view" once per code per signed-in user per
 * session. Fire-and-forget — tracking must never block the page.
 */
export function logReferralEvent(
  code: string,
  type: "open" | "checkout_view",
  opts: { uid?: string | null; plan?: string | null } = {},
) {
  const c = normalize(code);
  if (!isReferralCodeFormat(c)) return;
  if (type === "checkout_view" && !opts.uid) return;
  const dedupeKey = `kd_ref_evt_${type}_${c}_${opts.uid ?? ""}`;
  try {
    if (window.sessionStorage.getItem(dedupeKey)) return;
    window.sessionStorage.setItem(dedupeKey, "1");
  } catch {
    /* no sessionStorage — log anyway */
  }
  addDoc(collection(db, "referralEvents"), {
    code: c,
    type,
    platform: "web",
    uid: opts.uid ?? null,
    plan: opts.plan ? String(opts.plan).slice(0, 40) : null,
    at: serverTimestamp(),
  }).catch(() => {
    /* unknown/paused code or offline — tracking only */
  });
}
