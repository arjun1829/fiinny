import React, { useState, useEffect } from 'react';
import { PartnerModel } from '@/lib/models/PartnerModel';
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PartnerService } from '@/lib/services/PartnerService';
import { PartnerRingSummary } from '../widgets/PartnerRingSummary';
import { WeeklyPartnerRings } from '../widgets/WeeklyPartnerRings';
import { PartnerChatTab } from '../widgets/PartnerChatTab';
import { useAuth } from '@/components/AuthProvider';

interface PartnerDetailsScreenProps {
    partner: PartnerModel;
    currentUserPhone: string;
    onBack: () => void;
}

export default function PartnerDetailsScreen({ partner, currentUserPhone, onBack }: PartnerDetailsScreenProps) {
    const { user } = useAuth();
    const [selectedDay, setSelectedDay] = useState<Date>(new Date());
    const [transactions, setTransactions] = useState<any[]>([]);

    // Debug logging for ID issues
    console.log('PartnerDetailsScreen Debug:', {
        currentUserPhone,
        partnerId: partner.partnerId,
        pDocId: partner.id
    });

    // Stats for Selected Day
    const [dailyStats, setDailyStats] = useState({
        credit: 0,
        debit: 0,
        count: 0,
        totalVolume: 0
    });

    // Stats for Last 8 Days (for Weekly Rings)
    const [weeklyStats, setWeeklyStats] = useState<{
        credits: number[];
        debits: number[];
        dates: Date[];
    }>({ credits: [], debits: [], dates: [] });

    // Active Tab
    const [activeTab, setActiveTab] = useState<'transactions' | 'chat'>('transactions');

    // 1. Initial Load: Fetch last 8 days data
    useEffect(() => {
        const loadWeeklyData = async () => {
            // Generate last 8 days
            const dates = Array.from({ length: 8 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (7 - i));
                return d;
            });

            const credits: number[] = [];
            const debits: number[] = [];

            const startDate = dates[0];
            const endDate = new Date(dates[7]);
            endDate.setDate(endDate.getDate() + 1); // include last day

            try {
                // Use fallback ID if partnerId is missing
                const targetId = partner.partnerId || partner.id;

                const allTxs = await PartnerService.getPartnerTransactions(
                    targetId,
                    startDate,
                    endDate
                );

                // Bucket them
                dates.forEach(date => {
                    const dayStart = new Date(date);
                    dayStart.setHours(0, 0, 0, 0);
                    const dayEnd = new Date(date);
                    dayEnd.setHours(23, 59, 59, 999);

                    const dayTxs = allTxs.filter(tx => {
                        const txDate = tx.date.toDate(); // Firestone timestamp
                        return txDate >= dayStart && txDate <= dayEnd;
                    });

                    const c = dayTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
                    const d = dayTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

                    credits.push(c);
                    debits.push(d);
                });

                setWeeklyStats({ credits, debits, dates });

                // Set initial selection to today (last index) or keep current if selected
                loadDayStats(dates[7]);

            } catch (error) {
                console.error("Failed to load weekly stats", error);
            }
        };

        if (partner) {
            loadWeeklyData();
        }
    }, [partner.partnerId, partner.id]);


    const loadDayStats = async (date: Date) => {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        try {
            const targetId = partner.partnerId || partner.id;
            const txs = await PartnerService.getPartnerTransactions(targetId, start, end);

            // Calc stats
            const credit = txs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
            const debit = txs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

            setSelectedDay(date);
            setTransactions(txs);
            setDailyStats({
                credit,
                debit,
                count: txs.length,
                totalVolume: credit + debit
            });
        } catch (error) {
            console.error("Failed to load day stats", error);
        }
    };

    const formatDate = (date: Date) => {
        return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    };

    return (
        <div className="bg-white min-h-screen pb-12">
            {/* Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 px-4 py-3 border-b border-slate-100 flex items-center gap-3 shadow-sm">
                <button onClick={onBack} className="p-2 hover:bg-slate-50 rounded-full text-slate-600">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3">
                    <img
                        src={partner.avatar || 'https://api.dicebear.com/7.x/avataaars/svg'}
                        alt={partner.partnerName}
                        className="w-10 h-10 rounded-full bg-teal-50"
                    />
                    <h1 className="text-lg font-bold text-slate-800">{partner.partnerName}</h1>
                </div>
            </div>

            <main className="max-w-md mx-auto py-6 space-y-6 px-4">

                {/* --- Top Card: Partner Stats --- */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-[22px] shadow-lg border border-slate-100 p-6 flex flex-col items-center gap-6"
                >
                    {/* Partner Header inside Card */}
                    <div className="flex items-center gap-3 w-full">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-teal-50 shrink-0">
                            <img
                                src={partner.avatar || 'https://api.dicebear.com/7.x/avataaars/svg'}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-bold text-teal-800 truncate">{partner.partnerName}</h2>
                        </div>
                    </div>

                    {/* Big Ring */}
                    <PartnerRingSummary
                        credit={dailyStats.credit}
                        debit={dailyStats.debit}
                        totalAmount={dailyStats.totalVolume}
                        ringSize={140}
                    />

                    {/* Stats Row */}
                    <div className="flex items-center gap-10">
                        <div className="text-center">
                            <div className="text-xs text-green-700 font-medium mb-0.5">Credit</div>
                            <div className="text-lg font-bold text-green-800">₹{dailyStats.credit.toFixed(0)}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-red-700 font-medium mb-0.5">Debit</div>
                            <div className="text-lg font-bold text-red-800">₹{dailyStats.debit.toFixed(0)}</div>
                        </div>
                    </div>

                    {/* Date Footer */}
                    <div className="text-sm font-medium text-teal-900/80">
                        Tx: {dailyStats.count}  •  {formatDate(selectedDay)}
                    </div>
                </motion.div>

                {/* --- Weekly Activity Rings --- */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white rounded-[18px] shadow-sm border border-slate-100 p-4"
                >
                    <h3 className="text-sm font-semibold text-teal-700 mb-4 pl-2">Last 8 Days Activity</h3>
                    <WeeklyPartnerRings
                        dailyCredits={weeklyStats.credits}
                        dailyDebits={weeklyStats.debits}
                        dateLabels={weeklyStats.dates.map(d => `${d.getDate()}/${d.getMonth() + 1}`)}
                        onRingTap={(index) => {
                            if (weeklyStats.dates[index]) {
                                loadDayStats(weeklyStats.dates[index]);
                            }
                        }}
                    />
                </motion.div>

                {/* --- Tabs --- */}
                <div className="flex border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'transactions'
                                ? 'border-teal-600 text-teal-700'
                                : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        Transactions
                    </button>
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'chat'
                                ? 'border-teal-600 text-teal-700'
                                : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        Chat
                    </button>
                </div>

                {/* --- Tab Content --- */}
                <div className="min-h-[360px]">
                    <AnimatePresence mode="wait">
                        {activeTab === 'transactions' ? (
                            <motion.div
                                key="tx"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="space-y-3 pt-2"
                            >
                                {transactions.length === 0 ? (
                                    <div className="text-center text-slate-400 py-10">No transactions for this day</div>
                                ) : (
                                    transactions.map((tx, i) => (
                                        <div key={i} className="group relative bg-white rounded-2xl border border-slate-100 shadow-sm p-0 overflow-hidden hover:shadow-md transition-all">
                                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${tx.type === 'income' ? 'bg-green-500' : 'bg-red-500'}`} />
                                            <div className="flex items-center p-3 pl-5 gap-3">
                                                <div className={`p-2 rounded-full ${tx.type === 'income' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                                    {tx.type === 'income' ? <ArrowDownCircle size={20} /> : <ArrowUpCircle size={20} />}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start">
                                                        <h4 className="font-bold text-slate-800 text-sm">{tx.category || 'General'}</h4>
                                                        <span className={`font-black text-base ${tx.type === 'income' ? 'text-green-600' : 'text-red-700'}`}>
                                                            ₹{tx.amount.toFixed(0)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-end mt-1">
                                                        <p className="text-xs text-slate-500 line-clamp-1">{tx.note || (tx.type === 'income' ? 'Income' : 'Expense')}</p>
                                                        <span className="text-[10px] text-slate-400 font-medium">
                                                            {tx.date.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="chat"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className="h-[500px]"
                            >
                                <PartnerChatTab
                                    partnerUserId={partner.partnerId || partner.id}
                                    currentUserId={currentUserPhone}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
