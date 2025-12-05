"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, LayoutDashboard, User, Palette, ChevronDown } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useTheme, Theme } from "@/components/ThemeProvider";

export default function Navbar() {
    const { user, loading } = useAuth();
    const { theme, setTheme } = useTheme();
    const router = useRouter();
    const pathname = usePathname();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleLogout = async () => {
        await signOut(auth);
        router.push("/");
    };

    const isDashboard = pathname?.startsWith("/dashboard");

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const themes: { id: Theme; color: string; label: string }[] = [
        { id: "teal", color: "#0d9488", label: "Teal" },
        { id: "mint", color: "#10b981", label: "Mint" },
        { id: "black", color: "#000000", label: "Black" },
        { id: "white", color: "#ffffff", label: "White" },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
            <div className="container mx-auto px-6 py-4 flex justify-between items-center">
                <Link href={user ? "/dashboard" : "/"} className="flex items-center space-x-2 group">
                    <div className="relative w-8 h-8 transition-transform group-hover:scale-110">
                        <Image
                            src="/assets/images/logo_icon.png"
                            alt="Fiinny"
                            fill
                            className="object-contain"
                        />
                    </div>
                    <span className="text-2xl font-bold bg-gradient-to-r from-teal-600 to-emerald-500 bg-clip-text text-transparent">
                        Fiinny
                    </span>
                </Link>

                <div className="flex items-center space-x-4">
                    {!loading && (
                        <>
                            {user ? (
                                <div className="flex items-center space-x-4">
                                    {!isDashboard && (
                                        <Link href="/dashboard">
                                            <button className="hidden md:flex items-center space-x-2 text-slate-600 hover:text-teal-600 transition-colors font-medium">
                                                <LayoutDashboard className="w-4 h-4" />
                                                <span>Dashboard</span>
                                            </button>
                                        </Link>
                                    )}

                                    {/* Profile Dropdown */}
                                    <div className="relative" ref={dropdownRef}>
                                        <button
                                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                            className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm">
                                                {user.displayName?.[0] || user.phoneNumber?.[0] || "U"}
                                            </div>
                                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
                                        </button>

                                        <AnimatePresence>
                                            {isDropdownOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    transition={{ duration: 0.1 }}
                                                    className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden py-2"
                                                >
                                                    <div className="px-4 py-3 border-b border-slate-50">
                                                        <p className="text-sm font-bold text-slate-900 truncate">{user.displayName || "User"}</p>
                                                        <p className="text-xs text-slate-500 truncate">{user.phoneNumber}</p>
                                                    </div>

                                                    <div className="p-2">
                                                        <Link href="/dashboard?tab=profile" onClick={() => setIsDropdownOpen(false)}>
                                                            <button className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors text-sm font-medium">
                                                                <User className="w-4 h-4" />
                                                                <span>Profile Settings</span>
                                                            </button>
                                                        </Link>
                                                    </div>

                                                    <div className="px-4 py-2">
                                                        <div className="flex items-center space-x-2 text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">
                                                            <Palette className="w-3 h-3" />
                                                            <span>Theme</span>
                                                        </div>
                                                        <div className="grid grid-cols-4 gap-2">
                                                            {themes.map((t) => (
                                                                <button
                                                                    key={t.id}
                                                                    onClick={() => setTheme(t.id)}
                                                                    className={`w-full aspect-square rounded-full border-2 flex items-center justify-center transition-all ${theme === t.id ? "border-slate-900 scale-110" : "border-transparent hover:scale-105"}`}
                                                                    title={t.label}
                                                                >
                                                                    <div
                                                                        className="w-full h-full rounded-full border border-black/10"
                                                                        style={{ backgroundColor: t.color }}
                                                                    />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-slate-50 mt-2 p-2">
                                                        <button
                                                            onClick={handleLogout}
                                                            className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 transition-colors text-sm font-medium"
                                                        >
                                                            <LogOut className="w-4 h-4" />
                                                            <span>Sign Out</span>
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            ) : (
                                <Link href="/login">
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        className="bg-slate-900 text-white px-6 py-2.5 rounded-full font-bold text-sm hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
                                    >
                                        Login
                                    </motion.button>
                                </Link>
                            )}
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
