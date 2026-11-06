/**
 * Audit Log Service — single call site to instrument any ERP action.
 *
 * Usage (fire-and-forget):
 *   logAudit({ db, tenantId, userId, userName, userRole,
 *               module: 'POS Billing', action: 'Generate Invoice',
 *               entityName: 'KA-0042', entityId: docId,
 *               description: 'Bill generated for Walk-in ₹1,200',
 *               before: { paymentStatus: 'Pending' },
 *               after:  { paymentStatus: 'Paid' } });
 */
import { addDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { getTenantCollection } from './tenantPath';

// ─── Canonical module list ────────────────────────────────────────────────────
export type AuditModule =
    | 'POS Billing'
    | 'Worklist'
    | 'Supplier Ledger'
    | 'Inventory'
    | 'Manage Retailers'
    | 'Customers'
    | 'Manage Users'
    | 'Role Matrix'
    | 'B2B Invoice'
    | 'Digital Khata'
    | 'Purchase Orders'
    | 'Expenses'
    | 'Online Orders'
    | 'Settings'
    | 'Dispatch Board'
    | 'Delivery Challans';

// ─── Canonical action list ────────────────────────────────────────────────────
export type AuditAction =
    | 'Create'
    | 'Update'
    | 'Delete'
    | 'Restore'
    | 'Void'
    | 'Record Payment'
    | 'Link Payment'
    | 'Split Payment'
    | 'Generate Invoice'
    | 'Cancel Invoice'
    | 'Status Change'
    | 'Assign Salesperson'
    | 'Assign Transporter'
    | 'Stock Adjustment'
    | 'Rate Update'
    | 'Batch Create'
    | 'Login'
    | 'Logout'
    | 'Export';

export interface AuditParams {
    db: Firestore;
    tenantId: string;
    userId: string;
    userName: string;
    userRole: string;
    module: AuditModule;
    action: AuditAction;
    entityName: string;
    entityId?: string;
    description?: string;
    remarks?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
}

/**
 * Write an audit log entry to Firestore. Fire-and-forget — never throws,
 * never blocks the caller. The write is best-effort; a network failure is
 * logged to the console but does not surface to the user.
 */
export function logAudit(params: AuditParams): void {
    const {
        db, tenantId, userId, userName, userRole,
        module, action, entityName, entityId,
        description, remarks, before, after,
    } = params;

    const entry: Record<string, unknown> = {
        timestamp: serverTimestamp(),
        userId,
        userName,
        userRole,
        module,
        action,
        entityName,
    };
    if (entityId)     entry.entityId     = entityId;
    if (description)  entry.description  = description;
    if (remarks)      entry.remarks      = remarks;
    if (before)       entry.before       = before;
    if (after)        entry.after        = after;

    addDoc(getTenantCollection(db, tenantId, 'auditLogs'), entry).catch(err => {
        console.warn('[auditLog] write failed (non-fatal):', err);
    });
}
