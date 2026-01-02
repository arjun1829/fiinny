import 'entity_resolution_models.dart';

class EntityResolver {
  // ==================== FRIEND NAME RESOLUTION ====================
  
  /// Resolve friend name to phone number
  /// Requires a phone-to-name mapping (from ContactNameService or other source)
  static FriendResolution resolveFriendName(
    String query,
    Map<String, String> phoneToNameMap, // phone -> name
  ) {
    final queryLower = query.trim().toLowerCase();
    if (queryLower.isEmpty) {
      return FriendResolution.notFound();
    }

    if (phoneToNameMap.isEmpty) {
      return FriendResolution.notFound();
    }

    final candidates = <FriendCandidate>[];

    // Search through contacts
    for (final entry in phoneToNameMap.entries) {
      final phone = entry.key;
      final name = entry.value;
      final nameLower = name.toLowerCase();

      // Exact match
      if (nameLower == queryLower) {
        return FriendResolution.success(phone, name);
      }

      // Starts with
      if (nameLower.startsWith(queryLower)) {
        candidates.add(FriendCandidate(phone: phone, name: name, score: 0.9));
        continue;
      }

      // Contains
      if (nameLower.contains(queryLower)) {
        candidates.add(FriendCandidate(phone: phone, name: name, score: 0.7));
        continue;
      }

      // Fuzzy match (first name or last name)
      final nameParts = nameLower.split(' ');
      for (final part in nameParts) {
        if (part.startsWith(queryLower)) {
          candidates.add(FriendCandidate(phone: phone, name: name, score: 0.8));
          break;
        }
        if (_fuzzyMatch(part, queryLower)) {
          candidates.add(FriendCandidate(phone: phone, name: name, score: 0.6));
          break;
        }
      }
    }

    if (candidates.isEmpty) {
      return FriendResolution.notFound();
    }

    // Sort by score
    candidates.sort((a, b) => b.score.compareTo(a.score));

    // If top candidate has high confidence and is significantly better, return it
    if (candidates.length == 1 || candidates.first.score >= 0.9) {
      return FriendResolution.success(candidates.first.phone, candidates.first.name);
    }

    // Multiple good matches, need clarification
    return FriendResolution.ambiguous(candidates.take(5).toList());
  }

  // ==================== LABEL FUZZY MATCHING ====================

  /// Fuzzy match labels (e.g., "travel" matches "Goa trip", "Delhi flight")
  static EntityResolution<List<String>> resolveLabels(
    String query,
    List<String> availableLabels,
  ) {
    final queryLower = query.trim().toLowerCase();
    if (queryLower.isEmpty) {
      return EntityResolution.notFound('Query is empty');
    }

    final matches = <MatchCandidate<String>>[];

    for (final label in availableLabels) {
      final labelLower = label.toLowerCase();

      // Exact match
      if (labelLower == queryLower) {
        matches.add(MatchCandidate(
          value: label,
          displayName: label,
          score: 1.0,
          matchType: MatchType.EXACT,
        ));
        continue;
      }

      // Contains query
      if (labelLower.contains(queryLower)) {
        matches.add(MatchCandidate(
          value: label,
          displayName: label,
          score: 0.8,
          matchType: MatchType.CONTAINS,
        ));
        continue;
      }

      // Query contains label (e.g., query="travel expenses", label="travel")
      if (queryLower.contains(labelLower)) {
        matches.add(MatchCandidate(
          value: label,
          displayName: label,
          score: 0.7,
          matchType: MatchType.CONTAINS,
        ));
        continue;
      }

      // Fuzzy match
      if (_fuzzyMatch(labelLower, queryLower)) {
        matches.add(MatchCandidate(
          value: label,
          displayName: label,
          score: 0.5,
          matchType: MatchType.FUZZY,
        ));
      }
    }

    if (matches.isEmpty) {
      return EntityResolution.notFound('No matching labels found for "$query"');
    }

    // Sort by score
    matches.sort((a, b) => b.score.compareTo(a.score));

    // Return all matches above threshold
    final goodMatches = matches.where((m) => m.score >= 0.5).map((m) => m.value).toList();
    
    return EntityResolution.success(goodMatches, confidence: matches.first.score);
  }

  // ==================== CATEGORY RESOLUTION ====================

  /// Resolve category with fuzzy matching
  static EntityResolution<String> resolveCategory(
    String query,
    List<String> availableCategories,
  ) {
    final queryLower = query.trim().toLowerCase();
    if (queryLower.isEmpty) {
      return EntityResolution.notFound('Query is empty');
    }

    final candidates = <MatchCandidate<String>>[];

    for (final category in availableCategories) {
      final categoryLower = category.toLowerCase();

      // Exact match
      if (categoryLower == queryLower) {
        return EntityResolution.success(category, confidence: 1.0);
      }

      // Starts with
      if (categoryLower.startsWith(queryLower) || queryLower.startsWith(categoryLower)) {
        candidates.add(MatchCandidate(
          value: category,
          displayName: category,
          score: 0.9,
          matchType: MatchType.STARTS_WITH,
        ));
        continue;
      }

      // Contains
      if (categoryLower.contains(queryLower) || queryLower.contains(categoryLower)) {
        candidates.add(MatchCandidate(
          value: category,
          displayName: category,
          score: 0.7,
          matchType: MatchType.CONTAINS,
        ));
        continue;
      }

      // Fuzzy match
      if (_fuzzyMatch(categoryLower, queryLower)) {
        candidates.add(MatchCandidate(
          value: category,
          displayName: category,
          score: 0.5,
          matchType: MatchType.FUZZY,
        ));
      }
    }

    if (candidates.isEmpty) {
      return EntityResolution.notFound('No matching category found for "$query"');
    }

    // Sort by score
    candidates.sort((a, b) => b.score.compareTo(a.score));

    // If top match is strong, return it
    if (candidates.first.score >= 0.7) {
      return EntityResolution.success(candidates.first.value, confidence: candidates.first.score);
    }

    // Multiple weak matches, need clarification
    if (candidates.length > 1) {
      return EntityResolution.ambiguous(candidates.map((c) => c.value).take(5).toList());
    }

    return EntityResolution.success(candidates.first.value, confidence: candidates.first.score);
  }

  // ==================== GROUP NAME RESOLUTION ====================

  /// Resolve group name to groupId
  static EntityResolution<String> resolveGroup(
    String query,
    Map<String, String> groupNames, // groupId -> groupName
  ) {
    final queryLower = query.trim().toLowerCase();
    if (queryLower.isEmpty) {
      return EntityResolution.notFound('Query is empty');
    }

    final candidates = <MatchCandidate<String>>[];

    for (final entry in groupNames.entries) {
      final groupId = entry.key;
      final groupName = entry.value;
      final nameLower = groupName.toLowerCase();

      // Exact match
      if (nameLower == queryLower) {
        return EntityResolution.success(groupId, confidence: 1.0);
      }

      // Contains
      if (nameLower.contains(queryLower) || queryLower.contains(nameLower)) {
        candidates.add(MatchCandidate(
          value: groupId,
          displayName: groupName,
          score: 0.8,
          matchType: MatchType.CONTAINS,
        ));
        continue;
      }

      // Fuzzy match
      if (_fuzzyMatch(nameLower, queryLower)) {
        candidates.add(MatchCandidate(
          value: groupId,
          displayName: groupName,
          score: 0.6,
          matchType: MatchType.FUZZY,
        ));
      }
    }

    if (candidates.isEmpty) {
      return EntityResolution.notFound('No matching group found for "$query"');
    }

    // Sort by score
    candidates.sort((a, b) => b.score.compareTo(a.score));

    if (candidates.first.score >= 0.8) {
      return EntityResolution.success(candidates.first.value, confidence: candidates.first.score);
    }

    if (candidates.length > 1) {
      return EntityResolution.ambiguous(candidates.map((c) => c.value).take(5).toList());
    }

    return EntityResolution.success(candidates.first.value, confidence: candidates.first.score);
  }

  // ==================== HELPER METHODS ====================

  /// Simple fuzzy matching using Levenshtein distance
  static bool _fuzzyMatch(String s1, String s2) {
    final distance = _levenshteinDistance(s1, s2);
    final maxLen = s1.length > s2.length ? s1.length : s2.length;
    
    // Allow up to 30% difference
    return distance <= (maxLen * 0.3).ceil();
  }

  /// Calculate Levenshtein distance between two strings
  static int _levenshteinDistance(String s1, String s2) {
    if (s1 == s2) return 0;
    if (s1.isEmpty) return s2.length;
    if (s2.isEmpty) return s1.length;

    final len1 = s1.length;
    final len2 = s2.length;
    final matrix = List.generate(len1 + 1, (_) => List<int>.filled(len2 + 1, 0));

    for (int i = 0; i <= len1; i++) {
      matrix[i][0] = i;
    }
    for (int j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (int i = 1; i <= len1; i++) {
      for (int j = 1; j <= len2; j++) {
        final cost = s1[i - 1] == s2[j - 1] ? 0 : 1;
        matrix[i][j] = [
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost, // substitution
        ].reduce((a, b) => a < b ? a : b);
      }
    }

    return matrix[len1][len2];
  }

  /// Resolve travel-related labels (special case for common query)
  static List<String> resolveTravelLabels(List<String> availableLabels) {
    final travelKeywords = ['trip', 'travel', 'flight', 'hotel', 'vacation', 'tour', 'visit'];
    final matches = <String>[];

    for (final label in availableLabels) {
      final labelLower = label.toLowerCase();
      for (final keyword in travelKeywords) {
        if (labelLower.contains(keyword)) {
          matches.add(label);
          break;
        }
      }
    }

    return matches;
  }
}
