// lib/services/sms/sms_permission_helper.dart
import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:telephony/telephony.dart';

/// Simple helper for checking & requesting SMS permissions
/// Used by SmsIngestor before backfill or realtime listen.
class SmsPermissionHelper {
  static Telephony? _telephony;

  static bool get _isAndroid => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Telephony? _ensureTelephony() {
    if (!_isAndroid) return null;
    return _telephony ??= Telephony.instance;
  }

  /// Check if we already have SMS permission.
  static Future<bool> hasPermissions() async {
    final telephony = _ensureTelephony();
    if (telephony == null) return false;
    try {
      final status = await telephony.requestPhoneAndSmsPermissions;
      return status ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Ensure we have SMS permission. Will prompt the user if needed.
  static Future<bool> ensurePermissions() async {
    final telephony = _ensureTelephony();
    if (telephony == null) return false;
    try {
      final status = await telephony.requestPhoneAndSmsPermissions;
      return status ?? false;
    } catch (_) {
      return false;
    }
  }
}
