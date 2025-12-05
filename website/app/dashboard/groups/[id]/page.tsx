"use client";

import { useAuth } from "@/components/AuthProvider";
import { getGroups, getExpensesByGroup, getFriends, GroupModel, ExpenseItem, FriendModel } from "@/lib/firestore";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import GroupDetailsScreen from "@/components/screens/GroupDetailsScreen";

export default function GroupDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [group, setGroup] = useState<GroupModel | null>(null);
    const [members, setMembers] = useState<FriendModel[]>([]);
    const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Unwrap params using React.use()
    const { id } = React.use(params);
    const groupId = id;

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        } else if (user) {
            fetchData();
        }
    }, [user, loading, router, groupId]);

    const fetchData = async () => {
        if (!user) return;
        const userId = user.phoneNumber || user.uid;
        try {
            // Fetch groups to find the specific one
            const groups = await getGroups(userId);
            const foundGroup = groups.find(g => g.id === groupId);

            if (foundGroup) {
                setGroup(foundGroup);

                // Fetch expenses
                const fetchedExpenses = await getExpensesByGroup(userId, groupId);
                setExpenses(fetchedExpenses);

                // Fetch friends to resolve members
                // In a real app, we might need to fetch profiles for non-friends too
                const friends = await getFriends(userId);
                const groupMembers = foundGroup.memberPhones.map(phone => {
                    const friend = friends.find(f => f.phone === phone);
                    return friend || {
                        phone,
                        name: foundGroup.memberDisplayNames?.[phone] || phone,
                        avatar: foundGroup.memberAvatars?.[phone] || "👤",
                        email: ""
                    } as FriendModel;
                });
                setMembers(groupMembers);

            } else {
                console.error("Group not found");
            }
        } catch (error) {
            console.error("Error fetching group details:", error);
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

    if (!group) return <div>Group not found</div>;

    return (
        <div className="min-h-screen bg-slate-50">
            <Navbar />
            <main className="max-w-5xl mx-auto px-4 py-8">
                <GroupDetailsScreen
                    group={group}
                    members={members}
                    expenses={expenses}
                    currentUserId={user?.phoneNumber || user?.uid || ""}
                    onAddExpense={fetchData}
                    isLoading={isLoadingData}
                />
            </main>
        </div>
    );
}
