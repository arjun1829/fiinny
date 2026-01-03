"use client";

interface BankFilterPillsProps {
    banks: string[];
    selectedBank: string | null;
    onBankChange: (bank: string | null) => void;
    showFriendsFilter?: boolean;
}

export default function BankFilterPills({
    banks,
    selectedBank,
    onBankChange,
    showFriendsFilter = false
}: BankFilterPillsProps) {
    const formatBankName = (bank: string): string => {
        return bank
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    return (
        <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 pb-2">
                {/* All Accounts */}
                <button
                    onClick={() => onBankChange(null)}
                    className={`
                        flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                        ${selectedBank === null
                            ? "bg-slate-900 text-white shadow-md"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }
                    `}
                >
                    All accounts
                </button>

                {/* Individual Banks */}
                {banks.map((bank) => (
                    <button
                        key={bank}
                        onClick={() => onBankChange(bank)}
                        className={`
                            flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                            ${selectedBank === bank
                                ? "bg-slate-900 text-white shadow-md"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }
                        `}
                    >
                        {formatBankName(bank)}
                    </button>
                ))}

                {/* Friends Filter */}
                {showFriendsFilter && (
                    <button
                        onClick={() => onBankChange("__FRIENDS__")}
                        className={`
                            flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                            ${selectedBank === "__FRIENDS__"
                                ? "bg-slate-900 text-white shadow-md"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }
                        `}
                    >
                        Friends
                    </button>
                )}
            </div>
        </div>
    );
}
