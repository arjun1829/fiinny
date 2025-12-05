import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    getDocs,
    deleteDoc,
    query,
    orderBy,
    onSnapshot,
    setDoc
} from "firebase/firestore";
import { GoalModel, goalConverter } from "@/lib/models/GoalModel";

export class GoalService {
    static async getGoals(userId: string): Promise<GoalModel[]> {
        const q = query(collection(db, "users", userId, "goals"), orderBy("targetDate", "asc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => goalConverter.fromFirestore(doc));
    }

    static streamGoals(userId: string, callback: (items: GoalModel[]) => void) {
        const q = query(collection(db, "users", userId, "goals"), orderBy("targetDate", "asc"));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => goalConverter.fromFirestore(doc));
            callback(items);
        });
    }

    static async deleteGoal(userId: string, goalId: string) {
        await deleteDoc(doc(db, "users", userId, "goals", goalId));
    }

    static async addGoal(userId: string, goal: GoalModel) {
        const ref = doc(db, "users", userId, "goals", goal.id);
        await setDoc(ref, goalConverter.toFirestore(goal));
    }
}
