import 'dart:math';

class FuzzyUtils {
  /// Returns the Levenshtein edit distance between [s] and [t].
  static int levenshteinDistance(String s, String t) {
    s = s.toLowerCase();
    t = t.toLowerCase();
    if (s == t) return 0;
    if (s.isEmpty) return t.length;
    if (t.isEmpty) return s.length;

    final List<int> v0 = List<int>.filled(t.length + 1, 0);
    final List<int> v1 = List<int>.filled(t.length + 1, 0);

    for (int i = 0; i < t.length + 1; i++) {
      v0[i] = i;
    }

    for (int i = 0; i < s.length; i++) {
      v1[0] = i + 1;

      for (int j = 0; j < t.length; j++) {
        final int cost = (s[i] == t[j]) ? 0 : 1;
        v1[j + 1] = min(v1[j] + 1, min(v0[j + 1] + 1, v0[j] + cost));
      }

      for (int j = 0; j < t.length + 1; j++) {
        v0[j] = v1[j];
      }
    }

    return v1[t.length];
  }

  /// Checks if [input] contains [keyword] with a tolerance of [tolerance] edits.
  /// This is useful for finding "expense" in "add expnse".
  static bool containsFuzzy(String input, String keyword, {int tolerance = 2}) {
    final words = input.split(' ');
    for (final word in words) {
      if (levenshteinDistance(word, keyword) <= tolerance) {
        return true;
      }
    }
    return false;
  }
}
