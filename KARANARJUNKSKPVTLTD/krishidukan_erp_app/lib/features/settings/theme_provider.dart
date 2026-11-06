import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/theme.dart';

// v2: the redesign ships Light as the default look for everyone; a choice
// saved under the old key (from the previous dark-first design) is ignored.
const _prefsKey = 'app_theme_variant_v2';

/// Loaded once in main() before runApp and handed to the provider as its
/// starting value, so the app opens in the last theme the user picked instead
/// of flashing the default and then swapping.
Future<AppThemeVariant> loadSavedThemeVariant() async {
  final prefs = await SharedPreferences.getInstance();
  final saved = prefs.getString(_prefsKey);
  return AppThemeVariant.values.firstWhere(
    (v) => v.name == saved,
    orElse: () => AppThemeVariant.light,
  );
}

class ThemeVariantNotifier extends StateNotifier<AppThemeVariant> {
  ThemeVariantNotifier(super.initial);

  Future<void> set(AppThemeVariant variant) async {
    state = variant;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, variant.name);
  }
}

final themeVariantProvider =
    StateNotifierProvider<ThemeVariantNotifier, AppThemeVariant>(
  (ref) => ThemeVariantNotifier(AppThemeVariant.light),
);
