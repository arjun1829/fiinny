// import 'dart:io'; // Removed for web compatibility
import 'package:flutter/foundation.dart';
import 'package:app_tracking_transparency/app_tracking_transparency.dart';
import 'package:permission_handler/permission_handler.dart' as perm;

class ConsentService {
  ConsentService._();

  static TrackingStatus _lastStatus = TrackingStatus.notDetermined;
  static bool _authorized = false;
  static bool _requestedOnce = false;

  static TrackingStatus get lastStatus => _lastStatus;
  static bool get authorized => _authorized;

  static bool get isDeniedOrRestricted =>
      _lastStatus == TrackingStatus.denied ||
      _lastStatus == TrackingStatus.restricted;

  /// Shows only the system ATT dialog (iOS >= 14.5) and returns true if authorized.
  static Future<bool> requestATTIfNeeded() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) {
      _authorized = true;
      _lastStatus = TrackingStatus.authorized;
      return true;
    }

    if (_requestedOnce) return _authorized;
    _requestedOnce = true;

    var status = await AppTrackingTransparency.trackingAuthorizationStatus;
    _lastStatus = status;

    if (status == TrackingStatus.notDetermined) {
      await Future.delayed(const Duration(milliseconds: 300));
      status = await AppTrackingTransparency.requestTrackingAuthorization();
      _lastStatus = status;
    }

    _authorized = status == TrackingStatus.authorized;
    return _authorized;
  }

  /// Open app Settings (no ATT pre-prompt).
  static Future<void> openSettings() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) return;
    try {
      await perm.openAppSettings();
    } catch (_) {}
  }
}
