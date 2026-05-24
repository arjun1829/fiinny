import 'package:flutter/material.dart';

// Lifted from the website constants.ts so the app reads as the same brand.
class AppColors {
  static const primary = Color(0xFF154212);        // emerald-950 ish
  static const primaryDark = Color(0xFF0B2A0A);
  static const primarySoft = Color(0xFF2F6B2C);
  static const harvest = Color(0xFFF57C00);        // orange CTA
  static const accent = Color(0xFFF57C00);
  static const surface = Colors.white;
  static const surfaceAlt = Color(0xFFF5F6F5);
  static const text = Color(0xFF1B1C1B);
  static const muted = Color(0xFF6B7563);
  static const border = Color(0xFFE6E2DC);
  static const danger = Color(0xFFC0392B);
  static const inStockBg = Color(0xFFE6F4E6);
  static const inStockFg = Color(0xFF1F7A3A);

  // Category tints used on the home page chips.
  static const tintEmerald = Color(0xFFE7F4EC);
  static const tintAmber = Color(0xFFFFEAD2);
  static const tintRose = Color(0xFFFDE2E4);
  static const tintTeal = Color(0xFFD7F0EC);
  static const tintSky = Color(0xFFDDEEFB);
  static const tintYellow = Color(0xFFFFF2C7);
  static const tintSlate = Color(0xFFEAEAEA);
}

const String kFontFamily = 'Inter';

ThemeData buildAppTheme() {
  final base = ThemeData.light(useMaterial3: true);
  return base.copyWith(
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppColors.primary,
      secondary: AppColors.harvest,
      surface: AppColors.surfaceAlt,
    ),
    scaffoldBackgroundColor: AppColors.surface,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.text,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.text,
        fontSize: 18,
        fontWeight: FontWeight.w700,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        minimumSize: const Size.fromHeight(48),
        side: const BorderSide(color: AppColors.primary, width: 1.5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surfaceAlt,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(999),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(999),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(999),
        borderSide: const BorderSide(color: AppColors.primary, width: 2),
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surfaceAlt,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    textTheme: base.textTheme
        .apply(bodyColor: AppColors.text, displayColor: AppColors.text)
        .copyWith(
          headlineLarge: const TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w800,
            color: AppColors.text,
            height: 1.1,
          ),
          headlineMedium: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: AppColors.text,
          ),
          titleMedium: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppColors.text,
          ),
        ),
  );
}
