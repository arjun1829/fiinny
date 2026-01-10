// lib/services/sms/sms_permission_helper.dart
import 'package:flutter/foundation.dart' show TargetPlatform, ValueNotifier, defaultTargetPlatform, kIsWeb;
import 'package:permission_handler/permission_handler.dart';

/// Simple helper for checking & requesting SMS permissions
/// Used by SmsIngestor before backfill or realtime listen.
class SmsPermissionHelper {
  static bool? _lastKnownStatus;
  static bool? get lastKnownStatus => _lastKnownStatus;
  static final ValueNotifier<bool?> permissionStatus = ValueNotifier<bool?>(null);

  static bool get _isAndroid => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static void _publish(bool? status) {
    _lastKnownStatus = status;
    permissionStatus.value = status;
  }

  /// Check if we already have SMS permission.
  static Future<bool> hasPermissions() async {
    if (!_isAndroid) {
       _publish(false);
       return false;
    }

    final status = await Permission.sms.status;
    final granted = status.isGranted || status.isLimited;

    _publish(granted);
    return granted;
  }

  /// Ensure we have SMS permission. Will prompt the user if needed.
  static Future<bool> ensurePermissions() async {
    if (!_isAndroid) {
       _publish(false);
       return false;
    }

    PermissionStatus status = await Permission.sms.status;
    if (status.isPermanentlyDenied) {
      _publish(false);
      return false;
    }

    bool granted = status.isGranted || status.isLimited;

    if (!granted) {
      status = await Permission.sms.request();
      granted = status.isGranted || status.isLimited;
    }
    
    // Fallback: If SMS is granted but maybe phone is needed for some reason?
    // In many cases, Permission.sms is enough for reading SMS.
    // If further permissions are needed, request them explicitly.
    if (granted) {
       // Optional: Check phone stats permission if logic dictates
       // var phoneStatus = await Permission.phone.status;
       // if (!phoneStatus.isGranted) await Permission.phone.request();
    }

    _publish(granted);
    return granted;
  }
}
