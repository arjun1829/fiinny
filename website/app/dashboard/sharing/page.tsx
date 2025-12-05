"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Share2, TrendingUp, Users, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import PartnerSharingScreen from "@/components/screens/PartnerSharingScreen";
import { AuthService } from "@/lib/services/AuthService";
import { UserProfile } from "@/lib/models/UserProfile";

export default function SharingPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(true);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        } else if (user) {
            fetchProfile();
        }
    }, [user, loading, router]);

    const fetchProfile = async () => {
        if (!user) return;
        try {
            const profile = await AuthService.getUserProfile(user.phoneNumber || user.uid);
            setUserProfile(profile);
        } catch (error) {
            console.error("Error fetching profile:", error);
        } finally {
            setIsLoadingProfile(false);
        }
    };

    if (loading || isLoadingProfile) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
        );
    }

    if (!user || !userProfile) return null;

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
                                <Link href="/dashboard/friends">
                                    <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                                        <Users className="w-5 h-5" />
                                        <span>Friends</span>
                                    </button>
                                </Link>
                                <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-rose-100 text-rose-600 font-bold transition-colors">
                                    <Share2 className="w-5 h-5" />
                                    <span>Partner Sharing</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 space-y-8">
                        <div className="flex items-center space-x-4 mb-6">
                            <Link href="/dashboard" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <ArrowLeft className="w-6 h-6 text-slate-600" />
                            </Link>
                            <h1 className="text-3xl font-bold text-slate-900">Partner Sharing</h1>
                        </div>

                        <PartnerSharingScreen
                            userProfile={userProfile}
                            onUpdateProfile={fetchProfile}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
