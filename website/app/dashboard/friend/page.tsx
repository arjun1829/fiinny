"use client";

import { useAuth } from "@/components/AuthProvider";
import { getFriends, getExpensesByFriend, FriendModel, ExpenseItem } from "@/lib/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState, Suspense } from "react";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import FriendDetailsScreen from "@/components/screens/FriendDetailsScreen";

function FriendDetailsContent() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const friendId = searchParams.get("id");

    const [friend, setFriend] = useState<FriendModel | null>(null);
    const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        } else if (user && friendId) {
            fetchData(friendId);
        } else if (user && !friendId) {
            setIsLoadingData(false);
        }
    }, [user, loading, router, friendId]);

    const fetchData = async (targetId: string) => {
        if (!user) return;
        const userId = user.phoneNumber || user.uid;
        try {
            // Fetch all friends to find the specific one
            const friends = await getFriends(userId);
            const foundFriend = friends.find(f => f.phone === targetId);

            if (foundFriend) {
                setFriend(foundFriend);
                const fetchedExpenses = await getExpensesByFriend(userId, targetId);
                setExpenses(fetchedExpenses);
            } else {
                console.error("Friend not found");
            }
        } catch (error) {
            console.error("Error fetching friend details:", error);
        } finally {
            setIsLoadingData(false);
        }
    };

    if (loading || isLoadingData) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
        );
    }

    if (!friendId) return <div>No friend ID specified</div>;
    if (!friend) return <div>Friend not found</div>;

    return (
        <FriendDetailsScreen
            friend={friend}
            expenses={expenses}
            currentUserId={user?.phoneNumber || user?.uid || ""}
            onAddExpense={() => friendId && fetchData(friendId)}
            onSettleUp={() => { }}
            isLoading={isLoadingData}
        />
    );
}

export default function FriendDetailsPage() {
    return (
        <div className="min-h-screen bg-slate-50">
            <Navbar />
            <main className="max-w-5xl mx-auto px-4 py-8">
                <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
                    <FriendDetailsContent />
                </Suspense>
            </main>
        </div>
    );
}
