import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'app_theme.dart';

enum FiinnyTheme {
  fresh,
  royal,
  sunny,
  midnight,
  classic,
  pureDark,
  lightMinimal
}

class ThemeProvider extends ChangeNotifier {
  FiinnyTheme _theme = FiinnyTheme.fresh;
  StreamSubscription<User?>? _authSub;

  FiinnyTheme get theme => _theme;
  FiinnyTheme get currentThemeKey => _theme;   // 👈 Fix for profile screen

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

  ThemeProvider() {
    _authSub = FirebaseAuth.instance.authStateChanges().listen((user) {
      unawaited(_syncThemeFromRemote(user));
    });
  }

  Future<void> loadTheme() async {
    await _syncThemeFromRemote(FirebaseAuth.instance.currentUser, notify: false);
  }

  Future<void> _syncThemeFromRemote(User? user, {bool notify = true}) async {
    if (user == null) {
      if (_theme != FiinnyTheme.fresh) {
        _theme = FiinnyTheme.fresh;
        if (notify) notifyListeners();
      }
      return;
    }

    try {
      final doc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
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
    }
  }

  void setTheme(FiinnyTheme newTheme) async {
    if (_theme == newTheme) return;
    _theme = newTheme;
    notifyListeners();
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    try {
      await FirebaseFirestore.instance
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
      setTheme(FiinnyTheme.fresh);
    } else {
      setTheme(FiinnyTheme.midnight);
    }
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }
}
