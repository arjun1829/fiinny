
export const BANK_ASSETS: Record<string, string> = {
    'hdfc': '/assets/banks/hdfc.png',
    'sbi': '/assets/banks/sbi.png',
    'icici': '/assets/banks/icici.png',
    'axis': '/assets/banks/axis.png',
    'kotak': '/assets/banks/kotak.png',
    'amex': '/assets/banks/amex.png',
    'visa': '/assets/banks/visa.png',
    'mastercard': '/assets/banks/mastercard.png',
    'rupay': '/assets/banks/rupay.png',
};

export const normalizeBankName = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes('hdfc')) return 'hdfc';
    if (lower.includes('sbi') || lower.includes('state bank')) return 'sbi';
    if (lower.includes('icici')) return 'icici';
    if (lower.includes('axis')) return 'axis';
    if (lower.includes('kotak')) return 'kotak';
    if (lower.includes('amex') || lower.includes('american express')) return 'amex';
    return 'default';
};

export const getBankLogo = (bankName: string): string | undefined => {
    const key = normalizeBankName(bankName);
    return BANK_ASSETS[key];
};

export interface InferredCard {
    bankName: string;
    cardType: string; // 'Credit Card', 'Debit Card', 'UPI', etc.
    last4: string;
    network?: string; // Visa, Mastercard, RuPay
    logoUrl?: string;
    source: 'extracted' | 'manual';
}

export interface BankStats {
    totalTxCount: number;
    totalAmount: number;
    creditCount: number;
    debitCount: number;
    totalCredit: number;
    totalDebit: number;
}

export interface BankGroup {
    bankName: string;
    cards: InferredCard[];
    stats: BankStats;
    logoUrl?: string;
}

export const aggregateBanksFromTransactions = (expenses: any[], incomes: any[]): BankGroup[] => {
    const banksMap = new Map<string, BankGroup>();

    const getOrInitBank = (bankName: string) => {
        const normName = normalizeBankName(bankName);
        // Use normalized name for grouping key, but keep original for display if needed
        // Actually, let's use the first encountered bankName as the display name? 
        // Or better, capitalize the normalized name for consistency.
        const key = normName;

        if (!banksMap.has(key)) {
            banksMap.set(key, {
                bankName: bankName, // Keep original casing of first occurrence
                cards: [],
                logoUrl: getBankLogo(bankName),
                stats: {
                    totalTxCount: 0,
                    totalAmount: 0,
                    creditCount: 0,
                    debitCount: 0,
                    totalCredit: 0,
                    totalDebit: 0
                }
            });
        }
        return banksMap.get(key)!;
    };

    // Helper to add card if not exists
    const addCardToBank = (bankGroup: BankGroup, item: any) => {
        const last4 = item.cardLast4 || 'XXXX';
        const type = item.cardType || 'Unknown';
        const cardKey = `${last4}-${type}`;

        if (!bankGroup.cards.find(c => `${c.last4}-${c.cardType}` === cardKey)) {
            bankGroup.cards.push({
                bankName: bankGroup.bankName,
                cardType: type,
                last4: last4,
                network: item.instrumentNetwork,
                logoUrl: bankGroup.logoUrl,
                source: 'extracted'
            });
        }
    };

    // Process Expenses (Debit)
    expenses.forEach(e => {
        if (!e.issuerBank) return;
        const group = getOrInitBank(e.issuerBank);
        addCardToBank(group, e);

        group.stats.totalTxCount++;
        group.stats.debitCount++;
        group.stats.totalAmount += e.amount;
        group.stats.totalDebit += e.amount;
    });

    // Process Incomes (Credit)
    incomes.forEach(i => {
        if (!i.issuerBank) return;
        const group = getOrInitBank(i.issuerBank);
        addCardToBank(group, i);

        group.stats.totalTxCount++;
        group.stats.creditCount++;
        group.stats.totalAmount += i.amount;
        group.stats.totalCredit += i.amount;
    });

    return Array.from(banksMap.values());
};

// Keep the old function for backward compat if needed, or just remove it if we are fully switching.
// I'll keep the types but replace the logic.

