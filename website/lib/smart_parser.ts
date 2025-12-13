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
            // Use word boundary for short keys to avoid "VI" matching "Movies"
            const regex = new RegExp(`\\b${key}\\b`, 'i');
            if (regex.test(combined)) {
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
        if (/\b(restaurant|dine|meal|kitchen|caf[eé]|coffee|bistro|lunch|dinner|breakfast|snacks?|food)\b/i.test(lower)) {
            return { category: 'Food', subcategory: 'restaurants', confidence: 0.75, tags: ['food'] };
        }

        // Travel
        if (/\b(flight|air(?:line)?|hotel|stay|booking\.com|cab|taxi|ride)\b/i.test(lower)) {
            if (/\b(cab|taxi|ride|ola|uber)\b/i.test(lower)) return { category: 'Travel', subcategory: 'cab/bike services', confidence: 0.8, tags: ['travel'] };
            return { category: 'Travel', subcategory: 'travel others', confidence: 0.7, tags: ['travel'] };
        }

        // Entertainment
        if (/\b(movies?|cinemas?|films?|theatres?|shows?|tickets?)\b/i.test(lower)) {
            return { category: 'Entertainment', subcategory: 'entertainment others', confidence: 0.8, tags: ['entertainment'] };
        }

        // Groceries
        if (/\b(grocery|groceries|kirana|mart|supermarket|fresh|vegetables?|fruits?)\b/i.test(lower)) {
            return { category: 'Shopping', subcategory: 'groceries and consumables', confidence: 0.75, tags: ['groceries'] };
        }

        // Fuel
        if (/\b(petrol|diesel|fuel|pump|station)\b/i.test(lower)) {
            return { category: 'Payments', subcategory: 'Fuel', confidence: 0.9, tags: ['fuel'] };
        }

        // Default
        return { category: 'Others', subcategory: 'others', confidence: 0.1, tags: [] };
    }
    // --- Natural Language Parsing (Phase 1) ---

    /**
     * Parses a simple natural language string into a structured transaction guess.
     * Examples:
     * - "Lunch 200" -> { category: 'Food', amount: 200, ... }
     * - "Uber 450" -> { category: 'Travel', amount: 450, ... }
     * - "Salary 50000" -> { type: 'income', amount: 50000, ... }
     * - "Paid 500 for Movies" -> { category: 'Entertainment', amount: 500, ... }
     */
    static parseNaturalLanguage(text: string): {
        amount: number;
        type: 'expense' | 'income';
        category: string;
        subcategory: string;
        description: string;
        confidence: number;
        date?: string;
    } | null {
        const t = text.trim();
        if (!t) return null;

        // 1. Extract Amount
        // Added \b to ensure 'k' or 'l' aren't start of another word (like 'last')
        const amountRegex = /(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)(?:\s*(?:k|l)\b)?/i;
        const match = t.match(amountRegex);

        if (!match) return null; // No amount found, can't be a transaction

        let amountStr = match[1].replace(/,/g, '');
        let amount = parseFloat(amountStr);

        // Handle 'k' (thousand) or 'l' (lakh) suffix
        if (match[0].toLowerCase().includes('k')) amount *= 1000;
        else if (match[0].toLowerCase().includes('l')) amount *= 100000;

        // 2. Extract Description (remove amount from string)
        let description = t.replace(match[0], '').trim();

        // Cleanup common prepositions if they are at the start
        description = description.replace(/^(for|on|at|to)\s+/i, '');
        // Cleanup "paid" or "spent" prefixes
        description = description.replace(/^(paid|spent|bought|received|got)\s+/i, '');

        if (!description) description = "Unspecified Transaction";

        // 3. Determine Type (Income vs Expense)
        let type: 'expense' | 'income' = 'expense';
        if (/\b(income|salary|earned|received|credit|deposit)\b/i.test(t)) {
            type = 'income';
        }

        // 4. Guess Category (Refined logic)
        let categoryGuess = this.categorize(description);

        // Special handling for "Salary"
        if (type === 'income' && description.toLowerCase().includes('salary')) {
            return {
                amount,
                type: 'income',
                category: 'Income',
                subcategory: 'Salary',
                description: 'Salary Credit',
                confidence: 1.0
            };
        }

        // 5. Extract Date (Relative)
        let date = new Date();
        const lowerT = t.toLowerCase();

        if (lowerT.includes('yesterday')) {
            date.setDate(date.getDate() - 1);
            description = description.replace(/yesterday/i, '').trim();
        } else if (lowerT.match(/last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)) {
            const match = lowerT.match(/last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
            if (match) {
                const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
                const targetDay = days.indexOf(match[1]);
                const currentDay = date.getDay();
                let diff = currentDay - targetDay;
                if (diff <= 0) diff += 7; // Ensure looking back
                date.setDate(date.getDate() - diff);
                // Fix: Use Regex for case-insensitive replacement
                const dateRegex = new RegExp(match[0], 'i');
                description = description.replace(dateRegex, '').trim();
            }
        }

        // Cleanup trailing prepositions after removing date
        description = description.replace(/\s+(on|at|for)$/, '');

        return {
            amount,
            type,
            category: categoryGuess.category,
            subcategory: categoryGuess.subcategory,
            description: this._capitalize(description),
            confidence: categoryGuess.confidence,
            date: date.toISOString()
        };
    }

    private static _capitalize(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
}
