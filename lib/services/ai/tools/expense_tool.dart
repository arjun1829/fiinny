import 'package:cloud_firestore/cloud_firestore.dart';

class ExpenseTool {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<String> handle(String input, String userId) async {
    // Regex to find number
    final amountRegex = RegExp(r'(\d+)(\.\d+)?');
    final match = amountRegex.firstMatch(input);

    if (match != null) {
      final amountStr = match.group(0)!;
      final amount = double.parse(amountStr);
      
      // Extract "for X" or "on X"
      String note = "Expense";
      if (input.contains("for ")) {
        note = input.split("for ")[1].trim();
      } else if (input.contains("on ")) {
        note = input.split("on ")[1].trim();
      }

      // Date Parsing Logic
      DateTime date = DateTime.now();
      String lowerInput = input.toLowerCase();
      
      if (lowerInput.contains('yesterday')) {
        date = date.subtract(const Duration(days: 1));
      } else {
        // "on 2nd", "on the 5th"
        final dayRegex = RegExp(r'on (?:the )?(\d{1,2})(?:st|nd|rd|th)?');
        final dayMatch = dayRegex.firstMatch(lowerInput);
        if (dayMatch != null) {
          int day = int.parse(dayMatch.group(1)!);
          // Assume current month/year unless user specifies otherwise (Phase 9 requirement)
          if (day > 0 && day <= 31) {
            // "Obvious that I am asking for this year data"
            date = DateTime(date.year, date.month, day);
          }
        }
      }

      final category = _guessCategory(note);

      // Add to Firestore
      await _firestore
          .collection('users')
          .doc(userId)
          .collection('transactions')
          .add({
        'amount': amount,
        'type': 'expense',
        'category': category,
        'note': note,
        'date': date.toIso8601String(),
        'timestamp': FieldValue.serverTimestamp(),
      });

      return "Added expense: ₹$amount for '$note' on ${date.day}/${date.month} (Category: $category).";
    }

    return "I couldn't find the amount. Try 'Spent 500 for lunch'.";
  }

  /// Search expenses (e.g., "Show me expenses for today")
  Future<String> search(String input, String userId) async {
    DateTime date = DateTime.now();
    if (input.toLowerCase().contains('yesterday')) {
      date = date.subtract(const Duration(days: 1));
    }
    
    final startOfDay = DateTime(date.year, date.month, date.day);
    final endOfDay = startOfDay.add(const Duration(days: 1));

    final snapshot = await _firestore
        .collection('users')
        .doc(userId)
        .collection('transactions')
        .where('timestamp', isGreaterThanOrEqualTo: startOfDay)
        .where('timestamp', isLessThan: endOfDay)
        .orderBy('timestamp', descending: true)
        .get();

    if (snapshot.docs.isEmpty) {
      return "No expenses found for ${date.day}/${date.month}.";
    }

    double total = 0;
    final lines = snapshot.docs.map((doc) {
      final data = doc.data();
      final amt = data['amount'] as num;
      total += amt;
      return "• ₹$amt (${data['note'] ?? 'General'})";
    }).join('\n');

    return "Here's your spending for ${date.day}/${date.month} (Total: ₹$total):\n$lines";
  }

  /// Edit the LAST added transaction (Context-aware)
  Future<String> editLast(String input, String userId) async {
    // "Change amount to 500" or "Change note to Dinner"
    final snapshot = await _firestore
        .collection('users')
        .doc(userId)
        .collection('transactions')
        .orderBy('timestamp', descending: true)
        .limit(1)
        .get();

    if (snapshot.docs.isEmpty) return "No recent transactions to edit.";

    final doc = snapshot.docs.first;
    final Map<String, dynamic> updates = {};

    // Check for amount change
    final amountRegex = RegExp(r'(\d+)(\.\d+)?');
    final match = amountRegex.firstMatch(input);
    if (match != null) {
      updates['amount'] = double.parse(match.group(0)!);
    }

    // Check for note change
    if (input.contains("to ") && !match!.group(0)!.contains(input.split("to ")[1])) {
       // messy regex fallback: if we have "change note to X"
       final textParts = input.split("to ");
       if (textParts.length > 1) {
         updates['note'] = textParts[1].trim();
       }
    }

    if (updates.isEmpty) return "I didn't catch what to change. Try 'Change amount to 500'.";

    await doc.reference.update(updates);
    return "Updated the last transaction.";
  }

  Future<String> deleteLast(String userId) async {
    final snapshot = await _firestore
        .collection('users')
        .doc(userId)
        .collection('transactions')
        .orderBy('timestamp', descending: true)
        .limit(1)
        .get();

    if (snapshot.docs.isEmpty) return "Nothing to delete.";

    final doc = snapshot.docs.first;
    final data = doc.data();
    await doc.reference.delete();
    
    return "Deleted the last expense (₹${data['amount']} for ${data['note']}).";
  }

  String _guessCategory(String note) {
    final n = note.toLowerCase();
    
    // Food
    if (n.contains('lunch') || n.contains('dinner') || n.contains('food') || 
        n.contains('coffee') || n.contains('zomato') || n.contains('swiggy')) {
      return 'Food';
    }
    
    // Transport
    if (n.contains('uber') || n.contains('ola') || n.contains('taxi') || 
        n.contains('fuel') || n.contains('petrol') || n.contains('flight') || n.contains('train')) {
      return 'Transport';
    }
    
    // Utilities
    if (n.contains('bill') || n.contains('recharge') || n.contains('electricity') || n.contains('wifi')) {
      return 'Utilities';
    }
    
    // Entertainment
    if (n.contains('movie') || n.contains('netflix') || n.contains('bookmyshow') || n.contains('party')) {
      return 'Entertainment';
    }

    // Shopping
    if (n.contains('clothes') || n.contains('mall') || n.contains('shoe') || n.contains('amazon') || n.contains('flipkart')) {
      return 'Shopping';
    }

    return 'General';
  }
}
