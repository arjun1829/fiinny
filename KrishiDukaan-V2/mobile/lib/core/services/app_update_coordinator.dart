import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:in_app_update/in_app_update.dart' as play;
import 'package:shared_preferences/shared_preferences.dart';

import '../widgets/app_update_dialog.dart';
import 'app_update_service.dart';

/// Decides when and how to tell the user a newer build exists.
///
/// Android (Play-installed): Google Play's own in-app update UI — the native
/// "Update available" sheet. Optional updates download in the background
/// (flexible) and a snackbar offers "Restart" once ready; updates below
/// `appVersion/current.minSupportedVersion` use Play's full-screen immediate
/// flow. Builds Play can't serve (sideloaded, the uat flavor) fall back to the
/// branded dialog that links to the store.
///
/// iOS: the branded dialog, driven by the live App Store version plus the
/// `appVersion/current` doc.
///
/// Runs once after launch and again when the app returns to the foreground,
/// throttled so a user who keeps the app open for days still hears about a
/// release without being checked on every resume.
class AppUpdateCoordinator {
  AppUpdateCoordinator._();

  static const _throttle = Duration(hours: 6);
  static const _snoozedPlayCodeKey = 'update_snoozed_play_code';

  static GoRouter? _router;
  static GlobalKey<ScaffoldMessengerState>? _messengerKey;
  static bool Function() _isHindi = _never;
  static bool _launchSettled = false;
  static bool _busy = false;
  static bool _restartOffered = false;
  static DateTime? _lastCheck;
  static StreamSubscription<play.InstallStatus>? _installSub;

  static bool _never() => false;

  static bool get _isAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// Called once from the app root, before any check can run.
  static void configure({
    required GoRouter router,
    required GlobalKey<ScaffoldMessengerState> messengerKey,
    required bool Function() isHindi,
  }) {
    _router = router;
    _messengerKey = messengerKey;
    _isHindi = isHindi;
  }

  /// Splash has routed to the first real screen. A dialog shown any earlier
  /// would be torn down with the splash page.
  static void onLaunchSettled() {
    _launchSettled = true;
    // Let the first screen paint and its data start loading before we
    // compete for the network.
    Future.delayed(const Duration(milliseconds: 1500), checkNow);
  }

  /// App returned to the foreground.
  static void onResumed() {
    if (!_launchSettled) return;
    // A flexible update may have finished downloading while backgrounded.
    if (_isAndroid) unawaited(_offerRestartIfDownloaded());
    checkNow();
  }

  static Future<void> checkNow() async {
    if (kIsWeb || _busy || !_launchSettled) return;
    final last = _lastCheck;
    if (last != null && DateTime.now().difference(last) < _throttle) return;
    _busy = true;
    _lastCheck = DateTime.now();
    try {
      final policy = await AppUpdateService().check();
      if (_isAndroid && await _tryPlayUpdate(policy)) return;
      final ctx = _router?.routerDelegate.navigatorKey.currentContext;
      if (ctx == null || !ctx.mounted) return;
      await maybeShowUpdateDialog(ctx, policy, isHindi: _isHindi());
    } catch (_) {
      // Never let an update check disturb the app.
    } finally {
      _busy = false;
    }
  }

  /// Returns true when Play handled the decision (including "no update"), so
  /// the store-link dialog is only the fallback for non-Play installs.
  static Future<bool> _tryPlayUpdate(AppUpdateInfo policy) async {
    final play.AppUpdateInfo info;
    try {
      info = await play.InAppUpdate.checkForUpdate();
    } catch (_) {
      return false; // Not installed from Play (sideload, uat) — use dialog.
    }

    if (info.installStatus == play.InstallStatus.downloaded) {
      _showRestartSnackBar();
      return true;
    }

    final available = info.updateAvailability ==
            play.UpdateAvailability.updateAvailable ||
        info.updateAvailability ==
            play.UpdateAvailability.developerTriggeredUpdateInProgress;
    // Play is the authority on whether there is anything to install; a doc
    // that is ahead of the rollout must not nag users who can't update yet.
    if (!available) return true;

    // Priority 5 is set per release from the Play Console API for urgent fixes.
    final mustUpdate = policy.isForced || info.updatePriority >= 5;

    if (mustUpdate && info.immediateUpdateAllowed) {
      final r = await play.InAppUpdate.performImmediateUpdate();
      if (r == play.AppUpdateResult.success) return true;
      // Declined a required update — the blocking dialog takes over.
      return !policy.isForced;
    }
    if (mustUpdate) return false;

    final code = '${info.availableVersionCode ?? ''}';
    if (await _snoozed(code)) return true;

    if (!info.flexibleUpdateAllowed) {
      if (!info.immediateUpdateAllowed) return false;
      final r = await play.InAppUpdate.performImmediateUpdate();
      if (r == play.AppUpdateResult.userDeniedUpdate) await _snooze(code);
      return true;
    }

    _listenForDownload();
    final r = await play.InAppUpdate.startFlexibleUpdate();
    if (r == play.AppUpdateResult.userDeniedUpdate) await _snooze(code);
    return true;
  }

  static void _listenForDownload() {
    _installSub ??= play.InAppUpdate.installUpdateListener.listen(
      (status) {
        if (status == play.InstallStatus.downloaded) _showRestartSnackBar();
      },
      onError: (_) {},
    );
  }

  static Future<void> _offerRestartIfDownloaded() async {
    try {
      final info = await play.InAppUpdate.checkForUpdate();
      if (info.installStatus == play.InstallStatus.downloaded) {
        _showRestartSnackBar();
      }
    } catch (_) {}
  }

  static void _showRestartSnackBar() {
    if (_restartOffered) return;
    final messenger = _messengerKey?.currentState;
    if (messenger == null) return;
    _restartOffered = true;
    final hi = _isHindi();
    messenger.showSnackBar(
      SnackBar(
        duration: const Duration(days: 1),
        content: Text(hi
            ? 'नया अपडेट डाउनलोड हो गया है।'
            : 'A new version of KrishiDukan is ready.'),
        action: SnackBarAction(
          label: hi ? 'रीस्टार्ट' : 'RESTART',
          onPressed: () async {
            _restartOffered = false;
            try {
              await play.InAppUpdate.completeFlexibleUpdate();
            } catch (_) {}
          },
        ),
      ),
    );
  }

  static Future<bool> _snoozed(String code) async {
    if (code.isEmpty) return false;
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_snoozedPlayCodeKey) == code;
    } catch (_) {
      return false;
    }
  }

  static Future<void> _snooze(String code) async {
    if (code.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_snoozedPlayCodeKey, code);
    } catch (_) {}
  }
}
