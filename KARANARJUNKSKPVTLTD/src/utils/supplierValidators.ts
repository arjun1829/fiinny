/**
 * Lightweight, pure validators for the Add Supplier form.
 * Kept side-effect free so they can be unit-tested and reused.
 * GSTIN validation deliberately delegates to the existing gstinValidator.ts.
 */
import { validateGSTIN } from './gstinValidator';

export interface FieldCheck {
  valid: boolean;
  error?: string;
}

const ok: FieldCheck = { valid: true };

/** 10-digit Indian mobile (optionally prefixed with +91/0). Required field. */
export function checkMobile(raw: string): FieldCheck {
  const v = (raw || '').trim();
  if (!v) return { valid: false, error: 'Mobile number is required' };
  const digits = v.replace(/^\+?91/, '').replace(/^0/, '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return { valid: false, error: 'Enter a valid 10-digit mobile number' };
  }
  return ok;
}

/** GST is optional here; only validate format when provided. */
export function checkGstin(raw: string): FieldCheck {
  const v = (raw || '').trim();
  if (!v) return ok;
  const res = validateGSTIN(v);
  return res.valid ? ok : { valid: false, error: res.error || 'Invalid GSTIN' };
}

/** PAN: 5 letters + 4 digits + 1 letter. Optional. */
export function checkPan(raw: string): FieldCheck {
  const v = (raw || '').trim().toUpperCase();
  if (!v) return ok;
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)) {
    return { valid: false, error: 'Invalid PAN (e.g. AAPFU0939F)' };
  }
  return ok;
}

/** IFSC: 4 letters + 0 + 6 alphanumerics. Optional. */
export function checkIfsc(raw: string): FieldCheck {
  const v = (raw || '').trim().toUpperCase();
  if (!v) return ok;
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)) {
    return { valid: false, error: 'Invalid IFSC (e.g. HDFC0001234)' };
  }
  return ok;
}

/** Optional email. */
export function checkEmail(raw: string): FieldCheck {
  const v = (raw || '').trim();
  if (!v) return ok;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return { valid: false, error: 'Enter a valid email address' };
  }
  return ok;
}

/** Optional non-negative number (Credit Limit / Opening Balance). */
export function checkNonNegativeNumber(raw: string, label: string): FieldCheck {
  const v = (raw || '').trim();
  if (!v) return ok;
  const n = Number(v.replace(/,/g, ''));
  if (isNaN(n)) return { valid: false, error: `${label} must be a number` };
  if (n < 0) return { valid: false, error: `${label} cannot be negative` };
  return ok;
}

/** Optional website URL — accepts bare domains too. */
export function checkWebsite(raw: string): FieldCheck {
  const v = (raw || '').trim();
  if (!v) return ok;
  if (!/^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/.test(v)) {
    return { valid: false, error: 'Enter a valid website URL' };
  }
  return ok;
}

/**
 * Case-insensitive duplicate-name check against the already-loaded supplier list.
 * Returns a warning (not a hard error) — caller decides whether to allow override.
 */
export function findDuplicateName(name: string, existing: { name?: string }[]): boolean {
  const key = (name || '').trim().toLowerCase();
  if (!key) return false;
  return existing.some(s => (s.name || '').trim().toLowerCase() === key);
}
