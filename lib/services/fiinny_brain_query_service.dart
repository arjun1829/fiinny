import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../fiinny_brain/entity_resolver.dart';
import '../fiinny_brain/entity_resolution_models.dart';
import '../fiinny_brain/fuzzy_search_engine.dart';
import '../fiinny_brain/search_models.dart';
import '../fiinny_brain/split_query_engine.dart';
import '../fiinny_brain/enhanced_split_engine.dart';
import '../fiinny_brain/enhanced_split_models.dart';
import '../services/contact_name_service.dart';

/// Processes natural language queries and returns answers using Fiinny Brain engines
class FiinnyBrainQueryService {
  /// Process a user query and return a response
  static Future<String> processQuery({
    required String query,
    required String userPhone,
    required List<ExpenseItem> expenses,
    required List<IncomeItem> incomes,
    Map<String, String>? friendNames,
    Map<String, String>? groupNames,
  }) async {
    final queryLower = query.toLowerCase().trim();

    // Build phone-to-name map if not provided
    final phoneToNameMap = friendNames ?? await _buildPhoneToNameMap();

    try {
      // === SPLIT/FRIEND QUESTIONS ===
      if (_isSplitQuery(queryLower)) {
        return await _handleSplitQuery(
          query: queryLower,
          userPhone: userPhone,
          expenses: expenses,
          phoneToNameMap: phoneToNameMap,
          groupNames: groupNames ?? {},
        );
      }

      // === EXPENSE SEARCH QUESTIONS ===
      if (_isExpenseSearchQuery(queryLower)) {
        return _handleExpenseSearch(
          query: queryLower,
          expenses: expenses,
        );
      }

      // === CATEGORY/LABEL QUESTIONS ===
      if (_isCategoryQuery(queryLower)) {
        return _handleCategoryQuery(
          query: queryLower,
          expenses: expenses,
        );
      }

      // === TRAVEL QUESTIONS ===
      if (_isTravelQuery(queryLower)) {
        return _handleTravelQuery(
          query: queryLower,
          expenses: expenses,
        );
      }

      // === GENERAL SUMMARY ===
      return _handleGeneralSummary(expenses, incomes);
    } catch (e) {
      return "I encountered an error processing your question: $e\n\nPlease try rephrasing your question.";
    }
  }

  // ==================== QUERY TYPE DETECTION ====================

  static bool _isSplitQuery(String query) {
    final splitKeywords = ['owe', 'pending', 'friend', 'split', 'settle', 'remind', 'group', 'trip'];
    return splitKeywords.any((keyword) => query.contains(keyword));
  }

  static bool _isExpenseSearchQuery(String query) {
    final searchKeywords = ['show', 'find', 'search', 'list', 'tracked', 'recorded'];
    return searchKeywords.any((keyword) => query.contains(keyword));
  }

  static bool _isCategoryQuery(String query) {
    final categoryKeywords = ['category', 'spent on', 'spending on', 'how much on'];
    return categoryKeywords.any((keyword) => query.contains(keyword));
  }

  static bool _isTravelQuery(String query) {
    final travelKeywords = ['travel', 'trip', 'flight', 'hotel', 'vacation'];
    return travelKeywords.any((keyword) => query.contains(keyword));
  }

  // ==================== QUERY HANDLERS ====================

  static Future<String> _handleSplitQuery({
    required String query,
    required String userPhone,
    required List<ExpenseItem> expenses,
    required Map<String, String> phoneToNameMap,
    required Map<String, String> groupNames,
  }) async {
    // Generate enhanced split report
    final report = EnhancedSplitEngine.analyze(
      expenses,
      userPhone,
      friendNames: phoneToNameMap,
      groupNames: groupNames,
    );

    // Extract friend name from query if present
    String? friendName;
    for (final name in phoneToNameMap.values) {
      if (query.contains(name.toLowerCase())) {
        friendName = name;
        break;
      }
    }

    // "How much does X owe me?"
    if (query.contains('owe') && query.contains('me')) {
      if (friendName != null) {
        final resolution = EntityResolver.resolveFriendName(friendName, phoneToNameMap);
        if (resolution.needsClarification) {
          return _formatClarificationRequest(resolution.candidates, 'friend');
        }
        if (resolution.phone != null) {
          final amount = SplitQueryEngine.getAmountOwedBy(resolution.phone!, report);
          if (amount > 0) {
            return "${resolution.name} owes you ₹${amount.toStringAsFixed(0)}";
          } else {
            return "${resolution.name} doesn't owe you anything";
          }
        }
      }
      // General "who owes me"
      final whoOwes = SplitQueryEngine.getWhoOwesMe(report);
      if (whoOwes.isEmpty) {
        return "No one owes you money right now";
      }
      final details = whoOwes.map((phone) {
        final detail = report.friendDetails[phone]!;
        return "${detail.friendName}: ₹${detail.netBalance.toStringAsFixed(0)}";
      }).join('\n');
      return "People who owe you:\n$details";
    }

    // "How much do I owe X?"
    if (query.contains('i owe') || query.contains('do i owe')) {
      if (friendName != null) {
        final resolution = EntityResolver.resolveFriendName(friendName, phoneToNameMap);
        if (resolution.phone != null) {
          final amount = SplitQueryEngine.getAmountOwedTo(resolution.phone!, report);
          if (amount > 0) {
            return "You owe ${resolution.name} ₹${amount.toStringAsFixed(0)}";
          } else {
            return "You don't owe ${resolution.name} anything";
          }
        }
      }
      final totalOwed = SplitQueryEngine.getTotalToReturn(report);
      return "You owe ₹${totalOwed.toStringAsFixed(0)} in total";
    }

    // "Who should I remind?"
    if (query.contains('remind')) {
      final friendToRemind = SplitQueryEngine.getFriendToRemindFirst(report);
      if (friendToRemind == null) {
        return "No pending reminders needed";
      }
      final detail = report.friendDetails[friendToRemind]!;
      return "Remind ${detail.friendName} - they owe you ₹${detail.netBalance.toStringAsFixed(0)} (pending for ${detail.daysSinceLastSettlement} days)";
    }

    // "Am I always paying first?"
    if (query.contains('always') && query.contains('pay')) {
      final alwaysPaying = SplitQueryEngine.isAlwaysPayingFirst(report);
      if (alwaysPaying) {
        return "Yes, you pay first ${(report.behavior.socialSpendingPct).toStringAsFixed(0)}% of the time. Consider letting friends pay sometimes!";
      } else {
        return "No, you have a balanced payment pattern with friends";
      }
    }

    // Default split summary
    return _formatSplitSummary(report);
  }

  static String _handleExpenseSearch({
    required String query,
    required List<ExpenseItem> expenses,
  }) {
    // Extract search terms
    String? searchTerm;
    if (query.contains('flight')) searchTerm = 'flight';
    else if (query.contains('metro')) searchTerm = 'metro';
    else if (query.contains('cab') || query.contains('uber')) searchTerm = 'cab';

    if (searchTerm != null) {
      // Check if expense was tracked
      if (query.contains('tracked') || query.contains('recorded')) {
        final exists = FuzzySearchEngine.verifyExpense(
          expenses,
          description: searchTerm,
        );
        if (exists) {
          final result = FuzzySearchEngine.search(
            expenses,
            SearchCriteria(textQuery: searchTerm),
          );
          return "Yes, I found ${result.count} $searchTerm expense(s) totaling ₹${result.totalAmount.toStringAsFixed(0)}";
        } else {
          return "No $searchTerm expenses found. Would you like to add one?";
        }
      }

      // Show expenses
      final result = FuzzySearchEngine.search(
        expenses,
        SearchCriteria(textQuery: searchTerm),
      );
      if (result.count == 0) {
        return "No $searchTerm expenses found";
      }
      return "Found ${result.count} $searchTerm expense(s):\nTotal: ₹${result.totalAmount.toStringAsFixed(0)}\nAverage: ₹${(result.totalAmount / result.count).toStringAsFixed(0)}";
    }

    return "I can help you search for expenses. Try asking about specific categories like 'flight', 'metro', or 'food'";
  }

  static String _handleCategoryQuery({
    required String query,
    required List<ExpenseItem> expenses,
  }) {
    // Extract category from query
    final categories = expenses.map((e) => e.category).whereType<String>().toSet().toList();
    
    // Try to find category in query
    String? matchedCategory;
    for (final category in categories) {
      if (query.contains(category.toLowerCase())) {
        matchedCategory = category;
        break;
      }
    }

    // Extract timeframe
    final timeframe = FuzzySearchEngine.parseTimeframe(query);
    
    if (matchedCategory != null) {
      final result = FuzzySearchEngine.searchByCategory(
        expenses,
        matchedCategory,
        from: timeframe['from'],
        to: timeframe['to'],
      );
      
      final period = _formatPeriod(timeframe);
      return "You spent ₹${result.totalAmount.toStringAsFixed(0)} on $matchedCategory $period (${result.count} expenses)";
    }

    // Show all categories
    final summary = <String, double>{};
    for (final expense in expenses) {
      final cat = expense.category ?? 'Uncategorized';
      summary[cat] = (summary[cat] ?? 0) + expense.amount;
    }
    
    final sorted = summary.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final top5 = sorted.take(5).map((e) => "${e.key}: ₹${e.value.toStringAsFixed(0)}").join('\n');
    
    return "Top spending categories:\n$top5";
  }

  static String _handleTravelQuery({
    required String query,
    required List<ExpenseItem> expenses,
  }) {
    final timeframe = FuzzySearchEngine.parseTimeframe(query);
    final result = FuzzySearchEngine.searchTravel(
      expenses,
      from: timeframe['from'],
      to: timeframe['to'],
    );

    if (result.count == 0) {
      return "No travel expenses found for the specified period";
    }

    final period = _formatPeriod(timeframe);
    final breakdown = result.categoryBreakdown.entries
        .map((e) => "${e.key}: ₹${e.value.toStringAsFixed(0)}")
        .join('\n');

    return "Travel expenses $period:\nTotal: ₹${result.totalAmount.toStringAsFixed(0)}\nExpenses: ${result.count}\n\nBreakdown:\n$breakdown";
  }

  static String _handleGeneralSummary(List<ExpenseItem> expenses, List<IncomeItem> incomes) {
    final totalExpense = expenses.fold<double>(0, (sum, e) => sum + e.amount);
    final totalIncome = incomes.fold<double>(0, (sum, i) => sum + i.amount);
    final savings = totalIncome - totalExpense;

    return "Financial Summary:\n"
        "Income: ₹${totalIncome.toStringAsFixed(0)}\n"
        "Expenses: ₹${totalExpense.toStringAsFixed(0)}\n"
        "Savings: ₹${savings.toStringAsFixed(0)}\n\n"
        "Ask me anything about your expenses, splits, or travel!";
  }

  // ==================== HELPER METHODS ====================

  static Future<Map<String, String>> _buildPhoneToNameMap() async {
    // This would ideally come from ContactNameService
    // For now, return empty map - caller should provide it
    return {};
  }

  static String _formatSplitSummary(EnhancedSplitReport report) {
    final summary = StringBuffer();
    summary.writeln("Split Summary:");
    summary.writeln("Total to collect: ₹${report.totalPendingReceivable.toStringAsFixed(0)}");
    summary.writeln("Total to pay: ₹${report.totalPendingPayable.toStringAsFixed(0)}");
    summary.writeln("Net position: ₹${report.netPosition.toStringAsFixed(0)}");
    
    if (report.risks.isNotEmpty) {
      summary.writeln("\n⚠️ Alerts:");
      for (final risk in report.risks.take(3)) {
        summary.writeln("• ${risk.description}");
      }
    }
    
    return summary.toString();
  }

  static String _formatClarificationRequest(List<dynamic> candidates, String type) {
    final buffer = StringBuffer();
    buffer.writeln("I found multiple matches. Which one did you mean?");
    for (int i = 0; i < candidates.length && i < 5; i++) {
      if (type == 'friend' && candidates[i] is FriendCandidate) {
        final friend = candidates[i] as FriendCandidate;
        buffer.writeln("${i + 1}. ${friend.name}");
      }
    }
    return buffer.toString();
  }

  static String _formatPeriod(Map<String, DateTime?> timeframe) {
    if (timeframe['from'] == null && timeframe['to'] == null) {
      return 'overall';
    }
    if (timeframe['from'] != null && timeframe['to'] != null) {
      return 'from ${_formatDate(timeframe['from']!)} to ${_formatDate(timeframe['to']!)}';
    }
    return 'in the specified period';
  }

  static String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}
