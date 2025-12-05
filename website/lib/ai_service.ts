import { ExpenseItem, IncomeItem } from "./firestore";

export interface DashboardData {
    expenses: ExpenseItem[];
    incomes: IncomeItem[];
}

export const processQuery = async (query: string, data: DashboardData): Promise<string> => {
    const lowerQuery = query.toLowerCase();

    // Simulate "thinking" delay for realism
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
        // 1. Date Parsing
        const dateRange = parseDateRange(lowerQuery);

        // Filter data based on date range
        const filteredExpenses = data.expenses.filter(e =>
            e.date >= dateRange.start && e.date <= dateRange.end
        );
        const filteredIncomes = data.incomes.filter(i =>
            i.date >= dateRange.start && i.date <= dateRange.end
        );

        // 2. Intent Recognition & Execution

        // Intent: Highest Category Spend
        if (lowerQuery.includes("highest") && lowerQuery.includes("category") && (lowerQuery.includes("spend") || lowerQuery.includes("expense"))) {
            if (filteredExpenses.length === 0) {
                return `I couldn't find any expenses for ${dateRange.label}.`;
            }

            const categoryTotals: Record<string, number> = {};
            filteredExpenses.forEach(e => {
                const cat = e.category || "Uncategorized";
                categoryTotals[cat] = (categoryTotals[cat] || 0) + e.amount;
            });

            let maxCategory = "";
            let maxAmount = -1;

            Object.entries(categoryTotals).forEach(([cat, amount]) => {
                if (amount > maxAmount) {
                    maxAmount = amount;
                    maxCategory = cat;
                }
            });

            return `Your highest spending category for ${dateRange.label} was **${maxCategory}** with a total of **₹${maxAmount.toLocaleString()}**.`;
        }

        // Intent: Total Spend
        if (lowerQuery.includes("total") && (lowerQuery.includes("spend") || lowerQuery.includes("expense"))) {
            const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
            return `You spent a total of **₹${total.toLocaleString()}** in ${dateRange.label}.`;
        }

        // Intent: Total Income
        if (lowerQuery.includes("total") && (lowerQuery.includes("income") || lowerQuery.includes("earned"))) {
            const total = filteredIncomes.reduce((sum, i) => sum + i.amount, 0);
            return `You earned a total of **₹${total.toLocaleString()}** in ${dateRange.label}.`;
        }

        // Intent: Recent Transactions
        if (lowerQuery.includes("recent") || lowerQuery.includes("last transaction")) {
            const recent = [...filteredExpenses].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 3);
            if (recent.length === 0) return `No recent transactions found for ${dateRange.label}.`;

            const list = recent.map(e => `- ${e.category}: ₹${e.amount}`).join("\n");
            return `Here are your recent transactions for ${dateRange.label}:\n${list}`;
        }

        // Fallback / Help
        return "I can help you analyze your finances! Try asking:\n- \"Highest category spend for Nov month\"\n- \"Total spend this month\"\n- \"Total income in 2024\"";

    } catch (error) {
        console.error("AI Processing Error:", error);
        return "I'm having trouble processing that request right now. Please try again.";
    }
};

// Helper: Parse Date Range from Query
const parseDateRange = (query: string): { start: Date, end: Date, label: string } => {
    const now = new Date();
    const currentYear = now.getFullYear();

    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

    // Check for specific month names
    for (let i = 0; i < months.length; i++) {
        if (query.includes(months[i])) {
            const start = new Date(currentYear, i, 1);
            const end = new Date(currentYear, i + 1, 0, 23, 59, 59);
            return { start, end, label: new Date(currentYear, i).toLocaleString('default', { month: 'long' }) };
        }
    }

    // "This month"
    if (query.includes("this month")) {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        return { start, end, label: "this month" };
    }

    // "Last month"
    if (query.includes("last month")) {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        return { start, end, label: "last month" };
    }

    // "This year" or "2024" (simple year check)
    if (query.includes("this year") || query.includes("2024")) { // Hardcoded 2024 for simplicity based on context, better to regex
        const start = new Date(currentYear, 0, 1);
        const end = new Date(currentYear, 11, 31, 23, 59, 59);
        return { start, end, label: "this year" };
    }

    // Default: This Month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { start, end, label: "this month (default)" };
};
