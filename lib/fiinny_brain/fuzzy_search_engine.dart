import '../models/expense_item.dart';
import 'search_models.dart';
import 'entity_resolver.dart';

class FuzzySearchEngine {
  // ==================== MAIN SEARCH METHOD ====================
  
  /// Context-aware expense search with fuzzy matching
  static SearchResult search(
    List<ExpenseItem> expenses,
    SearchCriteria criteria,
  ) {
    var filtered = expenses;

    // Date range filter
    if (criteria.from != null) {
      filtered = filtered.where((e) => e.date.isAfter(criteria.from!) || 
                                       e.date.isAtSameMomentAs(criteria.from!)).toList();
    }
    if (criteria.to != null) {
      filtered = filtered.where((e) => e.date.isBefore(criteria.to!) || 
                                       e.date.isAtSameMomentAs(criteria.to!)).toList();
    }

    // Amount range filter
    if (criteria.minAmount != null) {
      filtered = filtered.where((e) => e.amount >= criteria.minAmount!).toList();
    }
    if (criteria.maxAmount != null) {
      filtered = filtered.where((e) => e.amount <= criteria.maxAmount!).toList();
    }

    // Category filter (fuzzy)
    if (criteria.categories != null && criteria.categories!.isNotEmpty) {
      filtered = filtered.where((e) {
        final category = e.category?.toLowerCase() ?? '';
        return criteria.categories!.any((c) => 
          category.contains(c.toLowerCase()) || c.toLowerCase().contains(category)
        );
      }).toList();
    }

    // Subcategory filter
    if (criteria.subcategories != null && criteria.subcategories!.isNotEmpty) {
      filtered = filtered.where((e) {
        final subcategory = e.subcategory?.toLowerCase() ?? '';
        return criteria.subcategories!.any((s) => 
          subcategory.contains(s.toLowerCase())
        );
      }).toList();
    }

    // Label filter (fuzzy)
    if (criteria.labels != null && criteria.labels!.isNotEmpty) {
      filtered = filtered.where((e) {
        final expenseLabels = e.labels.map((l) => l.toLowerCase()).toList();
        return criteria.labels!.any((queryLabel) {
          final queryLower = queryLabel.toLowerCase();
          return expenseLabels.any((expLabel) => 
            expLabel.contains(queryLower) || queryLower.contains(expLabel)
          );
        });
      }).toList();
    }

    // Text query (search in title, note, comments, category)
    if (criteria.textQuery != null && criteria.textQuery!.isNotEmpty) {
      final query = criteria.textQuery!.toLowerCase();
      filtered = filtered.where((e) {
        final searchText = [
          e.title ?? '',
          e.note,
          e.comments ?? '',
          e.category ?? '',
          ...e.labels,
        ].join(' ').toLowerCase();
        return searchText.contains(query);
      }).toList();
    }

    // Instrument filter
    if (criteria.instrument != null) {
      filtered = filtered.where((e) => 
        e.instrument?.toLowerCase() == criteria.instrument!.toLowerCase()
      ).toList();
    }

    // Friend filter
    if (criteria.friendIds != null && criteria.friendIds!.isNotEmpty) {
      filtered = filtered.where((e) => 
        criteria.friendIds!.any((friendId) => e.friendIds.contains(friendId))
      ).toList();
    }

    // Group filter
    if (criteria.groupId != null) {
      filtered = filtered.where((e) => e.groupId == criteria.groupId).toList();
    }

    return SearchResult.fromExpenses(filtered);
  }

  // ==================== SPECIALIZED SEARCH METHODS ====================

  /// Search for travel-related expenses
  static SearchResult searchTravel(
    List<ExpenseItem> expenses, {
    DateTime? from,
    DateTime? to,
    List<String>? additionalLabels,
  }) {
    // Get all available labels
    final allLabels = expenses.expand((e) => e.labels).toSet().toList();
    
    // Resolve travel-related labels
    final travelLabels = EntityResolver.resolveTravelLabels(allLabels);
    
    // Add any additional labels provided
    if (additionalLabels != null) {
      travelLabels.addAll(additionalLabels);
    }

    final criteria = SearchCriteria(
      categories: ['Travel', 'Flight', 'Hotel', 'Transport', 'Accommodation'],
      labels: travelLabels.isNotEmpty ? travelLabels : null,
      from: from,
      to: to,
    );

    return search(expenses, criteria);
  }

  /// Search for commute-specific expenses
  static SearchResult searchCommute(
    List<ExpenseItem> expenses, {
    required String mode, // metro, bus, cab, auto
    DateTime? from,
    DateTime? to,
  }) {
    final modeLower = mode.toLowerCase();
    
    // Map common terms to subcategories
    final subcategories = <String>[];
    if (modeLower.contains('metro') || modeLower.contains('subway')) {
      subcategories.add('Metro');
    }
    if (modeLower.contains('bus')) {
      subcategories.add('Bus');
    }
    if (modeLower.contains('cab') || modeLower.contains('taxi') || modeLower.contains('uber') || modeLower.contains('ola')) {
      subcategories.add('Cab');
    }
    if (modeLower.contains('auto') || modeLower.contains('rickshaw')) {
      subcategories.add('Auto');
    }

    final criteria = SearchCriteria(
      categories: ['Transport', 'Travel'],
      subcategories: subcategories.isNotEmpty ? subcategories : null,
      textQuery: mode, // Also search in text
      from: from,
      to: to,
    );

    return search(expenses, criteria);
  }

  /// Search for flight expenses specifically
  static SearchResult searchFlights(
    List<ExpenseItem> expenses, {
    DateTime? from,
    DateTime? to,
  }) {
    final criteria = SearchCriteria(
      categories: ['Flight', 'Travel'],
      textQuery: 'flight',
      from: from,
      to: to,
    );

    return search(expenses, criteria);
  }

  /// Verify if a specific expense exists
  static bool verifyExpense(
    List<ExpenseItem> expenses, {
    required String description, // e.g., "flight", "metro ticket"
    DateTime? date,
    double? approximateAmount,
  }) {
    final descLower = description.toLowerCase();
    
    var filtered = expenses.where((e) {
      final searchText = [
        e.title ?? '',
        e.note,
        e.comments ?? '',
        e.category ?? '',
        ...e.labels,
      ].join(' ').toLowerCase();
      return searchText.contains(descLower);
    }).toList();

    // If date provided, filter by date (within 3 days)
    if (date != null) {
      filtered = filtered.where((e) {
        final diff = e.date.difference(date).inDays.abs();
        return diff <= 3;
      }).toList();
    }

    // If amount provided, filter by amount (within 20% tolerance)
    if (approximateAmount != null) {
      filtered = filtered.where((e) {
        final diff = (e.amount - approximateAmount).abs();
        final tolerance = approximateAmount * 0.2;
        return diff <= tolerance;
      }).toList();
    }

    return filtered.isNotEmpty;
  }

  /// Search by label with fuzzy matching
  static SearchResult searchByLabel(
    List<ExpenseItem> expenses,
    String labelQuery, {
    DateTime? from,
    DateTime? to,
  }) {
    // Get all available labels
    final allLabels = expenses.expand((e) => e.labels).toSet().toList();
    
    // Fuzzy match the query
    final matchedLabels = EntityResolver.resolveLabels(labelQuery, allLabels);
    
    if (matchedLabels.isNotFound) {
      return SearchResult.fromExpenses([]);
    }

    final criteria = SearchCriteria(
      labels: matchedLabels.value,
      from: from,
      to: to,
    );

    return search(expenses, criteria);
  }

  /// Search by category with fuzzy matching
  static SearchResult searchByCategory(
    List<ExpenseItem> expenses,
    String categoryQuery, {
    DateTime? from,
    DateTime? to,
  }) {
    // Get all available categories
    final allCategories = expenses
        .map((e) => e.category)
        .where((c) => c != null)
        .cast<String>()
        .toSet()
        .toList();
    
    // Fuzzy match the query
    final matchedCategory = EntityResolver.resolveCategory(categoryQuery, allCategories);
    
    if (matchedCategory.isNotFound) {
      return SearchResult.fromExpenses([]);
    }

    final criteria = SearchCriteria(
      categories: [matchedCategory.value!],
      from: from,
      to: to,
    );

    return search(expenses, criteria);
  }

  // ==================== HELPER METHODS ====================

  /// Get date range for common timeframes
  static Map<String, DateTime?> parseTimeframe(String timeframe) {
    final now = DateTime.now();
    final timeframeLower = timeframe.toLowerCase();

    // Extract specific year (e.g., "2025", "from 2025", "in 2025")
    final yearMatch = RegExp(r'\b(20\d{2})\b').firstMatch(timeframeLower);
    if (yearMatch != null) {
      final year = int.parse(yearMatch.group(1)!);
      return {
        'from': DateTime(year, 1, 1),
        'to': DateTime(year, 12, 31, 23, 59, 59),
      };
    }

    if (timeframeLower.contains('today')) {
      return {
        'from': DateTime(now.year, now.month, now.day),
        'to': DateTime(now.year, now.month, now.day, 23, 59, 59),
      };
    }

    if (timeframeLower.contains('this month')) {
      return {
        'from': DateTime(now.year, now.month, 1),
        'to': DateTime(now.year, now.month + 1, 0, 23, 59, 59),
      };
    }

    if (timeframeLower.contains('this year')) {
      return {
        'from': DateTime(now.year, 1, 1),
        'to': DateTime(now.year, 12, 31, 23, 59, 59),
      };
    }

    if (timeframeLower.contains('last month')) {
      final lastMonth = DateTime(now.year, now.month - 1, 1);
      return {
        'from': lastMonth,
        'to': DateTime(now.year, now.month, 0, 23, 59, 59),
      };
    }

    if (timeframeLower.contains('last year')) {
      return {
        'from': DateTime(now.year - 1, 1, 1),
        'to': DateTime(now.year - 1, 12, 31, 23, 59, 59),
      };
    }

    return {'from': null, 'to': null};
  }
}
