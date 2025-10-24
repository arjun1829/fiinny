// lib/services/startup_prefs.dart
import 'package:shared_preferences/shared_preferences.dart';

/// Lightweight storage for startup/onboarding decisions.
class StartupPrefs {
  StartupPrefs._();

  static const String _welcomeSeenKey = 'startup.welcomeSeen.v1';
  static bool? _welcomeSeenCache;

  /// Returns true if the welcome screen has been displayed at least once.
  static Future<bool> hasSeenWelcome() async {
    if (_welcomeSeenCache != null) return _welcomeSeenCache!;

    final prefs = await SharedPreferences.getInstance();
    final seen = prefs.getBool(_welcomeSeenKey) ?? false;
    _welcomeSeenCache = seen;
    return seen;
  }

  /// Marks the welcome screen as shown so we can skip it on future launches.
  static Future<void> markWelcomeSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_welcomeSeenKey, true);
    _welcomeSeenCache = true;
  }
}
