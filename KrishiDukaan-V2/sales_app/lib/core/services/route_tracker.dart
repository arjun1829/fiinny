import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../../features/day_session/data/day_session.dart';
import '../../features/day_session/data/day_session_repository.dart';
import 'location_service.dart';

/// Records where the rep actually is every 15 minutes while a day is open.
///
/// Why: the end-of-day distance used to be start → visits → end, i.e. the
/// shortest road between the stops. A rep who took another road, or went
/// somewhere between visits, was credited the wrong distance. These breadcrumbs
/// let the route be rebuilt through the places the rep really was.
///
/// Android keeps this alive with a foreground service (hence the persistent
/// notification); iOS uses background location updates. If the OS or the rep
/// kills the app, tracking stops until the app is next opened — it then resumes
/// from [ensureRunning] and immediately drops a fresh point.
class RouteTracker {
  RouteTracker._();

  static const interval = Duration(minutes: 15);

  /// A little under the interval, so a stream event arriving a few seconds
  /// early is still stored rather than skipped until the next cycle.
  static const _minGap = Duration(minutes: 14);

  static StreamSubscription<Position>? _sub;
  static String? _sessionId;
  static DateTime? _lastSavedAt;
  static final _repo = DaySessionRepository();

  static bool isTrackingSession(String sessionId) => _sessionId == sessionId;

  /// Starts (or keeps) tracking for [sessionId]. [lastPointAt] is the time of
  /// the newest point already stored, so a restart doesn't double-record.
  static Future<void> ensureRunning(
    String sessionId, {
    DateTime? lastPointAt,
  }) async {
    if (isTrackingSession(sessionId)) return;
    await stop();
    // Claimed before the first await below, so a second caller (Start Day and
    // the session provider both fire on a new day) can't open a second stream.
    _sessionId = sessionId;

    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _sessionId = null;
        return;
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        _sessionId = null;
        return;
      }

      _lastSavedAt = lastPointAt;

      _sub = Geolocator.getPositionStream(locationSettings: _settings()).listen(
        (p) => _onPosition(sessionId, p),
        // Tracking is best-effort: a stream error must never surface to the
        // rep or affect starting/ending the day.
        onError: (_) {},
        cancelOnError: false,
      );
    } catch (_) {
      _sub = null;
      _sessionId = null;
    }
  }

  static Future<void> stop() async {
    final sub = _sub;
    _sub = null;
    _sessionId = null;
    _lastSavedAt = null;
    await sub?.cancel();
  }

  static Future<void> _onPosition(String sessionId, Position p) async {
    if (_sessionId != sessionId) return;
    final now = DateTime.now();
    final last = _lastSavedAt;
    if (last != null && now.difference(last) < _minGap) return;
    _lastSavedAt = now;
    try {
      await _repo.addTrackPoint(
        sessionId,
        TrackPoint(
          point: LatLngPoint(p.latitude, p.longitude),
          at: now,
          accuracyM: p.accuracy,
        ),
      );
    } catch (_) {
      // Allow the next event to retry instead of waiting out a full gap.
      _lastSavedAt = last;
    }
  }

  static LocationSettings _settings() {
    if (kIsWeb) {
      return const LocationSettings(accuracy: LocationAccuracy.high);
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return AndroidSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 0,
          intervalDuration: interval,
          foregroundNotificationConfig: const ForegroundNotificationConfig(
            notificationTitle: 'Day in progress',
            notificationText:
                'KrishiDukaan Sales is recording your route. It stops when you end your day.',
            notificationIcon: AndroidResource(
              name: 'ic_launcher',
              defType: 'mipmap',
            ),
            enableWakeLock: true,
            setOngoing: true,
          ),
        );
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
        return AppleSettings(
          accuracy: LocationAccuracy.high,
          activityType: ActivityType.automotiveNavigation,
          distanceFilter: 0,
          pauseLocationUpdatesAutomatically: false,
          showBackgroundLocationIndicator: true,
          allowBackgroundLocationUpdates: true,
        );
      default:
        return const LocationSettings(accuracy: LocationAccuracy.high);
    }
  }
}
