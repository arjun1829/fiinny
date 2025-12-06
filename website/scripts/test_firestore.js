
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, setDoc } = require("firebase/firestore");

// Hardcoded config from lib/firebase.ts
const firebaseConfig = {
    apiKey: "AIzaSyABuimmTbHwrxY-w7xhRrf-LWOu4gLVfnk",
    authDomain: "lifemap-72b21.firebaseapp.com",
    projectId: "lifemap-72b21",
    storageBucket: "lifemap-72b21.firebasestorage.app",
    messagingSenderId: "1085936196639",
    appId: "1:1085936196639:web:b74ffa7e9ded49e616492a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testWrite() {
    console.log("Testing Firestore Write...");
    const userId = "test_user_debug";
    const expenseId = "debug_" + Date.now();
    const ref = doc(db, "users", userId, "expenses", expenseId);

    // Minimal expense object
    const data = {
        amount: 100,
        category: "Debug",
        date: new Date(),
        title: "Debug Expense"
    };

    try {
        await setDoc(ref, data);
        console.log("Successfully wrote document to", ref.path);
    } catch (e) {
        console.error("Failed to write:", e);
    }
}

testWrite();
