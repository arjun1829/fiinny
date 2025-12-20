import { UserProfile, PartnerService, PartnerModel } from "@/lib/firestore";
import { useState, useEffect } from "react";
import PrimaryButton from "../widgets/PrimaryButton";
import { Heart, Mail, X, Check, Loader2, Share2, AlertCircle, ShieldCheck, UserCheck, Plus, User, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import CustomTextField from "../widgets/CustomTextField";
import PartnerDetailsScreen from "./PartnerDetailsScreen";

interface PartnerSharingScreenProps {
    userProfile: UserProfile;
    onUpdateProfile: () => void;
}

export default function PartnerSharingScreen({ userProfile, onUpdateProfile }: PartnerSharingScreenProps) {
    const [partners, setPartners] = useState<PartnerModel[]>([]);
    const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
    const [sentRequests, setSentRequests] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Add Partner Modal
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteError, setInviteError] = useState("");
    const [isInviting, setIsInviting] = useState(false);

    // Detail / Active Partner State
    const [selectedPartner, setSelectedPartner] = useState<PartnerModel | null>(null);

    useEffect(() => {
        if (!userProfile?.phoneNumber) return;

        const unsubPartners = PartnerService.StreamPartners(userProfile.phoneNumber, (data) => {
            setPartners(data);
            setIsLoading(false);
        });

        const unsubIncoming = PartnerService.StreamIncomingPending(userProfile.phoneNumber, (data) => {
            setIncomingRequests(data);
        });

        const unsubSent = PartnerService.StreamSentPending(userProfile.phoneNumber, (data) => {
            setSentRequests(data);
        });

        return () => {
            unsubPartners();
            unsubIncoming();
            unsubSent();
        };
    }, [userProfile.phoneNumber]);


    const handleInvite = async () => {
        if (!inviteEmail) return;
        if (!userProfile.phoneNumber) return;

        setIsInviting(true);
        setInviteError("");

        try {
            // relation triggers logic in service
            await PartnerService.addPartner(
                userProfile.phoneNumber,
                inviteEmail,
                'partner',
                { tx: true, goals: true }
            );
            setIsAddModalOpen(false);
            setInviteEmail("");
        } catch (err: any) {
            console.error(err);
            setInviteError(err.message || "Failed to send invite");
        } finally {
            setIsInviting(false);
        }
    };

    const handleAccept = async (requestId: string) => {
        if (!userProfile.phoneNumber) return;
        try {
            await PartnerService.approveRequest(requestId, userProfile.phoneNumber);
        } catch (e) {
            console.error(e);
            alert("Failed to accept");
        }
    };

    const handleReject = async (requestId: string) => {
        if (!userProfile.phoneNumber) return;
        if (!confirm("Reject this request?")) return;
        try {
            await PartnerService.rejectRequest(requestId, userProfile.phoneNumber);
        } catch (e) {
            console.error(e);
        }
    };

    const handleCancel = async (requestId: string) => {
        if (!confirm("Cancel this request?")) return;
        try {
            await PartnerService.cancelRequest(requestId);
        } catch (e) {
            console.error(e);
        }
    };

    const handleRemovePartner = async (partnerPhone: string) => {
        if (!userProfile.phoneNumber) return;
        if (!confirm("Are you sure you want to stop sharing with this partner?")) return;

        try {
            await PartnerService.removePartner(userProfile.phoneNumber, partnerPhone);
            if (selectedPartner?.partnerId === partnerPhone) setSelectedPartner(null);
        } catch (e) {
            console.error(e);
            alert("Failed to remove partner");
        }
    };

    if (isLoading) {
        return <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" /></div>;
    }

    // --- Main View ---

    if (selectedPartner) {
        return (
            <PartnerDetailsScreen
                partner={selectedPartner}
                currentUserPhone={userProfile.phoneNumber || ''}
                onBack={() => setSelectedPartner(null)}
            />
        );
    }

    const activePartners = partners.filter(p => p.status === 'active');

    return (
        <div className="space-y-8 max-w-5xl mx-auto p-4">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Partner Sharing</h1>
                    <p className="text-slate-500 mt-1">Manage who you share your financial journey with</p>
                </div>
                <PrimaryButton
                    onClick={() => setIsAddModalOpen(true)}
                    icon={<Plus className="w-5 h-5" />}
                    className="!bg-rose-600 hover:!bg-rose-700 !shadow-rose-200"
                >
                    Add Partner
                </PrimaryButton>
            </div>

            {/* Incoming Requests */}
            {incomingRequests.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6">
                    <h3 className="text-amber-800 font-bold mb-4 flex items-center gap-2">
                        <Mail className="w-5 h-5" /> Incoming Requests
                    </h3>
                    <div className="space-y-3">
                        {incomingRequests.map(req => (
                            <div key={req.id} className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 font-bold">
                                        <User className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900">{req.fromUserPhone}</p>
                                        <p className="text-xs text-slate-500">Wants to be your {req.relation || 'partner'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleReject(req.id)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-bold">Reject</button>
                                    <button onClick={() => handleAccept(req.id)} className="px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 rounded-lg text-sm font-bold shadow-md shadow-rose-200">Accept</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Active Partners Grid */}
            {activePartners.length === 0 ? (
                // Empty State
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                    <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Heart className="w-10 h-10 text-rose-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-2">No active partners</h3>
                    <p className="text-slate-500 max-w-md mx-auto">
                        Invite a partner to start sharing expenses, tracking mutual goals, and managing your finances together.
                    </p>
                    {sentRequests.length > 0 && (
                        <div className="mt-8 max-w-sm mx-auto bg-slate-50 rounded-xl p-4">
                            <p className="text-sm font-bold text-slate-700 mb-3">Pending Sent Requests:</p>
                            {sentRequests.map(req => (
                                <div key={req.id} className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600">{req.toUserPhone}</span>
                                    <button onClick={() => handleCancel(req.id)} className="text-red-500 hover:underline">Cancel</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activePartners.map(partner => (
                        <motion.div
                            key={partner.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden group hover:shadow-md transition-all"
                        >
                            <div className="bg-gradient-to-br from-rose-500 to-orange-500 p-6 text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                                <div className="relative z-10 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/30 text-xl font-bold">
                                        {partner.avatar ? <img src={partner.avatar} className="w-full h-full object-cover rounded-xl" /> : (partner.partnerName?.[0] || 'P')}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{partner.partnerName || partner.partnerId}</h3>
                                        <div className="flex items-center gap-1.5 text-white/80 text-sm">
                                            <Heart className="w-3.5 h-3.5 fill-current" />
                                            <span>{partner.relation || 'Partner'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6">
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div className="p-3 bg-emerald-50 rounded-2xl">
                                        <p className="text-xs text-emerald-600 font-bold mb-1">CREDIT</p>
                                        <p className="text-lg font-bold text-slate-900">₹{partner.todayCredit || 0}</p>
                                    </div>
                                    <div className="p-3 bg-rose-50 rounded-2xl">
                                        <p className="text-xs text-rose-600 font-bold mb-1">DEBIT</p>
                                        <p className="text-lg font-bold text-slate-900">₹{partner.todayDebit || 0}</p>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setSelectedPartner(partner)}
                                        className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-sm"
                                    >
                                        Dashboard <ArrowRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleRemovePartner(partner.partnerId)}
                                        className="w-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    {/* Sent Requests Card (if mixed with active) */}
                    {sentRequests.length > 0 && (
                        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 border-dashed flex flex-col justify-center">
                            <h4 className="font-bold text-slate-500 mb-4 flex items-center gap-2">
                                <Mail className="w-4 h-4" /> Pending Invites
                            </h4>
                            <div className="space-y-3">
                                {sentRequests.map(req => (
                                    <div key={req.id} className="flex items-center justify-between text-sm bg-white p-3 rounded-xl border border-slate-100">
                                        <span className="font-medium text-slate-700 truncate max-w-[120px]" title={req.toUserPhone}>{req.toUserPhone}</span>
                                        <button onClick={() => handleCancel(req.id)} className="text-xs font-bold text-red-500 hover:bg-red-50 px-2 py-1 rounded">Cancel</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}


            {/* Add Partner Modal */}
            <AnimatePresence>
                {isAddModalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsAddModalOpen(false)}
                            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed inset-0 m-auto max-w-md h-fit bg-white rounded-3xl shadow-2xl z-50 p-6 overflow-hidden"
                        >
                            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Share2 className="w-8 h-8 text-rose-500" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 text-center mb-2">Invite Partner</h2>
                            <p className="text-slate-500 text-center mb-6 text-sm">
                                Enter your partner's phone number or email to send an invite.
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <CustomTextField
                                        label="Phone or Email"
                                        value={inviteEmail}
                                        onChange={(e) => {
                                            setInviteEmail(e.target.value);
                                            setInviteError("");
                                        }}
                                        placeholder="+1234567890 or mail@example.com"
                                    />
                                    {inviteError && (
                                        <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" /> {inviteError}
                                        </p>
                                    )}
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        onClick={() => setIsAddModalOpen(false)}
                                        className="flex-1 py-3 text-slate-600 font-medium hover:bg-slate-50 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <div className="flex-1">
                                        <PrimaryButton
                                            onClick={handleInvite}
                                            loading={isInviting}
                                            className="w-full !bg-rose-600 hover:!bg-rose-700"
                                        >
                                            Send Invite
                                        </PrimaryButton>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
