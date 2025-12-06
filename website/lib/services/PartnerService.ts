import { db } from "../firebase";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    onSnapshot,
    runTransaction,
    Timestamp
} from "firebase/firestore";
import { PartnerModel, partnerConverter } from "../models/PartnerModel";

export class PartnerService {

    // --- Helpers ---
    private static normalizePhone(phone: string): string {
        // Basic normalization if needed, assuming E164 inputs from utils usually
        return phone.trim();
    }

    private static async resolveUserDoc(identifier: string) {
        const id = identifier.trim();
        const usersRef = collection(db, "users");

        // Try direct phone match (doc ID)
        const docRef = doc(usersRef, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return docSnap;

        // Try email
        const emailQuery = query(usersRef, where("email", "==", id.toLowerCase()), limit(1));
        const emailSnap = await getDocs(emailQuery);
        if (!emailSnap.empty) return emailSnap.docs[0];

        // Try 'phone' field
        const phoneQuery = query(usersRef, where("phone", "==", id), limit(1));
        const phoneSnap = await getDocs(phoneQuery);
        if (!phoneSnap.empty) return phoneSnap.docs[0];

        return null;
    }

    // --- Actions ---

    static async addPartner(currentUserPhone: string, partnerIdentifier: string, relation: string, permissions: Record<string, boolean>) {
        const from = this.normalizePhone(currentUserPhone);
        const partnerDoc = await this.resolveUserDoc(partnerIdentifier);

        if (!partnerDoc) throw new Error("User not found");

        const partnerId = partnerDoc.id; // Phone number as ID
        if (partnerId === from) throw new Error("Cannot add yourself");

        // Check existing request
        const reqQuery = query(
            collection(db, "partner_requests"),
            where("fromUserPhone", "==", from),
            where("toUserPhone", "==", partnerId),
            where("status", "==", "pending"),
            limit(1)
        );
        const existing = await getDocs(reqQuery);

        let requestId = "";
        if (!existing.empty) {
            requestId = existing.docs[0].id;
        } else {
            const reqRef = doc(collection(db, "partner_requests"));
            await setDoc(reqRef, {
                fromUserPhone: from,
                toUserPhone: partnerId,
                relation,
                permissions,
                status: 'pending',
                createdAt: serverTimestamp()
            });
            requestId = reqRef.id;
        }

        // Create local pending link
        await this.createOrUpdateLocalPendingLink(from, partnerId, relation, permissions, requestId);
        return partnerId;
    }

    static async createOrUpdateLocalPendingLink(currentUserPhone: string, partnerId: string, relation: string, permissions: Record<string, boolean>, requestId: string) {
        const partnerRef = doc(db, "users", partnerId);
        const partnerSnap = await getDoc(partnerRef);
        const partnerData = partnerSnap.data() || {};

        const ref = doc(db, "users", currentUserPhone, "sharedPartners", partnerId);

        const model: PartnerModel = {
            id: partnerId,
            userId: currentUserPhone,
            partnerId: partnerId,
            partnerName: partnerData.name || partnerData.displayName || '',
            partnerEmail: partnerData.email,
            avatar: partnerData.avatar || partnerData.photoURL,
            relation,
            permissions,
            status: 'pending',
            addedOn: new Date()
        };

        await setDoc(ref, {
            ...partnerConverter.toFirestore(model),
            approvedRequestId: requestId
        }, { merge: true });
    }

    static StreamIncomingPending(currentUserPhone: string, callback: (requests: any[]) => void) {
        const q = query(
            collection(db, "partner_requests"),
            where("toUserPhone", "==", currentUserPhone),
            where("status", "==", "pending")
        );
        return onSnapshot(q, (snap) => {
            callback(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        });
    }

    static StreamSentPending(currentUserPhone: string, callback: (requests: any[]) => void) {
        const q = query(
            collection(db, "partner_requests"),
            where("fromUserPhone", "==", currentUserPhone),
            where("status", "==", "pending")
        );
        return onSnapshot(q, (snap) => {
            callback(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        });
    }

    static async approveRequest(requestId: string, approverPhone: string) {
        await runTransaction(db, async (tx) => {
            const reqRef = doc(db, "partner_requests", requestId);
            const reqSnap = await tx.get(reqRef);
            if (!reqSnap.exists()) throw new Error("Request not found");

            const data = reqSnap.data();
            if (data.status !== 'pending') return;
            if (data.toUserPhone !== approverPhone) throw new Error("Not authorized");

            const from = data.fromUserPhone;
            const to = approverPhone;
            const permissions = data.permissions || {};
            const now = serverTimestamp();

            // Sender side
            const senderLink = doc(db, "users", from, "sharedPartners", to);
            tx.set(senderLink, {
                partnerPhone: to,
                status: 'active',
                permissions,
                permissionsGrantedBy: to,
                approvedRequestId: requestId,
                createdAt: now
            }, { merge: true });

            // Recipient side
            const recipLink = doc(db, "users", to, "sharedPartners", from);
            tx.set(recipLink, {
                partnerPhone: from,
                status: 'active',
                permissions,
                permissionsGrantedBy: to,
                approvedRequestId: requestId,
                createdAt: now
            }, { merge: true });

            tx.update(reqRef, {
                status: 'approved',
                approvedAt: now,
                approvedBy: approverPhone
            });
        });
    }

    static async rejectRequest(requestId: string, approverPhone: string) {
        await runTransaction(db, async (tx) => {
            const reqRef = doc(db, "partner_requests", requestId);
            const reqSnap = await tx.get(reqRef);
            if (!reqSnap.exists()) throw new Error("Request not found");

            if (reqSnap.data().toUserPhone !== approverPhone) throw new Error("Not authorized");

            tx.update(reqRef, {
                status: 'rejected',
                rejectedAt: serverTimestamp(),
                rejectedBy: approverPhone
            });
        });
    }

    static async cancelRequest(requestId: string) {
        const reqRef = doc(db, "partner_requests", requestId);
        await updateDoc(reqRef, { status: 'cancelled' });
    }

    static async removePartner(currentUserPhone: string, partnerPhone: string) {
        await runTransaction(db, async (tx) => {
            const ref1 = doc(db, "users", currentUserPhone, "sharedPartners", partnerPhone);
            const ref2 = doc(db, "users", partnerPhone, "sharedPartners", currentUserPhone);
            tx.delete(ref1);
            tx.delete(ref2);
        });
    }

    static StreamPartners(currentUserPhone: string, callback: (partners: PartnerModel[]) => void) {
        const q = query(collection(db, "users", currentUserPhone, "sharedPartners"));
        return onSnapshot(q, (snap) => {
            const partners = snap.docs.map(d => partnerConverter.fromFirestore(d));
            callback(partners);
        });
    }

    // Helper to fetch today's stats for a partner
    static async getPartnerStats(partnerId: string): Promise<{ credit: number, debit: number, count: number }> {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const expensesQ = query(collection(db, "users", partnerId, "expenses"), where("date", ">=", Timestamp.fromDate(start)));
        const incomesQ = query(collection(db, "users", partnerId, "incomes"), where("date", ">=", Timestamp.fromDate(start)));

        const [expSnap, incSnap] = await Promise.all([getDocs(expensesQ), getDocs(incomesQ)]);

        let debit = 0;
        let credit = 0;
        let count = 0;

        expSnap.forEach(d => { debit += d.data().amount || 0; count++; });
        incSnap.forEach(d => { credit += d.data().amount || 0; count++; });

        return { credit, debit, count };
    }

    static async getPartnerTransactions(partnerId: string, start: Date, end: Date) {
        const expensesQ = query(
            collection(db, "users", partnerId, "expenses"),
            where("date", ">=", Timestamp.fromDate(start)),
            where("date", "<=", Timestamp.fromDate(end))
        );
        const incomesQ = query(
            collection(db, "users", partnerId, "incomes"),
            where("date", ">=", Timestamp.fromDate(start)),
            where("date", "<=", Timestamp.fromDate(end))
        );

        const [expSnap, incSnap] = await Promise.all([getDocs(expensesQ), getDocs(incomesQ)]);

        const txs: any[] = [];
        expSnap.forEach(d => txs.push({ ...d.data(), id: d.id, type: 'expense' }));
        incSnap.forEach(d => txs.push({ ...d.data(), id: d.id, type: 'income' }));

        // Sort by date desc
        return txs.sort((a, b) => b.date.toMillis() - a.date.toMillis());
    }
}
