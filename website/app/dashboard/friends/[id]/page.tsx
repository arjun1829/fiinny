"use client";

import { useAuth } from "@/components/AuthProvider";
import { getFriends, getExpensesByFriend, FriendModel, ExpenseItem } from "@/lib/firestore";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import FriendDetailsScreen from "@/components/screens/FriendDetailsScreen";

export default function FriendDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [friend, setFriend] = useState<FriendModel | null>(null);
    const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Unwrap params using React.use()
    const { id } = React.use(params);
    const friendId = decodeURIComponent(id);

    console.log("Debug: friendId from URL:", friendId);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        } else if (user) {
            fetchData();
        }
    }, [user, loading, router, friendId]);

    const fetchData = async () => {
        if (!user) return;
        const userId = user.phoneNumber || user.uid;
        try {
            // Fetch all friends to find the specific one
            // Ideally we should have getFriendById but getFriends is cached usually
            const friends = await getFriends(userId);
            console.log("Debug: Fetched friends:", friends.map(f => f.phone));
            const foundFriend = friends.find(f => f.phone === friendId);

            if (foundFriend) {
                setFriend(foundFriend);
                const fetchedExpenses = await getExpensesByFriend(userId, friendId);
                setExpenses(fetchedExpenses);
            } else {
                console.error("Friend not found");
                // Handle not found (redirect or show error)
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

    if (!friend) return <div>Friend not found</div>;

    return (
        <div className="min-h-screen bg-slate-50">
            <Navbar />
            <main className="max-w-5xl mx-auto px-4 py-8">
                <FriendDetailsScreen
                    friend={friend}
                    expenses={expenses}
                    currentUserId={user?.phoneNumber || user?.uid || ""}
                    onAddExpense={fetchData}
                    onSettleUp={() => { }}
                    isLoading={isLoadingData}
                />
            </main>
        </div>
    );
}
