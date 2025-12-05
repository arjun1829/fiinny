// lib/firebase.ts
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Using existing Firebase project from Flutter app
const firebaseConfig = {
    apiKey: "AIzaSyABuimmTbHwrxY-w7xhRrf-LWOu4gLVfnk",
    authDomain: "lifemap-72b21.firebaseapp.com",
    projectId: "lifemap-72b21",
    storageBucket: "lifemap-72b21.firebasestorage.app",
    messagingSenderId: "1085936196639",
    appId: "1:1085936196639:web:b74ffa7e9ded49e616492a",
};

import { getMessaging, isSupported } from 'firebase/messaging';

// Initialize Firebase only if it hasn't been initialized yet
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const messaging = async () => {
    try {
        const supported = await isSupported();
        if (supported && typeof window !== 'undefined') {
            return getMessaging(app);
        }
        return null;
    } catch (err) {
        console.error("Firebase Messaging not supported", err);
        return null;
    }
};

export default app;
