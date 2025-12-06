import React from 'react';

interface PartnerRingSummaryProps {
    credit: number;
    debit: number;
    ringSize?: number;
    strokeWidth?: number;
    totalAmount?: number;
}

export const PartnerRingSummary: React.FC<PartnerRingSummaryProps> = ({
    credit,
    debit,
    ringSize = 140,
    strokeWidth = 15,
    totalAmount,
}) => {
    const total = totalAmount ?? (credit + debit);
    const incomePercent = total > 0 ? (credit / total) : 0;
    const expensePercent = total > 0 ? (debit / total) : 0;

    const radius = (ringSize - strokeWidth) / 2;
    const center = ringSize / 2;
    const circumference = 2 * Math.PI * radius;

    // Arc calculations
    // -90 degrees is the top. 
    // SVG circle starts at 3 o'clock (0 degrees). We rotate -90 to start at top.

    const incomeOffset = circumference - (incomePercent * circumference);
    const expenseOffset = circumference - (expensePercent * circumference);

    // Income starts at -90deg
    // Expense starts after income. 
    // SVG stroke-dasharray/offset logic:
    // We can overlay two circles.

    // Income Arc
    const incomeRotation = -90;

    // Expense Arc: Starts where income ends. 
    // Income ends at: -90 + (incomePercent * 360)
    const expenseRotation = -90 + (incomePercent * 360);

    return (
        <div style={{ width: ringSize, height: ringSize, position: 'relative' }}>
            <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
                {/* Background Track */}
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="#e5e7eb" // slate-200
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />

                {/* Income Arc (Green) */}
                {incomePercent > 0 && (
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke="#22c55e" // green-500
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={incomeOffset}
                        transform={`rotate(${incomeRotation} ${center} ${center})`}
                    />
                )}

                {/* Expense Arc (Red) */}
                {expensePercent > 0 && (
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke="#ef4444" // red-500
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={expenseOffset}
                        transform={`rotate(${expenseRotation} ${center} ${center})`}
                    />
                )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-slate-800">
                    ₹{total.toFixed(0)}
                </span>
            </div>
        </div>
    );
};
