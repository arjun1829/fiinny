import '../../models/expense_item.dart';

class SubscriptionModel {
  final String name;
  final double amount;
  final DateTime nextDueDate; // Predicted
  final String iconPath; // Can be local asset or generic
  final int daysRemaining;

  SubscriptionModel({
    required this.name,
    required this.amount,
    required this.nextDueDate,
    required this.iconPath,
  }) : daysRemaining = nextDueDate.difference(DateTime.now()).inDays;
}

class HiddenChargeModel {
  final String description;
  final double amount;
  final DateTime date;

  HiddenChargeModel({required this.description, required this.amount, required this.date});
}

class SubscriptionDetector {
  
  static final List<String> _subscriptionKeywords = [
    'netflix', 'spotify', 'youtube premium', 'prime video', 'hotstar',
    'apple music', 'icloud', 'google one', 'dropbox', 'linkedin',
    'tinder', 'bumble', 'hbo', 'disney+', 'hulu', 'chatgpt', 'openai'
  ];

  static final List<String> _hiddenChargeKeywords = [
    'forex markup', 'convenience fee', 'surcharge', 'processing fee',
    'late fee', 'maintenance charge', 'annual fee', 'atm fee'
  ];

  /// Detects potential subscriptions based on merchant names.
  /// Simple logic: If it matches a known provider.
  /// Advanced logic (Todo): Check for recurring amounts on same day.
  static List<SubscriptionModel> detectSubscriptions(List<ExpenseItem> expenses) {
    // Group by merchant first to find latest
    final Map<String, ExpenseItem> latestTx = {};

    for (var e in expenses) {
      final lower = (e.title ?? '').toLowerCase();
      // Check if it's a known sub
      final match = _subscriptionKeywords.firstWhere(
        (k) => lower.contains(k), 
        orElse: () => '',
      );

      if (match.isNotEmpty) {
        // Keep only the latest transaction for this merchant to predict next due date
        if (!latestTx.containsKey(match) || e.date.isAfter(latestTx[match]!.date)) {
          latestTx[match] = e;
        }
      }
    }

    return latestTx.entries.map((entry) {
      final name = entry.key; // e.g., 'netflix'
      final tx = entry.value;
      
      // Predict next due date (Assume monthly)
      // If last tx was Jan 15, next is Feb 15.
      final nextDue = DateTime(tx.date.year, tx.date.month + 1, tx.date.day);
      
      return SubscriptionModel(
        name: _capitalize(name),
        amount: tx.amount,
        nextDueDate: nextDue,
        iconPath: 'assets/brands/$name.png', // Placeholder logic
      );
    }).toList();
  }

  static List<HiddenChargeModel> detectHiddenCharges(List<ExpenseItem> expenses) {
    final List<HiddenChargeModel> charges = [];
    for (var e in expenses) {
      final lower = (e.title ?? '').toLowerCase();
      if (_hiddenChargeKeywords.any((k) => lower.contains(k))) {
        charges.add(HiddenChargeModel(
          description: e.title ?? '',
          amount: e.amount,
          date: e.date,
        ));
      }
    }
    return charges;
  }

  static String _capitalize(String s) => s.isNotEmpty ? '${s[0].toUpperCase()}${s.substring(1)}' : '';
}
