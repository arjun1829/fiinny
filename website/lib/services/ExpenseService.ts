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
    writeBatch,
    limit,
    where
} from "firebase/firestore";
import { ExpenseItem, expenseConverter } from "@/lib/models/ExpenseItem";

export class ExpenseService {
    static async getExpenses(userId: string, limitCount?: number): Promise<ExpenseItem[]> {
        let q = query(collection(db, "users", userId, "expenses"), orderBy("date", "desc"));
        if (limitCount) {
            q = query(q, limit(limitCount));
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => expenseConverter.fromFirestore(doc));
    }

    static streamExpenses(userId: string, callback: (items: ExpenseItem[]) => void) {
        const q = query(collection(db, "users", userId, "expenses"), orderBy("date", "desc"));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => expenseConverter.fromFirestore(doc));
            callback(items);
        });
    }

    static async deleteExpense(userId: string, expenseId: string) {
        await deleteDoc(doc(db, "users", userId, "expenses", expenseId));
    }

    static async addExpense(userId: string, expense: ExpenseItem) {
        const ref = doc(db, "users", userId, "expenses", expense.id);
        await setDoc(ref, expenseConverter.toFirestore(expense));
    }

    static async getExpensesByFriend(userId: string, friendId: string): Promise<ExpenseItem[]> {
        const q = query(
            collection(db, "users", userId, "expenses"),
            where("friendIds", "array-contains", friendId),
            orderBy("date", "desc")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => expenseConverter.fromFirestore(doc));
    }

    static async getExpensesByGroup(userId: string, groupId: string): Promise<ExpenseItem[]> {
        const q = query(
            collection(db, "users", userId, "expenses"),
            where("groupId", "==", groupId),
            orderBy("date", "desc")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => expenseConverter.fromFirestore(doc));
    }
}
