// lib/services/push/first_surface_gate.dart
// Coordinates when it is safe to present system UI (e.g. notification prompts)
// so we do not interrupt Flutter while it is still mounting the first route.

import 'dart:async';
import 'package:flutter/foundation.dart';

class FirstSurfaceGate {
  FirstSurfaceGate._();

  static final Completer<void> _readyCompleter = Completer<void>();

  /// Whether the initial surface has already been marked as ready.
  static bool get isReady => _readyCompleter.isCompleted;

  /// Await the first real navigation completing so we can safely surface
  /// intrusive UI such as the iOS notification permission sheet. The future
  /// resolves once [markReady] is invoked or after [timeout] elapses.
  static Future<void> waitUntilReady({Duration timeout = const Duration(seconds: 5)}) async {
    if (_readyCompleter.isCompleted) return;

    try {
      if (timeout == Duration.zero) {
        await _readyCompleter.future;
      } else {
        await _readyCompleter.future.timeout(timeout);
      }
    } catch (_) {
      if (kDebugMode) {
        // ignore: avoid_print
        print('[FirstSurfaceGate] waitUntilReady timeout; continuing.');
      }
    }
  }

  /// Signal that the app has transitioned away from the launcher splash and
  /// the UI can safely handle permission sheets without leaving a blank
  /// surface behind.
  static void markReady() {
    if (_readyCompleter.isCompleted) return;
    _readyCompleter.complete();
  }
}
