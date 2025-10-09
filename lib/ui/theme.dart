// lib/ui/theme.dart
import 'package:flutter/material.dart';
import 'tokens.dart';

ThemeData buildAppTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.mint,
      brightness: Brightness.light,
    ),
    visualDensity: VisualDensity.standard,
  );

  // shared radii
  const rSm = Radius.circular(AppRadii.sm);
  const rMd = Radius.circular(AppRadii.md);
  const rLg = Radius.circular(AppRadii.lg);

  return base.copyWith(
    scaffoldBackgroundColor: Colors.white,
    splashFactory: InkSparkle.splashFactory,

    appBarTheme: base.appBarTheme.copyWith(
      backgroundColor: Colors.transparent,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      foregroundColor: AppColors.ink900,
      iconTheme: const IconThemeData(color: AppColors.mint),
      titleTextStyle: const TextStyle(
        color: AppColors.ink900,
        fontSize: 18,
        fontWeight: FontWeight.w900,
      ),
    ),

    // Buttons
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.mint,
        foregroundColor: Colors.white,
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: const StadiumBorder(),
        side: BorderSide(color: AppColors.ink300.withOpacity(.6)),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.mint,
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      ),
    ),

    // Inputs
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      hintStyle: TextStyle(color: Colors.black.withOpacity(.45)),
      border: OutlineInputBorder(
        borderRadius: const BorderRadius.all(rSm),
        borderSide: BorderSide(color: Colors.black12.withOpacity(.25)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: const BorderRadius.all(rSm),
        borderSide: BorderSide(color: Colors.black12.withOpacity(.2)),
      ),
      focusedBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(rSm),
        borderSide: BorderSide(color: AppColors.mint, width: 1.5),
      ),
    ),

    // Chips (used by filters)
    chipTheme: base.chipTheme.copyWith(
      labelStyle: const TextStyle(fontWeight: FontWeight.w700),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      shape: const StadiumBorder(),
      side: BorderSide(color: Colors.black12.withOpacity(.2)),
      secondarySelectedColor: AppColors.mint.withOpacity(.16),
      selectedColor: AppColors.mint.withOpacity(.16),
      backgroundColor: Colors.white.withOpacity(.75),
    ),

    // Cards
    cardTheme: base.cardTheme.copyWith(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadii.lg)),
      surfaceTintColor: Colors.white,
    ),

    // Progress indicators (tiny bars etc.)
    progressIndicatorTheme: base.progressIndicatorTheme.copyWith(
      color: AppColors.mint,
    ),

    // Dividers / borders
    dividerTheme: base.dividerTheme.copyWith(
      space: 0,
      thickness: 1,
      color: Colors.black.withOpacity(.08),
    ),

    // ListTiles spacing/look
    listTileTheme: base.listTileTheme.copyWith(
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadii.md)),
      iconColor: AppColors.mint,
      titleTextStyle: const TextStyle(
        fontWeight: FontWeight.w700,
        color: AppColors.ink900,
      ),
      subtitleTextStyle: TextStyle(
        fontWeight: FontWeight.w600,
        color: Colors.black.withOpacity(.55),
      ),
    ),

    // Common text tweaks
    textTheme: base.textTheme.copyWith(
      bodyMedium: const TextStyle(height: 1.2),
      labelLarge: const TextStyle(fontWeight: FontWeight.w800),
      titleSmall: const TextStyle(fontWeight: FontWeight.w800),
    ),
  );
}
