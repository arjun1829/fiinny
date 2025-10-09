import 'package:flutter/material.dart';
import '../shims/shared_prefs_shim.dart';

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

  void setTheme(FiinnyTheme newTheme) async {
    _theme = newTheme;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    prefs.setInt('selected_theme', _theme.index);
  }

  Future<void> loadTheme() async {  // 👈 Fix for main.dart
    final prefs = await SharedPreferences.getInstance();
    int? index = prefs.getInt('selected_theme');
    if (index != null && index >= 0 && index < FiinnyTheme.values.length) {
      _theme = FiinnyTheme.values[index];
      // Don't notifyListeners here, since it will be before runApp.
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
}
