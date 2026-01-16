// lib/themes/theme_provider.dart
import 'dart:async';

import 'package:flutter/material.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import 'app_theme.dart';
import '../ui/theme.dart';
import '../ui/tokens.dart';

enum FiinnyTheme {
  teal,
  mint,
  black,
  white,
}

class ThemeProvider extends ChangeNotifier {
  FiinnyTheme _theme = FiinnyTheme.teal;
  StreamSubscription<User?>? _authSub;

  // Optional DI (useful for tests or early init)
  final FirebaseAuth? _authOverride;
  final FirebaseFirestore? _fsOverride;

  FiinnyTheme get theme => _theme;
  FiinnyTheme get currentThemeKey => _theme; // used on profile screen

  ThemeData get themeData {
    switch (_theme) {
      case FiinnyTheme.teal:
        return buildAppTheme(
          const ColorScheme.light(
            primary: tealPrimary,
            secondary: Colors.tealAccent,
            surface: Colors.white,
            onSurface: AppColors.ink900,
            onPrimary: Colors.white,
          ),
          scaffoldBackgroundColor: AppColors.mintSoft,
        );
      case FiinnyTheme.mint:
        return buildAppTheme(
          const ColorScheme.light(
            primary: tiffanyBlue,
            secondary: mintGreen,
            surface: Colors.white,
            onSurface: deepTeal,
            onPrimary: deepTeal,
          ),
          scaffoldBackgroundColor: Colors.white,
        );

      case FiinnyTheme.black:
        return buildAppTheme(
          const ColorScheme.dark(
            primary: Colors.white,
            secondary: Colors.white,
            surface: Colors.black,
            onSurface: Colors.white,
            onPrimary: Colors.black, // Ensure text on white buttons is black
          ),
          scaffoldBackgroundColor: Colors.black,
        );
      case FiinnyTheme.white:
        return buildAppTheme(
          const ColorScheme.light(
            primary: Colors.black,
            secondary: Colors.black,
            surface: Colors.white,
            onPrimary: Colors.white,
          ),
          scaffoldBackgroundColor: Colors.white,
        );
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
      if (_theme != FiinnyTheme.teal) {
        _theme = FiinnyTheme.teal;
        if (notify) notifyListeners();
      }
      return;
    }

    try {
      final fs = _fsOverride ?? FirebaseFirestore.instance;
      final docId = user.phoneNumber ?? user.uid;
      final doc =
          await fs.collection('users').doc(docId).get(const GetOptions());
      final key = doc.data()?['theme_key'];
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
      final docId = user.phoneNumber ?? user.uid;
      await fs
          .collection('users')
          .doc(docId)
          .set({'theme_key': newTheme.name}, SetOptions(merge: true));
    } catch (e) {
      debugPrint('Theme persist failed: $e');
    }
  }

  bool get isDarkMode => _theme == FiinnyTheme.black;

  void toggleTheme() {
    if (isDarkMode) {
      unawaited(setTheme(FiinnyTheme.teal));
    } else {
      unawaited(setTheme(FiinnyTheme.black));
    }
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }
}
