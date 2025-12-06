import { Timestamp, DocumentSnapshot } from "firebase/firestore";
import { AttachmentMeta } from "./ExpenseItem";

export interface IncomeItem {
    id: string;
    type: string;
    amount: number;
    note: string;
    date: Date;
    source: string;

    imageUrl?: string;
    label?: string;
    bankLogo?: string;
    category?: string;

    // Card basics
    cardType?: string;
    cardLast4?: string;

    // NEW: Context
    counterparty?: string;
    counterpartyType?: string;
    upiVpa?: string;
    instrument?: string;
    instrumentNetwork?: string;
    issuerBank?: string;
    isInternational?: boolean;
    fx?: Record<string, any>;
    fees?: Record<string, number>;

    // NEW UX
    title?: string;
    comments?: string;
    labels: string[];
    attachments: AttachmentMeta[];

    // Legacy single-attachment
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentSize?: number;

    // Brain
    brainMeta?: Record<string, any>;
    confidence?: number;
    tags?: string[];
}

export const incomeConverter = {
    toFirestore: (data: IncomeItem) => {
        const { id, date, ...rest } = data;
        return {
            ...rest,
            date: Timestamp.fromDate(date),
        };
    },
    fromFirestore: (snap: DocumentSnapshot) => {
        const data = snap.data() as any;
        return {
            ...data,
            id: snap.id,
            date: (data.date as Timestamp).toDate(),
            labels: data.labels || [],
            attachments: data.attachments || [],
        } as IncomeItem;
    }
};
