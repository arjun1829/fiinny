"use client";

import { useAuth } from "@/components/AuthProvider";
import { getFriends, getGroups, addFriend, createGroup, FriendModel, GroupModel } from "@/lib/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Users, ArrowLeft, TrendingUp, Share2 } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import FriendsScreen from "@/components/screens/FriendsScreen";

export default function FriendsPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [friends, setFriends] = useState<FriendModel[]>([]);
    const [groups, setGroups] = useState<GroupModel[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        } else if (user) {
            fetchData();
        }
    }, [user, loading, router]);

    const fetchData = async () => {
        if (!user) return;
        const userId = user.phoneNumber || user.uid;
        try {
            const [fetchedFriends, fetchedGroups] = await Promise.all([
                getFriends(userId),
                getGroups(userId)
            ]);
            setFriends(fetchedFriends);
            setGroups(fetchedGroups);
        } catch (error) {
            console.error("Error fetching social data:", error);
        } finally {
            setIsLoadingData(false);
        }
    };

    const handleAddFriend = async (friend: FriendModel) => {
        if (!user) return;
        const userId = user.phoneNumber || user.uid;
        await addFriend(userId, friend);
        await fetchData();
    };

    const handleCreateGroup = async (group: GroupModel) => {
        if (!user) return;
        const userId = user.phoneNumber || user.uid;

        // Ensure creator is in the group
        if (!group.memberPhones.includes(userId)) {
            group.memberPhones.push(userId);
        }
        // Set createdBy
        group.createdBy = userId;

        await createGroup(group);
        await fetchData();
    };

    if (loading || isLoadingData) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-4" />
                    <p className="text-slate-600">Loading social circle...</p>
                </div>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            <Navbar />

            <div className="container mx-auto px-4 py-8 pt-24">
                <div className="flex flex-col md:flex-row gap-8">

                    {/* Sidebar */}
                    <div className="w-full md:w-64 flex-shrink-0">
                        <div className="bg-white rounded-2xl shadow-sm p-4 sticky top-24">
                            <div className="space-y-2">
                                <Link href="/dashboard">
                                    <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                                        <TrendingUp className="w-5 h-5" />
                                        <span>Overview</span>
                                    </button>
                                </Link>
                                <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-teal-50 text-teal-700 font-bold transition-colors">
                                    <Users className="w-5 h-5" />
                                    <span>Friends</span>
                                </button>
                                <Link href="/dashboard/sharing">
                                    <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                                        <Share2 className="w-5 h-5" />
                                        <span>Partner Sharing</span>
                                    </button>
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1">
                        <FriendsScreen
                            friends={friends}
                            groups={groups}
                            isLoading={isLoadingData}
                            onAddFriend={handleAddFriend}
                            onCreateGroup={handleCreateGroup}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
