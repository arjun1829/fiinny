import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  // Primary — deep agri green (darkened for a richer, premium look)
  static const primary = Color(0xFF14532D); // deep forest green
  static const primaryDark = Color(0xFF0B3D20); // darker tone for gradients
  static const primaryLight = Color(
    0xFF2E7D32,
  ); // former primary, now the lighter accent
  static const primaryContainer = Color(0xFFA5D6A7);
  static const onPrimary = Color(0xFFFFFFFF);
  static const onPrimaryContainer = Color(0xFF0A3D0E);

  // Secondary — amber CTA (matches web)
  static const secondary = Color(0xFFF9A825);
  static const secondaryContainer = Color(0xFFFFF9C4);
  static const onSecondary = Color(0xFF000000);

  // Surface & background
  static const surface = Color(0xFFFFFBF5);
  static const surfaceVariant = Color(0xFFF5F5F5);
  static const background = Color(0xFFFAFAFA);
  static const onSurface = Color(0xFF1C1B1F);
  static const onSurfaceVariant = Color(0xFF757575);

  // Status colors
  static const error = Color(0xFFB00020);
  static const success = Color(0xFF2E7D32);
  static const warning = Color(0xFFF9A825);
  static const info = Color(0xFF1565C0);

  // Order status colors
  static const statusPending = Color(0xFFF9A825);
  static const statusAccepted = Color(0xFF1565C0);
  static const statusDispatched = Color(0xFF7B1FA2);
  static const statusDelivered = Color(0xFF2E7D32);
  static const statusCancelled = Color(0xFFB00020);

  // Misc
  static const divider = Color(0xFFE0E0E0);
  static const shimmerBase = Color(0xFFE0E0E0);
  static const shimmerHighlight = Color(0xFFF5F5F5);
  static const cardShadow = Color(0x1A000000);

  // Top-bar specific palette (kept separate from primary brand green).
  static const topBarStart = Color(0xFF1F2A7C);
  static const topBarEnd = Color(0xFF3C4DB7);
}
