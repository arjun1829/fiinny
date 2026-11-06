// The plan a visitor chose on the landing page, carried through
// sign-up → business setup → checkout so they land straight in payment for the
// plan they clicked. Holds only a plan id and billing cycle — never payment or
// subscription state, which stays server-side.

export type BillingCycle = 'monthly' | 'yearly';
export type PlanTierId = 'starter' | 'growth' | 'pro';

export interface PendingPlan {
    plan: PlanTierId;
    cycle: BillingCycle;
}

const KEY = 'ka_pending_plan';
// Long enough to sign up, wait for an OTP and fill in business details; short
// enough that a visitor returning next week sees the plan page, not a surprise
// checkout.
const TTL_MS = 6 * 60 * 60 * 1000;
const TIERS: PlanTierId[] = ['starter', 'growth', 'pro'];

export function savePendingPlan(p: PendingPlan): void {
    try {
        localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() }));
    } catch { /* storage blocked: the visitor just picks the plan again */ }
}

export function readPendingPlan(): PendingPlan | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const v = JSON.parse(raw) as { plan?: string; cycle?: string; at?: number };
        if (!v.at || Date.now() - v.at > TTL_MS || !TIERS.includes(v.plan as PlanTierId)) {
            localStorage.removeItem(KEY);
            return null;
        }
        return { plan: v.plan as PlanTierId, cycle: v.cycle === 'monthly' ? 'monthly' : 'yearly' };
    } catch {
        return null;
    }
}

export function clearPendingPlan(): void {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const formatINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
