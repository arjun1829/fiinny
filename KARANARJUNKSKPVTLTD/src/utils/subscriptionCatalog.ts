import type { AppScreen } from '../contexts/AuthContext';
import type { PlanEntitlements } from './subscriptionPlans';
import { ADMIN_COROLLARY_SCREENS } from './subscriptionPlans';
import { PERMISSION_MODULES, type PermissionSection } from './featurePermissions';

/**
 * ─── Subscription catalogue (Super Admin view) ─────────────────────────────────
 *
 * A one-to-one mirror of the ERP Main Navbar and its Feature Permissions. The
 * Super Admin toggles whole MODULES (and, where they exist, SUB-SECTIONS) into a
 * plan. CRUD/action rows (View/Add/Edit/Delete) are NOT here — those stay with the
 * Business Admin's Role Matrix / Feature Permissions.
 *
 * Everything is reused from existing definitions — no parallel identifiers:
 *   • `screen`         → an existing AppScreen key (plan.screens; route + nav gate).
 *   • `featureModuleId`→ an existing PERMISSION_MODULES module id (its sections
 *                        become the sub-sections; also the plan.features group).
 *   • sub-section ids  → existing PERMISSION_MODULES section ids, labels included.
 *
 * Hierarchy the Super Admin controls:
 *   Module            → included in subscription?          (plan.screens / group)
 *     └─ Sub-section  → included in subscription?          (plan.features allowlist)
 */

// Flatten a section tree so nested sections are label-resolvable too.
function flatten(sec: PermissionSection): PermissionSection[] {
    return [sec, ...(sec.children ?? []).flatMap(flatten)];
}

// id → label, sourced straight from the Feature Permission definitions (reused).
const SECTION_LABELS: Record<string, string> = {};
for (const m of PERMISSION_MODULES) {
    for (const s of m.sections) {
        for (const f of flatten(s)) SECTION_LABELS[f.id] = f.label;
    }
}

export interface SubSection {
    /** Existing PERMISSION_MODULES section id — reused as the plan feature id. */
    id: string;
    label: string;
}

export interface SubscriptionModule {
    /** Stable key (mirrors the navbar section id where one exists). */
    key: string;
    label: string;
    /** Route/nav entitlement — an existing AppScreen (plan.screens membership). */
    screen?: AppScreen;
    /** PERMISSION_MODULES module id whose sections this module owns (plan.features). */
    featureModuleId?: string;
    /** True when another module shares this screen (needs feature-group disambiguation). */
    sharesScreen?: boolean;
    sections: SubSection[];
    note?: string;
}

/** Resolve a section's label from the Feature Permission definitions. */
const sec = (id: string): SubSection => ({ id, label: SECTION_LABELS[id] ?? id });

/**
 * The subscription modules, in Main-Navbar order. Sub-sections and their labels
 * come from PERMISSION_MODULES, so this cannot diverge from the app's Feature
 * Permissions.
 *
 * `settings` is intentionally absent — always-allowed (ALWAYS_ALLOWED_SCREENS) so
 * a tenant is never fully locked out.
 */
export const SUBSCRIPTION_MODULES: SubscriptionModule[] = [
    { key: 'dashboard',     label: 'B2B Dashboard',    screen: 'dashboard',     sections: [] },
    { key: 'b2cDashboard',  label: 'B2C Dashboard',    screen: 'b2c_dashboard', sections: [] },
    { key: 'analytics',     label: 'Analytics',        screen: 'analytics',     sections: [] },
    {
        key: 'worklist', label: 'Worklist', screen: 'worklist', featureModuleId: 'worklist',
        sections: [
            sec('worklist.partners'),
            sec('worklist.invoices'),
            sec('worklist.payments'),
            sec('worklist.reminders'),
            sec('worklist.tracking'),
            sec('worklist.onlineOrders'),
        ],
    },
    {
        key: 'pos', label: 'POS / B2C Billing', screen: 'pos', featureModuleId: 'posBilling',
        sections: [
            sec('posBilling.billing'),
            sec('posBilling.khata'),
            sec('posBilling.customers'),
            sec('posBilling.orderHistory'),
        ],
    },
    { key: 'admin', label: 'Admin', screen: 'admin', sections: [] },
    {
        key: 'supplierLedger', label: 'Supplier Ledger', screen: 'worklist',
        featureModuleId: 'supplierLedger', sharesScreen: true, sections: [],
        note: 'Runs on the Worklist screen; toggling controls its ledger tabs.',
    },
    {
        key: 'inventory', label: 'Inventory', screen: 'inventory', featureModuleId: 'inventory',
        sections: [
            sec('inventory.productMaster'),
            sec('inventory.registers'),
            sec('inventory.stockMovements'),
            sec('inventory.transfer'),
        ],
    },
    {
        key: 'reports', label: 'Reports', screen: 'analytics', featureModuleId: 'reports',
        sharesScreen: true,
        sections: [
            sec('reports.stock'),
            sec('reports.financial'),
            sec('reports.gst'),
        ],
    },
    {
        key: 'teamPerformance', label: 'Team Performance', featureModuleId: 'teamPerformance',
        sections: [],
        note: 'No screen-level gate (route is role-gated); recorded as subscription intent.',
    },
    { key: 'expenses', label: 'Expenses', screen: 'expenses', sections: [] },
];

/** Sentinel appended to plan.features to keep a module restricted with 0 sections. */
export const FEATURE_EXCLUDED = '__excluded__';
/** Sentinel recording a screenless module (Team Performance) as included. */
export const FEATURE_ON = '__on__';

// ─── Nav-path → subscription gate (visibility + access) ─────────────────────────
// Most nav items are gated purely by their AppScreen (plan.screens). These paths,
// however, map to a subscription module that SHARES a screen with another module
// (Worklist vs Supplier Ledger; Analytics vs Reports) or has no screen at all
// (Team Performance), so they must additionally be gated by their feature GROUP.
// Values are existing PERMISSION_MODULES / featureModuleId ids — no new names.
export const NAV_FEATURE_GROUP: Record<string, string> = {
    '/worklist':         'worklist',
    '/supplier-ledger':  'supplierLedger',
    '/reports':          'reports',
    '/team-performance': 'teamPerformance',
};

/** Resolve the feature group gating a route path (exact match or nested child). */
export function navFeatureGroupForPath(path: string): string | null {
    for (const key of Object.keys(NAV_FEATURE_GROUP)) {
        if (path === key || path.startsWith(key + '/')) return NAV_FEATURE_GROUP[key];
    }
    return null;
}

/**
 * True if the tenant's plan includes a module's feature GROUP. Screenful groups
 * are ON unless their `__excluded__` marker is present; the screenless
 * Team Performance group is ON only when its `__on__` marker is present.
 * `features === null` means no sub-section restriction is stored at all.
 */
export function isFeatureGroupAllowed(featureModuleId: string, ent: PlanEntitlements): boolean {
    const screenless = featureModuleId === 'teamPerformance';
    if (ent.features === null) return !screenless;
    if (screenless) return ent.features.has(`${featureModuleId}.${FEATURE_ON}`);
    return !ent.features.has(`${featureModuleId}.${FEATURE_EXCLUDED}`);
}

// ─── Plan ⇄ editor conversion ───────────────────────────────────────────────
// One place that maps the module/sub-section checkboxes to the Phase-2A plan
// shape (plan.screens + plan.features) and back, handling screen-sharing modules
// (Worklist/Supplier Ledger, Analytics/Reports) and the screenless one
// (Team Performance).

export interface PlanEditorState {
    enabledKeys: Set<string>;      // enabled top-level module keys
    includedSections: Set<string>; // enabled sub-section ids
}

/** Build plan.screens + plan.features from the editor's checkbox state. */
export function buildPlanEntitlement(state: PlanEditorState): { screens: AppScreen[]; features: string[] } {
    const screens = new Set<AppScreen>();
    for (const mod of SUBSCRIPTION_MODULES) {
        if (state.enabledKeys.has(mod.key) && mod.screen) screens.add(mod.screen);
    }
    // Admin corollary screens are not individually toggled in the editor; inject them
    // whenever admin is enabled so they are never dropped from plan.screens on re-save.
    if (screens.has('admin')) {
        for (const s of ADMIN_COROLLARY_SCREENS) screens.add(s);
    }

    const features: string[] = [];
    for (const mod of SUBSCRIPTION_MODULES) {
        const fm = mod.featureModuleId;
        if (!fm) continue;
        const enabled = state.enabledKeys.has(mod.key);

        // Screenless module (Team Performance) — record on/off via a marker.
        if (!mod.screen) {
            if (enabled) features.push(`${fm}.${FEATURE_ON}`);
            continue;
        }

        const screenOn = screens.has(mod.screen);
        if (!enabled) {
            // Deny this feature group only if a sibling keeps the screen open.
            if (screenOn) features.push(`${fm}.${FEATURE_EXCLUDED}`);
            continue;
        }
        // Enabled: partial sub-section allowlist (all → unrestricted, none → excluded).
        if (mod.sections.length) {
            const checked = mod.sections.filter(s => state.includedSections.has(s.id)).map(s => s.id);
            if (checked.length === mod.sections.length) continue;           // unrestricted
            if (checked.length === 0) { features.push(`${fm}.${FEATURE_EXCLUDED}`); continue; }
            features.push(...checked);
        }
        // Enabled flat module → unrestricted, nothing to add.
    }
    return { screens: [...screens], features };
}

/** Derive the editor's checkbox state from a stored plan. */
export function derivePlanEditorState(planScreens: AppScreen[] = [], planFeatures: string[] = []): PlanEditorState {
    const screenSet = new Set(planScreens);
    const featSet = new Set(planFeatures);
    const excluded = (fm: string) => featSet.has(`${fm}.${FEATURE_EXCLUDED}`);
    const onMarker = (fm: string) => featSet.has(`${fm}.${FEATURE_ON}`);

    const enabledKeys = new Set<string>();
    const includedSections = new Set<string>();

    for (const mod of SUBSCRIPTION_MODULES) {
        const fm = mod.featureModuleId;
        let enabled: boolean;
        if (!mod.screen && fm) enabled = onMarker(fm);
        else if (fm && excluded(fm)) enabled = false;
        else enabled = mod.screen ? screenSet.has(mod.screen) : false;
        if (enabled) enabledKeys.add(mod.key);

        if (mod.sections.length && fm) {
            const anyEntry = planFeatures.some(f => f.split('.')[0] === fm);
            for (const s of mod.sections) {
                const inc = !anyEntry ? true : excluded(fm) ? false : featSet.has(s.id);
                if (inc) includedSections.add(s.id);
            }
        }
    }
    return { enabledKeys, includedSections };
}
