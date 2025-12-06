import React, { useState } from 'react';
import { X, CreditCard, Calendar, Lock, User } from 'lucide-react';

interface AddCardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (card: any) => void;
}

const AddCardModal: React.FC<AddCardModalProps> = ({ isOpen, onClose, onAdd }) => {
    const [formData, setFormData] = useState({
        name: '',
        number: '',
        expiry: '',
        cvv: '',
        bank: '',
    });

    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        onAdd({
            ...formData,
            last4: formData.number.slice(-4),
            cardType: 'Visa' // Mock detection
        });
        setLoading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-2xl font-bold text-white mb-1">Add New Card</h2>
                <p className="text-gray-400 text-sm mb-6">Enter details to verify and save your card.</p>

                <form onSubmit={handleSubmit} className="space-y-4">

                    <div className="space-y-1">
                        <label className="text-xs text-gray-400 uppercase font-semibold ml-1">Card Number</label>
                        <div className="relative">
                            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                            <input
                                type="text"
                                placeholder="0000 0000 0000 0000"
                                maxLength={19}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all placeholder:text-gray-600 font-mono"
                                value={formData.number}
                                onChange={e => setFormData({ ...formData, number: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-gray-400 uppercase font-semibold ml-1">Expiry</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="MM/YY"
                                    maxLength={5}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder:text-gray-600"
                                    value={formData.expiry}
                                    onChange={e => setFormData({ ...formData, expiry: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-400 uppercase font-semibold ml-1">CVV</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <input
                                    type="password"
                                    placeholder="123"
                                    maxLength={4}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder:text-gray-600"
                                    value={formData.cvv}
                                    onChange={e => setFormData({ ...formData, cvv: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-gray-400 uppercase font-semibold ml-1">Name on Card</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                            <input
                                type="text"
                                placeholder="JOHN DOE"
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder:text-gray-600"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-gray-400 uppercase font-semibold ml-1">Bank Name</label>
                        <input
                            type="text"
                            placeholder="e.g. HDFC Bank"
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder:text-gray-600"
                            value={formData.bank}
                            onChange={e => setFormData({ ...formData, bank: e.target.value })}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-cyan-500/20 transform active:scale-95 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading && <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {loading ? 'Verifying...' : 'Save Card'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AddCardModal;
