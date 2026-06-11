import 'package:flutter/material.dart';
import 'app_colors.dart';

class AppTextStyles {
  AppTextStyles._();

  static const _fontFamily = 'Roboto'; // system default, swap for Poppins later

  static const displayLarge = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w700,
    fontFamily: _fontFamily,
    color: AppColors.onSurface,
    height: 1.2,
  );

  static const heading1 = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    fontFamily: _fontFamily,
    color: AppColors.onSurface,
    height: 1.3,
  );

  static const heading2 = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    fontFamily: _fontFamily,
    color: AppColors.onSurface,
    height: 1.3,
  );

  static const heading3 = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    fontFamily: _fontFamily,
    color: AppColors.onSurface,
  );

  static const body = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    fontFamily: _fontFamily,
    color: AppColors.onSurface,
    height: 1.5,
  );

  static const bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    fontFamily: _fontFamily,
    color: AppColors.onSurface,
  );

  static const bodySmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    fontFamily: _fontFamily,
    color: AppColors.onSurfaceVariant,
  );

  static const caption = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w400,
    fontFamily: _fontFamily,
    color: AppColors.onSurfaceVariant,
    letterSpacing: 0.4,
  );

  static const button = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w600,
    fontFamily: _fontFamily,
    letterSpacing: 0.5,
  );

  static const price = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w700,
    fontFamily: _fontFamily,
    color: AppColors.primary,
  );

  static const priceLarge = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w700,
    fontFamily: _fontFamily,
    color: AppColors.primary,
  );
}
