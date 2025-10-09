import '../../models/suggestion.dart';
import '../../models/transaction.dart';

class SuggestionDetector {
  /// SAFE default: return [] so UI never breaks if you haven’t wired transactions.
  Future<List<Suggestion>> detectRecent(String? userPhone) async {
    // TODO: plug in your transaction feed + heuristics.
    return const <Suggestion>[];
  }

  /// Example helper (not used yet): infer frequency based on recurrence gap.
  String inferFrequencyFromGap(Duration gap) {
    final d = gap.inDays.abs();
    if (d >= 365 - 10 && d <= 365 + 10) return 'yearly';
    if (d >= 90 - 7 && d <= 92 + 7) return 'quarterly';
    if (d >= 30 - 5 && d <= 31 + 5) return 'monthly';
    return 'unknown';
  }
}
