import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

export interface FinancialProfile {
    riskTolerance: 'low' | 'medium' | 'high';
    communicationStyle: 'empathetic' | 'direct' | 'humorous';
    financialGoals: string[];
    spendingStruggles: string[];
}

export const DEFAULT_PROFILE: FinancialProfile = {
    riskTolerance: 'medium',
    communicationStyle: 'empathetic',
    financialGoals: [],
    spendingStruggles: []
};

export const getUserProfile = async (userId: string): Promise<FinancialProfile> => {
    try {
        const docRef = doc(db, "users", userId, "settings", "profile");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { ...DEFAULT_PROFILE, ...docSnap.data() } as FinancialProfile;
        } else {
            // Create default if not exists
            await setDoc(docRef, DEFAULT_PROFILE);
            return DEFAULT_PROFILE;
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return DEFAULT_PROFILE;
    }
};

export const updateUserProfile = async (userId: string, updates: Partial<FinancialProfile>): Promise<void> => {
    try {
        const docRef = doc(db, "users", userId, "settings", "profile");
        await setDoc(docRef, updates, { merge: true });
    } catch (error) {
        console.error("Error updating user profile:", error);
        throw error;
    }
};
