import 'package:cloud_firestore/cloud_firestore.dart';

class SummaryTool {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<String> summarize(String input, String userId) async {
    // "Summarize my spending" or "Summarize Rahul"
    
    // Check if friend name is mentioned
    // Simplified logic: If input contains "spending", summarize all.
    
    final snapshot = await _firestore
        .collection('users')
        .doc(userId)
        .collection('transactions')
        .orderBy('timestamp', descending: true)
        .limit(20) // Analyze last 20 txns
        .get();

    if (snapshot.docs.isEmpty) return "Your ledger is clean! No spending to summarize yet.";

    double total = 0;
    Map<String, double> categories = {};
    
    for (var doc in snapshot.docs) {
      final data = doc.data();
      final amt = (data['amount'] as num).toDouble();
      final cat = (data['category'] as String?) ?? 'Uncategorized';
      
      total += amt;
      categories[cat] = (categories[cat] ?? 0) + amt;
    }

    // Find top category
    var topCat = "";
    double topVal = 0;
    categories.forEach((k, v) {
      if (v > topVal) {
        topVal = v;
        topCat = k;
      }
    });

    // Creative Persona (The "Bro" / "Witty" AI)
    return "💰 **Spending Vibe Check**\n"
           "In your last 20 moves, you dropped **₹${total.toStringAsFixed(0)}**.\n"
           "Your biggest obsession seems to be **$topCat** (₹${topVal.toStringAsFixed(0)}).\n\n"
           "${_getWittyComment(topCat, total)}";
  }

  String _getWittyComment(String topCat, double total) {
    if (total > 50000) return "Slow down, Elon! 🚀";
    if (topCat.toLowerCase().contains('food')) return "Eating good, living good! 🍕";
    if (topCat.toLowerCase().contains('travel')) return "Wanderlust is expensive, huh? ✈️";
    return "Keep accurate tracking, stay wealthy! 💎";
  }
}
