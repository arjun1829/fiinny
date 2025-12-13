import { Timestamp, DocumentSnapshot } from "firebase/firestore";

export interface AttachmentMeta {
    url?: string;
    name?: string;
    size?: number;
    mimeType?: string;
    storagePath?: string;
}

export interface ExpenseItem {
    id: string;
    type: string;
    amount: number;
    note: string; // System/parsed note
    date: Date;

    // Social/splits
    friendIds: string[];
    groupId?: string;
    settledFriendIds: string[];
    payerId: string;
    customSplits?: Record<string, number>;

    // Card basics
    cardType?: string;
    cardLast4?: string;
    isBill: boolean;
    imageUrl?: string;
    isSettlement?: boolean;

    // Legacy tagging
    label?: string;
    category?: string;
    bankLogo?: string;

    // Legacy single-attachment
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentSize?: number;

    // NEW: Context
    counterparty?: string;
    counterpartyType?: string;
    upiVpa?: string;
    instrument?: string;
    instrumentNetwork?: string;
    issuerBank?: string;

    // NEW: International/FX & fees
    isInternational?: boolean;
    fx?: Record<string, any>;
    fees?: Record<string, number>;

    // NEW: Bill meta
    billTotalDue?: number;
    billMinDue?: number;
    billDueDate?: Date;
    statementStart?: Date;
    statementEnd?: Date;

    // NEW UX
    title?: string;
    comments?: string;
    labels: string[];
    attachments: AttachmentMeta[];

    // Brain
    brainMeta?: Record<string, any>;
    confidence?: number;
    tags?: string[];
}

export const expenseConverter = {
    toFirestore: (data: ExpenseItem) => {
        const { id, date, billDueDate, statementStart, statementEnd, ...rest } = data;
        return {
            ...rest,
            date: Timestamp.fromDate(date),
            billDueDate: billDueDate ? Timestamp.fromDate(billDueDate) : null,
            statementStart: statementStart ? Timestamp.fromDate(statementStart) : null,
            statementEnd: statementEnd ? Timestamp.fromDate(statementEnd) : null,
        };
    },
    fromFirestore: (snap: DocumentSnapshot) => {
        const data = snap.data() as any;
        return {
            ...data,
            id: snap.id,
            date: (data.date as Timestamp).toDate(),
            billDueDate: data.billDueDate ? (data.billDueDate as Timestamp).toDate() : undefined,
            statementStart: data.statementStart ? (data.statementStart as Timestamp).toDate() : undefined,
            statementEnd: data.statementEnd ? (data.statementEnd as Timestamp).toDate() : undefined,
            friendIds: data.friendIds || [],
            settledFriendIds: data.settledFriendIds || [],
            labels: data.labels || [],
            attachments: data.attachments || [],
        } as ExpenseItem;
    }
};
