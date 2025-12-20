import { ExpenseItem, IncomeItem, GoalModel, LoanModel } from "@/lib/firestore";
import { startOfMonth, subMonths, endOfMonth, isSameMonth } from "date-fns";

export type InsightSeverity = 'info' | 'success' | 'warning' | 'critical';
export type InsightType = 'trend' | 'saving' | 'budget' | 'goal' | 'subscription' | 'networth' | 'info';

export interface Insight {
    id: string;
    type: InsightType;
    message: string;
    description?: string;
    severity: InsightSeverity;
    actionLabel?: string;
    actionLink?: string;
    score: number; // For sorting relevance
}

export const generateInsights = (
    expenses: ExpenseItem[],
    incomes: IncomeItem[],
    goals: GoalModel[],
    loans: LoanModel[]
): Insight[] => {
    const insights: Insight[] = [];
    const now = new Date();

    // Period Setups
    const currentMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Data Filtering
    const thisMonthExpenses = expenses.filter(e => e.date >= currentMonthStart);
    const lastMonthExpenses = expenses.filter(e => e.date >= lastMonthStart && e.date <= lastMonthEnd);

    const thisMonthIncome = incomes.filter(i => i.date >= currentMonthStart);

    // Totals
    const totalExpenseThisMonth = thisMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalExpenseLastMonth = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalIncomeThisMonth = thisMonthIncome.reduce((sum, i) => sum + i.amount, 0);

    // 1. Spending Trend Analyzer
    if (totalExpenseLastMonth > 0) {
        // Project current month expense if we are mid-month?
        // Let's stick to comparing simple totals so far, or daily average?
        // Simple comparison:
        if (totalExpenseThisMonth > totalExpenseLastMonth) {
            const percent = ((totalExpenseThisMonth - totalExpenseLastMonth) / totalExpenseLastMonth) * 100;
            insights.push({
                id: 'trend-spike',
                type: 'trend',
                message: `Spending Alert: Up ${percent.toFixed(0)}%`,
                description: `You've already spent more than last month (₹${totalExpenseThisMonth.toLocaleString()} vs ₹${totalExpenseLastMonth.toLocaleString()}). Check your discretionary spending.`,
                severity: 'warning',
                score: 80
            });
        }
    }

    // 2. Savings Rate Analyzer
    if (totalIncomeThisMonth > 0) {
        const savings = totalIncomeThisMonth - totalExpenseThisMonth;
        const rate = (savings / totalIncomeThisMonth) * 100;

        if (rate > 20) {
            insights.push({
                id: 'savings-good',
                type: 'saving',
                message: `Great Savings Month! 💰`,
                description: `You've saved ${rate.toFixed(0)}% of your income so far. Keep it up!`,
                severity: 'success',
                score: 50
            });
        } else if (rate < 0) {
            insights.push({
                id: 'savings-neg',
                type: 'saving',
                message: `Negative Cashflow 📉`,
                description: `You've spent ₹${Math.abs(savings).toLocaleString()} more than you earned. Watch out!`,
                severity: 'critical',
                score: 90
            });
        }
    }

    // 3. Subscription/Recurring Spy (Simple Heuristic: Same amount, different months)
    // Find expenses that happened last month and this month with same amount + roughly same description
    // This is computationally expensive-ish, but fine for < 1000 txns
    const recurringCandidates = new Map<string, number>();
    lastMonthExpenses.forEach(e => {
        const key = `${e.amount}-${e.category}`; // Simple key
        recurringCandidates.set(key, (recurringCandidates.get(key) || 0) + 1);
    });

    let potentialSubscriptions = 0;
    thisMonthExpenses.forEach(e => {
        const key = `${e.amount}-${e.category}`;
        if (recurringCandidates.has(key)) {
            potentialSubscriptions++;
        }
    });

    if (potentialSubscriptions > 0) {
        // Maybe just an info card?
        // insights.push({
        //     id: 'subs-detect',
        //     type: 'subscription',
        //     message: `${potentialSubscriptions} Recurring Charges`,
        //     description: "We detected recurring payments. make sure you still use these services!",
        //     severity: 'info',
        //     score: 30
        // });
        // Commented out to reduce noise unless we have specific "Zombie" logic (unused subs)
    }

    // 4. Net Worth / Loans (If data exists)
    const totalLoans = loans.reduce((sum, l) => sum + ((l.totalAmount || l.amount || 0) - (l.paidAmount || 0)), 0);
    if (totalLoans > 0) {
        insights.push({
            id: 'loan-alert',
            type: 'networth',
            message: `Debt Watch: ₹${totalLoans.toLocaleString()}`,
            description: "Focus on paying off high-interest loans first.",
            severity: 'info',
            score: 40
        });
    }

    // 5. Empty State / Onboarding
    if (insights.length === 0) {
        if (expenses.length === 0) {
            insights.push({
                id: 'welcome',
                type: 'info',
                message: "Welcome to Fiinny! 👋",
                description: "Start by adding your first transaction or syncing your bank SMS.",
                severity: 'info',
                score: 100
            });
        } else {
            insights.push({
                id: 'steady',
                type: 'info',
                message: "Everything looks steady. ⚓",
                description: "Your spending is consistent and nothing erratic detected.",
                severity: 'success',
                score: 10
            });
        }
    }

    return insights.sort((a, b) => b.score - a.score);
};
