"use client";

import { useAuth } from "@/components/AuthProvider";
import { db, functions } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ArrowLeft, Loader2, Star, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ManageSubscriptionPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    // State
    const [subData, setSubData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCanceling, setIsCanceling] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
            return;
        }

        if (user) {
            fetchSubscription();
        }
    }, [user, loading]);

    const fetchSubscription = async () => {
        try {
            const uid = user?.uid;
            if (!uid) return;

            const docRef = doc(db, "subscriptions", uid);
            const snapshot = await getDoc(docRef);

            if (snapshot.exists()) {
                setSubData(snapshot.data());
            } else {
                setSubData(null); // Free plan usually means no doc or empty
            }
        } catch (error) {
            console.error("Error fetching sub:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = async () => {
        if (!confirm("Are you sure? You will keep benefits until the end of the billing period.")) return;

        setIsCanceling(true);
        try {
            const cancelFn = httpsCallable(functions, 'cancelSubscription');
            await cancelFn();
            alert("Subscription cancelled. Auto-renew is now OFF.");
            fetchSubscription(); // Refresh UI
        } catch (error: any) {
            console.error("Cancel failed:", error);
            alert("Failed to cancel: " + error.message);
        } finally {
            setIsCanceling(false);
        }
    };

    if (loading || isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
            </div>
        );
    }

    const isPremium = subData?.status === 'active';
    const planName = isPremium ? (subData?.plan === 'pro' ? "Pro Plan" : "Premium Plan") : "Free Plan";
    const expiryDate = subData?.expiry_date?.toDate().toLocaleDateString();
    const autoRenew = subData?.auto_renew !== false; // Default true if undefined for active subs usually, but logic in backend sets it.

    // Status Logic
    const isCanceled = isPremium && !autoRenew;

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 p-8">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/dashboard" className="p-2 rounded-full bg-white border border-slate-200 hover:bg-slate-100 transition-colors">
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </Link>
                    <h1 className="text-2xl font-bold">Manage Subscription</h1>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative">
                    {/* Premium Header Background */}
                    {isPremium && (
                        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-400 to-orange-500" />
                    )}

                    <div className="p-8">
                        <div className="flex items-start justify-between mb-8">
                            <div>
                                <div className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">Current Plan</div>
                                <h2 className="text-4xl font-black text-slate-900 flex items-center gap-3">
                                    {planName}
                                    {isPremium && <Star className="w-8 h-8 text-amber-500 fill-current" />}
                                </h2>
                                {isPremium && (
                                    <p className="text-slate-500 mt-2">
                                        Renews on <span className="font-bold text-slate-900">{expiryDate}</span>
                                    </p>
                                )}
                            </div>

                            <div className="text-right">
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase ${isPremium ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {isPremium ? (isCanceled ? "Canceling" : "Active") : "Free"}
                                </div>
                            </div>
                        </div>

                        {/* Status Messages */}
                        {isCanceled && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-8">
                                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-amber-800">Membership Pending Cancellation</p>
                                    <p className="text-sm text-amber-700">
                                        Your benefits are active until {expiryDate}. After that, you will be downgraded to Free. You will not be charged again.
                                    </p>
                                </div>
                            </div>
                        )}

                        {!isPremium && (
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-6 mb-8 text-center">
                                <p className="text-slate-600 mb-4">You are missing out on AI Insights, Unlimited Cards, and Data Exports.</p>
                                <Link href="/subscription" className="inline-block bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors">
                                    Upgrade to Premium
                                </Link>
                            </div>
                        )}

                        {/* Actions */}
                        {isPremium && !isCanceled && (
                            <div className="space-y-4">
                                <button
                                    onClick={handleCancel}
                                    disabled={isCanceling}
                                    className="w-full py-3 border border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    {isCanceling && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Cancel Membership
                                </button>
                                <p className="text-center text-xs text-slate-400">
                                    Canceling stops auto-renew. You keep your benefits for the current period.
                                </p>
                            </div>
                        )}

                        {isPremium && subData?.plan === 'premium' && (
                            <div className="mt-8 pt-8 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-bold text-slate-900">Upgrade to Pro</h3>
                                        <p className="text-sm text-slate-500">Get unlimited everything + priority support.</p>
                                    </div>
                                    <Link href="/subscription" className="bg-purple-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-purple-700 transition-colors text-sm">
                                        View Pro Plans
                                    </Link>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">
                                    * We'll deduct the unused value of your current plan from the upgrade price.
                                </p>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}
