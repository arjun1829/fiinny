import { Timestamp, DocumentSnapshot } from "firebase/firestore";

export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';
export type GoalType = 'oneTime' | 'recurring' | 'milestone';

export interface GoalModel {
    id: string;
    title: string;
    targetAmount: number;
    savedAmount: number;
    targetDate: Date;
    emoji?: string;
    category?: string;
    priority?: string;
    notes?: string;
    dependencies?: string[];

    // New fields
    status: GoalStatus;
    goalType: GoalType;
    type?: string; // savings, debt, purchase, investing
    color?: string;
    icon?: string;
    recurrence?: string;
    milestones?: string[];
    imageUrl?: string;
    archived: boolean;
    createdAt?: Date;
    completedAt?: Date;
}

export const goalConverter = {
    toFirestore: (data: GoalModel) => {
        const { id, targetDate, createdAt, completedAt, ...rest } = data;
        return {
            ...rest,
            targetDate: Timestamp.fromDate(targetDate),
            createdAt: createdAt ? Timestamp.fromDate(createdAt) : null,
            completedAt: completedAt ? Timestamp.fromDate(completedAt) : null,
        };
    },
    fromFirestore: (snap: DocumentSnapshot) => {
        const data = snap.data() as any;
        return {
            ...data,
            id: snap.id,
            targetDate: (data.targetDate as Timestamp).toDate(),
            createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : undefined,
            completedAt: data.completedAt ? (data.completedAt as Timestamp).toDate() : undefined,
            dependencies: data.dependencies || [],
            milestones: data.milestones || [],
        } as GoalModel;
    }
};
