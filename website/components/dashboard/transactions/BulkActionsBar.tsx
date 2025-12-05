"use client";

import { motion } from "framer-motion";
import { Trash2, X } from "lucide-react";

interface BulkActionsBarProps {
    selectedCount: number;
    onClearSelection: () => void;
    onDeleteSelected: () => void;
}

export default function BulkActionsBar({
    selectedCount,
    onClearSelection,
    onDeleteSelected
}: BulkActionsBarProps) {
    return (
        <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-6 z-50"
        >
            <div className="flex items-center gap-3">
                <div className="bg-slate-800 px-2.5 py-0.5 rounded-md text-sm font-bold">
                    {selectedCount}
                </div>
                <span className="text-sm font-medium text-slate-300">Selected</span>
            </div>

            <div className="h-6 w-px bg-slate-700" />

            <div className="flex items-center gap-2">
                <button
                    onClick={onDeleteSelected}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-colors text-sm font-medium"
                >
                    <Trash2 className="w-4 h-4" />
                    Delete
                </button>

                <button
                    onClick={onClearSelection}
                    className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </motion.div>
    );
}
