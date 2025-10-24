// lib/themes/theme_provider.dart
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import 'app_theme.dart';

enum FiinnyTheme {
  fresh,
  royal,
  sunny,
  midnight,
  classic,
  pureDark,
  lightMinimal,
}

class ThemeProvider extends ChangeNotifier {
  FiinnyTheme _theme = FiinnyTheme.fresh;
  StreamSubscription<User?>? _authSub;

  // Optional DI (useful for tests or early init)
  final FirebaseAuth? _authOverride;
  final FirebaseFirestore? _fsOverride;

  FiinnyTheme get theme => _theme;
  FiinnyTheme get currentThemeKey => _theme; // used on profile screen

  ThemeData get themeData {
    switch (_theme) {
      case FiinnyTheme.royal:
        return royalTheme;
      case FiinnyTheme.sunny:
        return sunnyTheme;
      case FiinnyTheme.midnight:
        return midnightTheme;
      case FiinnyTheme.classic:
        return classicTheme;
      case FiinnyTheme.pureDark:
        return pureDarkTheme;
      case FiinnyTheme.lightMinimal:
        return lightMinimalTheme;
      default:
        return freshTheme;
    }
  }

  ThemeProvider({
    FirebaseAuth? firebaseAuth,
    FirebaseFirestore? firestore,
  })  : _authOverride = firebaseAuth,
        _fsOverride = firestore {
    // If Firebase isn’t initialized yet, don’t crash—attach later.
    _maybeAttachAuthListener();
  }

  /// Called by main.dart right after Firebase.initializeApp().
  Future<void> loadTheme() async {
    if (Firebase.apps.isEmpty) return; // guard if someone calls too early
    final auth = _authOverride ?? FirebaseAuth.instance;
    await _syncThemeFromRemote(auth.currentUser, notify: false);
  }

  void _maybeAttachAuthListener() {
    if (Firebase.apps.isEmpty) {
      // Try again on the next microtask; by then main() likely initialized Firebase.
      scheduleMicrotask(() {
        if (Firebase.apps.isNotEmpty) _attachAuthListener();
      });
      return;
    }
    _attachAuthListener();
  }

  void _attachAuthListener() {
    _authSub?.cancel();
    final auth = _authOverride ?? FirebaseAuth.instance;
    _authSub = auth.authStateChanges().listen((user) {
      unawaited(_syncThemeFromRemote(user));
    });
  }

  Future<void> _syncThemeFromRemote(User? user, {bool notify = true}) async {
    if (Firebase.apps.isEmpty) return; // hard guard
    if (user == null) {
      // Anonymous / signed out → default theme
      if (_theme != FiinnyTheme.fresh) {
        _theme = FiinnyTheme.fresh;
        if (notify) notifyListeners();
      }
      return;
    }

    try {
      final fs = _fsOverride ?? FirebaseFirestore.instance;
      final doc =
          await fs.collection('users').doc(user.uid).get(const GetOptions());
      final key = doc.data()?['selectedTheme'];
      if (key is String) {
        final match = FiinnyTheme.values.firstWhere(
          (t) => t.name == key,
          orElse: () => _theme,
        );
        if (match != _theme) {
          _theme = match;
          if (notify) notifyListeners();
        }
      }
    } catch (e) {
      debugPrint('Theme sync failed: $e');
      // Fail silently; keep current theme
    }
  }

  Future<void> setTheme(FiinnyTheme newTheme) async {
    if (_theme == newTheme) return;
    _theme = newTheme;
    notifyListeners();

    // Persist to Firestore only if signed-in and Firebase ready
    if (Firebase.apps.isEmpty) return;
    final auth = _authOverride ?? FirebaseAuth.instance;
    final user = auth.currentUser;
    if (user == null) return;

    try {
      final fs = _fsOverride ?? FirebaseFirestore.instance;
      await fs
          .collection('users')
          .doc(user.uid)
          .set({'selectedTheme': newTheme.name}, SetOptions(merge: true));
    } catch (e) {
      debugPrint('Theme persist failed: $e');
    }
  }

  bool get isDarkMode =>
      _theme == FiinnyTheme.midnight || _theme == FiinnyTheme.pureDark;

  void toggleTheme() {
    if (isDarkMode) {
      unawaited(setTheme(FiinnyTheme.fresh));
    } else {
      unawaited(setTheme(FiinnyTheme.midnight));
    }
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }
}
