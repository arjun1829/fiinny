import '../models/expense_item.dart';

class SplitReport {
  final Map<String, double> netBalances; // friendId -> amount (>0 means they owe you)

  const SplitReport({required this.netBalances});

  Map<String, dynamic> toJson() => {
    'netBalances': netBalances,
  };
}

class SplitEngine {
  static SplitReport calculate(List<ExpenseItem> expenses, String myUserId) {
    final Map<String, double> balances = {};

    for (var e in expenses) {
      if (e.isBill) continue; // Skip bills for now if they are not shared? 
      // Actually standard ExpenseItem usage implies shared if friendIds > unique.
      
      final payer = e.payerId;
      final amount = e.amount;
      
      // Determine splits
      Map<String, double> currentSplits = {};
      
      if (e.customSplits != null && e.customSplits!.isNotEmpty) {
        currentSplits = e.customSplits!;
      } else {
        // Equal split
        // Participants = friendIds + (maybe payer? usually friendIds includes everyone involved including self if properly formed, OR friendIds works differently)
        // Checking ExpenseItem logic: usually friendIds stores *other* people tagged? 
        // Let's assume a simplified robust model: 
        // If splits are missing, assume equal split among (friendIds + payer) unique.
        
        final participants = <String>{...e.friendIds, payer};
        if (participants.isEmpty) continue; // Should not happen
        
        final splitAmount = amount / participants.length;
        for (var p in participants) {
          currentSplits[p] = splitAmount;
        }
      }

      // Apply to balances
      // Logic:
      // If I paid, everyone else owes me their split.
      // If Someone else (X) paid, I owe X my split.
      
      if (payer == myUserId) {
        // I paid.
        currentSplits.forEach((userId, splitAmount) {
          if (userId != myUserId) {
             balances[userId] = (balances[userId] ?? 0) + splitAmount;
          }
        });
      } else {
        // Someone else paid.
        // If I am involved, I owe them.
        if (currentSplits.containsKey(myUserId)) {
           final myShare = currentSplits[myUserId]!;
           // I owe payer 'myShare'. So payer's balance decreases (from my perspective: they owe me negative)
           balances[payer] = (balances[payer] ?? 0) - myShare;
        }
      }
    }

    return SplitReport(netBalances: balances);
  }
}
