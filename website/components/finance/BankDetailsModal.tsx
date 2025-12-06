
import React, { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import BankCard from './BankCard';
import { InferredCard, BankStats } from '@/lib/utils/bankUtils';
import { ExpenseItem, IncomeItem } from '@/lib/firestore';
import UnifiedTransactionList from '@/components/dashboard/transactions/UnifiedTransactionList';

interface BankDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    bankName: string;
    cards: InferredCard[];
    userName: string;
    expenses: ExpenseItem[];
    incomes: IncomeItem[];
    onEditTransaction: (tx: ExpenseItem | IncomeItem) => void;
    onDeleteTransaction: (id: string, type: "expense" | "income") => void;
    onSplitTransaction: (tx: ExpenseItem) => void;
    onViewTransactionDetails: (tx: ExpenseItem | IncomeItem) => void;
}

const BankDetailsModal: React.FC<BankDetailsModalProps> = ({
    isOpen,
    onClose,
    bankName,
    cards,
    userName,
    expenses,
    incomes,
    onEditTransaction,
    onDeleteTransaction,
    onSplitTransaction,
    onViewTransactionDetails
}) => {
    const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);

    // Initial derived data (all transactions for this bank)
    const bankTransactions = useMemo(() => {
        const normalize = (s: string) => s?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
        const target = normalize(bankName);

        return [...expenses, ...incomes].filter(tx => {
            return normalize(tx.issuerBank || '') === target;
        }).sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [expenses, incomes, bankName]);

    // Derived data for display (filtered by selected card if any)
    const displayedTransactions = useMemo(() => {
        if (selectedCardIndex === null) return bankTransactions;

        const card = cards[selectedCardIndex];
        return bankTransactions.filter(tx => {
            // Match by last4 and type if possible
            if (tx.cardLast4 && card.last4 && tx.cardLast4 !== card.last4) return false;
            // if (tx.cardType && card.cardType && tx.cardType !== card.cardType) return false; // Strict type matching might be too aggressive
            return true;
        });
    }, [bankTransactions, selectedCardIndex, cards]);

    // Calculate stats for EACH card to pass to BankCard
    // We map over 'cards' and compute stats from 'bankTransactions' for each
    const cardsWithStats = useMemo(() => {
        return cards.map(c => {
            const stats: BankStats = {
                totalTxCount: 0,
                totalAmount: 0,
                creditCount: 0,
                debitCount: 0,
                totalCredit: 0,
                totalDebit: 0
            };

            const cardTxs = bankTransactions.filter(tx => {
                if (tx.cardLast4 && c.last4 && tx.cardLast4 !== c.last4) return false;
                return true;
            });

            cardTxs.forEach(tx => {
                const isIncome = 'type' in tx && (tx as IncomeItem).type === 'Income'; // Simple check
                stats.totalTxCount++;
                stats.totalAmount += tx.amount;
                if (isIncome) {
                    stats.creditCount++;
                    stats.totalCredit += tx.amount;
                } else {
                    stats.debitCount++;
                    stats.totalDebit += tx.amount;
                }
            });

            return { ...c, stats };
        });
    }, [cards, bankTransactions]);

    // Reset selection when modal opens or bank changes
    React.useEffect(() => {
        setSelectedCardIndex(null);
    }, [bankName, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">{bankName} Overview</h2>
                        <p className="text-slate-500 text-sm">
                            Found {cards.length} cards · {bankTransactions.length} transactions
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-500" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-6 space-y-8">
                    {/* Cards Grid */}
                    <div className="flex flex-wrap justify-center gap-8 min-h-[220px]">
                        {cardsWithStats.map((card, i) => {
                            const isSelected = selectedCardIndex === i;
                            const isDimmed = selectedCardIndex !== null && !isSelected;

                            return (
                                <div
                                    key={i}
                                    className={`transition-all duration-300 transform ${isDimmed ? 'opacity-40 scale-95 blur-[1px]' : 'opacity-100 scale-100'} ${isSelected ? 'ring-2 ring-teal-500 ring-offset-2 rounded-2xl' : ''}`}
                                    onClick={() => setSelectedCardIndex(isSelected ? null : i)}
                                >
                                    <BankCard
                                        bankName={card.bankName}
                                        cardType={card.cardType}
                                        last4={card.last4}
                                        name={userName}
                                        logoUrl={card.logoUrl}
                                        colorTheme={i % 2 === 0 ? 'black' : 'blue'}
                                        stats={card.stats} // Pass stats so Eye button appears
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Transaction List */}
                    <div className="border-t border-slate-100 pt-6">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">
                            {selectedCardIndex !== null && cards[selectedCardIndex] ? `Transactions for ${cards[selectedCardIndex].cardType} ending in ${cards[selectedCardIndex].last4}` : 'All Bank Transactions'}
                        </h3>

                        {displayedTransactions.length > 0 ? (
                            <UnifiedTransactionList
                                transactions={displayedTransactions}
                                selectedIds={new Set()}
                                onToggleSelect={() => { }}
                                onDelete={onDeleteTransaction}
                                onEdit={onEditTransaction}
                                onSplit={onSplitTransaction as any}
                                onViewDetails={onViewTransactionDetails}
                                groupBy="day"
                            />
                        ) : (
                            <div className="text-center py-12 text-slate-500">
                                <Search className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                <p>No transactions found for this selection.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BankDetailsModal;
