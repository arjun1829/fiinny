/**
 * Smart Parser Logic (Ported from Flutter)
 * 
 * Provides:
 * 1. Category & Subcategory detection (CategoryRules)
 * 2. Merchant/Counterparty extraction (CounterpartyExtractor)
 */

export interface CategoryGuess {
    category: string;
    subcategory: string;
    confidence: number;
    tags: string[];
}

export interface Counterparty {
    name: string;
    type: 'merchant' | 'person' | 'bank' | 'employer' | 'unknown';
    vpa?: string;
}

// --- Brand Map (Canonical) ---
const BRAND_MAP: { [key: string]: [string, string, string[]] } = {
    // OTT & Subscriptions
    'NETFLIX': ['Entertainment', 'OTT services', ['ott', 'subscription']],
    'AMAZON PRIME': ['Entertainment', 'OTT services', ['ott', 'subscription']],
    'PRIME VIDEO': ['Entertainment', 'OTT services', ['ott', 'subscription']],
    'HOTSTAR': ['Entertainment', 'OTT services', ['ott', 'subscription']],
    'DISNEY+ HOTSTAR': ['Entertainment', 'OTT services', ['ott', 'subscription']],
    'SPOTIFY': ['Entertainment', 'music', ['music', 'subscription']],
    'YOUTUBE PREMIUM': ['Entertainment', 'OTT services', ['ott', 'subscription']],
    'APPLE.COM/BILL': ['Entertainment', 'entertainment others', ['apple', 'subscription']],
    'APPLE': ['Entertainment', 'entertainment others', ['apple', 'subscription']],
    'ADOBE': ['Payments', 'Payment others', ['saas', 'subscription']],
    'MICROSOFT': ['Payments', 'Payment others', ['saas', 'subscription']],
    'OPENAI': ['Payments', 'Payment others', ['saas', 'subscription']],
    'CHATGPT': ['Payments', 'Payment others', ['saas', 'subscription']],

    // Telecom / Internet
    'JIO': ['Payments', 'Mobile bill', ['telecom']],
    'AIRTEL': ['Payments', 'Mobile bill', ['telecom']],
    'VI': ['Payments', 'Mobile bill', ['telecom']],
    'BSNL': ['Payments', 'Mobile bill', ['telecom']],
    'ACT FIBERNET': ['Payments', 'Bills / Utility', ['broadband']],

    // Food
    'ZOMATO': ['Food', 'food delivery', ['food']],
    'SWIGGY': ['Food', 'food delivery', ['food']],
    'DOMINOS': ['Food', 'restaurants', ['food']],
    'MCDONALD': ['Food', 'restaurants', ['food']],
    'KFC': ['Food', 'restaurants', ['food']],
    'STARBUCKS': ['Food', 'restaurants', ['food', 'coffee']],

    // Shopping & Groceries
    'BIGBASKET': ['Shopping', 'groceries and consumables', ['groceries']],
    'BLINKIT': ['Shopping', 'groceries and consumables', ['groceries']],
    'ZEPTO': ['Shopping', 'groceries and consumables', ['groceries']],
    'DMART': ['Shopping', 'groceries and consumables', ['groceries']],
    'AMAZON': ['Shopping', 'ecommerce', ['shopping']],
    'FLIPKART': ['Shopping', 'ecommerce', ['shopping']],
    'MYNTRA': ['Shopping', 'apparel', ['shopping']],
    'AJIO': ['Shopping', 'apparel', ['shopping']],
    'NYKAA': ['Shopping', 'personal care', ['shopping']],
    'MEESHO': ['Shopping', 'ecommerce', ['shopping']],

    // Travel
    'IRCTC': ['Travel', 'railways', ['travel']],
    'REDBUS': ['Travel', 'travel and tours', ['travel']],
    'MAKEMYTRIP': ['Travel', 'travel and tours', ['travel']],
    'INDIGO': ['Travel', 'airlines', ['travel']],
    'VISTARA': ['Travel', 'airlines', ['travel']],
    'AIR INDIA': ['Travel', 'airlines', ['travel']],
    'OLA': ['Travel', 'cab/bike services', ['mobility']],
    'UBER': ['Travel', 'cab/bike services', ['mobility']],
    'RAPIDO': ['Travel', 'cab/bike services', ['mobility']],

    // Investments
    'ZERODHA': ['Investments', 'Stocks / Brokerage', ['investments', 'brokerage']],
    'GROWW': ['Investments', 'Stocks / Brokerage', ['investments', 'brokerage']],
    'INDMONEY': ['Investments', 'Stocks / Brokerage', ['investments', 'brokerage']],
};

export class SmartParser {

    // --- Counterparty Extraction ---

    static extractMerchant(text: string, direction: 'debit' | 'credit'): Counterparty | null {
        // Regexes
        const reVpa = /([a-z0-9.\-_]+@[a-z]{2,})/i;
        const reBank = /\b(HDFC|ICICI|SBI|AXIS|KOTAK|YES|IDFC|IDBI|PNB|CANARA|INDUSIND)\b/i;

        let name = '';
        let vpa = reVpa.exec(text)?.[1];

        if (direction === 'debit') {
            const reTo = /\b(?:to|at|towards|paid to)\b\s*([-A-Za-z0-9&.'\s]+)/i;
            const reBene = /(?:Beneficiary|Payee)\s*[:\-]\s*([-A-Za-z0-9&.'\s]+)/i;

            name = reTo.exec(text)?.[1]?.trim() || reBene.exec(text)?.[1]?.trim() || '';
        } else {
            const reFrom = /\b(?:from|by)\b\s*([-A-Za-z0-9&.'\s]+)/i;
            name = reFrom.exec(text)?.[1]?.trim() || '';
        }

        // Fallback to VPA if no name found
        if (!name && vpa) name = vpa;

        if (!name) return null;

        name = this._cleanName(name);

        // Determine Type
        let type: Counterparty['type'] = 'merchant';
        if (vpa) type = 'person'; // Assume person for VPA unless brand matched later
        if (reBank.test(name)) type = 'bank';
        if (direction === 'credit' && !vpa && !reBank.test(name)) type = 'employer'; // Heuristic

        return { name, type, vpa };
    }

    private static _cleanName(s: string): string {
        let t = s.replace(/\s+/g, ' ').trim();
        t = t.replace(/^(for|the|a|an)\s+/i, '');
        // Remove common suffixes often captured by greedy regex
        t = t.replace(/\s+(on|via|using|through)\s+.*$/, '');
        return t.substring(0, 40).trim(); // Cap length
    }

    // --- Categorization ---

    static categorize(text: string, merchantName?: string): CategoryGuess {
        const combined = ((text || '') + ' ' + (merchantName || '')).toUpperCase();
        const lower = combined.toLowerCase();

        // 1. Brand Map
        for (const [key, value] of Object.entries(BRAND_MAP)) {
            if (combined.includes(key)) {
                return {
                    category: value[0],
                    subcategory: value[1],
                    confidence: 1.0,
                    tags: value[2]
                };
            }
        }

        // 2. Heuristics

        // Subscriptions
        if (/\b(auto[-\s]?debit|autopay|subscription|renew(al)?|membership)\b/i.test(lower)) {
            return { category: 'Payments', subcategory: 'Payment others', confidence: 0.9, tags: ['subscription'] };
        }

        // Food / Dining
        if (/\b(restaurant|dine|meal|kitchen|caf[eé]|coffee|bistro)\b/i.test(lower)) {
            return { category: 'Food', subcategory: 'restaurants', confidence: 0.75, tags: ['food'] };
        }

        // Travel
        if (/\b(flight|air(?:line)?|hotel|stay|booking\.com|cab|taxi|ride)\b/i.test(lower)) {
            if (/\b(cab|taxi|ride|ola|uber)\b/i.test(lower)) return { category: 'Travel', subcategory: 'cab/bike services', confidence: 0.8, tags: ['travel'] };
            return { category: 'Travel', subcategory: 'travel others', confidence: 0.7, tags: ['travel'] };
        }

        // Groceries
        if (/\b(grocery|kirana|mart|supermarket|fresh)\b/i.test(lower)) {
            return { category: 'Shopping', subcategory: 'groceries and consumables', confidence: 0.75, tags: ['groceries'] };
        }

        // Fuel
        if (/\b(petrol|diesel|fuel|pump|station)\b/i.test(lower)) {
            return { category: 'Payments', subcategory: 'Fuel', confidence: 0.9, tags: ['fuel'] };
        }

        // Default
        return { category: 'Others', subcategory: 'others', confidence: 0.1, tags: [] };
    }
}
