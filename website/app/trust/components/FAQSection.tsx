'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';

const questions = [
    {
        question: "What happens if I lose my phone?",
        answer: "Your financial data is safe. Fiinny is protected by your device's biometric security (FaceID/Fingerprint). Without your physical biometrics, the app cannot be opened, and the encrypted data on the disk remains unreadable."
    },
    {
        question: "Can Fiinny employees see my bank balance?",
        answer: "No. Our architecture is 'Local-First'. Your SMS data and parsed financial transactions live in a local database on your phone. We do not have a 'master key' to view user data remotely."
    },
    {
        question: "Do you sell my spending data to advertisers?",
        answer: "Absolutely not. We are a subscription-first company. You are our customer, not our product. We do not sell, rent, or trade your personal or financial information to third parties."
    },
    {
        question: "Is my data backed up to the cloud?",
        answer: "Only if you enable Cloud Sync. If you do, your data is encrypted before it leaves your device using AES-256 encryption, ensuring that even if the cloud provider is compromised, your data remains unintelligible."
    },
    {
        question: "Why do you need SMS permission?",
        answer: "SMS permission is optional. We use it solely to automate expense tracking by reading transaction alerts from your bank. This processing happens 100% on-device. You can choose to enter transactions manually if you prefer."
    }
];

const FAQItem = ({ question, answer, isOpen, toggle }: any) => (
    <div className="border-b border-slate-100 last:border-0">
        <button
            onClick={toggle}
            className="w-full py-6 flex items-center justify-between text-left group"
        >
            <span className={`text-lg font-medium transition-colors ${isOpen ? 'text-teal-600' : 'text-slate-900 group-hover:text-teal-600'}`}>
                {question}
            </span>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isOpen ? 'bg-teal-50 text-teal-600' : 'bg-slate-50 text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-500'}`}>
                {isOpen ? <Minus size={16} /> : <Plus size={16} />}
            </div>
        </button>
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                >
                    <p className="pb-6 text-slate-600 leading-relaxed max-w-3xl">
                        {answer}
                    </p>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
);

export default function FAQSection() {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <section className="bg-white py-24 px-4">
            <div className="max-w-3xl mx-auto">
                <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">
                    Common Questions
                </h2>
                <div className="bg-white rounded-2xl">
                    {questions.map((q, i) => (
                        <FAQItem
                            key={i}
                            {...q}
                            isOpen={openIndex === i}
                            toggle={() => setOpenIndex(openIndex === i ? null : i)}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
