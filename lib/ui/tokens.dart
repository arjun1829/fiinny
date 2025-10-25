import 'package:flutter/material.dart';

class AppColors {
  // Brand / accents
  static const Color mint = Color(0xFF09857A);
  static const mintGlow = Color(0xFF19A08F);
  static const mintSoft = Color(0xFFE7F6F4);

  static const deepBlue = Color(0xFF1F3AF0);       // Subscriptions
  static const richOrange = Color(0xFFFF7A1A);     // Bills
  static const electricPurple = Color(0xFF7F56D9); // Recurring
  static const teal = Color(0xFF12B3A8);           // EMIs

  // Success / warning / error
  static const good = Color(0xFF1FAD66);
  static const warn = Color(0xFFF2A100);
  static const bad  = Color(0xFFE45858);

  // Neutrals
  static const ink900 = Color(0xFF111111);
  static const ink800 = Color(0xFF1E1E1E);
  static const ink700 = Color(0xFF333333);
  static const ink500 = Color(0xFF6B7780);
  static const ink300 = Color(0xFFB9C1C5);
  static const ink200 = Color(0xFFD9E0E4);
  static const ink100 = Color(0xFFF4F6F7);
}

class AppRadii {
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 22.0;
  static const xl = 28.0;
}

class AppSpacing {
  static const xs = 6.0;
  static const s  = 8.0;
  static const m  = 12.0;
  static const l  = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

/// Global perf flags (wire to remote-config / settings if needed).
class AppPerf {
  /// When true we avoid expensive animations & blurs.
  static bool lowGpuMode = true;
}

class AppShadows {
  static List<BoxShadow> soft = [
    BoxShadow(
      color: Colors.black.withOpacity(.06),
      blurRadius: 18,
      offset: const Offset(0, 8),
    ),
  ];
}

/// Animation timing + curves used across the app.
class AppAnim {
  static const fast = Duration(milliseconds: 200);
  static const med  = Duration(milliseconds: 420);
  static const slow = Duration(milliseconds: 600);

  static const fade  = Curves.easeIn;
  static const slide = Curves.easeOutCubic;
}
