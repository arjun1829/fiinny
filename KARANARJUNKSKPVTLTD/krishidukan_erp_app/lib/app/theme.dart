import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

enum AppThemeVariant { dark, light }

extension AppThemeVariantX on AppThemeVariant {
  String get label => switch (this) {
        AppThemeVariant.dark => 'Dark',
        AppThemeVariant.light => 'Light',
      };
}

/// One immutable set of design tokens. Card/status/series colours share the
/// same field names across all three variants so every screen reads
/// `AppColors.X` without knowing which variant is active.
class _Palette {
  const _Palette({
    required this.bg,
    required this.surface,
    required this.card,
    required this.cardHi,
    required this.border,
    required this.borderHi,
    required this.ink,
    required this.inkDim,
    required this.inkMute,
    required this.accent,
    required this.accentInk,
    required this.accentDim,
    required this.b2b,
    required this.pos,
    required this.online,
    required this.good,
    required this.warning,
    required this.critical,
    required this.brightness,
  });

  final Color bg;
  final Color surface;
  final Color card;
  final Color cardHi;
  final Color border;
  final Color borderHi;
  final Color ink;
  final Color inkDim;
  final Color inkMute;
  final Color accent;
  final Color accentInk;
  final Color accentDim;
  final Color b2b;
  final Color pos;
  final Color online;
  final Color good;
  final Color warning;
  final Color critical;
  final Brightness brightness;
}

/// Dark — a green-tinted near-black rather than neutral grey, so the app
/// reads as its own product instead of default Material dark.
const _darkPalette = _Palette(
  bg: Color(0xFF080C0A),
  surface: Color(0xFF0F1512),
  card: Color(0xFF121A16),
  cardHi: Color(0xFF18221D),
  border: Color(0xFF22302A),
  borderHi: Color(0xFF32453B),
  ink: Color(0xFFEAF2ED),
  inkDim: Color(0xFF9DB0A5),
  inkMute: Color(0xFF6B7F74),
  accent: Color(0xFFD7F94F),
  accentInk: Color(0xFF0A0F08),
  accentDim: Color(0xFF8FA82E),
  b2b: Color(0xFF3987E5),
  pos: Color(0xFFD95926),
  online: Color(0xFF199E70),
  good: Color(0xFF0CA30C),
  warning: Color(0xFFFAB219),
  critical: Color(0xFFD03B3B),
  brightness: Brightness.dark,
);

/// Light — the same shapes and structure as Dark, in a clean white register.
const _lightPalette = _Palette(
  bg: Color(0xFFF5F7F6),
  surface: Color(0xFFFFFFFF),
  card: Color(0xFFFFFFFF),
  cardHi: Color(0xFFF0F3F1),
  border: Color(0xFFE1E8E3),
  borderHi: Color(0xFFCBD6CF),
  ink: Color(0xFF10201A),
  inkDim: Color(0xFF4C6058),
  inkMute: Color(0xFF7C9089),
  accent: Color(0xFF2E7D32),
  accentInk: Color(0xFFFFFFFF),
  accentDim: Color(0xFF1B5E20),
  b2b: Color(0xFF1D6FC4),
  pos: Color(0xFFC24F1B),
  online: Color(0xFF0F7D57),
  good: Color(0xFF0A8A2E),
  warning: Color(0xFFB9790C),
  critical: Color(0xFFC22B2B),
  brightness: Brightness.light,
);

/// Design tokens for the active theme. All fields resolve through the current
/// [AppColors.variant] so every screen reads `AppColors.X` without knowing
/// which variant is active — switching variant and forcing a remount (see
/// KeyedSubtree in app.dart) is what makes the whole app repaint.
class AppColors {
  AppColors._();

  static AppThemeVariant variant = AppThemeVariant.dark;

  static _Palette get _p => switch (variant) {
        AppThemeVariant.dark => _darkPalette,
        AppThemeVariant.light => _lightPalette,
      };

  static Color get bg => _p.bg;
  static Color get surface => _p.surface;
  static Color get card => _p.card;
  static Color get cardHi => _p.cardHi;
  static Color get border => _p.border;
  static Color get borderHi => _p.borderHi;
  static Color get ink => _p.ink;
  static Color get inkDim => _p.inkDim;
  static Color get inkMute => _p.inkMute;
  static Color get accent => _p.accent;
  static Color get accentInk => _p.accentInk;
  static Color get accentDim => _p.accentDim;
  static Color get b2b => _p.b2b;
  static Color get pos => _p.pos;
  static Color get online => _p.online;
  static Color get good => _p.good;
  static Color get warning => _p.warning;
  static Color get critical => _p.critical;
  static Brightness get brightness => _p.brightness;
}

/// Micro-label: uppercase, widely tracked. Used for every tile and section
/// caption — the app's most recognisable typographic move. A getter (not a
/// const) so it re-reads AppColors after a theme switch.
TextStyle get kMicro => TextStyle(
      fontSize: 10,
      height: 1.2,
      fontWeight: FontWeight.w700,
      letterSpacing: 1.1,
      color: AppColors.inkMute,
    );

/// Big standalone values use proportional figures; only columns of numbers
/// that must align vertically get tabular figures.
TextStyle get kFigure => TextStyle(
      fontSize: 26,
      height: 1.05,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.8,
      color: AppColors.ink,
    );

TextStyle get kTabular => TextStyle(
      fontFeatures: const [FontFeature.tabularFigures()],
      fontWeight: FontWeight.w600,
      color: AppColors.ink,
    );

ThemeData buildTheme() {
  final scheme = ColorScheme(
    brightness: AppColors.brightness,
    primary: AppColors.accent,
    onPrimary: AppColors.accentInk,
    secondary: AppColors.online,
    onSecondary: AppColors.accentInk,
    surface: AppColors.card,
    onSurface: AppColors.ink,
    error: AppColors.critical,
    onError: Colors.white,
  );

  final baseTextTheme = ThemeData(brightness: AppColors.brightness).textTheme;

  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: AppColors.bg,
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.bg,
      foregroundColor: AppColors.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      systemOverlayStyle: AppColors.brightness == Brightness.dark
          ? SystemUiOverlayStyle.light
          : SystemUiOverlayStyle.dark,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: AppColors.card,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: AppColors.border),
      ),
    ),
    dividerTheme: DividerThemeData(color: AppColors.border, thickness: 1),
    textTheme: baseTextTheme.apply(
      bodyColor: AppColors.ink,
      displayColor: AppColors.ink,
    ),
    iconTheme: IconThemeData(color: AppColors.inkDim),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: AppColors.accent),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      hintStyle: TextStyle(color: AppColors.inkMute),
      labelStyle: TextStyle(color: AppColors.inkDim),
      helperStyle: TextStyle(color: AppColors.inkMute, fontSize: 11),
      prefixIconColor: AppColors.inkMute,
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppColors.accent, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppColors.critical),
      ),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: AppColors.accentInk,
        disabledBackgroundColor: AppColors.cardHi,
        disabledForegroundColor: AppColors.inkMute,
        textStyle: const TextStyle(
            fontWeight: FontWeight.w700, letterSpacing: 0.2, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        side: BorderSide(color: AppColors.borderHi),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: AppColors.accentDim),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AppColors.cardHi,
      contentTextStyle: TextStyle(color: AppColors.ink),
      behavior: SnackBarBehavior.floating,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: AppColors.surface,
      dragHandleColor: AppColors.borderHi,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    dialogTheme: DialogThemeData(backgroundColor: AppColors.surface),
  );
}
