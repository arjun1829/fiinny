export interface AffordabilityResult {
    canAffordNow: boolean;
    monthsToAfford: number;
    projectedDate: Date;
    monthlySavings: number;
    recommendation: string;
    riskLevel: 'safe' | 'moderate' | 'high';
}

export const analyzeAffordability = (
    itemCost: number,
    currentSavings: number,
    avgMonthlySavings: number
): AffordabilityResult => {
    // 1. Can afford now?
    if (currentSavings >= itemCost) {
        return {
            canAffordNow: true,
            monthsToAfford: 0,
            projectedDate: new Date(),
            monthlySavings: avgMonthlySavings,
            recommendation: "Rest easy! You have enough savings to buy this immediately.",
            riskLevel: 'safe'
        };
    }

    // 2. If savings are negative or zero, they can never afford it
    if (avgMonthlySavings <= 0) {
        return {
            canAffordNow: false,
            monthsToAfford: Infinity,
            projectedDate: new Date(8640000000000000), // Far future
            monthlySavings: avgMonthlySavings,
            recommendation: "Critical Warning: Your current monthly savings are zero or negative. You cannot afford this without cutting expenses first.",
            riskLevel: 'high'
        };
    }

    // 3. Calculate time to afford
    const deficit = itemCost - currentSavings;
    const months = Math.ceil(deficit / avgMonthlySavings);

    const projectedDate = new Date();
    projectedDate.setMonth(projectedDate.getMonth() + months);

    let riskLevel: 'safe' | 'moderate' | 'high' = 'safe';
    let recommendation = "";

    if (months <= 3) {
        riskLevel = 'safe';
        recommendation = `You're close! You can afford this by ${projectedDate.toLocaleString('default', { month: 'long' })}.`;
    } else if (months <= 6) {
        riskLevel = 'moderate';
        recommendation = `It's a stretch. You'll need to save for ${months} months. Consider finding a cheaper alternative or boosting income.`;
    } else {
        riskLevel = 'high';
        recommendation = `This is a major purchase requiring ${months} months of disciplined saving. Make sure you really need it.`;
    }

    return {
        canAffordNow: false,
        monthsToAfford: months,
        projectedDate,
        monthlySavings: avgMonthlySavings,
        recommendation,
        riskLevel
    };
};
