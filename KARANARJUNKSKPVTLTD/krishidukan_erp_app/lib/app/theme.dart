import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

enum AppThemeVariant { light, dark }

extension AppThemeVariantX on AppThemeVariant {
  String get label => switch (this) {
        AppThemeVariant.light => 'Light',
        AppThemeVariant.dark => 'Dark',
      };
}

/// One immutable set of design tokens. Both variants share field names so
/// every screen reads `AppColors.X` without knowing which one is active.
class _Palette {
  const _Palette({
    required this.bg,
    required this.surface,
    required this.card,
    required this.cardHi,
    required this.tile,
    required this.border,
    required this.borderHi,
    required this.ink,
    required this.inkDim,
    required this.inkMute,
    required this.primary,
    required this.onPrimary,
    required this.primarySoft,
    required this.header,
    required this.onHeader,
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

  /// Background of the small rounded squares behind quick-access icons.
  final Color tile;
  final Color border;
  final Color borderHi;
  final Color ink;
  final Color inkDim;
  final Color inkMute;
  final Color primary;
  final Color onPrimary;

  /// Very light tint of [primary] — selected chips, info banners.
  final Color primarySoft;

  /// Solid top bar on the home screen.
  final Color header;
  final Color onHeader;
  final Color b2b;
  final Color pos;
  final Color online;
  final Color good;
  final Color warning;
  final Color critical;
  final Brightness brightness;
}

/// Light — the default. Plain white cards on a cool light-grey page, one solid
/// business blue for the header and primary actions. No gradients, no neon.
const _lightPalette = _Palette(
  bg: Color(0xFFF3F5F9),
  surface: Color(0xFFFFFFFF),
  card: Color(0xFFFFFFFF),
  cardHi: Color(0xFFF6F8FB),
  tile: Color(0xFFF1F4F9),
  border: Color(0xFFE5E9F0),
  borderHi: Color(0xFFD3D9E3),
  ink: Color(0xFF161B26),
  inkDim: Color(0xFF4A5363),
  inkMute: Color(0xFF8A93A3),
  primary: Color(0xFF1463E6),
  onPrimary: Color(0xFFFFFFFF),
  primarySoft: Color(0xFFE8F0FD),
  header: Color(0xFF1463E6),
  onHeader: Color(0xFFFFFFFF),
  b2b: Color(0xFF3B5BDB),
  pos: Color(0xFFE8590C),
  online: Color(0xFF0C8599),
  good: Color(0xFF16A34A),
  warning: Color(0xFFD97706),
  critical: Color(0xFFDC2626),
  brightness: Brightness.light,
);

/// Dark — neutral charcoal with the same blue, for night use.
const _darkPalette = _Palette(
  bg: Color(0xFF0E1116),
  surface: Color(0xFF161A21),
  card: Color(0xFF181C24),
  cardHi: Color(0xFF1F242E),
  tile: Color(0xFF222834),
  border: Color(0xFF272D39),
  borderHi: Color(0xFF353D4C),
  ink: Color(0xFFECEFF4),
  inkDim: Color(0xFFAEB6C4),
  inkMute: Color(0xFF7A8496),
  primary: Color(0xFF4C8DFF),
  onPrimary: Color(0xFFFFFFFF),
  primarySoft: Color(0xFF1A2A47),
  header: Color(0xFF161A21),
  onHeader: Color(0xFFECEFF4),
  b2b: Color(0xFF748FFC),
  pos: Color(0xFFFF8A4C),
  online: Color(0xFF3BC9DB),
  good: Color(0xFF40C057),
  warning: Color(0xFFF59F00),
  critical: Color(0xFFFF6B6B),
  brightness: Brightness.dark,
);

/// Design tokens for the active theme. Switching variant and forcing a
/// remount (see KeyedSubtree in app.dart) is what repaints the whole app.
class AppColors {
  AppColors._();

  static AppThemeVariant variant = AppThemeVariant.light;

  static _Palette get _p => switch (variant) {
        AppThemeVariant.light => _lightPalette,
        AppThemeVariant.dark => _darkPalette,
      };

  static Color get bg => _p.bg;
  static Color get surface => _p.surface;
  static Color get card => _p.card;
  static Color get cardHi => _p.cardHi;
  static Color get tile => _p.tile;
  static Color get border => _p.border;
  static Color get borderHi => _p.borderHi;
  static Color get ink => _p.ink;
  static Color get inkDim => _p.inkDim;
  static Color get inkMute => _p.inkMute;
  static Color get primary => _p.primary;
  static Color get onPrimary => _p.onPrimary;
  static Color get primarySoft => _p.primarySoft;
  static Color get header => _p.header;
  static Color get onHeader => _p.onHeader;
  static Color get b2b => _p.b2b;
  static Color get pos => _p.pos;
  static Color get online => _p.online;
  static Color get good => _p.good;
  static Color get warning => _p.warning;
  static Color get critical => _p.critical;
  static Brightness get brightness => _p.brightness;

  static bool get isDark => brightness == Brightness.dark;
}

/// Type scale — sentence case everywhere, no shouty tracked caps.
class AppText {
  AppText._();

  static TextStyle get title => TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
        color: AppColors.ink,
      );

  static TextStyle get section => TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.1,
        color: AppColors.ink,
      );

  static TextStyle get body => TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: AppColors.ink,
      );

  static TextStyle get label => TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w500,
        color: AppColors.inkMute,
      );

  static TextStyle get small => TextStyle(
        fontSize: 11.5,
        fontWeight: FontWeight.w500,
        color: AppColors.inkMute,
      );

  /// Big standalone money figures.
  static TextStyle get figure => TextStyle(
        fontSize: 22,
        height: 1.1,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
        color: AppColors.ink,
      );

  /// Columns of amounts that should line up.
  static TextStyle get amount => TextStyle(
        fontFeatures: const [FontFeature.tabularFigures()],
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: AppColors.ink,
      );
}

const kRadius = 14.0;

/// Soft, low shadow used on cards in light mode (none in dark — borders do it).
List<BoxShadow> get kCardShadow => AppColors.isDark
    ? const []
    : const [
        BoxShadow(
          color: Color(0x0A1B2A4A),
          blurRadius: 12,
          offset: Offset(0, 3),
        ),
      ];

ThemeData buildTheme() {
  final scheme = ColorScheme(
    brightness: AppColors.brightness,
    primary: AppColors.primary,
    onPrimary: AppColors.onPrimary,
    primaryContainer: AppColors.primarySoft,
    onPrimaryContainer: AppColors.primary,
    secondary: AppColors.primary,
    onSecondary: AppColors.onPrimary,
    surface: AppColors.surface,
    onSurface: AppColors.ink,
    surfaceContainerHighest: AppColors.cardHi,
    onSurfaceVariant: AppColors.inkDim,
    outline: AppColors.borderHi,
    outlineVariant: AppColors.border,
    error: AppColors.critical,
    onError: Colors.white,
  );

  final baseTextTheme = ThemeData(brightness: AppColors.brightness).textTheme;
  final overlay =
      AppColors.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark;

  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: AppColors.bg,
    splashFactory: InkRipple.splashFactory,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      },
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      shadowColor: AppColors.border,
      centerTitle: true,
      titleTextStyle: TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w700,
        color: AppColors.ink,
      ),
      systemOverlayStyle: overlay,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: AppColors.card,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kRadius),
        side: BorderSide(color: AppColors.border),
      ),
    ),
    dividerTheme:
        DividerThemeData(color: AppColors.border, thickness: 1, space: 1),
    textTheme: baseTextTheme.apply(
      bodyColor: AppColors.ink,
      displayColor: AppColors.ink,
    ),
    iconTheme: IconThemeData(color: AppColors.inkDim),
    progressIndicatorTheme:
        ProgressIndicatorThemeData(color: AppColors.primary),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: AppColors.primarySoft,
      elevation: 0,
      height: 66,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 11.5,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w700
              : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? AppColors.primary
              : AppColors.inkMute,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          size: 23,
          color: states.contains(WidgetState.selected)
              ? AppColors.primary
              : AppColors.inkMute,
        ),
      ),
    ),
    drawerTheme: DrawerThemeData(
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(right: Radius.circular(20)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      hintStyle: TextStyle(color: AppColors.inkMute, fontSize: 14),
      labelStyle: TextStyle(color: AppColors.inkDim),
      helperStyle: TextStyle(color: AppColors.inkMute, fontSize: 11.5),
      prefixIconColor: AppColors.inkMute,
      suffixIconColor: AppColors.inkMute,
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.primary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.critical),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.critical, width: 1.5),
      ),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        disabledBackgroundColor: AppColors.cardHi,
        disabledForegroundColor: AppColors.inkMute,
        minimumSize: const Size(0, 48),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        minimumSize: const Size(0, 48),
        side: BorderSide(color: AppColors.borderHi),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.primary,
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AppColors.isDark ? AppColors.cardHi : AppColors.ink,
      contentTextStyle: TextStyle(
        color: AppColors.isDark ? AppColors.ink : Colors.white,
        fontSize: 13.5,
      ),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      dragHandleColor: AppColors.borderHi,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 6,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      textStyle: TextStyle(fontSize: 14, color: AppColors.ink),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    ),
    datePickerTheme: DatePickerThemeData(
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      headerBackgroundColor: AppColors.primary,
      headerForegroundColor: AppColors.onPrimary,
      rangeSelectionBackgroundColor: AppColors.primarySoft,
    ),
  );
}
