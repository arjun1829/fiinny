/**
 * Seller KYC: what we ask for, and the checks on it.
 *
 * Kept short on purpose (sellers abandon long forms). Razorpay needs a bank
 * account, a PAN and, if the seller has one, the GST number to open the Route
 * account their money is sent to; we add one licence to sell agri inputs.
 *
 *   - Bank: account holder name, account number (typed twice), IFSC. Bank and
 *     branch names are filled in from the IFSC.
 *   - GST number (optional). A GSTIN contains its holder's PAN (characters
 *     3–12), so a seller who enters it does not type the PAN again.
 *   - PAN: from the GSTIN, or typed by sellers without GST.
 *   - Licence (trade / product licence): one upload.
 *
 * Same rules as mobile/lib/core/utils/kyc_rules.dart and the reminder in
 * functions/src/notifications/reminders.ts; change them together.
 */

/** RBI IFSC format: 4 letters, a literal 0, then 6 letters or digits. */
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Indian account numbers run 9–18 digits depending on the bank. */
export const ACCOUNT_RE = /^\d{9,18}$/;

/** Account holder name as the bank has it: letters (any script), spaces and
 *  . , ' & ( ) / - only ("M/s Sai Agro"), at least two letters, no digits.
 *  Same rule as mobile/lib/core/utils/kyc_rules.dart. */
// Built with the constructor: the project's TS target rejects the /u flag on
// literals, while every supported browser and Node has it.
const HOLDER_NAME_RE = new RegExp("^[\\p{L}\\p{M} .,'&()/-]+$", "u");
const LETTER_RE = new RegExp("\\p{L}", "gu");

export function isValidHolderName(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 2 || !HOLDER_NAME_RE.test(t)) return false;
  return (t.match(LETTER_RE) ?? []).length >= 2;
}
export const PAN_RE = /^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$/;
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The one document still required. Older uploads of other types stay on file. */
export const REQUIRED_DOC = "trade_license";

const B36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GSTIN check character (the 15th), from the first 14. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = B36.indexOf(first14[i]!);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return B36[(36 - (sum % 36)) % 36]!;
}

/** Format and check character, so one mistyped character is caught here. */
export function isValidGstin(raw: string): boolean {
  const g = raw.trim().toUpperCase();
  return GSTIN_RE.test(g) && gstinCheckChar(g.slice(0, 14)) === g[14];
}

/** The PAN inside a valid GSTIN, else null. */
export function panFromGstin(raw: string): string | null {
  const g = raw.trim().toUpperCase();
  if (!isValidGstin(g)) return null;
  const pan = g.slice(2, 12);
  return PAN_RE.test(pan) ? pan : null;
}

export function isValidPan(raw: string): boolean {
  return PAN_RE.test(raw.trim().toUpperCase());
}

/**
 * Razorpay business type from the PAN's 4th character (the holder type):
 * P person, C company, F firm or LLP, H HUF, T trust. A person selling is a
 * proprietorship.
 */
export function businessTypeFromPan(pan: string): string {
  switch (pan.trim().toUpperCase()[3]) {
    case "C": return "private_limited";
    case "F": return "partnership";
    case "H": return "huf";
    case "T": return "trust";
    default: return "proprietorship";
  }
}

export type KycAccount = {
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
  pan?: string;
  gstin?: string;
  status?: string;
  documents?: Record<string, unknown>;
};

export type KycItem = "bank" | "pan" | "licence";

export const KYC_ITEM_LABEL: Record<KycItem, string> = {
  bank: "Bank details",
  pan: "PAN or GST number",
  licence: "Licence",
};

/** What is still missing before the account can be verified. */
export function kycMissing(a: KycAccount | null | undefined): KycItem[] {
  if (!a) return ["bank", "pan", "licence"];
  const out: KycItem[] = [];
  const bankOk =
    String(a.accountHolderName ?? "").trim().length > 1 &&
    ACCOUNT_RE.test(String(a.accountNumber ?? "")) &&
    IFSC_RE.test(String(a.ifsc ?? "").toUpperCase());
  if (!bankOk) out.push("bank");
  const pan = String(a.pan ?? "") || panFromGstin(String(a.gstin ?? "")) || "";
  if (!isValidPan(pan)) out.push("pan");
  if (!a.documents || !(REQUIRED_DOC in a.documents)) out.push("licence");
  return out;
}

/** Bank and branch for an IFSC, from Razorpay's free directory via /api/ifsc. */
export type IfscInfo = { bank: string; branch: string; city: string; state: string };
