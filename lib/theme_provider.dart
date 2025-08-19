import 'package:flutter/material.dart';
import 'app_theme.dart';

enum FiinnyTheme { light, dark, glass, fresh } // add fresh

class ThemeProvider extends ChangeNotifier {
  FiinnyTheme _theme = FiinnyTheme.fresh;

  var currentThemeKey; // set fresh as default

  FiinnyTheme get theme => _theme;

  ThemeData get themeData {
    switch (_theme) {
      case FiinnyTheme.dark:
        return darkTheme;
      case FiinnyTheme.glass:
        return glassTheme;
      case FiinnyTheme.fresh:
        return freshTheme;
      default:
        return appTheme;
    }
  }

  bool get isDarkMode => _theme == FiinnyTheme.dark;

  void toggleTheme() {
    _theme = FiinnyTheme.values[(_theme.index + 1) % FiinnyTheme.values.length];
    notifyListeners();
  }

  void setTheme(FiinnyTheme newTheme) {
    _theme = newTheme;
    notifyListeners();
  }
}
