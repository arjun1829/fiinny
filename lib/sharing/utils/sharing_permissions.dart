// lib/sharing/utils/sharing_permissions.dart

/// Permission utilities for partner/data sharing.
/// Backwards-compatible with the original API.
///
/// Key goals:
/// - Strong typing and whitelisting (avoid unknown/poison keys).
/// - Safe defaults (never grant unintended access).
/// - Small helpers for common flows (sanitize, grantedKeys, presets).
class SharingPermissions {
  // -----------------------------
  // Permission Keys (stable API)
  // -----------------------------
  static const String viewRing = 'ring';
  static const String viewTransactions = 'tx';
  static const String viewGoals = 'goals';
  static const String viewNotes = 'notes';
  static const String viewInsights = 'insights';

  // Known keys whitelist (order matters for UI)
  static const List<String> _orderedKeys = <String>[
    viewRing,
    viewTransactions,
    viewGoals,
    viewNotes,
    viewInsights,
  ];
  static const Set<String> _known = {
    viewRing,
    viewTransactions,
    viewGoals,
    viewNotes,
    viewInsights,
  };

  // -----------------------------
  // Human-readable labels (stable)
  // -----------------------------
  static String label(String key) {
    switch (key) {
      case viewRing:
        return 'Finance Ring';
      case viewTransactions:
        return 'Transactions';
      case viewGoals:
        return 'Goals';
      case viewNotes:
        return 'Notes';
      case viewInsights:
        return 'Insights';
      default:
        // Fallback: Title Case the raw key (never used if you stick to known keys)
        final clean = key.replaceAll(RegExp(r'[_\-]+'), ' ').trim();
        if (clean.isEmpty) {
          return key;
        }
        return clean[0].toUpperCase() + clean.substring(1);
    }
  }

  // -----------------------------
  // Defaults / Presets
  // -----------------------------
  /// Default set used across the app (unchanged values from your current code).
  static Map<String, bool> defaultPermissions() => {
        viewRing: true,
        viewTransactions: true,
        viewGoals: true,
        viewNotes: true,
        viewInsights: false,
      };

  /// Everything off.
  static Map<String, bool> empty() => {
        for (final k in _orderedKeys) k: false,
      };

  /// Minimal preset (example): only ring.
  static Map<String, bool> presetMinimal() => {
        viewRing: true,
        viewTransactions: false,
        viewGoals: false,
        viewNotes: false,
        viewInsights: false,
      };

  /// Standard preset (example): defaults clone.
  static Map<String, bool> presetStandard() =>
      Map<String, bool>.from(defaultPermissions());

  // -----------------------------
  // Queries
  // -----------------------------
  /// The canonical key order for UI.
  static List<String> allKeys() => List<String>.from(_orderedKeys);

  /// Check if a permission is enabled. Coerces non-bool values defensively.
  static bool canView(String key, Map<String, bool> permissions) {
    if (!_known.contains(key)) {
      return false;
    }
    final v = permissions[key];
    return v == true;
  }

  /// Toggle a permission (no-ops for unknown keys).
  static void togglePermission(String key, Map<String, bool> permissions) {
    if (!_known.contains(key)) {
      return;
    }
    permissions[key] = !(permissions[key] ?? false);
  }

  /// Return keys granted (true) in order.
  static List<String> grantedKeys(Map<String, bool>? permissions) {
    final p = ensureAllKeys(permissions);
    return _orderedKeys.where((k) => p[k] == true).toList();
  }

  /// Return a new map with only enabled keys (true). Useful for compact writes.
  static Map<String, bool> onlyEnabled(Map<String, bool>? permissions) {
    final p = ensureAllKeys(permissions);
    final out = <String, bool>{};
    for (final k in _orderedKeys) {
      if (p[k] == true) out[k] = true;
    }
    return out;
  }

  // -----------------------------
  // Normalization / Sanitization
  // -----------------------------
  /// Ensure all known keys exist, coerce to bool, ignore unknown keys.
  /// Existing values overwrite defaults, but only for known keys.
  static Map<String, bool> ensureAllKeys(Map<String, bool>? permissions) {
    final base = defaultPermissions();
    if (permissions == null) {
      return base;
    }

    permissions.forEach((k, v) {
      if (_known.contains(k)) {
        base[k] = v == true; // coerce to strict bool
      }
    });
    return base;
  }

  /// Sanitize a dynamic map (e.g., Firestore) into a strict {String: bool} over known keys.
  static Map<String, bool> sanitize(Map<String, dynamic>? raw) {
    final out = defaultPermissions();
    if (raw == null) {
      return out;
    }

    raw.forEach((k, v) {
      if (_known.contains(k)) {
        out[k] = _toBool(v);
      }
    });
    return out;
  }

  /// Accepts any map type and returns strict {String: bool} (alias to [sanitize]).
  static Map<String, bool> fromAny(Map<String, dynamic>? raw) => sanitize(raw);

  /// Build from a list of keys that should be true (unknown keys ignored).
  static Map<String, bool> fromTrueList(Iterable<String> keys) {
    final out = empty();
    for (final k in keys) {
      if (_known.contains(k)) {
        out[k] = true;
      }
    }
    return out;
  }

  /// Merge two permission maps safely (b overwrites a), both sanitized.
  static Map<String, bool> merge(
      Map<String, dynamic>? a, Map<String, dynamic>? b) {
    final left = sanitize(a);
    final right = sanitize(b);
    final out = Map<String, bool>.from(left);
    right.forEach((k, v) => out[k] = v);
    return out;
  }

  // -----------------------------
  // Internals
  // -----------------------------
  static bool _toBool(dynamic v) {
    if (v is bool) {
      return v;
    }
    if (v is num) {
      return v != 0;
    }
    if (v is String) {
      final s = v.trim().toLowerCase();
      return s == '1' || s == 'true' || s == 'yes' || s == 'y';
    }
    return false;
  }
}
