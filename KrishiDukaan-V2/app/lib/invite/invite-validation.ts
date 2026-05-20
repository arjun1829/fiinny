export type InviteDocStatus = "invited" | "active" | "revoked";

export type InviteAcceptanceFailureReason =
  | "invalid_code"
  | "already_used"
  | "expired"
  | "not_invited";

export type InviteAcceptancePrecheck =
  | { ok: true; docId: string }
  | { ok: false; reason: InviteAcceptanceFailureReason };

export interface ManufacturerRetailerInviteSnapshot {
  id: string;
  status: InviteDocStatus;
  retailerId: string;
  /** Pre-created retailers/{docId} — used to query products/inventory assigned pre-signup. */
  retailerDocId: string;
  inviteCode: string;
  /** True when status === "invited" and claimable === true in Firestore. */
  claimable: boolean;
}

export function mapInviteAcceptanceError(reason: InviteAcceptanceFailureReason): string {
  switch (reason) {
    case "invalid_code":
      return "Invalid invite code. Check the link or ask the manufacturer for a new invite.";
    case "already_used":
      return "This invite has already been used. Sign in with the account that accepted it, or request a new invite.";
    case "expired":
      return "This invite is no longer valid or has been revoked.";
    case "not_invited":
      return "This invite cannot be activated in its current state.";
    default:
      return "Unable to accept this invite.";
  }
}

function parseStatus(value: unknown): InviteDocStatus {
  if (value === "active" || value === "revoked" || value === "invited") return value;
  return "invited";
}

export function mapInviteSnapshot(
  id: string,
  data: Record<string, unknown>,
): ManufacturerRetailerInviteSnapshot {
  const status = parseStatus(data.status);
  const retailerId = String(data.retailerId ?? "").trim();
  const claimable = status === "invited" && data.claimable === true;

  return {
    id,
    status,
    retailerId,
    retailerDocId: String(data.retailerDocId ?? "").trim(),
    inviteCode: String(data.inviteCode ?? ""),
    claimable,
  };
}

/**
 * Rules: claim when status is invited, retailerId empty, claimable true (or legacy undefined),
 * or idempotent when already active for the same uid.
 */
export function precheckInviteForAcceptance(
  doc: ManufacturerRetailerInviteSnapshot | null,
  currentUid: string,
): InviteAcceptancePrecheck {
  if (!doc) {
    return { ok: false, reason: "invalid_code" };
  }

  if (doc.status === "revoked") {
    return { ok: false, reason: "expired" };
  }

  if (doc.status === "active") {
    const rid = doc.retailerId.trim();
    if (rid === currentUid) {
      return { ok: true, docId: doc.id };
    }
    if (rid) {
      return { ok: false, reason: "already_used" };
    }
    return { ok: false, reason: "not_invited" };
  }

  if (doc.status === "invited") {
    const rid = doc.retailerId.trim();
    if (rid && rid !== currentUid) {
      return { ok: false, reason: "already_used" };
    }
    if (!doc.claimable) {
      return { ok: false, reason: "not_invited" };
    }
    return { ok: true, docId: doc.id };
  }

  return { ok: false, reason: "not_invited" };
}
