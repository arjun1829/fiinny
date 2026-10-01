// Platform Audit Log — records privileged Super Admin actions taken in the
// platform console (/super-admin). Deliberately kept separate from the
// tenant-scoped `/auditLogs` collection (business-level, readable by any master
// admin) so that platform audit trail read/write is Super-Admin-only and
// append-only. Never store passwords, tokens, secrets or payment credentials —
// the writer (utils/platformAuditLog.ts) sanitises before/after payloads.

// Root-level Firestore collection holding every platform audit entry.
export const PLATFORM_AUDIT_COLLECTION = 'platformAuditLogs';

// The area of the platform an action belongs to. Drives the category filter.
export type AuditCategory =
    | 'business'
    | 'plan'
    | 'promotion'
    | 'payment'
    | 'career'
    | 'support'
    | 'security';

// The verb describing what happened. Kept broad but finite so the action filter
// stays a closed set.
export type AuditAction =
    | 'create'
    | 'update'
    | 'delete'
    | 'suspend'
    | 'activate'
    | 'deactivate'
    | 'publish'
    | 'close'
    | 'status_change'
    | 'assign'
    | 'seed'
    | 'login'
    | 'logout';

export interface PlatformAuditLog {
    id: string;
    // Server-stamped time of the action (Firestore Timestamp; read via toDate()).
    timestamp?: unknown;
    // ── Actor (verified against the auth token in firestore.rules) ──
    actorUid: string;
    actorEmail: string;
    actorRole: string;
    // ── What happened ──
    action: AuditAction;
    category: AuditCategory;
    resourceType: string;   // e.g. 'subscription', 'plan', 'promotion', 'jobOpening', 'ticket'
    resourceId?: string;
    resourceName: string;
    // ── Affected business (when the action targets a specific tenant) ──
    tenantId?: string;
    tenantName?: string;
    // ── Human-readable summary ──
    description: string;
    // ── Optional field-level snapshots (sanitised; secrets stripped) ──
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
}

// Filter option lists for the Audit Logs UI. `all` is the implicit default.
export const AUDIT_CATEGORY_OPTIONS: { value: AuditCategory | 'all'; label: string }[] = [
    { value: 'all',        label: 'All categories' },
    { value: 'business',   label: 'Business' },
    { value: 'plan',       label: 'Plan' },
    { value: 'promotion',  label: 'Promotion' },
    { value: 'payment',    label: 'Payment' },
    { value: 'career',     label: 'Career' },
    { value: 'support',    label: 'Support' },
    { value: 'security',   label: 'Security' },
];

export const AUDIT_ACTION_OPTIONS: { value: AuditAction | 'all'; label: string }[] = [
    { value: 'all',           label: 'All actions' },
    { value: 'create',        label: 'Create' },
    { value: 'update',        label: 'Update' },
    { value: 'delete',        label: 'Delete' },
    { value: 'suspend',       label: 'Suspend' },
    { value: 'activate',      label: 'Activate' },
    { value: 'deactivate',    label: 'Deactivate' },
    { value: 'publish',       label: 'Publish' },
    { value: 'close',         label: 'Close' },
    { value: 'status_change', label: 'Status change' },
    { value: 'assign',        label: 'Assign' },
    { value: 'seed',          label: 'Seed' },
    { value: 'login',         label: 'Login' },
    { value: 'logout',        label: 'Logout' },
];

// Compact colour map for the category badge in the table.
export const AUDIT_CATEGORY_BADGE: Record<AuditCategory, { bg: string; fg: string; label: string }> = {
    business:  { bg: 'hsla(210,100%,50%,0.15)', fg: 'hsl(210,90%,55%)',  label: 'Business' },
    plan:      { bg: 'hsla(262,83%,58%,0.15)',  fg: 'hsl(262,70%,60%)',  label: 'Plan' },
    promotion: { bg: 'hsla(38,92%,50%,0.15)',   fg: 'hsl(38,80%,45%)',   label: 'Promotion' },
    payment:   { bg: 'hsla(152,60%,40%,0.15)',  fg: 'hsl(152,55%,38%)',  label: 'Payment' },
    career:    { bg: 'hsla(280,65%,60%,0.15)',  fg: 'hsl(280,55%,60%)',  label: 'Career' },
    support:   { bg: 'hsla(190,90%,45%,0.15)',  fg: 'hsl(190,80%,42%)',  label: 'Support' },
    security:  { bg: 'hsla(0,75%,55%,0.15)',    fg: 'hsl(0,70%,55%)',    label: 'Security' },
};
