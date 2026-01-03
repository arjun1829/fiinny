import { ExpenseItem } from "../firestore";

export class InferenceEngine {
    // ==================== INFERENCE DICTIONARIES ====================

    private static _keywordMap: Record<string, string[]> = {
        'travel': ['travel', 'uber', 'ola', 'rapido', 'metro', 'train', 'flight', 'bus', 'ticket', 'indigo', 'air india', 'irctc'],
        'food': ['swiggy', 'zomato', 'restaurant', 'cafe', 'coffee', 'starbucks', 'dominos', 'pizza', 'burger', 'lunch', 'dinner'],
        'shopping': ['amazon', 'flipkart', 'myntra', 'zara', 'h&m', 'decathlon', 'mall'],
        'grocery': ['blinkit', 'zepto', 'bigbasket', 'dmart', 'reliance fresh', 'milk', 'vegetables'],
        'medical': ['pharmacy', 'hospital', 'doctor', 'clinic', 'medicine', 'apollo', '1mg'],
        'entertainment': ['netflix', 'spotify', 'prime', 'pvr', 'inox', 'movie', 'cinema', 'game'],
    };

    private static _contextMap: Record<string, string[]> = {
        'office': ['work', 'commute', 'cab', 'metro', 'bus', 'lunch', 'coffee', 'uber', 'ola'],
        'vacation': ['trip', 'hotel', 'flight', 'resort', 'airbnb', 'sightseeing'],
    };

    // ==================== QUERY LOGIC ====================

    static inferByCategory(expenses: ExpenseItem[], targetCategory: string): ExpenseItem[] {
        const keywords = this._keywordMap[targetCategory.toLowerCase()] || [];
        if (keywords.length === 0) return [];

        return expenses.filter((e) => {
            if (e.category?.toLowerCase() === targetCategory.toLowerCase()) return true;

            const text = `${e.title || ''} ${e.comments || ''} ${(e.labels || []).join(' ')}`.toLowerCase();
            return keywords.some((k) => text.includes(k));
        });
    }

    static inferContext(expenses: ExpenseItem[], context: string): ExpenseItem[] {
        const keywords = this._contextMap[context.toLowerCase()];
        if (!keywords) return [];

        return expenses.filter((e) => {
            const text = `${e.title || ''} ${e.note || ''} ${e.comments || ''} ${(e.labels || []).join(' ')}`.toLowerCase();
            return keywords.some((k) => text.includes(k));
        });
    }

    static inferComplexIntent(expenses: ExpenseItem[], intent: string): ExpenseItem[] {
        if (intent === 'hospital_travel') {
            const medicalKeys = this._keywordMap['medical']!;
            const travelKeys = this._keywordMap['travel']!;

            return expenses.filter((e) => {
                const text = `${e.title || ''} ${e.note || ''} ${e.comments || ''} ${(e.labels || []).join(' ')}`.toLowerCase();
                const hasMedical = medicalKeys.some((k) => text.includes(k));
                const hasTravel = travelKeys.some((k) => text.includes(k)) || e.category?.toLowerCase() === 'travel';
                return hasMedical && hasTravel;
            });
        }
        return [];
    }
}
