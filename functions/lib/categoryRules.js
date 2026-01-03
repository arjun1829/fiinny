// Ported from lib/services/categorization/category_rules.dart
// Comprehensive categorization rules for Indian expenses
export class CategoryRules {
    // Brand/keyword -> [category, subcategory, tags]
    static brandMap = {
        // Food & Beverages
        'ZOMATO': ['Food', 'food delivery', ['food']],
        'SWIGGY': ['Food', 'food delivery', ['food']],
        'DOMINOS': ['Food', 'restaurants', ['food']],
        'MCDONALD': ['Food', 'restaurants', ['food']],
        'KFC': ['Food', 'restaurants', ['food']],
        'STARBUCKS': ['Food', 'restaurants', ['food']],
        'KARACHI BAKERY': ['Food', 'restaurants', ['food']],
        'ASHOK CHAVA': ['Food', 'restaurants', ['food']],
        // Groceries
        'BIGBASKET': ['Shopping', 'groceries and consumables', ['groceries']],
        'BLINKIT': ['Shopping', 'groceries and consumables', ['groceries']],
        'ZEPTO': ['Shopping', 'groceries and consumables', ['groceries']],
        'DMART': ['Shopping', 'groceries and consumables', ['groceries']],
        // Shopping
        'AMAZON': ['Shopping', 'ecommerce', ['shopping']],
        'FLIPKART': ['Shopping', 'ecommerce', ['shopping']],
        'MYNTRA': ['Shopping', 'apparel', ['shopping']],
        // Travel
        'IRCTC': ['Travel', 'railways', ['travel']],
        'OLA': ['Travel', 'cab/bike services', ['mobility']],
        'UBER': ['Travel', 'cab/bike services', ['mobility']],
        'RAPIDO': ['Travel', 'cab/bike services', ['mobility']],
        // Entertainment
        'NETFLIX': ['Entertainment', 'OTT services', ['ott', 'subscription']],
        'AMAZON PRIME': ['Entertainment', 'OTT services', ['ott', 'subscription']],
        'HOTSTAR': ['Entertainment', 'OTT services', ['ott', 'subscription']],
        // Fuel
        'HPCL': ['Payments', 'Fuel', ['fuel']],
        'BPCL': ['Payments', 'Fuel', ['fuel']],
        'IOCL': ['Payments', 'Fuel', ['fuel']],
    };
    static categorizeMerchant(text, merchantKey) {
        const combined = (text + ' ' + (merchantKey || '')).trim();
        const upper = combined.toUpperCase();
        const lower = combined.toLowerCase();
        // 1) Direct brand hits
        for (const [brand, [category, subcategory, tags]] of Object.entries(this.brandMap)) {
            if (upper.includes(brand)) {
                return { category, subcategory, confidence: 1.0, tags };
            }
        }
        // 2) Keyword-based categorization
        // Food keywords (including chai, coffee, tea, etc.)
        if (this.hasPattern(lower, /\b(chai|coffee|tea|cafe|restaurant|dine|meal|kitchen|bistro|food|breakfast|lunch|dinner|snack)\b/)) {
            if (this.hasPattern(lower, /\b(zomato|swiggy|delivery)\b/)) {
                return { category: 'Food', subcategory: 'food delivery', confidence: 0.8, tags: ['food'] };
            }
            return { category: 'Food', subcategory: 'restaurants', confidence: 0.75, tags: ['food'] };
        }
        // Groceries
        if (this.hasPattern(lower, /\b(grocery|kirana|mart|fresh|supermarket|vegetables|fruits)\b/)) {
            return { category: 'Shopping', subcategory: 'groceries and consumables', confidence: 0.75, tags: ['groceries'] };
        }
        // Travel
        if (this.hasPattern(lower, /\b(travel|flight|train|bus|cab|taxi|uber|ola|hotel|booking)\b/)) {
            if (this.hasPattern(lower, /\b(cab|taxi|uber|ola|rapido)\b/)) {
                return { category: 'Travel', subcategory: 'cab/bike services', confidence: 0.75, tags: ['travel'] };
            }
            if (this.hasPattern(lower, /\b(train|railway|irctc)\b/)) {
                return { category: 'Travel', subcategory: 'railways', confidence: 0.8, tags: ['travel'] };
            }
            return { category: 'Travel', subcategory: 'travel others', confidence: 0.7, tags: ['travel'] };
        }
        // Shopping
        if (this.hasPattern(lower, /\b(shopping|amazon|flipkart|myntra|clothes|apparel|electronics)\b/)) {
            return { category: 'Shopping', subcategory: 'ecommerce', confidence: 0.75, tags: ['shopping'] };
        }
        // Entertainment
        if (this.hasPattern(lower, /\b(movie|cinema|netflix|prime|ott|entertainment)\b/)) {
            return { category: 'Entertainment', subcategory: 'entertainment others', confidence: 0.7, tags: ['entertainment'] };
        }
        // Medical
        if (this.hasPattern(lower, /\b(medical|medicine|pharmacy|hospital|doctor|clinic)\b/)) {
            return { category: 'Healthcare', subcategory: 'medicine/pharma', confidence: 0.75, tags: ['health'] };
        }
        // Bills & Utilities
        if (this.hasPattern(lower, /\b(bill|electricity|water|gas|recharge|mobile|internet)\b/)) {
            return { category: 'Payments', subcategory: 'Bills / Utility', confidence: 0.7, tags: ['utilities'] };
        }
        // Fuel
        if (this.hasPattern(lower, /\b(petrol|diesel|fuel|gas station)\b/)) {
            return { category: 'Payments', subcategory: 'Fuel', confidence: 0.8, tags: ['fuel'] };
        }
        // Transport (general)
        if (this.hasPattern(lower, /\b(transport|metro|bus|auto)\b/)) {
            return { category: 'Travel', subcategory: 'travel others', confidence: 0.6, tags: ['transport'] };
        }
        // Fallback
        return { category: 'Others', subcategory: 'others', confidence: 0.3, tags: [] };
    }
    static hasPattern(text, pattern) {
        return pattern.test(text);
    }
}
//# sourceMappingURL=categoryRules.js.map