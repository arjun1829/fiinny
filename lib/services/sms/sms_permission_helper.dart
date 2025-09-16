// lib/services/sms/sms_permission_helper.dart
import 'package:telephony/telephony.dart';

/// Simple helper for checking & requesting SMS permissions
/// Used by SmsIngestor before backfill or realtime listen.
class SmsPermissionHelper {
  static final Telephony _telephony = Telephony.instance;

  /// Check if we already have SMS permission.
  static Future<bool> hasPermissions() async {
    try {
      final status = await _telephony.requestPhoneAndSmsPermissions;
      return status ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Ensure we have SMS permission. Will prompt the user if needed.
  static Future<bool> ensurePermissions() async {
    try {
      final status = await _telephony.requestPhoneAndSmsPermissions;
      return status ?? false;
    } catch (_) {
      return false;
    }
  }
}
