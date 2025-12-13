import { ExpenseItem } from "../firestore";

export interface MemberTotals {
    paid: number;
    share: number;
    net: number;
}

/**
 * Returns a map of memberId -> split amount.
 * Uses customSplits if present, otherwise splits equally among payer + friendIds.
 */
export function computeSplits(e: ExpenseItem): Record<string, number> {
    if (e.customSplits && Object.keys(e.customSplits).length > 0) {
        return { ...e.customSplits };
    }

    const participants = new Set<string>();
    if (e.payerId) participants.add(e.payerId);
    if (e.friendIds) {
        e.friendIds.forEach(id => {
            if (id) participants.add(id);
        });
    }

    const members = Array.from(participants);
    if (members.length === 0) return {};

    const ids = members;
    const amount = e.amount;
    const each = amount / ids.length;

    const splits: Record<string, number> = {};
    ids.forEach(id => {
        splits[id] = each;
    });
    return splits;
}

function isSettlement(e: ExpenseItem): boolean {
    const type = (e.type || "").toLowerCase();
    const label = (e.label || "").toLowerCase();

    if (type.includes("settle") || label.includes("settle")) return true;

    // Settle Up flow: single counterparty, no custom splits, marked as bill/transfer
    // Note: In Flutter "isBill" might be used for this. In web, we should check if we map isBill field.
    // For now we check the typical structure of a settlement
    if (e.friendIds && e.friendIds.length === 1 && (!e.customSplits || Object.keys(e.customSplits).length === 0)) {
        // Ideally we check a specific flag, but checking type "transfer" or "settlement" is safer if available.
        // We'll rely on text matching and maybe "isBill" if we add that to the model.
        if (e.category === "Settlement") return true;
    }
    return false;
}

/**
 * Computes paid/share/net totals for each member in a list of expenses.
 */
export function computeMemberTotals(expenses: ExpenseItem[]): Record<string, MemberTotals> {
    const map: Record<string, { paid: number; share: number }> = {};

    const getMember = (id: string) => {
        if (!map[id]) map[id] = { paid: 0, share: 0 };
        return map[id];
    };

    for (const e of expenses) {
        if (!e.payerId) continue;

        if (isSettlement(e)) {
            // Treat settlement as cash transfer from payer -> others
            const payer = e.payerId;
            const others = (e.friendIds || []).filter(id => !!id);
            if (others.length === 0) continue;

            const amt = Math.abs(e.amount);
            const perOther = amt / others.length;

            // Payer's net goes DOWN by full amount => increase payer's share
            getMember(payer).share += amt;

            // Each counterparty's net goes UP by their portion => increase their paid
            others.forEach(o => {
                getMember(o).paid += perOther;
            });
            continue;
        }

        // Normal Expense
        // Payer paid full amount
        getMember(e.payerId).paid += e.amount;

        // Splits determine share
        const splits = computeSplits(e);
        Object.entries(splits).forEach(([id, share]) => {
            getMember(id).share += share;
        });
    }

    const result: Record<string, MemberTotals> = {};
    Object.entries(map).forEach(([id, val]) => {
        result[id] = {
            paid: val.paid,
            share: val.share,
            net: val.paid - val.share
        };
    });
    return result;
}

/**
 * Returns map of memberId -> net balance for the group/list.
 */
export function computeNetByMember(expenses: ExpenseItem[]): Record<string, number> {
    const totals = computeMemberTotals(expenses);
    const result: Record<string, number> = {};
    Object.entries(totals).forEach(([id, t]) => {
        // Round to 2 decimals
        result[id] = Math.round(t.net * 100) / 100;
    });
    return result;
}
