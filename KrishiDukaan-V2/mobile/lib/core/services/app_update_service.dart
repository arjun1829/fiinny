import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// How urgently the installed build needs to be updated.
enum AppUpdateStatus {
  /// Running the latest version (or the check failed / is disabled) — say nothing.
  upToDate,

  /// A newer version exists. Dialog is dismissible ("Later").
  optional,

  /// Installed build is below `minSupportedVersion` — dialog blocks the app.
  /// Use only for releases that genuinely break without updating (schema
  /// change, security fix), never for routine releases.
  forced,
}

/// The remote update policy, stored in Firestore at `appVersion/current`.
///
/// Schema (all fields optional except `latestVersion` — missing/!enabled is
/// treated as "no update to advertise", so a malformed doc can never lock
/// users out of the app):
/// ```
/// appVersion/current {
///   enabled:             true,          // kill switch for the whole feature
///   latestVersion:       "2.5.0",       // newest published build
///   minSupportedVersion: "2.4.0",       // below this → forced update
///   androidUrl:          "https://play.google.com/store/apps/details?id=…",
///   iosUrl:              "https://apps.apple.com/app/id…",
///   releaseNotes:        "What's new…"  // shown in the dialog when present
/// }
/// ```
class AppUpdateInfo {
  final AppUpdateStatus status;
  final String currentVersion;
  final String latestVersion;
  final String? storeUrl;
  final String? releaseNotes;

  const AppUpdateInfo({
    required this.status,
    required this.currentVersion,
    required this.latestVersion,
    this.storeUrl,
    this.releaseNotes,
  });

  static const none = AppUpdateInfo(
    status: AppUpdateStatus.upToDate,
    currentVersion: '',
    latestVersion: '',
  );

  bool get needsUpdate => status != AppUpdateStatus.upToDate;
  bool get isForced => status == AppUpdateStatus.forced;
}

class AppUpdateService {
  static const _androidFallbackUrl =
      'https://play.google.com/store/apps/details?id=com.karanarjuntechnologies.KrishiDukan';

  final FirebaseFirestore _db;
  AppUpdateService({FirebaseFirestore? db})
      : _db = db ?? FirebaseFirestore.instance;

  /// Compares two dotted version strings numerically.
  /// Returns <0 when [a] is older than [b], 0 when equal, >0 when newer.
  ///
  /// Segment-wise numeric comparison (not string comparison) so "2.10.0"
  /// correctly sorts above "2.9.0". Non-numeric suffixes ("-beta") are
  /// ignored rather than throwing.
  @visibleForTesting
  static int compareVersions(String a, String b) {
    List<int> parts(String v) {
      var core = v.trim();
      // Strip semver build metadata ("+117") and pre-release ("-beta") before
      // splitting. Neither participates in precedence, and a pubspec-style
      // "2.4.0+117" would otherwise parse as a fourth segment that outranks
      // plain "2.4.0" — falsely advertising an update to an up-to-date user.
      final plus = core.indexOf('+');
      if (plus != -1) core = core.substring(0, plus);
      final dash = core.indexOf('-');
      if (dash != -1) core = core.substring(0, dash);
      return core
          .split('.')
          .map((s) => int.tryParse(s.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0)
          .toList();
    }

    final pa = parts(a);
    final pb = parts(b);
    final len = pa.length > pb.length ? pa.length : pb.length;
    for (var i = 0; i < len; i++) {
      final x = i < pa.length ? pa[i] : 0;
      final y = i < pb.length ? pb[i] : 0;
      if (x != y) return x.compareTo(y);
    }
    return 0;
  }

  /// Reads the remote policy and compares it against the running build.
  ///
  /// Never throws and never blocks startup: any failure (offline, missing
  /// doc, permission error, malformed data) resolves to [AppUpdateInfo.none]
  /// so the app opens normally. Web is skipped entirely — there is no app
  /// store build to update to.
  Future<AppUpdateInfo> check() async {
    if (kIsWeb) return AppUpdateInfo.none;
    try {
      final info = await PackageInfo.fromPlatform();
      final current = info.version;
      if (current.isEmpty) return AppUpdateInfo.none;

      final snap = await _db.collection('appVersion').doc('current').get();
      if (!snap.exists) return AppUpdateInfo.none;
      final d = snap.data();
      if (d == null || d['enabled'] == false) return AppUpdateInfo.none;

      final latest = (d['latestVersion'] as String?)?.trim() ?? '';
      if (latest.isEmpty) return AppUpdateInfo.none;

      // Already current (or ahead — e.g. an internal test build).
      if (compareVersions(current, latest) >= 0) return AppUpdateInfo.none;

      final minSupported = (d['minSupportedVersion'] as String?)?.trim() ?? '';
      final forced = minSupported.isNotEmpty &&
          compareVersions(current, minSupported) < 0;

      final isAndroid = defaultTargetPlatform == TargetPlatform.android;
      final rawUrl = isAndroid
          ? (d['androidUrl'] as String?)
          : (d['iosUrl'] as String?);
      final storeUrl = (rawUrl != null && rawUrl.trim().startsWith('http'))
          ? rawUrl.trim()
          : (isAndroid ? _androidFallbackUrl : null);

      // No reachable store link (iOS before App Store approval) — nagging the
      // user with a dialog they cannot action would be worse than staying quiet.
      if (storeUrl == null) return AppUpdateInfo.none;

      final notes = (d['releaseNotes'] as String?)?.trim();

      return AppUpdateInfo(
        status: forced ? AppUpdateStatus.forced : AppUpdateStatus.optional,
        currentVersion: current,
        latestVersion: latest,
        storeUrl: storeUrl,
        releaseNotes: (notes != null && notes.isNotEmpty) ? notes : null,
      );
    } catch (_) {
      return AppUpdateInfo.none;
    }
  }
}
