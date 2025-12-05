import { db } from "@/lib/firebase";
import {
    getDocs,
    onSnapshot,
    Timestamp,
    doc,
    setDoc,
    collection,
    query,
    where
} from "firebase/firestore";
import { GroupModel } from "@/lib/models/GroupModel";

export class GroupService {
    static async getGroups(userId: string): Promise<GroupModel[]> {
        const q = query(collection(db, "groups"), where("memberPhones", "array-contains", userId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name || "",
                memberPhones: data.memberPhones || [],
                memberAvatars: data.memberAvatars,
                memberDisplayNames: data.memberDisplayNames,
                createdBy: data.createdBy || "",
                createdAt: (data.createdAt as Timestamp).toDate(),
                avatarUrl: data.avatarUrl
            } as GroupModel;
        });
    }

    static streamGroups(userId: string, callback: (items: GroupModel[]) => void) {
        const q = query(collection(db, "groups"), where("memberPhones", "array-contains", userId));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || "",
                    memberPhones: data.memberPhones || [],
                    memberAvatars: data.memberAvatars,
                    memberDisplayNames: data.memberDisplayNames,
                    createdBy: data.createdBy || "",
                    createdAt: (data.createdAt as Timestamp).toDate(),
                    avatarUrl: data.avatarUrl
                } as GroupModel;
            });
            callback(items);
        });
    }

    static async createGroup(group: GroupModel): Promise<void> {
        const groupRef = doc(collection(db, "groups"));
        const groupWithId = { ...group, id: groupRef.id };
        await setDoc(groupRef, groupWithId);
    }
}
