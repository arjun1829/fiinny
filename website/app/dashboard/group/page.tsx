"use client";

import { useAuth } from "@/components/AuthProvider";
import { getGroups, getExpensesByGroup, getFriends, GroupModel, ExpenseItem, FriendModel } from "@/lib/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState, Suspense } from "react";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import GroupDetailsScreen from "@/components/screens/GroupDetailsScreen";

function GroupDetailsContent() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const groupId = searchParams.get("id");

    const [group, setGroup] = useState<GroupModel | null>(null);
    const [members, setMembers] = useState<FriendModel[]>([]);
    const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        } else if (user && groupId) {
            fetchData(groupId);
        } else if (user && !groupId) {
            setIsLoadingData(false);
        }
    }, [user, loading, router, groupId]);

    const fetchData = async (targetId: string) => {
        if (!user) return;
        const userId = user.phoneNumber || user.uid;
        try {
            // Fetch groups to find the specific one
            const groups = await getGroups(userId);
            const foundGroup = groups.find(g => g.id === targetId);

            if (foundGroup) {
                setGroup(foundGroup);

                // Fetch expenses
                const fetchedExpenses = await getExpensesByGroup(userId, targetId);
                setExpenses(fetchedExpenses);

                // Fetch friends to resolve members
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

    if (!groupId) return <div>No group ID specified</div>;
    if (!group) return <div>Group not found</div>;

    return (
        <GroupDetailsScreen
            group={group}
            members={members}
            expenses={expenses}
            currentUserId={user?.phoneNumber || user?.uid || ""}
            onAddExpense={() => groupId && fetchData(groupId)}
            isLoading={isLoadingData}
        />
    );
}

export default function GroupDetailsPage() {
    return (
        <div className="min-h-screen bg-slate-50">
            <Navbar />
            <main className="max-w-5xl mx-auto px-4 py-8">
                <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
                    <GroupDetailsContent />
                </Suspense>
            </main>
        </div>
    );
}
