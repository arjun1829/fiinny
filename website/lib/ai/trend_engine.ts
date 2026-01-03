import { ExpenseItem } from "../firestore";

export class TrendEngine {
    // ==================== GROWTH ANALYSIS ====================

    static calculateGrowthRate(
        currentMonthExpenses: ExpenseItem[],
        lastMonthExpenses: ExpenseItem[]
    ): number {
        const currentTotal = TrendEngine._sum(currentMonthExpenses);
        const lastTotal = TrendEngine._sum(lastMonthExpenses);

        if (lastTotal === 0) return currentTotal > 0 ? 100.0 : 0.0;
        return ((currentTotal - lastTotal) / lastTotal) * 100;
    }

    static analyzeTrendDirection(growthRate: number): string {
        if (growthRate > 10) return "increasing rapidly 📈";
        if (growthRate > 0) return "increasing slightly ↗️";
        if (growthRate < -10) return "decreasing significantly 📉";
        if (growthRate < 0) return "decreasing slightly ↘️";
        return "stable ➡️";
    }

    // ==================== ANOMALY DETECTION ====================

    static detectAnomaly(
        currentExpenses: ExpenseItem[],
        historicalExpenses: ExpenseItem[],
        category?: string
    ): { isAnomaly: boolean; deviation?: number; average?: number; current?: number; message: string } {
        let current = currentExpenses;
        let history = historicalExpenses;

        if (category) {
            current = current.filter((e) => e.category?.toLowerCase() === category.toLowerCase());
            history = history.filter((e) => e.category?.toLowerCase() === category.toLowerCase());
        }

        const currentTotal = TrendEngine._sum(current);

        if (history.length === 0) return { isAnomaly: false, message: 'No history' };

        const months = new Set(history.map((e) => {
            const d = new Date(e.date);
            return `${d.getFullYear()}-${d.getMonth()}`;
        })).size;

        const historyTotal = TrendEngine._sum(history);
        const average = months > 0 ? historyTotal / months : 0.0;

        if (average === 0) return { isAnomaly: true, message: 'First time spending' };

        const deviation = ((currentTotal - average) / average) * 100;
        const isSpike = deviation > 50;

        return {
            isAnomaly: isSpike,
            deviation,
            average,
            current: currentTotal,
            message: isSpike
                ? `Unusual spike! ${deviation.toFixed(0)}% higher than average (₹${average.toFixed(0)})`
                : "Normal spending range",
        };
    }

    private static _sum(list: ExpenseItem[]): number {
        return list.reduce((sum, e) => sum + e.amount, 0);
    }
}
