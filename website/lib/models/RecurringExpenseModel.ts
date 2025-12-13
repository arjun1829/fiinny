import { Timestamp, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore";
import { ExpenseItem } from "./ExpenseItem";

export interface RecurringExpenseModel {
    id: string;
    description: string;
    amount: number;
    category: string;
    subcategory?: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    nextDueDate: Timestamp;

    // Determining context
    friendIds?: string[];
    groupId?: string;
    payerId: string;

    // Split logic mirrors ExpenseItem
    splitType?: 'equal' | 'exact' | 'percentage';
    customSplits?: Record<string, number>;
}

export const recurringExpenseConverter = {
    toFirestore(expense: RecurringExpenseModel): any {
        return { ...expense };
    },
    fromFirestore(
        snapshot: QueryDocumentSnapshot,
        options: SnapshotOptions
    ): RecurringExpenseModel {
        const data = snapshot.data(options);
        return {
            id: snapshot.id,
            description: data.description,
            amount: data.amount,
            category: data.category,
            subcategory: data.subcategory,
            frequency: data.frequency,
            nextDueDate: data.nextDueDate,
            friendIds: data.friendIds,
            groupId: data.groupId,
            payerId: data.payerId,
            splitType: data.splitType,
            customSplits: data.customSplits,
        } as RecurringExpenseModel;
    },
};
