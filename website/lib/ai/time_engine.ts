import { ExpenseItem } from "../firestore";

export class TimeEngine {
    // ==================== TIME OF DAY ====================

    static filterByTimeOfDay(expenses: ExpenseItem[], period: string): ExpenseItem[] {
        return expenses.filter((e) => {
            const date = new Date(e.date);
            const hour = date.getHours();
            switch (period.toLowerCase()) {
                case 'morning':
                    return hour >= 5 && hour < 12; // 5 AM - 12 PM
                case 'afternoon':
                    return hour >= 12 && hour < 17; // 12 PM - 5 PM
                case 'evening':
                    return hour >= 17 && hour < 22; // 5 PM - 10 PM
                case 'night':
                    return hour >= 22 || hour < 5; // 10 PM - 5 AM
                case 'late night':
                    return hour >= 0 && hour < 4; // 12 AM - 4 AM
                default:
                    return false;
            }
        });
    }

    // ==================== WEEKEND / WEEKDAY ====================

    static filterByDayType(expenses: ExpenseItem[], isWeekend: boolean): ExpenseItem[] {
        return expenses.filter((e) => {
            const date = new Date(e.date);
            const day = date.getDay(); // 0 = Sun, 6 = Sat
            const isSatSun = day === 0 || day === 6;
            return isWeekend ? isSatSun : !isSatSun;
        });
    }

    static filterBySpecificDay(expenses: ExpenseItem[], dayName: string): ExpenseItem[] {
        const dayMap: Record<string, number> = {
            'monday': 1, 'mon': 1,
            'tuesday': 2, 'tue': 2,
            'wednesday': 3, 'wed': 3,
            'thursday': 4, 'thu': 4,
            'friday': 5, 'fri': 5,
            'saturday': 6, 'sat': 6,
            'sunday': 0, 'sun': 0, // JS: Sunday is 0
        };

        const targetDay = dayMap[dayName.toLowerCase()];
        if (targetDay === undefined) return [];

        return expenses.filter((e) => new Date(e.date).getDay() === targetDay);
    }

    // ==================== SEASONS ====================

    static filterBySeason(expenses: ExpenseItem[], season: string): ExpenseItem[] {
        return expenses.filter((e) => {
            const date = new Date(e.date);
            const month = date.getMonth(); // 0 = Jan, 11 = Dec
            // Adjust months (+1 to match 1-based logic from Dart if comparing strict numbers, but JS is 0-based)
            // Dart: Jan=1. JS: Jan=0.
            // Dart Summer: 3,4,5 (Mar, Apr, May). JS: 2,3,4.

            switch (season.toLowerCase()) {
                case 'summer':
                    return month >= 2 && month <= 4; // Mar - May
                case 'monsoon':
                case 'rain':
                    return month >= 5 && month <= 8; // Jun - Sep
                case 'winter':
                    return month >= 10 || month <= 1; // Nov - Feb
                default:
                    return false;
            }
        });
    }
}
