/**
 * Platform Audit Log Service — records privileged Super Admin actions to the
 * root-level `platformAuditLogs` collection. Fire-and-forget: never throws,
 * never blocks the caller. The write is best-effort; a network/permission
 * failure is logged to the console but does not surface to the user.
 *
 * SECURITY:
 *  - The collection is Super-Admin-only read/create and append-only (see
 *    firestore.rules → match /platformAuditLogs).
 *  - `actorUid` is verified against request.auth.uid in the rules, so a forged
 *    identity is rejected server-side — the client cannot spoof who acted.
 *  - before/after payloads are sanitised here so secrets can never be stored.
 *
 * Usage:
 *   logPlatformAudit({
 *     actor,                         // { uid, email, role }
 *     category: 'promotion', action: 'create',
 *     resourceType: 'promotion', resourceId: id, resourceName: 'Diwali 20%',
 *     description: 'Promotion "Diwali 20%" created',
 *     after: { discountPct: 20, tiers: ['retailer'] },
 *   });
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { PLATFORM_AUDIT_COLLECTION, type AuditAction, type AuditCategory } from '../types/audit';

export interface AuditActor {
    uid: string;
    email: string;
    role: string;
}

export interface PlatformAuditParams {
    actor: AuditActor;
    category: AuditCategory;
    action: AuditAction;
    resourceType: string;
    resourceName: string;
    resourceId?: string;
    tenantId?: string;
    tenantName?: string;
    description: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
}

// Keys whose values must never be persisted to an audit log, matched
// case-insensitively as substrings of the field name.
const SENSITIVE_KEY_PATTERN = /pass(word|code)|token|secret|api[-_ ]?key|signature|credential|otp|cvv|pin\b/i;

// Recursively drop any sensitive keys from a snapshot before storage. Values are
// preserved otherwise; only clearly-sensitive fields are replaced with a marker.
function sanitize(value: unknown, depth = 0): unknown {
    if (depth > 6 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(v => sanitize(v, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[redacted]' : sanitize(v, depth + 1);
    }
    return out;
}

export function logPlatformAudit(params: PlatformAuditParams): void {
    const {
        actor, category, action, resourceType, resourceName, resourceId,
        tenantId, tenantName, description, before, after,
    } = params;

    // Guard: without a verifiable actor uid the write would be rejected by the
    // rules anyway — skip silently rather than surface a permission error.
    if (!actor?.uid) return;

    const entry: Record<string, unknown> = {
        timestamp: serverTimestamp(),
        actorUid: actor.uid,
        actorEmail: actor.email || '',
        actorRole: actor.role || 'unknown',
        action,
        category,
        resourceType,
        resourceName,
        description,
    };
    if (resourceId)  entry.resourceId  = resourceId;
    if (tenantId)    entry.tenantId    = tenantId;
    if (tenantName)  entry.tenantName  = tenantName;
    if (before)      entry.before      = sanitize(before);
    if (after)       entry.after       = sanitize(after);

    addDoc(collection(db, PLATFORM_AUDIT_COLLECTION), entry).catch(err => {
        console.warn('[platformAuditLog] write failed (non-fatal):', err);
    });
}
