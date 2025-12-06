import 'tools/expense_tool.dart';
import 'tools/friend_tool.dart';
import 'tools/summary_tool.dart';
import 'gemini_service.dart';
import '../../services/user_data.dart';
import '../../utils/fuzzy_utils.dart'; 

enum ActionType {
  addExpense,
  addFriend,
  createGroup,
  scanReceipt, // New local intent
  unknown,
}

class ActionRouter {
  final ExpenseTool _expenseTool = ExpenseTool();
  final FriendTool _friendTool = FriendTool();
  final SummaryTool _summaryTool = SummaryTool();
  final GeminiService _geminiService = GeminiService();

  // Standard entry point
  Future<String> route(String input, String userId, UserData userData) async {
    final lower = input.toLowerCase();

    // --- 1. LOCAL INTENT ENGINE (The Fast Lane) ---
    // Zero API cost. Handles typos via FuzzyUtils.

    // A. Expense Actions
    if (FuzzyUtils.containsFuzzy(lower, 'expense') || 
        FuzzyUtils.containsFuzzy(lower, 'spent') || 
        FuzzyUtils.containsFuzzy(lower, 'paid')) {
       return await _expenseTool.handle(input, userId);
    }

    // B. Social Actions
    if (FuzzyUtils.containsFuzzy(lower, 'friend') || 
        (FuzzyUtils.containsFuzzy(lower, 'add') && FuzzyUtils.containsFuzzy(lower, 'name'))) {
      return await _friendTool.addFriend(input, userId);
    }
    
    if (FuzzyUtils.containsFuzzy(lower, 'group')) {
       if (FuzzyUtils.containsFuzzy(lower, 'create')) {
         return await _friendTool.createGroup(input, userId);
       }
       return await _friendTool.addToGroup(input, userId);
    }

    // C. Summarize/Search (Read Only)
    if (FuzzyUtils.containsFuzzy(lower, 'summarize') || 
        (lower.contains('how') && FuzzyUtils.containsFuzzy(lower, 'spending'))) {
      return await _summaryTool.summarize(input, userId);
    }
    
    if (FuzzyUtils.containsFuzzy(lower, 'show') || FuzzyUtils.containsFuzzy(lower, 'list')) {
       return await _expenseTool.search(input, userId);
    }

    // D. Receipt Scan
    if (FuzzyUtils.containsFuzzy(lower, 'receipt') && 
       (FuzzyUtils.containsFuzzy(lower, 'scan') || FuzzyUtils.containsFuzzy(lower, 'read'))) {
         if (input.contains("test")) {
            return "I need an image to scan. (Tap the camera icon).";
         }
         if (input.startsWith("scan receipt ")) {
            final path = input.replaceFirst("scan receipt ", "").trim();
            return await _geminiService.analyzeReceipt(path);
         }
    }

    // --- 2. CLOUD FALLBACK (The Slow Lane) ---
    // Only for "Why?", "Advice", or complex things local engine missed.
    try {
      // Build Rich Context
      final totalSpent = userData.getWeeklySpending();
      final limit = userData.weeklyLimit;
      final isOverBudget = userData.isWeeklyLimitExceeded();
      final goalsList = userData.goals.map((g) => "${g.title} (Target: ${g.targetAmount}, Saved: ${g.savedAmount})").join(", ");
      
      final context = """
User ID: $userId
Date: ${DateTime.now().toIso8601String()}
Weekly Budget: $limit (Spent: $totalSpent)
Status: ${isOverBudget ? 'OVER BUDGET 🚨' : 'On Track'}
Active Goals: [$goalsList]
Friends: [Rahul, Priya]
""";
      
      // Use routeIntent for structured fallback or chat for free-form
      // Since we want advice here, chat is appropriate. 
      // If we used Agentic Routing (Step 871), we could use routeIntent.
      // But given we handled actions locally, we can just fallback to 'chat'.
      return await _geminiService.chat(input, context);

    } catch (e) {
       return "Cloud Brain Error: $e";
    }
  }
}
