import { ExpenseItem } from "../firestore";
import { computeSplits } from "./balanceMath";

export interface PairwiseTotals {
    owe: number;
    owed: number;
    net: number;
}

export interface PairwiseBucketTotals {
    owe: number;
    owed: number;
    net: number;
}

export interface PairwiseBreakdown {
    totals: PairwiseTotals;
    buckets: Record<string, PairwiseBucketTotals>;
}

export function isSettlementLike(e: ExpenseItem): boolean {
    const type = (e.type || "").toLowerCase();
    const label = (e.label || "").toLowerCase();

    if (type.includes("settle") || label.includes("settle")) return true;

    // Settlement/Transfer check
    if ((e.friendIds || []).length === 1 && (!e.customSplits || Object.keys(e.customSplits).length === 0)) {
        if (e.category === "Settlement") return true;
    }
    return false;
}

export function involvesPair(e: ExpenseItem, you: string, friend: string): boolean {
    if (isSettlementLike(e)) {
        const recipients = e.friendIds || [];
        const youPaidFriend = e.payerId === you && recipients.includes(friend);
        const friendPaidYou = e.payerId === friend && recipients.includes(you);
        return youPaidFriend || friendPaidYou;
    }

    const splits = computeSplits(e);
    const youPaidFriendIn = (e.payerId === you) && (friend in splits);
    const friendPaidYouIn = (e.payerId === friend) && (you in splits);
    return youPaidFriendIn || friendPaidYouIn;
}

export function getPairwiseExpenses(you: string, friend: string, all: ExpenseItem[]): ExpenseItem[] {
    const list = all.filter(e => involvesPair(e, you, friend));
    // Sort by date DESC
    list.sort((a, b) => {
        const da = a.date instanceof Date ? a.date : new Date(a.date);
        const db = b.date instanceof Date ? b.date : new Date(b.date);
        return db.getTime() - da.getTime();
    });
    return list;
}

export function computePairwiseBreakdown(you: string, friend: string, pairwise: ExpenseItem[]): PairwiseBreakdown {
    let youOwe = 0.0;
    let owedToYou = 0.0;
    const oweByBucket: Record<string, number> = {};
    const owedByBucket: Record<string, number> = {};

    const bucketId = (groupId?: string) => (!groupId ? '__none__' : groupId);

    for (const e of pairwise) {
        const bucket = bucketId(e.groupId);

        if (isSettlementLike(e)) {
            if (e.payerId === you) {
                owedToYou += e.amount;
                owedByBucket[bucket] = (owedByBucket[bucket] || 0) + e.amount;
            } else if (e.payerId === friend) {
                youOwe += e.amount;
                oweByBucket[bucket] = (oweByBucket[bucket] || 0) + e.amount;
            }
            continue;
        }

        const splits = computeSplits(e);
        const yourShare = splits[you] || 0.0;
        const theirShare = splits[friend] || 0.0;

        if (e.payerId === you) {
            owedToYou += theirShare;
            owedByBucket[bucket] = (owedByBucket[bucket] || 0) + theirShare;
        } else if (e.payerId === friend) {
            youOwe += yourShare;
            oweByBucket[bucket] = (oweByBucket[bucket] || 0) + yourShare;
        }
    }

    const round2 = (val: number) => Math.round(val * 100) / 100;
    const isSettled = (owed: number, owe: number) => Math.abs(owed - owe) < 0.01;

    youOwe = round2(youOwe);
    owedToYou = round2(owedToYou);
    let net = round2(owedToYou - youOwe);

    if (isSettled(owedToYou, youOwe)) {
        youOwe = 0.0;
        owedToYou = 0.0;
        net = 0.0;
    }

    const buckets: Record<string, PairwiseBucketTotals> = {};
    const allKeys = new Set([...Object.keys(oweByBucket), ...Object.keys(owedByBucket)]);

    allKeys.forEach(key => {
        const owe = round2(oweByBucket[key] || 0.0);
        const owed = round2(owedByBucket[key] || 0.0);

        if (isSettled(owed, owe)) {
            buckets[key] = { owe: 0, owed: 0, net: 0 };
        } else {
            buckets[key] = {
                owe,
                owed,
                net: round2(owed - owe)
            };
        }
    });

    return {
        totals: {
            owe: youOwe,
            owed: owedToYou,
            net
        },
        buckets
    };
}
