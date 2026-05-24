export type InviteDocStatus = "invited" | "active" | "revoked";

export type InviteAcceptanceFailureReason =
  | "invalid_code"
  | { type: "already_used"; uid: string }
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
  /** Normalized phone number from the invite. */
  retailerPhone: string;
}

export function mapInviteAcceptanceError(reason: InviteAcceptanceFailureReason): string {
  if (typeof reason === "object" && reason.type === "already_used") {
    return `This invite was already accepted by a different account (UID ending in ...${reason.uid.slice(-6)}). Sign in with that account or request a new invite.`;
  }

  switch (reason) {
    case "invalid_code":
      return "Invalid invite code. Check the link or ask the manufacturer for a new invite.";
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
    retailerPhone: String(data.retailerPhone ?? "").trim(),
  };
}

/**
 * Rules: claim when status is invited, claimable true,
 * or idempotent when already active for the same phone.
 */
export function precheckInviteForAcceptance(
  doc: ManufacturerRetailerInviteSnapshot | null,
  currentPhone: string,
): InviteAcceptancePrecheck {
  if (!doc) {
    return { ok: false, reason: "invalid_code" };
  }

  if (doc.status === "revoked") {
    return { ok: false, reason: "expired" };
  }

  const rPhone = doc.retailerPhone;

  if (doc.status === "active") {
    if (rPhone === currentPhone) {
      return { ok: true, docId: doc.id };
    }
    if (rPhone) {
      return { ok: false, reason: { type: "already_used", uid: rPhone } }; // using phone as 'uid' in message
    }
    return { ok: false, reason: "not_invited" };
  }

  if (doc.status === "invited") {
    if (rPhone && rPhone !== currentPhone) {
      return { ok: false, reason: { type: "already_used", uid: rPhone } };
    }
    if (!doc.claimable) {
      return { ok: false, reason: "not_invited" };
    }
    return { ok: true, docId: doc.id };
  }

  return { ok: false, reason: "not_invited" };
}
