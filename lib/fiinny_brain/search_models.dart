import '../models/expense_item.dart';

/// Criteria for fuzzy expense search
class SearchCriteria {
  final List<String>? categories;
  final List<String>? subcategories;
  final List<String>? labels;
  final String? textQuery;      // Search in title, note, comments
  final DateTime? from;
  final DateTime? to;
  final double? minAmount;
  final double? maxAmount;
  final String? instrument;     // UPI, Cash, Card
  final List<String>? friendIds; // Filter by friends
  final String? groupId;        // Filter by group

  const SearchCriteria({
    this.categories,
    this.subcategories,
    this.labels,
    this.textQuery,
    this.from,
    this.to,
    this.minAmount,
    this.maxAmount,
    this.instrument,
    this.friendIds,
    this.groupId,
  });

  /// Create criteria for travel expenses
  factory SearchCriteria.travel({DateTime? from, DateTime? to}) {
    return SearchCriteria(
      categories: ['Travel', 'Flight', 'Hotel', 'Transport'],
      from: from,
      to: to,
    );
  }

  /// Create criteria for commute expenses
  factory SearchCriteria.commute({
    required String mode, // metro, bus, cab
    DateTime? from,
    DateTime? to,
  }) {
    return SearchCriteria(
      categories: ['Transport'],
      subcategories: [mode],
      from: from,
      to: to,
    );
  }

  /// Create criteria from natural language context
  factory SearchCriteria.fromContext({
    List<String>? categories,
    List<String>? labels,
    String? textQuery,
    DateTime? from,
    DateTime? to,
  }) {
    return SearchCriteria(
      categories: categories,
      labels: labels,
      textQuery: textQuery,
      from: from,
      to: to,
    );
  }
}

/// Result of fuzzy search with metadata
class SearchResult {
  final List<ExpenseItem> expenses;
  final double totalAmount;
  final int count;
  final Map<String, double> categoryBreakdown;
  final Map<String, int> categoryCount;
  final DateTime? earliestDate;
  final DateTime? latestDate;

  const SearchResult({
    required this.expenses,
    required this.totalAmount,
    required this.count,
    required this.categoryBreakdown,
    required this.categoryCount,
    this.earliestDate,
    this.latestDate,
  });

  factory SearchResult.fromExpenses(List<ExpenseItem> expenses) {
    if (expenses.isEmpty) {
      return const SearchResult(
        expenses: [],
        totalAmount: 0,
        count: 0,
        categoryBreakdown: {},
        categoryCount: {},
      );
    }

    double total = 0;
    final categoryBreakdown = <String, double>{};
    final categoryCount = <String, int>{};
    DateTime? earliest;
    DateTime? latest;

    for (final expense in expenses) {
      total += expense.amount;
      
      final category = expense.category ?? 'Uncategorized';
      categoryBreakdown[category] = (categoryBreakdown[category] ?? 0) + expense.amount;
      categoryCount[category] = (categoryCount[category] ?? 0) + 1;

      if (earliest == null || expense.date.isBefore(earliest)) {
        earliest = expense.date;
      }
      if (latest == null || expense.date.isAfter(latest)) {
        latest = expense.date;
      }
    }

    return SearchResult(
      expenses: expenses,
      totalAmount: total,
      count: expenses.length,
      categoryBreakdown: categoryBreakdown,
      categoryCount: categoryCount,
      earliestDate: earliest,
      latestDate: latest,
    );
  }
}
