import 'package:flutter/material.dart';

/// Palette shared with the customer app (mobile/lib/core/constants/app_colors.dart)
/// and the /sales web route, so a rep who has seen either recognises this app.
class AppColors {
  AppColors._();

  // Primary — deep agri green
  static const primary = Color(0xFF0F391B);
  static const primaryDark = Color(0xFF082712);
  static const primaryLight = Color(0xFF1B5E20);
  static const primaryContainer = Color(0xFFDCECE0);
  static const onPrimary = Color(0xFFFFFFFF);
  static const onPrimaryContainer = Color(0xFF06230E);

  // Secondary — amber CTA. "Harvest" is the web's name for the same tone.
  static const harvest = Color(0xFFF9A825);
  static const harvestContainer = Color(0xFFFFF9C4);

  // Surface & background
  static const surface = Color(0xFFFFFBF5);
  static const surfaceContainer = Color(0xFFF3F1EC);
  static const surfaceContainerLow = Color(0xFFFAF8F3);
  static const onSurface = Color(0xFF1C1B1F);
  static const onSurfaceVariant = Color(0xFF757575);
  static const outline = Color(0xFF9E9E9E);
  static const divider = Color(0xFFE0E0E0);

  // Status
  static const error = Color(0xFFB00020);
  static const errorContainer = Color(0xFFFDECEC);
  static const success = Color(0xFF2E7D32);
  static const successContainer = Color(0xFFE8F5E9);
  static const warning = Color(0xFFF9A825);
  static const warningContainer = Color(0xFFFFF8E1);
  static const info = Color(0xFF1565C0);
  static const infoContainer = Color(0xFFE3F2FD);

  static const cardShadow = Color(0x14000000);
}
