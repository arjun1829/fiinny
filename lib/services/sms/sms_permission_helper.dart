// lib/services/sms/sms_permission_helper.dart
import 'package:flutter/foundation.dart' show TargetPlatform, ValueNotifier, defaultTargetPlatform, kIsWeb;
import 'package:telephony/telephony.dart';

/// Simple helper for checking & requesting SMS permissions
/// Used by SmsIngestor before backfill or realtime listen.
class SmsPermissionHelper {
  static Telephony? _telephony;

  static bool? _lastKnownStatus;
  static bool? get lastKnownStatus => _lastKnownStatus;
  static final ValueNotifier<bool?> permissionStatus = ValueNotifier<bool?>(null);

  static bool get _isAndroid => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Telephony? _ensureTelephony() {
    if (!_isAndroid) {
      _publish(null);
      return null;
    }
    return _telephony ??= Telephony.instance;
  }

  static void _publish(bool? status) {
    _lastKnownStatus = status;
    permissionStatus.value = status;
  }

  /// Check if we already have SMS permission.
  static Future<bool> hasPermissions() async {
    final telephony = _ensureTelephony();
    if (telephony == null) return false;

    final granted = await _callPermissionGetter(
      () => telephony.requestSmsPermissions,
    ) || await _callPermissionGetter(
      () => telephony.requestPhoneAndSmsPermissions,
    );

    _publish(granted);
    return granted;
  }

  /// Ensure we have SMS permission. Will prompt the user if needed.
  static Future<bool> ensurePermissions() async {
    final telephony = _ensureTelephony();
    if (telephony == null) return false;

    var granted = await _callPermissionGetter(
      () => telephony.requestPhoneAndSmsPermissions,
      askPhonePermission: true,
    );

    if (!granted) {
      granted = await _callPermissionGetter(
        () => telephony.requestSmsPermissions,
        askPhonePermission: true,
      );
    }

    _publish(granted);
    return granted;
  }

  static Future<bool> _callPermissionGetter(
    dynamic Function() getter, {
    bool askPhonePermission = false,
  }) async {
    try {
      final dynamic candidate = getter();

      Future<bool?>? future;
      if (candidate is Future<bool?>) {
        future = candidate;
      } else if (candidate is Future<bool?> Function()) {
        future = candidate();
      } else if (candidate is Future<bool?> Function({bool? askPhonePermission})) {
        future = candidate(askPhonePermission: askPhonePermission);
      } else if (candidate is Future<bool?> Function({bool? force})) {
        future = candidate(force: askPhonePermission);
      }

      if (future == null) return false;

      final result = await future;
      return result ?? false;
    } catch (_) {
      return false;
    }
  }
}
