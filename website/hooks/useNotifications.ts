"use client";

import { useEffect, useState } from "react";
import { messaging } from "@/lib/firebase";
import { getToken, onMessage } from "firebase/messaging";

export function useNotifications() {
    const [permission, setPermission] = useState<NotificationPermission>("default");
    const [fcmToken, setFcmToken] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== "undefined" && "Notification" in window) {
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = async () => {
        try {
            const permission = await Notification.requestPermission();
            setPermission(permission);

            if (permission === "granted") {
                const msg = await messaging();
                if (msg) {
                    const token = await getToken(msg, {
                        vapidKey: "YOUR_VAPID_KEY_HERE" // You'll need to generate this in Firebase Console
                    });
                    setFcmToken(token);
                    console.log("FCM Token:", token);

                    // TODO: Save token to user profile in Firestore
                }
            }
        } catch (error) {
            console.error("Error requesting notification permission:", error);
        }
    };

    useEffect(() => {
        const setupListener = async () => {
            const msg = await messaging();
            if (!msg) return;

            const unsubscribe = onMessage(msg, (payload) => {
                console.log("Foreground Message:", payload);
                // Show browser notification
                if (Notification.permission === "granted") {
                    new Notification(payload.notification?.title || "New Message", {
                        body: payload.notification?.body,
                        icon: "/assets/images/logo_icon.png"
                    });
                }
            });

            return () => unsubscribe();
        };

        setupListener();
    }, []);

    return { permission, requestPermission, fcmToken };
}
