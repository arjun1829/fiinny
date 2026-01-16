/// Result of entity resolution with support for ambiguous matches
class EntityResolution<T> {
  final T? value; // Resolved value (if unique match)
  final List<T> candidates; // All possible matches
  final bool needsClarification; // True if multiple matches found
  final String? errorMessage; // Error if resolution failed
  final double? confidence; // Match confidence (0-1)

  const EntityResolution({
    this.value,
    this.candidates = const [],
    this.needsClarification = false,
    this.errorMessage,
    this.confidence,
  });

  /// Successful unique resolution
  factory EntityResolution.success(T value, {double? confidence}) {
    return EntityResolution(
      value: value,
      candidates: [value],
      needsClarification: false,
      confidence: confidence ?? 1.0,
    );
  }

  /// Multiple candidates found, needs user clarification
  factory EntityResolution.ambiguous(List<T> candidates) {
    return EntityResolution(
      value: null,
      candidates: candidates,
      needsClarification: true,
    );
  }

  /// No matches found
  factory EntityResolution.notFound(String errorMessage) {
    return EntityResolution(
      value: null,
      candidates: const [],
      needsClarification: false,
      errorMessage: errorMessage,
    );
  }

  bool get isSuccess => value != null && !needsClarification;
  bool get isAmbiguous => needsClarification && candidates.length > 1;
  bool get isNotFound =>
      value == null && candidates.isEmpty && !needsClarification;
}

/// Candidate match with metadata
class MatchCandidate<T> {
  final T value;
  final String displayName;
  final double score; // Match score (0-1, higher = better)
  final MatchType matchType;

  const MatchCandidate({
    required this.value,
    required this.displayName,
    required this.score,
    required this.matchType,
  });
}

enum MatchType {
  exact, // Exact match
  startsWith, // Starts with query
  contains, // Contains query
  fuzzy, // Fuzzy match (Levenshtein)
}

/// Friend resolution result with contact info
class FriendResolution {
  final String? phone;
  final String? name;
  final List<FriendCandidate> candidates;
  final bool needsClarification;

  const FriendResolution({
    this.phone,
    this.name,
    this.candidates = const [],
    this.needsClarification = false,
  });

  factory FriendResolution.success(String phone, String name) {
    return FriendResolution(
      phone: phone,
      name: name,
      candidates: [FriendCandidate(phone: phone, name: name, score: 1.0)],
      needsClarification: false,
    );
  }

  factory FriendResolution.ambiguous(List<FriendCandidate> candidates) {
    return FriendResolution(
      phone: null,
      name: null,
      candidates: candidates,
      needsClarification: true,
    );
  }

  factory FriendResolution.notFound() {
    return const FriendResolution(
      phone: null,
      name: null,
      candidates: [],
      needsClarification: false,
    );
  }
}

class FriendCandidate {
  final String phone;
  final String name;
  final double score;

  const FriendCandidate({
    required this.phone,
    required this.name,
    required this.score,
  });
}
