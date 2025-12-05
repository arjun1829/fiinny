import { FriendModel, GroupModel } from "@/lib/firestore";
import { Users, ArrowLeft, Plus, X, Search, UserPlus, Users as UsersIcon, Check, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import PrimaryButton from "../widgets/PrimaryButton";
import CustomTextField from "../widgets/CustomTextField";
import { motion, AnimatePresence } from "framer-motion";

interface FriendsScreenProps {
    friends: FriendModel[];
    groups?: GroupModel[];
    isLoading?: boolean;
    onAddFriend?: (friend: FriendModel) => Promise<void>;
    onCreateGroup?: (group: GroupModel) => Promise<void>;
}

const AVATARS = ["👤", "👨", "👩", "🧑", "👱", "🧔", "👵", "👴", "👳", "🧕", "👮", "👷", "💂", "🕵️", "👩‍⚕️", "👨‍🌾", "👩‍🍳", "👨‍🎓", "👩‍🎤", "👨‍🏫", "👩‍🏭", "👨‍💻", "👩‍💼", "👨‍🔧", "👩‍🔬", "👨‍🎨", "👩‍🚒", "👨‍✈️", "👩‍🚀", "👨‍⚖️"];

export default function FriendsScreen({
    friends,
    groups = [],
    isLoading = false,
    onAddFriend,
    onCreateGroup
}: FriendsScreenProps) {
    const [activeTab, setActiveTab] = useState<"friends" | "groups">("friends");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Friend Form State
    const [newFriendName, setNewFriendName] = useState("");
    const [newFriendPhone, setNewFriendPhone] = useState("");
    const [newFriendEmail, setNewFriendEmail] = useState("");
    const [newFriendAvatar, setNewFriendAvatar] = useState("👤");
    const [friendErrors, setFriendErrors] = useState<{ name?: string, phone?: string, email?: string }>({});

    // Group Form State
    const [newGroupName, setNewGroupName] = useState("");
    const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
    const [groupError, setGroupError] = useState("");

    const validateFriendForm = () => {
        const errors: { name?: string, phone?: string, email?: string } = {};
        if (!newFriendName.trim()) errors.name = "Name is required";
        if (!newFriendPhone.trim()) {
            errors.phone = "Phone number is required";
        } else if (!/^\d{10}$/.test(newFriendPhone.replace(/\D/g, ''))) {
            errors.phone = "Please enter a valid 10-digit phone number";
        }
        if (newFriendEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newFriendEmail)) {
            errors.email = "Please enter a valid email address";
        }
        setFriendErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleAddFriend = async () => {
        if (!validateFriendForm()) return;
        setIsSubmitting(true);
        try {
            await onAddFriend?.({
                name: newFriendName,
                phone: newFriendPhone,
                email: newFriendEmail,
                avatar: newFriendAvatar,
                docId: "" // Will be set by Firestore
            });
            setIsAddModalOpen(false);
            setNewFriendName("");
            setNewFriendPhone("");
            setNewFriendEmail("");
            setNewFriendAvatar("👤");
            setFriendErrors({});
        } catch (error) {
            console.error("Error adding friend:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            setGroupError("Group name is required");
            return;
        }
        if (selectedFriendIds.length === 0) {
            setGroupError("Please select at least one friend");
            return;
        }
        setGroupError("");
        setIsSubmitting(true);
        try {
            const selectedFriends = friends.filter(f => selectedFriendIds.includes(f.phone));
            const memberPhones = selectedFriends.map(f => f.phone);
            const memberDisplayNames: Record<string, string> = {};
            const memberAvatars: Record<string, string> = {};

            selectedFriends.forEach(f => {
                memberDisplayNames[f.phone] = f.name;
                memberAvatars[f.phone] = f.avatar;
            });

            await onCreateGroup?.({
                id: "", // Will be set by Firestore
                name: newGroupName,
                memberPhones: memberPhones,
                memberDisplayNames: memberDisplayNames,
                memberAvatars: memberAvatars,
                createdBy: "", // Service should handle this
                createdAt: new Date(),
            });
            setIsGroupModalOpen(false);
            setNewGroupName("");
            setSelectedFriendIds([]);
        } catch (error) {
            console.error("Error creating group:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleFriendSelection = (phone: string) => {
        if (selectedFriendIds.includes(phone)) {
            setSelectedFriendIds(selectedFriendIds.filter(id => id !== phone));
        } else {
            setSelectedFriendIds([...selectedFriendIds, phone]);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center space-x-4">
                    <Link href="/dashboard" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6 text-slate-600" />
                    </Link>
                    <h1 className="text-3xl font-bold text-slate-900">Social</h1>
                </div>
                <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl">
                    <button
                        onClick={() => setActiveTab("friends")}
                        className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === "friends" ? "bg-white text-[var(--primary-dark)] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                    >
                        Friends
                    </button>
                    <button
                        onClick={() => setActiveTab("groups")}
                        className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === "groups" ? "bg-white text-[var(--primary-dark)] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                    >
                        Groups
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-900">
                        {activeTab === "friends" ? "Your Friends" : "Your Groups"}
                    </h2>
                    <PrimaryButton
                        onClick={() => activeTab === "friends" ? setIsAddModalOpen(true) : setIsGroupModalOpen(true)}
                        icon={<Plus className="w-5 h-5" />}
                        className="!py-2 !px-4"
                    >
                        {activeTab === "friends" ? "Add Friend" : "Create Group"}
                    </PrimaryButton>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <p className="text-slate-500">Loading...</p>
                    </div>
                ) : activeTab === "friends" ? (
                    friends.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <UserPlus className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">No friends yet</h3>
                            <p className="text-slate-500 max-w-sm mx-auto">
                                Add friends to start splitting bills and tracking shared expenses.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {friends.map((friend) => (
                                <div key={friend.phone} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center space-x-4">
                                        <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-300 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
                                            {friend.avatar === "👤" ? friend.name[0] : friend.avatar}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900">{friend.name}</div>
                                            <div className="text-xs text-slate-500">{friend.phone}</div>
                                        </div>
                                    </div>
                                    <Link href={`/dashboard/friends/${encodeURIComponent(friend.phone)}`}>
                                        <button className="px-4 py-2 text-sm font-semibold text-[var(--primary)] border border-[var(--primary)] rounded-full hover:bg-[var(--primary-light)] transition-colors">
                                            View Details
                                        </button>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    groups.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <UsersIcon className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">No groups yet</h3>
                            <p className="text-slate-500 max-w-sm mx-auto">
                                Create a group to split expenses with multiple friends at once.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {groups.map((group) => (
                                <div key={group.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center space-x-4">
                                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
                                            {group.avatarUrl ? <img src={group.avatarUrl} alt={group.name} className="w-full h-full rounded-full object-cover" /> : <UsersIcon className="w-6 h-6" />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900">{group.name}</div>
                                            <div className="text-xs text-slate-500">{group.memberPhones.length} members</div>
                                        </div>
                                    </div>
                                    <Link href={`/dashboard/groups/${group.id}`}>
                                        <button className="px-4 py-2 text-sm font-semibold text-[var(--primary)] border border-[var(--primary)] rounded-full hover:bg-[var(--primary-light)] transition-colors">
                                            View Group
                                        </button>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>

            {/* Add Friend Modal */}
            <AnimatePresence>
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
                        >
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-xl font-bold text-slate-900">Add New Friend</h3>
                                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                                {/* Avatar Selection */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Choose Avatar</label>
                                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                        {AVATARS.map(avatar => (
                                            <button
                                                key={avatar}
                                                onClick={() => setNewFriendAvatar(avatar)}
                                                className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-xl transition-all ${newFriendAvatar === avatar
                                                    ? "bg-[var(--primary-light)] border-2 border-[var(--primary)] scale-110"
                                                    : "bg-slate-50 hover:bg-slate-100 border border-transparent"
                                                    }`}
                                            >
                                                {avatar}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <CustomTextField
                                        label="Name"
                                        placeholder="Enter friend's name"
                                        value={newFriendName}
                                        onChange={(e) => {
                                            setNewFriendName(e.target.value);
                                            if (friendErrors.name) setFriendErrors({ ...friendErrors, name: undefined });
                                        }}
                                    />
                                    {friendErrors.name && (
                                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {friendErrors.name}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <CustomTextField
                                        label="Phone Number"
                                        placeholder="Enter 10-digit phone number"
                                        value={newFriendPhone}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                            setNewFriendPhone(val);
                                            if (friendErrors.phone) setFriendErrors({ ...friendErrors, phone: undefined });
                                        }}
                                    />
                                    {friendErrors.phone && (
                                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {friendErrors.phone}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <CustomTextField
                                        label="Email (Optional)"
                                        placeholder="Enter email address"
                                        value={newFriendEmail}
                                        onChange={(e) => {
                                            setNewFriendEmail(e.target.value);
                                            if (friendErrors.email) setFriendErrors({ ...friendErrors, email: undefined });
                                        }}
                                    />
                                    {friendErrors.email && (
                                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {friendErrors.email}
                                        </p>
                                    )}
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button
                                        onClick={() => setIsAddModalOpen(false)}
                                        className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <PrimaryButton
                                        onClick={handleAddFriend}
                                        loading={isSubmitting}
                                        className="flex-1"
                                    >
                                        Add Friend
                                    </PrimaryButton>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Create Group Modal */}
            <AnimatePresence>
                {isGroupModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-xl font-bold text-slate-900">Create New Group</h3>
                                <button onClick={() => setIsGroupModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                            <div className="p-6 space-y-6 overflow-y-auto">
                                <div>
                                    <CustomTextField
                                        label="Group Name"
                                        placeholder="e.g. Goa Trip, Roommates"
                                        value={newGroupName}
                                        onChange={(e) => {
                                            setNewGroupName(e.target.value);
                                            if (groupError) setGroupError("");
                                        }}
                                    />
                                    {groupError && !selectedFriendIds.length && (
                                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {groupError}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Select Members</label>
                                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                                        {friends.length === 0 ? (
                                            <div className="p-4 text-center text-slate-500 text-sm">
                                                No friends to add. Add friends first!
                                            </div>
                                        ) : (
                                            friends.map(friend => (
                                                <div
                                                    key={friend.phone}
                                                    onClick={() => toggleFriendSelection(friend.phone)}
                                                    className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${selectedFriendIds.includes(friend.phone) ? "bg-[var(--primary-light)]" : "hover:bg-slate-50"}`}
                                                >
                                                    <div className="flex items-center space-x-3">
                                                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-xs font-bold">
                                                            {friend.avatar === "👤" ? friend.name[0] : friend.avatar}
                                                        </div>
                                                        <span className="font-medium text-slate-900">{friend.name}</span>
                                                    </div>
                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedFriendIds.includes(friend.phone) ? "bg-[var(--primary)] border-[var(--primary)]" : "border-slate-300"}`}>
                                                        {selectedFriendIds.includes(friend.phone) && <Check className="w-3 h-3 text-white" />}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">
                                        {selectedFriendIds.length} friends selected
                                    </p>
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        onClick={() => setIsGroupModalOpen(false)}
                                        className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <PrimaryButton
                                        onClick={handleCreateGroup}
                                        loading={isSubmitting}
                                        className="flex-1"
                                    >
                                        Create Group
                                    </PrimaryButton>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
