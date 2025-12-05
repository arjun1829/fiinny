import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Calendar, Tag, Type, MessageSquare, Hash } from "lucide-react";
import { format } from "date-fns";

export interface BulkEditSpec {
    title?: string;
    comments?: string;
    category?: string;
    date?: Date;
    addLabels: string[];
    removeLabels: string[];
}

interface BulkEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (spec: BulkEditSpec) => void;
    categories: string[];
    existingLabels?: string[]; // Suggestions
}

export default function BulkEditModal({ isOpen, onClose, onApply, categories, existingLabels = [] }: BulkEditModalProps) {
    const [title, setTitle] = useState("");
    const [comments, setComments] = useState("");
    const [category, setCategory] = useState<string>("");
    const [date, setDate] = useState<string>("");

    const [addLabels, setAddLabels] = useState<Set<string>>(new Set());
    const [removeLabels, setRemoveLabels] = useState<Set<string>>(new Set());

    const [addLabelInput, setAddLabelInput] = useState("");
    const [removeLabelInput, setRemoveLabelInput] = useState("");

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setTitle("");
            setComments("");
            setCategory("");
            setDate("");
            setAddLabels(new Set());
            setRemoveLabels(new Set());
            setAddLabelInput("");
            setRemoveLabelInput("");
        }
    }, [isOpen]);

    const handleAddLabel = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = addLabelInput.trim();
            if (val) {
                setAddLabels(prev => new Set(prev).add(val));
                setAddLabelInput("");
            }
        }
    };

    const handleRemoveLabel = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = removeLabelInput.trim();
            if (val) {
                setRemoveLabels(prev => new Set(prev).add(val));
                setRemoveLabelInput("");
            }
        }
    };

    const isNoop = !title && !comments && !category && !date && addLabels.size === 0 && removeLabels.size === 0;

    const handleApply = () => {
        // Add pending inputs if any
        const finalAddLabels = new Set(addLabels);
        if (addLabelInput.trim()) finalAddLabels.add(addLabelInput.trim());

        const finalRemoveLabels = new Set(removeLabels);
        if (removeLabelInput.trim()) finalRemoveLabels.add(removeLabelInput.trim());

        if (isNoop && !addLabelInput.trim() && !removeLabelInput.trim()) return;

        onApply({
            title: title || undefined,
            comments: comments || undefined,
            category: category || undefined,
            date: date ? new Date(date) : undefined,
            addLabels: Array.from(finalAddLabels),
            removeLabels: Array.from(finalRemoveLabels),
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl max-h-[90vh] flex flex-col"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Bulk Edit</h3>
                        <p className="text-sm text-slate-500">Apply changes to selected items</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">

                    {/* Title */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                            <Type className="w-4 h-4" /> Set Title (Optional)
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="e.g. Goa Trip"
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>

                    {/* Comments */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                            <MessageSquare className="w-4 h-4" /> Set Comments (Optional)
                        </label>
                        <input
                            type="text"
                            value={comments}
                            onChange={e => setComments(e.target.value)}
                            placeholder="Add a note..."
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                            <Tag className="w-4 h-4" /> Set Category (Optional)
                        </label>
                        <select
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 appearance-none"
                        >
                            <option value="">— Leave as is —</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                            <Calendar className="w-4 h-4" /> Set Date (Optional)
                        </label>
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>

                    <div className="h-px bg-slate-100 my-2" />

                    {/* Add Labels */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                            <Hash className="w-4 h-4 text-teal-600" /> Add Labels
                        </label>
                        <input
                            type="text"
                            value={addLabelInput}
                            onChange={e => setAddLabelInput(e.target.value)}
                            onKeyDown={handleAddLabel}
                            placeholder="Type and press Enter..."
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 mb-2"
                        />
                        <div className="flex flex-wrap gap-2">
                            {Array.from(addLabels).map(l => (
                                <span key={l} className="px-2 py-1 bg-teal-50 text-teal-700 rounded-lg text-sm flex items-center gap-1 border border-teal-100">
                                    #{l}
                                    <button onClick={() => setAddLabels(prev => { const n = new Set(prev); n.delete(l); return n; })} className="hover:text-teal-900"><X className="w-3 h-3" /></button>
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Remove Labels */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                            <Hash className="w-4 h-4 text-red-500" /> Remove Labels
                        </label>
                        <input
                            type="text"
                            value={removeLabelInput}
                            onChange={e => setRemoveLabelInput(e.target.value)}
                            onKeyDown={handleRemoveLabel}
                            placeholder="Type and press Enter..."
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 mb-2"
                        />
                        <div className="flex flex-wrap gap-2">
                            {Array.from(removeLabels).map(l => (
                                <span key={l} className="px-2 py-1 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-1 border border-red-100">
                                    #{l}
                                    <button onClick={() => setRemoveLabels(prev => { const n = new Set(prev); n.delete(l); return n; })} className="hover:text-red-900"><X className="w-3 h-3" /></button>
                                </span>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-200 rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={isNoop}
                        className={`px-5 py-2.5 text-white font-semibold rounded-xl transition-colors flex items-center gap-2 ${isNoop ? 'bg-slate-300 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 shadow-lg shadow-teal-600/20'}`}
                    >
                        <Check className="w-4 h-4" />
                        Apply Changes
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
