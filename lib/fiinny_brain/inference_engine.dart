import '../models/expense_item.dart';

class InferenceEngine {
  // ==================== INFERENCE DICTIONARIES ====================

  static const Map<String, List<String>> _keywordMap = {
    'travel': [
      'travel',
      'uber',
      'ola',
      'rapido',
      'metro',
      'train',
      'flight',
      'bus',
      'ticket',
      'indigo',
      'air india',
      'irctc'
    ],
    'food': [
      'swiggy',
      'zomato',
      'restaurant',
      'cafe',
      'coffee',
      'starbucks',
      'dominos',
      'pizza',
      'burger',
      'lunch',
      'dinner'
    ],
    'shopping': [
      'amazon',
      'flipkart',
      'myntra',
      'zara',
      'h&m',
      'decathlon',
      'mall'
    ],
    'grocery': [
      'blinkit',
      'zepto',
      'bigbasket',
      'dmart',
      'reliance fresh',
      'milk',
      'vegetables'
    ],
    'medical': [
      'pharmacy',
      'hospital',
      'doctor',
      'clinic',
      'medicine',
      'apollo',
      '1mg'
    ],
    'entertainment': [
      'netflix',
      'spotify',
      'prime',
      'pvr',
      'inox',
      'movie',
      'cinema',
      'game'
    ],
  };

  static const Map<String, List<String>> _contextMap = {
    'office': [
      'work',
      'commute',
      'cab',
      'metro',
      'bus',
      'lunch',
      'coffee',
      'uber',
      'ola'
    ],
    'vacation': ['trip', 'hotel', 'flight', 'resort', 'airbnb', 'sightseeing'],
  };

  // ==================== QUERY LOGIC ====================

  /// Infers expenses based on keyword matching in title, notes, or merchant name
  static List<ExpenseItem> inferByCategory(
      List<ExpenseItem> expenses, String targetCategory) {
    final keywords = _keywordMap[targetCategory.toLowerCase()] ?? [];
    if (keywords.isEmpty) {
      return [];
    }

    return expenses.where((e) {
      // If manually categorized, trust it (optional: or double check)
      if (e.category?.toLowerCase() == targetCategory.toLowerCase()) {
        return true;
      }

      final text =
          "${e.title ?? ''} ${e.note} ${e.labels.join(' ')}".toLowerCase();
      return keywords.any((k) => text.contains(k));
    }).toList();
  }

  /// Infers expenses based on context (e.g., "Hospital travel")
  static List<ExpenseItem> inferContext(
      List<ExpenseItem> expenses, String context) {
    final keywords = _contextMap[context.toLowerCase()];
    if (keywords == null) {
      return [];
    }

    return expenses.where((e) {
      final text =
          "${e.title ?? ''} ${e.note} ${e.labels.join(' ')}".toLowerCase();
      return keywords.any((k) => text.contains(k));
    }).toList();
  }

  /// Specific handler for "Hospital Travel" type queries
  static List<ExpenseItem> inferComplexIntent(
      List<ExpenseItem> expenses, String intent) {
    if (intent == 'hospital_travel') {
      // Must match MEDICAL keywords AND TRAVEL keywords
      final medicalKeys = _keywordMap['medical']!;
      final travelKeys = _keywordMap['travel']!;

      return expenses.where((e) {
        final text =
            "${e.title ?? ''} ${e.note} ${e.labels.join(' ')}".toLowerCase();
        final hasMedical = medicalKeys.any((k) => text.contains(k));
        final hasTravel = travelKeys.any((k) => text.contains(k)) ||
            e.category?.toLowerCase() == 'travel';
        return hasMedical && hasTravel;
      }).toList();
    }
    return [];
  }
}
