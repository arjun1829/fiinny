/**
 * A manufacturer's selling licence for one product: the states it covers,
 * the licence document and its details. Stored on the manufacturer's
 * product doc as `license`; checkout reads `license.states`
 * (lib/sell-area.ts). The document itself sits in the manufacturer's
 * private Storage folder (kyc/{phone}/), like KYC files.
 */

export type ProductLicenceFile = {
  storagePath: string;
  fileName: string;
  contentType: string;
  size: number;
};

export type ProductLicence = {
  /** States the licence covers (names from INDIAN_STATES). */
  states: string[];
  number?: string;
  /** YYYY-MM-DD. */
  validUntil?: string;
  file?: ProductLicenceFile;
  /** ISO — last change. */
  updatedAt?: string;
};

export function parseLicence(raw: unknown): ProductLicence | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const states = Array.isArray(r.states) ? r.states.map(String).filter(Boolean) : [];
  const f = r.file as Record<string, unknown> | undefined;
  return {
    states,
    number: r.number ? String(r.number) : undefined,
    validUntil: r.validUntil ? String(r.validUntil) : undefined,
    file: f && f.storagePath
      ? {
          storagePath: String(f.storagePath),
          fileName: String(f.fileName ?? "licence"),
          contentType: String(f.contentType ?? ""),
          size: Number(f.size) || 0,
        }
      : undefined,
    updatedAt: r.updatedAt ? String(r.updatedAt) : undefined,
  };
}

/** States chosen AND the document uploaded — enough to sell online. */
export function licenceComplete(l: ProductLicence | null | undefined): boolean {
  return !!l && l.states.length > 0 && !!l.file?.storagePath;
}

export function licenceExpired(l: ProductLicence | null | undefined, today = new Date()): boolean {
  if (!l?.validUntil) return false;
  const end = new Date(`${l.validUntil}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end < today;
}

/** Firestore-ready value (no undefined fields). */
export function licenceForSave(l: ProductLicence): Record<string, unknown> {
  return {
    states: l.states,
    ...(l.number?.trim() ? { number: l.number.trim() } : {}),
    ...(l.validUntil ? { validUntil: l.validUntil } : {}),
    ...(l.file ? { file: l.file } : {}),
    updatedAt: new Date().toISOString(),
  };
}
