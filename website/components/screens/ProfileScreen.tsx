import { UserProfile } from "@/lib/firestore";
import { LogOut, Edit2, Camera, ChevronRight, Shield, Bell, Trash2, Download, Save, X, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef } from "react";
import { db, storage, auth } from "@/lib/firebase";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { deleteUser } from "firebase/auth";
import Image from "next/image";

interface ProfileScreenProps {
    userProfile: UserProfile | null;
    userPhone?: string;
    onSignOut: () => void;
}

const AVATAR_OPTIONS = [
    '/assets/avatars/avatar1.png',
    '/assets/avatars/avatar2.png',
    '/assets/avatars/avatar3.png',
    '/assets/avatars/avatar4.png',
    '/assets/avatars/avatar5.png',
    '/assets/avatars/avatar6.png',
    '/assets/avatars/avatar7.png',
    '/assets/avatars/avatar8.png',
    '/assets/avatars/avatar9.png',
    '/assets/avatars/avatar10.png',
];

export default function ProfileScreen({ userProfile, userPhone, onSignOut }: ProfileScreenProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);

    // Form State
    const [name, setName] = useState(userProfile?.displayName || "");
    const [email, setEmail] = useState(userProfile?.email || "");
    const [phone, setPhone] = useState(userPhone || "");
    const [avatar, setAvatar] = useState(userProfile?.photoURL || "");

    // Privacy State
    const [analyticsOptIn, setAnalyticsOptIn] = useState(true); // Default true, should fetch from profile if available
    const [personalizeTips, setPersonalizeTips] = useState(true);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSaveProfile = async () => {
        if (!userPhone) return;
        setIsLoading(true);
        try {
            await setDoc(doc(db, "users", userPhone), {
                name: name,
                email: email,
                phone: phone,
                avatar: avatar
            }, { merge: true });
            setIsEditing(false);
            // Ideally, trigger a refresh of userProfile in parent
        } catch (error) {
            console.error("Error updating profile:", error);
            alert("Failed to update profile.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userPhone) return;

        setIsLoading(true);
        try {
            const storageRef = ref(storage, `users/${userPhone}/profile.jpg`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setAvatar(url);
            await setDoc(doc(db, "users", userPhone), { avatar: url }, { merge: true });
            setShowAvatarPicker(false);
        } catch (error) {
            console.error("Error uploading image:", error);
            alert("Failed to upload image.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectAvatar = async (assetPath: string) => {
        if (!userPhone) return;
        setIsLoading(true);
        try {
            setAvatar(assetPath);
            await setDoc(doc(db, "users", userPhone), { avatar: assetPath }, { merge: true });
            setShowAvatarPicker(false);
        } catch (error) {
            console.error("Error updating avatar:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!confirm("Are you sure you want to delete your account? This cannot be undone.")) return;
        const confirmText = prompt("Type DELETE to confirm account deletion:");
        if (confirmText !== "DELETE") return;

        setIsLoading(true);
        try {
            if (userPhone) {
                await deleteDoc(doc(db, "users", userPhone));
            }
            if (auth.currentUser) {
                await deleteUser(auth.currentUser);
            }
            onSignOut();
        } catch (error) {
            console.error("Error deleting account:", error);
            alert("Failed to delete account. You may need to re-login first.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportData = () => {
        alert("Export started! You will receive an email with your data shortly.");
        // Implement actual export logic here (e.g., cloud function trigger)
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-3xl mx-auto pb-24"
        >
            {/* Header / Avatar Section */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 flex flex-col items-center text-center relative overflow-hidden">
                <div className="relative group">
                    <div className="w-32 h-32 rounded-full bg-slate-100 overflow-hidden border-4 border-white shadow-lg mb-4 relative">
                        {avatar ? (
                            <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-4xl font-bold bg-slate-100">
                                {name[0]?.toUpperCase()}
                            </div>
                        )}
                        <button
                            onClick={() => setShowAvatarPicker(true)}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                            <Camera className="w-8 h-8 text-white" />
                        </button>
                    </div>
                </div>

                {isEditing ? (
                    <div className="w-full max-w-xs space-y-3">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full text-center text-2xl font-bold text-slate-900 border-b-2 border-teal-500 focus:outline-none bg-transparent"
                            placeholder="Your Name"
                        />
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full text-center text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 focus:outline-none transition-colors"
                        />
                    </div>
                ) : (
                    <>
                        <h2 className="text-2xl font-bold text-slate-900">{name}</h2>
                        <p className="text-slate-500">{phone}</p>
                    </>
                )}

                <div className="absolute top-6 right-6">
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsEditing(false)}
                                className="p-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleSaveProfile}
                                disabled={isLoading}
                                className="p-2 rounded-full bg-teal-500 text-white hover:bg-teal-600 transition-colors shadow-md shadow-teal-200"
                            >
                                <Check className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="p-2 rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            <Edit2 className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Personal Info */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-teal-600" />
                        Personal Information
                    </h3>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-slate-500">Email Address</label>
                            {isEditing ? (
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none transition-all"
                                />
                            ) : (
                                <div className="p-3 rounded-xl bg-slate-50 text-slate-700 border border-transparent">
                                    {email || "Not set"}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-slate-500">Phone Number</label>
                            {isEditing ? (
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none transition-all"
                                />
                            ) : (
                                <div className="p-3 rounded-xl bg-slate-50 text-slate-700 border border-transparent">
                                    {phone || "Not set"}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Privacy & Settings */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-indigo-600" />
                        Privacy & Data
                    </h3>
                </div>
                <div className="divide-y divide-slate-100">
                    <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div>
                            <p className="font-medium text-slate-900">Share Anonymous Analytics</p>
                            <p className="text-sm text-slate-500">Helps us improve features and reliability</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={analyticsOptIn} onChange={(e) => setAnalyticsOptIn(e.target.checked)} className="sr-only peer" />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                        </label>
                    </div>
                    <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div>
                            <p className="font-medium text-slate-900">Personalized Tips</p>
                            <p className="text-sm text-slate-500">Use your data locally to tailor advice</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={personalizeTips} onChange={(e) => setPersonalizeTips(e.target.checked)} className="sr-only peer" />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                        </label>
                    </div>
                </div>
            </div>

            {/* Account Actions */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-slate-600" />
                        Account Actions
                    </h3>
                </div>
                <div className="divide-y divide-slate-100">
                    <button onClick={handleExportData} className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                <Download className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-medium text-slate-900">Export Data</p>
                                <p className="text-sm text-slate-500">Download a copy of your financial data</p>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                    </button>
                    <button onClick={onSignOut} className="w-full p-4 flex items-center justify-between hover:bg-red-50 transition-colors text-left group">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:bg-red-100 transition-colors">
                                <LogOut className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-medium text-red-600">Sign Out</p>
                                <p className="text-sm text-red-400">Log out of your account on this device</p>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-red-300 group-hover:text-red-500" />
                    </button>
                    <button onClick={handleDeleteAccount} className="w-full p-4 flex items-center justify-between hover:bg-red-50 transition-colors text-left group">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:bg-red-100 transition-colors">
                                <Trash2 className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-medium text-red-600">Delete Account</p>
                                <p className="text-sm text-red-400">Permanently delete your account and data</p>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-red-300 group-hover:text-red-500" />
                    </button>
                </div>
            </div>

            {/* Avatar Picker Modal */}
            <AnimatePresence>
                {showAvatarPicker && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
                        >
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-xl font-bold text-slate-900">Choose Avatar</h3>
                                <button onClick={() => setShowAvatarPicker(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-4 gap-4 mb-6">
                                    {AVATAR_OPTIONS.map((path, index) => (
                                        <button
                                            key={index}
                                            onClick={() => handleSelectAvatar(path)}
                                            className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-teal-500 hover:scale-105 transition-all"
                                        >
                                            <img src={path} alt={`Avatar ${index + 1}`} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-slate-200"></div>
                                    </div>
                                    <div className="relative flex justify-center text-sm">
                                        <span className="px-2 bg-white text-slate-500">Or upload your own</span>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        accept="image/*"
                                        className="hidden"
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 font-medium hover:border-teal-500 hover:text-teal-600 hover:bg-teal-50 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Camera className="w-5 h-5" />
                                        Upload Photo
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {isLoading && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/50 backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
                </div>
            )}
        </motion.div>
    );
}
