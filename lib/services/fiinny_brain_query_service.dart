import '../fiinny_brain/time_engine.dart';
import '../fiinny_brain/trend_engine.dart';
import '../fiinny_brain/inference_engine.dart';
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

      // === TIME/WEEKEND QUESTIONS ===
      if (_isTimeQuery(queryLower)) {
        return _handleTimeQuery(
          query: queryLower,
          expenses: expenses,
        );
      }

      // === TREND/GROWTH QUESTIONS ===
      if (_isTrendQuery(queryLower)) {
        return _handleTrendQuery(
          query: queryLower,
          expenses: expenses,
        );
      }

      // === INFERENCE/CONTEXT QUESTIONS ===
      if (_isInferenceQuery(queryLower)) {
        return _handleInferenceQuery(
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

  static bool _isTimeQuery(String query) {
    const keywords = ['weekend', 'weekday', 'morning', 'night', 'holiday', 'monday', 'sunday'];
    return keywords.any((k) => query.contains(k));
  }

  static bool _isTrendQuery(String query) {
    const keywords = ['increasing', 'decreasing', 'trend', 'spike', 'more than last', 'usage'];
    return keywords.any((k) => query.contains(k));
  }

  static bool _isInferenceQuery(String query) {
    const keywords = ['inferred', 'guess', 'hospital', 'commute']; // Explicit intents
    return keywords.any((k) => query.contains(k));
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
            return "${resolution.name} currently owes you ₹${amount.toStringAsFixed(0)}";
          } else {
            return "${resolution.name} doesn't owe you anything right now.";
          }
        }
      }
      // General "who owes me"
      final whoOwes = SplitQueryEngine.getWhoOwesMe(report);
      if (whoOwes.isEmpty) {
        return "Good news! No one owes you money right now.";
      }
      final details = whoOwes.map((phone) {
        final detail = report.friendDetails[phone]!;
        return "${detail.friendName}: ₹${detail.netBalance.toStringAsFixed(0)}";
      }).join('\n');
      return "Here's who owes you money:\n$details";
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
          return "Yes, I found ${result.count} expenses related to '$searchTerm', totaling ₹${result.totalAmount.toStringAsFixed(0)}";
        } else {
          return "I couldn't find any recorded expenses for '$searchTerm'. Would you like to add one?";
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
      return "Found ${result.count} expense(s) for '$searchTerm':\nTotal: ₹${result.totalAmount.toStringAsFixed(0)}\nAverage: ₹${(result.totalAmount / result.count).toStringAsFixed(0)}";
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
      return "You've spent ₹${result.totalAmount.toStringAsFixed(0)} on $matchedCategory $period (${result.count} expenses)";
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

    return "**Financial Summary**\n"
        "Income: ₹${totalIncome.toStringAsFixed(0)}\n"
        "Expenses: ₹${totalExpense.toStringAsFixed(0)}\n"
        "Savings: ₹${savings.toStringAsFixed(0)}\n\n"
        "I'm here to help! efficient tracking leads to better savings.";
  }

  // ==================== ADVANCED HANDLERS ====================

  static String _handleTimeQuery({required String query, required List<ExpenseItem> expenses}) {
    if (query.contains('weekend')) {
      final weekendExpenses = TimeEngine.filterByDayType(expenses, isWeekend: true);
      final total = weekendExpenses.fold(0.0, (sum, e) => sum + e.amount);
      return "You've spent a total of ₹${total.toStringAsFixed(0)} on weekends (Total ${weekendExpenses.length} expenses)";
    }
    
    if (query.contains('morning') || query.contains('10 am')) {
      final morningExpenses = TimeEngine.filterByTimeOfDay(expenses, 'morning');
      final total = morningExpenses.fold(0.0, (sum, e) => sum + e.amount);
      return "You've spent ₹${total.toStringAsFixed(0)} in the morning (before 12 PM)";
    }
    
    // Add more time handlers as needed
    return "I can analyze spending by time. Try asking about 'weekends' or 'mornings'.";
  }

  static String _handleTrendQuery({required String query, required List<ExpenseItem> expenses}) {
    final now = DateTime.now();
    final currentMonth = expenses.where((e) => e.date.month == now.month && e.date.year == now.year).toList();
    final lastMonth = expenses.where((e) => e.date.month == now.month - 1 && e.date.year == now.year).toList(); // Simplified date logic

    if (query.contains('increasing') || query.contains('trend')) {
      final growth = TrendEngine.calculateGrowthRate(currentMonth, lastMonth);
      final direction = TrendEngine.analyzeTrendDirection(growth);
      return "I've noticed your spending is **$direction** (${growth.abs().toStringAsFixed(1)}% vs last month)";
    }

    if (query.contains('spike')) {
      final anomaly = TrendEngine.detectAnomaly(currentMonth, expenses); // Naive history
      return anomaly['message'];
    }

    return "I can analyze your spending trends. Try asking 'Is my spending increasing?'";
  }

  static String _handleInferenceQuery({required String query, required List<ExpenseItem> expenses}) {
    if (query.contains('hospital')) {
      final results = InferenceEngine.inferComplexIntent(expenses, 'hospital_travel');
      final total = results.fold(0.0, (sum, e) => sum + e.amount);
      return "I found ₹${total.toStringAsFixed(0)} likely related to hospital travel (based on keywords like 'hospital', 'clinic' + travel patterns).";
    }

    if (query.contains('commute')) {
      final results = InferenceEngine.inferContext(expenses, 'office');
      final total = results.fold(0.0, (sum, e) => sum + e.amount);
      return "Estimated office commute spend: ₹${total.toStringAsFixed(0)} (includes cab, metro, bus)";
    }

    return "I can infer categories based on context. Try asking about 'hospital travel' or 'office commute'.";
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
