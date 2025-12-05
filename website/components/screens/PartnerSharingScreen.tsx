import { UserProfile } from "@/lib/firestore";
import { useState } from "react";
import PrimaryButton from "../widgets/PrimaryButton";
import { Heart, Mail, X, Check, Loader2, Share2, AlertCircle, ShieldCheck, UserCheck } from "lucide-react";
import { AuthService } from "@/lib/services/AuthService";
import { motion, AnimatePresence } from "framer-motion";

interface PartnerSharingScreenProps {
    userProfile: UserProfile;
    onUpdateProfile: () => void;
}

export default function PartnerSharingScreen({ userProfile, onUpdateProfile }: PartnerSharingScreenProps) {
    const [inviteEmail, setInviteEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    const validateEmail = (email: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const handleInvite = async () => {
        if (!inviteEmail) return;
        if (!validateEmail(inviteEmail)) {
            setError("Please enter a valid email address.");
            return;
        }
        setError("");
        setIsLoading(true);

        try {
            // Simulate sending invite by updating local profile
            await AuthService.createUserProfile(userProfile.phoneNumber, {
                ...userProfile,
                partnerStatus: 'pending',
                partnerName: inviteEmail
            });
            onUpdateProfile();
        } catch (err) {
            console.error(err);
            setError("Failed to send invite. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancelInvite = async () => {
        setIsLoading(true);
        try {
            await AuthService.createUserProfile(userProfile.phoneNumber, {
                ...userProfile,
                partnerStatus: undefined,
                partnerName: undefined,
                partnerId: undefined
            });
            onUpdateProfile();
            setInviteEmail("");
            setShowCancelConfirm(false);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisconnect = async () => {
        setIsLoading(true);
        try {
            await AuthService.createUserProfile(userProfile.phoneNumber, {
                ...userProfile,
                partnerStatus: undefined,
                partnerName: undefined,
                partnerId: undefined
            });
            onUpdateProfile();
            setShowDisconnectConfirm(false);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    // Confirmation Modal Component
    const ConfirmationModal = ({
        isOpen,
        onClose,
        onConfirm,
        title,
        message,
        confirmText,
        isDestructive = false
    }: any) => (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl"
                    >
                        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
                        <p className="text-slate-500 mb-6">{message}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onConfirm}
                                disabled={isLoading}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-white transition-colors flex items-center justify-center gap-2 ${isDestructive ? "bg-red-500 hover:bg-red-600" : "bg-[var(--primary)] hover:bg-[var(--primary-dark)]"
                                    }`}
                            >
                                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                {confirmText}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    // 1. Connected State
    if (userProfile.partnerStatus === 'connected') {
        return (
            <div className="space-y-6">
                <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-rose-200/50">
                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                            <div className="flex items-center space-x-4">
                                <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border-2 border-white/30">
                                    <Heart className="w-8 h-8 text-white" fill="currentColor" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold">Connected with {userProfile.partnerName}</h2>
                                    <div className="flex items-center gap-2 text-rose-100 mt-1">
                                        <ShieldCheck className="w-4 h-4" />
                                        <span className="text-sm font-medium">Securely Sharing Finances</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowDisconnectConfirm(true)}
                                className="bg-white/10 backdrop-blur-md text-white border border-white/20 px-4 py-2 rounded-xl font-semibold hover:bg-white/20 transition-colors flex items-center gap-2 self-start md:self-auto"
                            >
                                <X className="w-4 h-4" />
                                Disconnect
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="bg-black/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                                <p className="text-rose-100 text-xs font-bold uppercase tracking-wider mb-1">Shared Expenses</p>
                                <p className="text-2xl font-bold">₹12,450</p>
                            </div>
                            <div className="bg-black/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                                <p className="text-rose-100 text-xs font-bold uppercase tracking-wider mb-1">Active Goals</p>
                                <p className="text-2xl font-bold">2</p>
                            </div>
                            <div className="bg-black/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10 col-span-2 md:col-span-1">
                                <p className="text-rose-100 text-xs font-bold uppercase tracking-wider mb-1">Last Sync</p>
                                <p className="text-lg font-bold">Just now</p>
                            </div>
                        </div>
                    </div>

                    {/* Decorative Background Elements */}
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-rose-900/20 rounded-full blur-3xl" />
                    <Heart className="absolute -bottom-8 -right-8 w-48 h-48 text-white/5 rotate-12" fill="currentColor" />
                </div>

                <ConfirmationModal
                    isOpen={showDisconnectConfirm}
                    onClose={() => setShowDisconnectConfirm(false)}
                    onConfirm={handleDisconnect}
                    title="Disconnect Partner?"
                    message="Are you sure you want to disconnect? This will stop sharing all financial data and remove your partner from your dashboard."
                    confirmText="Disconnect"
                    isDestructive={true}
                />
            </div>
        );
    }

    // 2. Pending State
    if (userProfile.partnerStatus === 'pending') {
        return (
            <div className="max-w-lg mx-auto">
                <div className="bg-white rounded-3xl p-8 shadow-lg border border-slate-100 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-amber-400" />

                    <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                        <Mail className="w-10 h-10 text-amber-500" />
                        <div className="absolute top-0 right-0 w-6 h-6 bg-amber-500 rounded-full border-4 border-white flex items-center justify-center">
                            <Loader2 className="w-3 h-3 text-white animate-spin" />
                        </div>
                    </div>

                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Invitation Sent!</h2>
                    <p className="text-slate-500 mb-8 leading-relaxed">
                        We've sent an invite to <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{userProfile.partnerName}</span>.
                        <br />
                        Your shared dashboard will unlock automatically once they accept.
                    </p>

                    <div className="bg-slate-50 rounded-xl p-4 mb-8 text-left flex items-start gap-3">
                        <UserCheck className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-slate-700">What happens next?</p>
                            <p className="text-xs text-slate-500 mt-1">Your partner needs to create a Fiinny account with this email address to accept your invitation.</p>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="w-full py-3 rounded-xl font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all flex items-center justify-center gap-2"
                    >
                        Cancel Invite
                    </button>
                </div>

                <ConfirmationModal
                    isOpen={showCancelConfirm}
                    onClose={() => setShowCancelConfirm(false)}
                    onConfirm={handleCancelInvite}
                    title="Cancel Invitation?"
                    message="Are you sure you want to cancel this invitation? The link sent to your partner will become invalid."
                    confirmText="Yes, Cancel"
                    isDestructive={true}
                />
            </div>
        );
    }

    // 3. Empty State (Invite)
    return (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="grid md:grid-cols-2">
                <div className="p-8 md:p-12 flex flex-col justify-center">
                    <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mb-6 rotate-3 shadow-sm">
                        <Heart className="w-8 h-8 text-rose-600" fill="currentColor" />
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900 mb-4">Share finances with your partner</h2>
                    <p className="text-slate-500 mb-8 leading-relaxed">
                        Invite your partner to Fiinny to track shared expenses, goals, and budgets together. Keep your personal finances private while managing your shared life.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Partner's Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => {
                                        setInviteEmail(e.target.value);
                                        if (error) setError("");
                                    }}
                                    placeholder="partner@example.com"
                                    className={`w-full pl-12 pr-4 py-3 rounded-xl border ${error ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-rose-200 focus:border-rose-500"} focus:ring-4 outline-none transition-all`}
                                />
                            </div>
                            {error && (
                                <motion.p
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-red-500 text-sm mt-2 flex items-center gap-1"
                                >
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </motion.p>
                            )}
                        </div>
                        <PrimaryButton
                            onClick={handleInvite}
                            loading={isLoading}
                            className="w-full !bg-rose-600 hover:!bg-rose-700 !shadow-lg !shadow-rose-200 !py-3.5"
                            icon={<Share2 className="w-4 h-4" />}
                        >
                            Send Invite
                        </PrimaryButton>
                        <p className="text-center text-xs text-slate-400 mt-4">
                            Your partner will receive an email with instructions.
                        </p>
                    </div>
                </div>
                <div className="bg-rose-50 relative hidden md:block overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center p-12">
                        {/* Abstract Visual */}
                        <div className="relative w-full aspect-square max-w-sm">
                            <div className="absolute top-0 left-0 w-40 h-40 bg-[var(--primary)] rounded-full mix-blend-multiply filter blur-2xl opacity-60 animate-blob" />
                            <div className="absolute top-0 right-0 w-40 h-40 bg-rose-400 rounded-full mix-blend-multiply filter blur-2xl opacity-60 animate-blob animation-delay-2000" />
                            <div className="absolute -bottom-8 left-20 w-40 h-40 bg-purple-400 rounded-full mix-blend-multiply filter blur-2xl opacity-60 animate-blob animation-delay-4000" />

                            {/* Card Mockup */}
                            <div className="relative bg-white/60 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/50 mt-12 transform rotate-3 transition-transform hover:rotate-0 duration-500">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 shadow-md" />
                                    <div className="flex-1">
                                        <div className="h-3 w-24 bg-slate-800/10 rounded-full mb-2" />
                                        <div className="h-2 w-16 bg-slate-800/5 rounded-full" />
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-500">
                                        <Heart className="w-4 h-4" fill="currentColor" />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="h-2 w-full bg-slate-800/5 rounded-full" />
                                    <div className="h-2 w-full bg-slate-800/5 rounded-full" />
                                    <div className="h-2 w-2/3 bg-slate-800/5 rounded-full" />
                                </div>
                                <div className="mt-6 flex gap-3">
                                    <div className="h-10 flex-1 bg-rose-500 rounded-xl shadow-lg shadow-rose-200" />
                                    <div className="h-10 w-10 bg-white rounded-xl border border-slate-200" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
