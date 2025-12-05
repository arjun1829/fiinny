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
import { LoanModel, loanConverter } from "@/lib/models/LoanModel";

export class LoanService {
    static async getLoans(userId: string): Promise<LoanModel[]> {
        const q = query(collection(db, "users", userId, "loans"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => loanConverter.fromFirestore(doc));
    }

    static streamLoans(userId: string, callback: (items: LoanModel[]) => void) {
        const q = query(collection(db, "users", userId, "loans"), orderBy("createdAt", "desc"));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => loanConverter.fromFirestore(doc));
            callback(items);
        });
    }

    static async deleteLoan(userId: string, loanId: string) {
        await deleteDoc(doc(db, "users", userId, "loans", loanId));
    }

    static async addLoan(userId: string, loan: LoanModel) {
        const ref = doc(db, "users", userId, "loans", loan.id);
        await setDoc(ref, loanConverter.toFirestore(loan));
    }
}
