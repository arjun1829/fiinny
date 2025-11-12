import 'dart:io';

import 'package:app_tracking_transparency/app_tracking_transparency.dart';
import 'package:permission_handler/permission_handler.dart' show openAppSettings;

/// Centralized helper for Apple App Tracking Transparency (ATT) consent.
typedef ConsentPrePrompt = Future<bool> Function();

class ConsentService {
  ConsentService._();

  static TrackingStatus _lastStatus = TrackingStatus.notDetermined;
  static bool _authorized = false;

  static TrackingStatus get lastStatus => _lastStatus;
  static bool get authorized => _authorized;

  static bool get isDeniedOrRestricted =>
      _lastStatus == TrackingStatus.denied || _lastStatus == TrackingStatus.restricted;

  /// Requests ATT authorisation on iOS and records the result.
  ///
  /// Returns [true] when the user authorises tracking.
  /// When a [showPrePrompt] callback is supplied it will be shown before
  /// Apple's system dialog and should resolve to `true` to proceed.
  static Future<bool> requestATTIfNeeded({ConsentPrePrompt? showPrePrompt}) async {
    if (!Platform.isIOS) {
      _authorized = true;
      _lastStatus = TrackingStatus.authorized;
      return _authorized;
    }

    var status = await AppTrackingTransparency.trackingAuthorizationStatus;
    _lastStatus = status;

    if (status == TrackingStatus.notDetermined) {
      if (showPrePrompt != null) {
        final proceed = await showPrePrompt();
        if (proceed != true) {
          _authorized = false;
          return _authorized;
        }
      }

      await Future.delayed(const Duration(milliseconds: 300));
      status = await AppTrackingTransparency.requestTrackingAuthorization();
      _lastStatus = status;
    }

    _authorized = status == TrackingStatus.authorized;
    return _authorized;
  }

  static Future<void> openSettings() async {
    if (!Platform.isIOS) {
      return;
    }

    try {
      final didOpen = await openAppSettings();
      if (!didOpen) {
        // Best-effort attempt: if the dedicated settings screen could not be
        // opened, fall back to re-requesting the authorization dialog.
        await AppTrackingTransparency.requestTrackingAuthorization();
      }
    } catch (_) {
      // The underlying plugin can throw when the iOS version does not support
      // opening the settings screen directly. Ignore and keep the flow
      // consistent for callers.
    }
  }
}
