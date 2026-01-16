// lib/services/contact_name_service.dart
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../utils/permissions_helper.dart';
import '../utils/phone_number_utils.dart';

/// Provides best-effort contact name lookups (local-only cache).
///
/// The service keeps a lightweight in-memory + shared_preferences cache so that
/// once contact names are resolved, they continue to work offline.
class ContactNameService extends ChangeNotifier {
  ContactNameService._();

  static final ContactNameService instance = ContactNameService._();

  static const String _prefsKey = 'contactNames.cache.v1';

  Map<String, String> _cache = <String, String>{};
  bool _prefsLoaded = false;
  Future<void>? _prefsFuture;

  bool _deviceAttempted = false;
  Future<void>? _deviceFuture;

  /// Returns the cached contact name for [phone] if available.
  String? lookupCached(String phone) {
    final normalized = _normalize(phone);
    if (normalized == null) return null;
    return _cache[normalized];
  }

  /// Whether we should fall back to a contact name for [remoteName].
  bool shouldPreferContact(String? remoteName, String phone) {
    final trimmed = remoteName?.trim() ?? '';
    if (trimmed.isEmpty) return true;

    final lower = trimmed.toLowerCase();
    if (lower == phone.toLowerCase()) return true;
    if (lower.contains('member (') || lower.contains('friend (')) return true;

    final phoneDigits = digitsOnly(phone);
    if (phoneDigits.isEmpty) return false;

    final nameDigits = digitsOnly(trimmed);
    if (nameDigits.isEmpty) return false;

    if (nameDigits == phoneDigits) return true;
    if (phoneDigits.endsWith(nameDigits)) return true;

    return false;
  }

  /// Picks the best display label for [phone], preferring contact names when
  /// the remote/server name looks like a phone placeholder.
  String bestDisplayName({
    required String phone,
    String? remoteName,
    String? fallback,
  }) {
    final remoteTrimmed = remoteName?.trim() ?? '';
    final cached = lookupCached(phone);

    if (cached != null && cached.isNotEmpty && shouldPreferContact(remoteTrimmed, phone)) {
      return cached;
    }

    if (remoteTrimmed.isNotEmpty && !shouldPreferContact(remoteTrimmed, phone)) {
      return remoteTrimmed;
    }

    if (cached != null && cached.isNotEmpty) {
      return cached;
    }

    if (remoteTrimmed.isNotEmpty) {
      return remoteTrimmed;
    }

    if (fallback != null && fallback.trim().isNotEmpty) {
      return fallback.trim();
    }

    return phone;
  }

  /// Resolves a contact name for [phone], requesting permissions only when
  /// necessary. If permission is denied, returns `null` and keeps the existing
  /// placeholder.
  Future<String?> lookup(String phone) async {
    final normalized = _normalize(phone);
    if (normalized == null) return null;

    await _ensurePrefsLoaded();
    final cached = _cache[normalized];
    if (cached != null && cached.isNotEmpty) return cached;

    await _loadFromDevice();
    return _cache[normalized];
  }

  Future<void> _ensurePrefsLoaded() {
    if (_prefsLoaded) return Future.value();
    return _prefsFuture ??= _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_prefsKey);
      if (raw == null || raw.isEmpty) {
        _prefsLoaded = true;
        return;
      }

      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        final restored = <String, String>{};
        decoded.forEach((key, value) {
          if (key is String && value is String) {
            final trimmed = value.trim();
            if (key.isNotEmpty && trimmed.isNotEmpty) {
              restored[key] = trimmed;
            }
          }
        });
        _cache = restored;
      }
    } catch (e, stack) {
      debugPrint('ContactNameService prefs load failed: $e\n$stack');
    } finally {
      _prefsLoaded = true;
    }
  }

  Future<void> _persistCache() async {
    if (!_prefsLoaded) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, jsonEncode(_cache));
    } catch (e, stack) {
      debugPrint('ContactNameService prefs save failed: $e\n$stack');
    }
  }

  Future<void> _loadFromDevice() async {
    if (_deviceAttempted) {
      await (_deviceFuture ?? Future.value());
      return;
    }

    _deviceAttempted = true;
    _deviceFuture = _fetchFromDevice();
    await _deviceFuture;
  }

  Future<void> _fetchFromDevice() async {
    try {
      final result = await getContactsWithPermission();
      if (!result.granted) {
        return;
      }

      final updated = <String, String>{};

      for (final Contact contact in result.contacts) {
        final display = contact.displayName.trim();
        if (display.isEmpty) continue;

        for (final Phone phone in contact.phones) {
          final raw = phone.normalizedNumber.isNotEmpty == true
              ? phone.normalizedNumber
              : phone.number;
          final normalized = _normalize(raw);
          if (normalized == null) continue;

          final existing = _cache[normalized];
          if (existing == display) continue;
          updated[normalized] = display;
        }
      }

      if (updated.isNotEmpty) {
        _cache.addAll(updated);
        await _persistCache();
        notifyListeners();
      }
    } catch (e, stack) {
      debugPrint('ContactNameService load failed: $e\n$stack');
    }
  }

  static String? _normalize(String? raw) {
    if (raw == null) return null;
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;

    final normalized = normalizeToE164(trimmed);
    return normalized.isEmpty ? null : normalized;
  }
}
