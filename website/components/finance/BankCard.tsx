import React, { useState } from 'react';
import { CreditCard, Wifi, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { BankStats } from '@/lib/utils/bankUtils';

interface BankCardProps {
    bankName: string;
    cardType: string;
    last4: string;
    name: string;
    expiry?: string;
    colorTheme?: 'blue' | 'purple' | 'black' | 'green' | 'red';
    logoUrl?: string;
    stats?: BankStats;
    onClick?: () => void;
}

const BankCard: React.FC<BankCardProps> = ({
    bankName,
    cardType,
    last4,
    name,
    expiry = '12/28',
    colorTheme = 'blue',
    logoUrl,
    stats,
    onClick
}) => {
    const [showStats, setShowStats] = useState(false);

    const getGradient = () => {
        switch (colorTheme) {
            case 'purple':
                return 'from-purple-900 to-indigo-800';
            case 'black':
                return 'from-gray-900 to-black';
            case 'green':
                return 'from-green-800 to-emerald-600';
            case 'red':
                return 'from-red-900 to-rose-700';
            case 'blue':
            default:
                return 'from-blue-900 to-cyan-800';
        }
    };

    const handleEyeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowStats(!showStats);
    };

    return (
        <div
            onClick={onClick}
            className={`relative w-80 h-48 rounded-2xl overflow-hidden shadow-2xl transition-transform transform hover:-translate-y-1 hover:shadow-cyan-500/20 bg-gradient-to-br ${getGradient()} cursor-pointer shrink-0 snap-center`}
        >
            {/* Decorative Circles */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-white opacity-5 blur-2xl"></div>
            <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-40 h-40 rounded-full bg-white opacity-10 blur-xl"></div>

            {showStats && stats ? (
                <div className="relative p-6 flex flex-col justify-between h-full z-20 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="flex justify-between items-start">
                        <h3 className="text-white font-bold text-lg tracking-wider">Analytics</h3>
                        <button onClick={handleEyeClick} className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                            <EyeOff className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-2">
                        <div>
                            <p className="text-[10px] text-gray-300 uppercase tracking-wider">Total Spend</p>
                            <p className="text-xl font-bold text-white">₹{stats.totalDebit.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-300 uppercase tracking-wider">Transactions</p>
                            <p className="text-xl font-bold text-white">{stats.totalTxCount}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-green-300 uppercase tracking-wider">Credits</p>
                            <p className="text-sm font-medium text-white">₹{stats.totalCredit.toLocaleString()} ({stats.creditCount})</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-red-300 uppercase tracking-wider">Debits</p>
                            <p className="text-sm font-medium text-white">₹{stats.totalDebit.toLocaleString()} ({stats.debitCount})</p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="relative p-6 flex flex-col justify-between h-full z-10">
                    {/* Header */}
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            {logoUrl ? (
                                <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-lg p-1 flex items-center justify-center">
                                    <img src={logoUrl} alt={bankName} className="w-full h-full object-contain" />
                                </div>
                            ) : null}
                            <div>
                                <h3 className="text-white font-bold text-lg tracking-wider font-mono leading-none">{bankName.toUpperCase()}</h3>
                                <p className="text-[10px] text-gray-300 font-light mt-1 uppercase tracking-widest">{cardType}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {stats && (
                                <button
                                    onClick={handleEyeClick}
                                    className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
                                >
                                    <Eye className="w-5 h-5" />
                                </button>
                            )}
                            <Wifi className="text-white/70 w-6 h-6 rotate-90" />
                        </div>
                    </div>

                    {/* Chip & Content */}
                    <div className="flex flex-col gap-4 mt-2">
                        <div className="w-10 h-8 rounded bg-gradient-to-r from-yellow-200 to-yellow-500 opacity-90 border border-yellow-600 shadow-inner flex items-center justify-center">
                            <div className="w-full h-[1px] bg-yellow-700/30"></div>
                        </div>

                        <div className="flex items-center gap-3 text-white">
                            <span className="text-xl tracking-[0.2em] font-mono opacity-80">•••• •••• ••••</span>
                            <span className="text-xl font-mono font-bold tracking-widest">{last4}</span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-[0.6rem] text-gray-400 uppercase tracking-wider mb-0.5">Card Holder</p>
                            <p className="text-sm text-gray-100 font-medium tracking-wide uppercase">{name}</p>
                        </div>
                        <div className="flex flex-col items-end">
                            <p className="text-[0.5rem] text-gray-400 uppercase tracking-wider">Valid Thru</p>
                            <p className="text-sm text-white font-bold tracking-wide">{expiry}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Gloss Effect */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
        </div>
    );
};

export default BankCard;
