/**
 * Shared Indian mobile number validation.
 * Same 10-digit / leading-6-9 convention as supplierValidators.ts::checkMobile,
 * extended to accept multiple numbers separated by comma/space/semicolon
 * (an established pattern for retailer contact numbers — see UdhariUploadModal's
 * cleanPhoneLocally / functions/src/retailerImport.ts's cleanPhone).
 */
export interface FieldCheck {
  valid: boolean;
  error?: string;
}

const MOBILE_RE = /^[6-9]\d{9}$/;

const normalize = (part: string): string =>
  part.trim().replace(/^\+?91/, '').replace(/^0/, '').replace(/\D/g, '');

/**
 * Validates a Contact Number field that may hold one or more mobile numbers
 * separated by commas, spaces, or semicolons. Required field.
 */
export function checkContactNumber(raw: string): FieldCheck {
  const v = (raw || '').trim();
  if (!v) return { valid: false, error: 'Contact number is required' };

  const parts = v.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return { valid: false, error: 'Contact number is required' };

  const invalid = parts.filter(part => !MOBILE_RE.test(normalize(part)));
  if (invalid.length > 0) {
    return {
      valid: false,
      error: parts.length > 1
        ? 'Enter valid 10-digit mobile numbers (each starting with 6-9)'
        : 'Enter a valid 10-digit mobile number',
    };
  }

  return { valid: true };
}
