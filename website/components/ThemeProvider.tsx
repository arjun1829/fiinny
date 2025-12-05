"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./AuthProvider";

export type Theme = "teal" | "mint" | "black" | "white";

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: "teal",
    setTheme: async () => { },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("teal");
    const { user } = useAuth();

    // Load theme from local storage or user profile on mount
    useEffect(() => {
        const loadTheme = async () => {
            // 1. Try Local Storage first for immediate feedback
            const savedTheme = localStorage.getItem("app-theme") as Theme;
            if (savedTheme) {
                setThemeState(savedTheme);
                applyTheme(savedTheme);
            }

            // 2. If user is logged in, sync with Firestore
            if (user) {
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        if (data.theme && data.theme !== savedTheme) {
                            setThemeState(data.theme);
                            applyTheme(data.theme);
                            localStorage.setItem("app-theme", data.theme);
                        }
                    }
                } catch (error) {
                    console.error("Error loading theme from profile:", error);
                }
            }
        };

        loadTheme();
    }, [user]);

    const applyTheme = (newTheme: Theme) => {
        const root = document.documentElement;
        root.classList.remove("theme-teal", "theme-mint", "theme-black", "theme-white");
        root.classList.add(`theme-${newTheme}`);

        // You can also set CSS variables directly if needed, but class-based is cleaner with Tailwind
        // Example of setting a primary color variable if you use it in Tailwind config
        // root.style.setProperty('--primary', getThemeColor(newTheme));
    };

    const setTheme = async (newTheme: Theme) => {
        setThemeState(newTheme);
        applyTheme(newTheme);
        localStorage.setItem("app-theme", newTheme);

        if (user) {
            try {
                const userRef = doc(db, "users", user.uid);
                // Ensure document exists before updating
                const userSnapshot = await getDoc(userRef);
                if (!userSnapshot.exists()) {
                    await setDoc(userRef, { theme: newTheme }, { merge: true });
                } else {
                    await updateDoc(userRef, { theme: newTheme });
                }
            } catch (error) {
                console.error("Error saving theme to profile:", error);
            }
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
