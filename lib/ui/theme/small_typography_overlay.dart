import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Shrinks typography and density for sections that should mirror the
/// dashboard's lighter visual weight without mutating the global theme.
class SmallTypographyOverlay extends StatelessWidget {
  const SmallTypographyOverlay({
    super.key,
    required this.child,
    this.scale = 0.92,
  });

  final Widget child;
  final double scale;

  TextStyle? _scaled(TextStyle? base, {double? fixedSize}) {
    if (base == null) return null;
    final targetSize = fixedSize ?? base.fontSize;
    return base.copyWith(
      fontSize: targetSize == null ? null : targetSize * scale,
      fontFeatures: const [ui.FontFeature.tabularFigures()],
    );
  }

  TextTheme _shrink(TextTheme theme) {
    return theme.copyWith(
      displayLarge: _scaled(theme.displayLarge),
      displayMedium: _scaled(theme.displayMedium),
      displaySmall: _scaled(theme.displaySmall),
      headlineLarge: _scaled(theme.headlineLarge),
      headlineMedium: _scaled(theme.headlineMedium),
      headlineSmall: _scaled(theme.headlineSmall),
      titleLarge: _scaled(theme.titleLarge, fixedSize: theme.titleLarge?.fontSize ?? 18),
      titleMedium: _scaled(theme.titleMedium, fixedSize: theme.titleMedium?.fontSize ?? 16),
      titleSmall: _scaled(theme.titleSmall, fixedSize: theme.titleSmall?.fontSize ?? 14),
      bodyLarge: _scaled(theme.bodyLarge, fixedSize: theme.bodyLarge?.fontSize ?? 14),
      bodyMedium: _scaled(theme.bodyMedium, fixedSize: theme.bodyMedium?.fontSize ?? 13),
      bodySmall: _scaled(theme.bodySmall, fixedSize: theme.bodySmall?.fontSize ?? 12),
      labelLarge: _scaled(theme.labelLarge, fixedSize: theme.labelLarge?.fontSize ?? 13),
      labelMedium: _scaled(theme.labelMedium, fixedSize: theme.labelMedium?.fontSize ?? 12),
      labelSmall: _scaled(theme.labelSmall, fixedSize: theme.labelSmall?.fontSize ?? 11),
    );
  }

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context);
    final shrunkenText = _shrink(base.textTheme);
    final shrunkenPrimary = _shrink(base.primaryTextTheme);

    final appBarTheme = base.appBarTheme.copyWith(
      toolbarHeight: (base.appBarTheme.toolbarHeight ?? kToolbarHeight) - 4,
      titleTextStyle: _scaled(
        base.appBarTheme.titleTextStyle ??
            (base.textTheme.titleLarge ?? const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        fixedSize: 16,
      ),
    );

    final tabBarTheme = base.tabBarTheme.copyWith(
      labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
      unselectedLabelStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
      labelPadding: const EdgeInsets.symmetric(horizontal: 12),
    );

    const buttonText = TextStyle(fontSize: 13, fontWeight: FontWeight.w700);

    return Theme(
      data: base.copyWith(
        textTheme: shrunkenText,
        primaryTextTheme: shrunkenPrimary,
        appBarTheme: appBarTheme,
        tabBarTheme: tabBarTheme,
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(textStyle: buttonText, visualDensity: VisualDensity.compact),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(textStyle: buttonText, visualDensity: VisualDensity.compact),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(textStyle: buttonText, visualDensity: VisualDensity.compact),
        ),
        chipTheme: base.chipTheme.copyWith(
          labelStyle: _scaled(
            base.chipTheme.labelStyle ?? const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            fixedSize: 11.5,
          ),
          visualDensity: VisualDensity.compact,
        ),
        popupMenuTheme: base.popupMenuTheme.copyWith(
          textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
      ),
      child: child,
    );
  }
}
