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
                className="flex items-center gap-2 text-slate-600 hover:text-teal-600 transition-colors text-sm font-medium"
            >
                <Globe className="w-4 h-4" />
                <span className="hidden md:inline">{currentLangName}</span>
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-20">
                        {languages.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => {
                                    setLanguage(lang.code as any);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${language === lang.code ? "text-teal-600 font-bold" : "text-slate-600"
                                    }`}
                            >
                                {lang.name}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
