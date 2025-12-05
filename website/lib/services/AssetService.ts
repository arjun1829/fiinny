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
import { AssetModel, assetConverter } from "@/lib/models/AssetModel";

export class AssetService {
    static async getAssets(userId: string): Promise<AssetModel[]> {
        const q = query(collection(db, "users", userId, "assets"), orderBy("value", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => assetConverter.fromFirestore(doc));
    }

    static streamAssets(userId: string, callback: (items: AssetModel[]) => void) {
        const q = query(collection(db, "users", userId, "assets"), orderBy("value", "desc"));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => assetConverter.fromFirestore(doc));
            callback(items);
        });
    }

    static async deleteAsset(userId: string, assetId: string) {
        await deleteDoc(doc(db, "users", userId, "assets", assetId));
    }

    static async addAsset(userId: string, asset: AssetModel) {
        const ref = doc(db, "users", userId, "assets", asset.id);
        await setDoc(ref, assetConverter.toFirestore(asset));
    }
}
