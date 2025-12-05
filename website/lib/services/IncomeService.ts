import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    getDocs,
    deleteDoc,
    query,
    orderBy,
    onSnapshot,
    setDoc,
    limit
} from "firebase/firestore";
import { IncomeItem, incomeConverter } from "@/lib/models/IncomeItem";

export class IncomeService {
    static async getIncomes(userId: string, limitCount?: number): Promise<IncomeItem[]> {
        let q = query(collection(db, "users", userId, "incomes"), orderBy("date", "desc"));
        if (limitCount) {
            q = query(q, limit(limitCount));
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => incomeConverter.fromFirestore(doc));
    }

    static streamIncomes(userId: string, callback: (items: IncomeItem[]) => void) {
        const q = query(collection(db, "users", userId, "incomes"), orderBy("date", "desc"));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => incomeConverter.fromFirestore(doc));
            callback(items);
        });
    }

    static async deleteIncome(userId: string, incomeId: string) {
        await deleteDoc(doc(db, "users", userId, "incomes", incomeId));
    }

    static async addIncome(userId: string, income: IncomeItem) {
        const ref = doc(db, "users", userId, "incomes", income.id);
        await setDoc(ref, incomeConverter.toFirestore(income));
    }
}
