import { Timestamp, DocumentSnapshot } from "firebase/firestore";

export interface AssetModel {
    id: string;
    userId: string;
    title: string;
    value: number;
    assetType: string;
    subType?: string;
    institution?: string;
    currency: string;
    purchaseValue?: number;
    purchaseDate?: Date;
    quantity?: number;
    avgBuyPrice?: number;
    tags?: string[];
    logoHint?: string;
    notes?: string;
    createdAt?: Date;
    valuationDate?: Date;
}

export const assetConverter = {
    toFirestore: (data: AssetModel) => {
        const { id, purchaseDate, createdAt, valuationDate, ...rest } = data;
        return {
            ...rest,
            purchaseDate: purchaseDate ? Timestamp.fromDate(purchaseDate) : null,
            createdAt: createdAt ? Timestamp.fromDate(createdAt) : null,
            valuationDate: valuationDate ? Timestamp.fromDate(valuationDate) : null,
        };
    },
    fromFirestore: (snap: DocumentSnapshot) => {
        const data = snap.data() as any;
        return {
            ...data,
            id: snap.id,
            purchaseDate: data.purchaseDate ? (data.purchaseDate as Timestamp).toDate() : undefined,
            createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : undefined,
            valuationDate: data.valuationDate ? (data.valuationDate as Timestamp).toDate() : undefined,
            tags: data.tags || [],
        } as AssetModel;
    }
};
