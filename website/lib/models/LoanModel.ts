import { Timestamp, DocumentSnapshot } from "firebase/firestore";

export type LoanInterestMethod = 'reducing' | 'flat';
export type LoanShareMode = 'equal' | 'custom';

export interface LoanShareMember {
    name?: string;
    phone?: string;
    userId?: string;
    percent?: number;
}

export interface LoanShare {
    isShared: boolean;
    mode: LoanShareMode;
    members: LoanShareMember[];
}

export type LoanType = 'given' | 'taken' | 'bank';

export interface LoanModel {
    id: string;
    userId?: string;
    title: string;
    totalAmount: number; // The original loan amount
    paidAmount: number;  // Amount paid back so far
    type: LoanType;      // given (I lent), taken (I borrowed), bank (Bank loan)
    personName?: string; // For personal loans

    // Bank Loan specific fields (optional)
    lenderName?: string;
    accountLast4?: string;
    minDue?: number;
    billCycleDay?: number;
    startDate?: Date;
    dueDate?: Date;
    interestRate?: number;
    interestMethod?: LoanInterestMethod;
    emi?: number;
    tenureMonths?: number;
    paymentDayOfMonth?: number;
    reminderEnabled?: boolean;
    reminderDaysBefore?: number;
    reminderTime?: string;
    autopay?: boolean;
    lastPaymentDate?: Date;
    lastPaymentAmount?: number;
    tags?: string[];
    share?: LoanShare;
    shareMemberPhones?: string[];
    note?: string;
    isClosed?: boolean;
    createdAt?: Date;

    // Legacy field support (optional)
    amount?: number;
}

export const loanConverter = {
    toFirestore: (data: LoanModel) => {
        const { id, startDate, dueDate, lastPaymentDate, createdAt, ...rest } = data;
        return {
            ...rest,
            startDate: startDate ? Timestamp.fromDate(startDate) : null,
            dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
            lastPaymentDate: lastPaymentDate ? Timestamp.fromDate(lastPaymentDate) : null,
            createdAt: createdAt ? Timestamp.fromDate(createdAt) : null,
        };
    },
    fromFirestore: (snap: DocumentSnapshot) => {
        const data = snap.data() as any;
        return {
            ...data,
            id: snap.id,
            startDate: data.startDate ? (data.startDate as Timestamp).toDate() : undefined,
            dueDate: data.dueDate ? (data.dueDate as Timestamp).toDate() : undefined,
            lastPaymentDate: data.lastPaymentDate ? (data.lastPaymentDate as Timestamp).toDate() : undefined,
            createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : undefined,
            tags: data.tags || [],
            shareMemberPhones: data.shareMemberPhones || [],
        } as LoanModel;
    }
};
