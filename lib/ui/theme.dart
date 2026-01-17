// lib/ui/theme.dart
import 'package:flutter/material.dart';
import 'tokens.dart';

ThemeData buildAppTheme(ColorScheme colorScheme,
    {Color? scaffoldBackgroundColor}) {
  final isDark = colorScheme.brightness == Brightness.dark;
  final bgColor = scaffoldBackgroundColor ?? colorScheme.surface;
  final cardColor =
      isDark ? colorScheme.surface.withValues(alpha: 0.8) : Colors.white;
  final inputFillColor =
      isDark ? colorScheme.surface.withValues(alpha: 0.5) : Colors.white;
  final textColor = isDark ? Colors.white : AppColors.ink900;
  final iconColor = isDark ? Colors.white : colorScheme.primary;

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    visualDensity: VisualDensity.standard,
    scaffoldBackgroundColor: bgColor,
    splashFactory: InkSparkle.splashFactory,
    fontFamily: 'Montserrat',
  );

  // shared radii
  const rSm = Radius.circular(AppRadii.sm);

  return base.copyWith(
    scaffoldBackgroundColor: bgColor,

    appBarTheme: base.appBarTheme.copyWith(
      backgroundColor: Colors.transparent,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      foregroundColor: textColor,
      iconTheme: IconThemeData(color: iconColor),
      titleTextStyle: TextStyle(
        color: textColor,
        fontSize: 18,
        fontWeight: FontWeight.w900,
      ),
    ),

    // Buttons
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: const StadiumBorder(),
        side: BorderSide(
            color: isDark
                ? Colors.white24
                : AppColors.ink300.withValues(alpha: .6)),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
        foregroundColor: colorScheme.primary,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: colorScheme.primary,
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      ),
    ),

    // Inputs
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: inputFillColor,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      hintStyle: TextStyle(
          color: isDark ? Colors.white54 : Colors.black.withValues(alpha: .45)),
      border: OutlineInputBorder(
        borderRadius: const BorderRadius.all(rSm),
        borderSide: BorderSide(
            color: isDark
                ? Colors.white12
                : Colors.black12.withValues(alpha: .25)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: const BorderRadius.all(rSm),
        borderSide: BorderSide(
            color:
                isDark ? Colors.white10 : Colors.black12.withValues(alpha: .2)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: const BorderRadius.all(rSm),
        borderSide: BorderSide(color: colorScheme.primary, width: 1.5),
      ),
    ),

    // Chips (used by filters)
    chipTheme: base.chipTheme.copyWith(
      labelStyle: const TextStyle(fontWeight: FontWeight.w700),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      shape: const StadiumBorder(),
      side: BorderSide(
          color:
              isDark ? Colors.white12 : Colors.black12.withValues(alpha: .2)),
      secondarySelectedColor: colorScheme.primary.withValues(alpha: .16),
      selectedColor: colorScheme.primary.withValues(alpha: .16),
      backgroundColor:
          isDark ? Colors.white10 : Colors.white.withValues(alpha: .75),
      labelPadding: EdgeInsets.zero,
    ),

    // Cards
    cardTheme: base.cardTheme.copyWith(
      color: cardColor,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg)),
      surfaceTintColor: cardColor,
    ),

    // Progress indicators (tiny bars etc.)
    progressIndicatorTheme: base.progressIndicatorTheme.copyWith(
      color: colorScheme.primary,
    ),

    // Dividers / borders
    dividerTheme: base.dividerTheme.copyWith(
      space: 0,
      thickness: 1,
      color: isDark ? Colors.white10 : Colors.black.withValues(alpha: .08),
    ),

    // ListTiles spacing/look
    listTileTheme: base.listTileTheme.copyWith(
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md)),
      iconColor: iconColor,
      titleTextStyle: TextStyle(
        fontWeight: FontWeight.w700,
        color: textColor,
      ),
      subtitleTextStyle: TextStyle(
        fontWeight: FontWeight.w600,
        color: isDark ? Colors.white60 : Colors.black.withValues(alpha: .55),
      ),
    ),

    // Common text tweaks
    textTheme: base.textTheme
        .copyWith(
          bodyMedium: TextStyle(height: 1.2, color: textColor),
          titleMedium: TextStyle(color: textColor),
          titleLarge: TextStyle(fontWeight: FontWeight.w800, color: textColor),
          titleSmall: TextStyle(fontWeight: FontWeight.w800, color: textColor),
          labelLarge: const TextStyle(fontWeight: FontWeight.w800),
        )
        .apply(
          bodyColor: textColor,
          displayColor: textColor,
        ),
  );
}
