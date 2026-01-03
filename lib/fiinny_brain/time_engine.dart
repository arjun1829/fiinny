import '../models/expense_item.dart';

class TimeEngine {
  // ==================== TIME OF DAY ====================

  static List<ExpenseItem> filterByTimeOfDay(List<ExpenseItem> expenses, String period) {
    return expenses.where((e) {
      final hour = e.date.hour;
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
    }).toList();
  }

  // ==================== WEEKEND / WEEKDAY ====================

  static List<ExpenseItem> filterByDayType(List<ExpenseItem> expenses, {required bool isWeekend}) {
    return expenses.where((e) {
      final weekday = e.date.weekday; // 1 = Mon, 7 = Sun
      final isSatSun = weekday == 6 || weekday == 7;
      return isWeekend ? isSatSun : !isSatSun;
    }).toList();
  }

  static List<ExpenseItem> filterBySpecificDay(List<ExpenseItem> expenses, String dayName) {
    final dayMap = {
      'monday': 1, 'mon': 1,
      'tuesday': 2, 'tue': 2,
      'wednesday': 3, 'wed': 3,
      'thursday': 4, 'thu': 4,
      'friday': 5, 'fri': 5,
      'saturday': 6, 'sat': 6,
      'sunday': 7, 'sun': 7,
    };
    
    final targetDay = dayMap[dayName.toLowerCase()];
    if (targetDay == null) return [];

    return expenses.where((e) => e.date.weekday == targetDay).toList();
  }

  // ==================== SEASONS ====================

  static List<ExpenseItem> filterBySeason(List<ExpenseItem> expenses, String season) {
    return expenses.where((e) {
      final month = e.date.month;
      switch (season.toLowerCase()) {
        case 'summer':
          return month >= 3 && month <= 5; // Mar - May (India)
        case 'monsoon':
        case 'rain':
          return month >= 6 && month <= 9; // Jun - Sep
        case 'winter':
          return month >= 11 || month <= 2; // Nov - Feb
        default:
          return false;
      }
    }).toList();
  }
}
