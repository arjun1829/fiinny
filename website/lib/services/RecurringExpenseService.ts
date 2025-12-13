import { db } from "../firebase";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { RecurringExpenseModel, recurringExpenseConverter } from "../models/RecurringExpenseModel";

export class RecurringExpenseService {
    static streamRecurringExpenses(
        userId: string,
        filter: { type: 'group' | 'friend', id: string },
        callback: (items: RecurringExpenseModel[]) => void
    ) {
        const ref = collection(db, "users", userId, "recurring_expenses").withConverter(recurringExpenseConverter);
        let q;

        if (filter.type === 'group') {
            q = query(ref, where("groupId", "==", filter.id));
        } else {
            // For friends, we check if the friendId is in the friendIds array
            q = query(ref, where("friendIds", "array-contains", filter.id));
        }

        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => doc.data());
            callback(items);
        });
    }

    static async addRecurringExpense(userId: string, expense: Partial<RecurringExpenseModel>) {
        const ref = collection(db, "users", userId, "recurring_expenses").withConverter(recurringExpenseConverter);
        await addDoc(ref, expense as RecurringExpenseModel);
    }

    static async deleteRecurringExpense(userId: string, expenseId: string) {
        await deleteDoc(doc(db, "users", userId, "recurring_expenses", expenseId));
    }
}
