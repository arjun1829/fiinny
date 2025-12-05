import { db } from "@/lib/firebase";
import {
    getDocs,
    onSnapshot,
    addDoc,
    collection,
    query
} from "firebase/firestore";
import { FriendModel } from "@/lib/models/FriendModel";

export class FriendService {
    static async getFriends(userId: string): Promise<FriendModel[]> {
        const q = query(collection(db, "users", userId, "friends"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                phone: data.phone || doc.id,
                name: data.name || "",
                email: data.email,
                avatar: data.avatar || "👤",
                docId: doc.id
            } as FriendModel;
        });
    }

    static streamFriends(userId: string, callback: (items: FriendModel[]) => void) {
        const q = query(collection(db, "users", userId, "friends"));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    phone: data.phone || doc.id,
                    name: data.name || "",
                    email: data.email,
                    avatar: data.avatar || "👤",
                    docId: doc.id
                } as FriendModel;
            });
            callback(items);
        });
    }

    static async addFriend(userId: string, friend: FriendModel): Promise<void> {
        await addDoc(collection(db, "users", userId, "friends"), friend);
    }
}
