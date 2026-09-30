import type { UserRole } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PermissionAction {
    id: string;
    label: string;
}

export interface PermissionSection {
    id: string;
    label: string;
    actions?: PermissionAction[];
    children?: PermissionSection[];
}

export interface PermissionModule {
    id: string;
    label: string;
    sections: PermissionSection[];
}

export type FeaturePermissionMap = Record<string, boolean>;
export type FeaturePermissions = Partial<Record<UserRole, FeaturePermissionMap>>;

// ─── Permission Tree ──────────────────────────────────────────────────────────
// High-level ERP modules. Each sub-tab carries at least one leaf action so it is
// independently toggleable; deeper page/section/action levels can be nested via
// `children` as modules are onboarded.

export const PERMISSION_MODULES: PermissionModule[] = [
    {
        id: 'navbar',
        label: 'Main Navbar',
        sections: [
            { id: 'navbar.dashboard',      label: 'B2B Dashboard',   actions: [{ id: 'navbar.dashboard.view',      label: 'Show in navbar' }] },
            { id: 'navbar.b2cDashboard',   label: 'B2C Dashboard',   actions: [{ id: 'navbar.b2cDashboard.view',   label: 'Show in navbar' }] },
            { id: 'navbar.analytics',      label: 'Analytics',       actions: [{ id: 'navbar.analytics.view',      label: 'Show in navbar' }] },
            { id: 'navbar.worklist',       label: 'Worklist',        actions: [{ id: 'navbar.worklist.view',       label: 'Show in navbar' }] },
            { id: 'navbar.pos',            label: 'POS Billing',     actions: [{ id: 'navbar.pos.view',            label: 'Show in navbar' }] },
            { id: 'navbar.supplierLedger', label: 'Supplier Ledger', actions: [{ id: 'navbar.supplierLedger.view', label: 'Show in navbar' }] },
            { id: 'navbar.inventory',      label: 'Inventory',       actions: [{ id: 'navbar.inventory.view',      label: 'Show in navbar' }] },
            { id: 'navbar.teamPerformance', label: 'Team Performance', actions: [{ id: 'navbar.teamPerformance.view', label: 'Show in navbar' }] },
            { id: 'navbar.reports',        label: 'Reports',         actions: [{ id: 'navbar.reports.view',        label: 'Show in navbar' }] },
            { id: 'navbar.expenses',       label: 'Expenses',        actions: [{ id: 'navbar.expenses.view',       label: 'Show in navbar' }] },
            { id: 'navbar.barcode',        label: 'Barcode Labels',  actions: [{ id: 'navbar.barcode.view',        label: 'Show in navbar' }] },
            { id: 'navbar.help',           label: 'Help Center',     actions: [{ id: 'navbar.help.view',           label: 'Show in navbar' }] },
        ],
    },
    {
        id: 'reports',
        label: 'Reports',
        sections: [
            {
                id: 'reports.stock',
                label: 'Stock Report',
                actions: [
                    { id: 'reports.stock.view', label: 'View' },
                ],
            },
            {
                id: 'reports.sales',
                label: 'Sales Report',
                actions: [
                    { id: 'reports.sales.view', label: 'View' },
                ],
            },
            {
                id: 'reports.financial',
                label: 'Financial Report',
                actions: [
                    { id: 'reports.financial.view', label: 'View' },
                ],
            },
            {
                id: 'reports.gst',
                label: 'GST Report',
                actions: [
                    { id: 'reports.gst.view', label: 'View' },
                ],
            },
        ],
    },
    {
        id: 'worklist',
        label: 'Worklist',
        sections: [
            {
                id: 'worklist.partners',
                label: 'Partners',
                actions: [
                    { id: 'worklist.partners.view',           label: 'View' },
                    { id: 'worklist.partners.create',         label: 'Add New Partner' },
                    { id: 'worklist.partners.edit',           label: 'Edit Profile' },
                    { id: 'worklist.partners.delete',         label: 'Delete' },
                    { id: 'worklist.partners.recordPayment',  label: 'Record Payment' },
                    { id: 'worklist.partners.call',           label: 'Call' },
                    { id: 'worklist.partners.whatsapp',       label: 'WhatsApp' },
                    { id: 'worklist.partners.export',         label: 'Export CSV' },
                    { id: 'worklist.partners.sendReminder',   label: 'Send Reminder' },
                    { id: 'worklist.partners.newSalesOrder',  label: 'New Sales Order' },
                    { id: 'worklist.partners.newB2BInvoice',  label: 'New B2B GST Invoice' },
                ],
            },
            {
                id: 'worklist.retailerProfile',
                label: 'Retailer Profile',
                actions: [
                    { id: 'worklist.retailerProfile.view', label: 'View' },
                    { id: 'worklist.retailerProfile.editCollectionSettings', label: 'Edit Collection Settings' },
                ],
                children: [
                    {
                        id: 'worklist.retailerProfile.b2bOrders',
                        label: 'B2B Orders',
                        actions: [
                            { id: 'worklist.retailerProfile.b2bOrders.view',        label: 'View' },
                            { id: 'worklist.retailerProfile.b2bOrders.addPayment',  label: 'Add Payment' },
                            { id: 'worklist.retailerProfile.b2bOrders.editOrder',   label: 'Edit Order' },
                            { id: 'worklist.retailerProfile.b2bOrders.deleteOrder', label: 'Delete Order' },
                        ],
                    },
                    {
                        id: 'worklist.retailerProfile.payments',
                        label: 'Payments',
                        actions: [
                            { id: 'worklist.retailerProfile.payments.view', label: 'View' },
                            { id: 'worklist.retailerProfile.payments.edit', label: 'Edit' },
                        ],
                    },
                    {
                        id: 'worklist.retailerProfile.productSalesOverview',
                        label: 'Product Sales Overview',
                        actions: [
                            { id: 'worklist.retailerProfile.productSalesOverview.view', label: 'View' },
                            { id: 'worklist.retailerProfile.productSalesOverview.edit', label: 'Edit' },
                        ],
                    },
                ],
            },
            {
                id: 'worklist.invoices',
                label: 'Invoices',
                actions: [
                    { id: 'worklist.invoices.view',   label: 'View' },
                    { id: 'worklist.invoices.create', label: 'Create' },
                    { id: 'worklist.invoices.edit',   label: 'Edit' },
                    { id: 'worklist.invoices.delete', label: 'Delete' },
                ],
            },
            {
                id: 'worklist.payments',
                label: 'Payments',
                actions: [
                    { id: 'worklist.payments.view',       label: 'View' },
                    { id: 'worklist.payments.addPayment', label: 'Add Payment' },
                ],
            },
            {
                id: 'worklist.reminders',
                label: 'Payment Reminders',
                actions: [
                    { id: 'worklist.reminders.view', label: 'View' },
                ],
            },
            {
                id: 'worklist.tracking',
                label: 'Tracking Info',
                actions: [
                    { id: 'worklist.tracking.view', label: 'View' },
                ],
            },
            {
                id: 'worklist.onlineOrders',
                label: 'Online Orders',
                actions: [
                    { id: 'worklist.onlineOrders.view', label: 'View' },
                ],
            },
        ],
    },
    {
        id: 'posBilling',
        label: 'POS Billing',
        sections: [
            {
                id: 'posBilling.billing',
                label: 'POS Billing',
                actions: [
                    { id: 'posBilling.billing.view', label: 'View' },
                ],
            },
            {
                id: 'posBilling.khata',
                label: 'Khata (Udhari)',
                actions: [
                    { id: 'posBilling.khata.view', label: 'View' },
                ],
            },
            {
                id: 'posBilling.customers',
                label: 'Customers',
                actions: [
                    { id: 'posBilling.customers.view', label: 'View' },
                ],
            },
            {
                id: 'posBilling.orderHistory',
                label: 'Order History',
                actions: [
                    { id: 'posBilling.orderHistory.view', label: 'View' },
                ],
            },
        ],
    },
    {
        id: 'supplierLedger',
        label: 'Supplier Ledger',
        sections: [
            { id: 'supplierLedger.suppliers', label: 'Suppliers',         actions: [{ id: 'supplierLedger.suppliers.view', label: 'View' }] },
            { id: 'supplierLedger.payments',  label: 'Invoices',          actions: [{ id: 'supplierLedger.payments.view',  label: 'View' }] },
            { id: 'supplierLedger.reminders', label: 'Payment Reminders', actions: [{ id: 'supplierLedger.reminders.view', label: 'View' }] },
            { id: 'supplierLedger.reports',   label: 'Reports',           actions: [{ id: 'supplierLedger.reports.view',   label: 'View' }] },
        ],
    },
    {
        id: 'inventory',
        label: 'Inventory',
        sections: [
            {
                id: 'inventory.productMaster',
                label: 'Product Master',
                actions: [
                    { id: 'inventory.productMaster.view', label: 'View' },
                    { id: 'inventory.productMaster.add',  label: 'Add Product' },
                    { id: 'inventory.productMaster.edit', label: 'Edit Product' },
                ],
                children: [
                    {
                        id: 'inventory.productMaster.csv',
                        label: 'CSV Import / Export',
                        actions: [
                            { id: 'inventory.productMaster.csv.export',   label: 'Export CSV' },
                            { id: 'inventory.productMaster.csv.template', label: 'CSV Template' },
                            { id: 'inventory.productMaster.csv.upload',   label: 'Upload CSV' },
                        ],
                    },
                ],
            },
            {
                id: 'inventory.registers',
                label: 'Inventory Batches',
                actions: [
                    { id: 'inventory.registers.view', label: 'View' },
                    { id: 'inventory.registers.add',  label: 'Add Batch' },
                ],
            },
            {
                id: 'inventory.stockMovements',
                label: 'Stock Movements',
                actions: [
                    { id: 'inventory.stockMovements.view', label: 'View Stock Movement' },
                ],
            },
            {
                id: 'inventory.transfer',
                label: 'Transport',
                actions: [
                    { id: 'inventory.transfer.view',   label: 'View' },
                    { id: 'inventory.transfer.add',    label: 'Add Transporter' },
                    { id: 'inventory.transfer.edit',   label: 'Edit Transporter' },
                    { id: 'inventory.transfer.delete', label: 'Delete Transporter' },
                ],
            },
        ],
    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively collect all leaf PermissionActions from a section tree. */
export function collectSectionActions(section: PermissionSection): PermissionAction[] {
    const own = section.actions ?? [];
    const nested = (section.children ?? []).flatMap(collectSectionActions);
    return [...own, ...nested];
}

/** Collect all actions across all modules. */
function collectAllActions(): PermissionAction[] {
    return PERMISSION_MODULES
        .flatMap(m => m.sections)
        .flatMap(collectSectionActions);
}

// ─── Default Permissions ──────────────────────────────────────────────────────

// Analyst: all granted except these explicit denials (applies across all modules).
// These replace what used to be hardcoded role checks inside the pages, so the
// Feature Matrix stays the single source of truth (a super admin can re-enable any
// of them per tenant).
const ANALYST_DENIED = new Set([
    'worklist.partners.delete',
    'worklist.invoices.delete',
    'worklist.retailerProfile.b2bOrders.deleteOrder',
    'worklist.retailerProfile.productSalesOverview.edit',
    'worklist.retailerProfile.editCollectionSettings',
    // Payment Reminders sub-tab — previously hidden via a hardcoded WorklistPage guard.
    'worklist.reminders.view',
    // Financial + GST reports — previously hidden via a hardcoded ReportsPage guard.
    'reports.financial.view',
    'reports.gst.view',
]);

// Sales: explicit allowlist — view-only access matching pre-existing isSales behaviour.
const SALES_ALLOWED = new Set([
    'worklist.partners.view',
    'worklist.partners.call',
    'worklist.partners.whatsapp',
    'worklist.invoices.view',
    'worklist.payments.view',
    'worklist.tracking.view',
    // RetailerProfile — preserve existing navigation access for sales (view-only)
    'worklist.retailerProfile.view',
    'worklist.retailerProfile.b2bOrders.view',
    'worklist.retailerProfile.payments.view',
    'worklist.retailerProfile.productSalesOverview.view',
]);

// Retailer: minimal allowlist — only sub-tab views they already accessed.
const RETAILER_ALLOWED = new Set([
    'worklist.invoices.view',
    'worklist.payments.view',
]);

function buildDefaults(): FeaturePermissions {
    const admin: FeaturePermissionMap = {};
    const analyst: FeaturePermissionMap = {};
    const sales: FeaturePermissionMap = {};
    const retailer: FeaturePermissionMap = {};
    const shopkeeper: FeaturePermissionMap = {};
    const manufacturer: FeaturePermissionMap = {};
    const customer: FeaturePermissionMap = {};

    for (const { id } of collectAllActions()) {
        // Worklist carries hand-tuned per-role defaults (pre-existing behaviour).
        // Newer modules (reports/POS/inventory/…) had no feature gating before,
        // so they default to granted for every role — the feature layer only
        // becomes restrictive once a super admin explicitly unchecks something.
        const isWorklist = id.startsWith('worklist.');

        admin[id]        = true;
        analyst[id]      = !ANALYST_DENIED.has(id);
        sales[id]        = isWorklist ? SALES_ALLOWED.has(id)    : true;
        retailer[id]     = isWorklist ? RETAILER_ALLOWED.has(id) : true;
        shopkeeper[id]   = true;
        manufacturer[id] = isWorklist ? false : true;
        customer[id]     = isWorklist ? false : true;
    }

    return { admin, analyst, sales, retailer, shopkeeper, manufacturer, customer };
}

export const DEFAULT_FEATURE_PERMISSIONS: FeaturePermissions = buildDefaults();
