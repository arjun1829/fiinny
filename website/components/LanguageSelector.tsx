"use client";

import { Globe } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/app/i18n/LanguageContext";

const languages = [
    { code: "en", name: "English" },
    { code: "hi", name: "हिंदी" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "ja", name: "日本語" },
];

export default function LanguageSelector() {
    const [isOpen, setIsOpen] = useState(false);
    const { language, setLanguage } = useLanguage();

    // Find name for current language code
    const currentLangName = languages.find(l => l.code === language)?.name || "English";

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white transition-all text-sm font-medium px-4 py-2 rounded-full border border-slate-700 shadow-sm"
            >
                <Globe className="w-4 h-4 text-teal-400" />
                <span className="hidden md:inline">{currentLangName}</span>
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute bottom-full mb-2 right-0 w-48 bg-slate-900 rounded-xl shadow-xl border border-slate-700 py-2 z-20 overflow-hidden">
                        {languages.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => {
                                    setLanguage(lang.code as any);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-800 transition-colors flex items-center justify-between ${language === lang.code ? "text-teal-400 font-bold bg-slate-800/50" : "text-slate-300"
                                    }`}
                            >
                                {lang.name}
                                {language === lang.code && <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
