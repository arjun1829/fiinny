/**
 * Subscription & Hidden Charge Detector (TypeScript Port)
 * Mirrors: lib/services/analytics/subscription_detector.dart
 */

export interface SubscriptionModel {
    name: string;
    amount: number;
    nextDueDate: Date;
    daysRemaining: number;
    icon?: string;
}

export interface HiddenChargeModel {
    description: string;
    amount: number;
    date: Date;
}

const SUBSCRIPTION_KEYWORDS = [
    'netflix', 'spotify', 'youtube premium', 'prime video', 'hotstar',
    'apple music', 'icloud', 'google one', 'dropbox', 'linkedin',
    'tinder', 'bumble', 'hbo', 'disney+', 'hulu', 'chatgpt', 'openai',
    'aws', 'adobe'
];

const HIDDEN_CHARGE_KEYWORDS = [
    'forex markup', 'convenience fee', 'surcharge', 'processing fee',
    'late fee', 'maintenance charge', 'annual fee', 'atm fee',
    'international transaction fee'
];



export class SubscriptionDetector {

    static detectSubscriptions(expenses: any[]): SubscriptionModel[] {
        // expenses = { title, amount, date (Date object) }
        const latestTx: { [key: string]: any } = {};

        for (const e of expenses) {
            const lower = (e.title || e.note || '').toLowerCase();
            const match = SUBSCRIPTION_KEYWORDS.find(k => lower.includes(k));

            if (match) {
                if (!latestTx[match] || e.date > latestTx[match].date) {
                    latestTx[match] = e;
                }
            }
        }

        return Object.entries(latestTx).map(([key, tx]) => {
            const nextDue = new Date(tx.date);
            nextDue.setMonth(nextDue.getMonth() + 1); // Assume monthly

            const daysRemaining = Math.ceil((nextDue.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            return {
                name: key.charAt(0).toUpperCase() + key.slice(1),
                amount: tx.amount,
                nextDueDate: nextDue,
                daysRemaining: daysRemaining
            };
        });
    }

    static detectHiddenCharges(expenses: any[]): HiddenChargeModel[] {
        const charges: HiddenChargeModel[] = [];

        for (const e of expenses) {
            const lower = (e.title || e.note || '').toLowerCase();
            if (HIDDEN_CHARGE_KEYWORDS.some(k => lower.includes(k))) {
                charges.push({
                    description: e.title || 'Unknown Fee',
                    amount: e.amount,
                    date: e.date
                });
            }
        }

        return charges;
    }

    static analyzeTransaction(text: string): { isSubscription: boolean; isHiddenCharge: boolean; subscriptionName?: string } {
        const lower = text.toLowerCase();

        const subMatch = SUBSCRIPTION_KEYWORDS.find(k => lower.includes(k));
        const hiddenMatch = HIDDEN_CHARGE_KEYWORDS.some(k => lower.includes(k));

        return {
            isSubscription: !!subMatch,
            subscriptionName: subMatch ? subMatch.charAt(0).toUpperCase() + subMatch.slice(1) : undefined,
            isHiddenCharge: hiddenMatch
        };
    }
}
