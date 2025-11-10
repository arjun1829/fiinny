import 'dart:ui';

import 'package:flutter/material.dart';

/// A lightweight glassmorphism-inspired card used to unify detail screens.
///
/// Defaults match the Fiinny detail headers: soft gradient, subtle border,
/// rounded 18dp corners, and a gentle blur to keep the background visible
/// without sacrificing contrast.
class GlassCard extends StatelessWidget {
  const GlassCard({
    Key? key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.radius = 18,
    this.boxShadow,
    this.gradient,
    this.borderColor,
  }) : super(key: key);

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final List<BoxShadow>? boxShadow;
  final Gradient? gradient;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final effectiveGradient = gradient ?? LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        Colors.white.withOpacity(isDark ? 0.12 : 0.55),
        Colors.white.withOpacity(isDark ? 0.08 : 0.32),
      ],
    );
    final effectiveShadow = boxShadow ?? [
      BoxShadow(
        color: Colors.black.withOpacity(isDark ? 0.28 : 0.06),
        blurRadius: 20,
        offset: const Offset(0, 12),
      ),
    ];
    final effectiveBorder = borderColor ??
        Colors.white.withOpacity(isDark ? 0.14 : 0.38);

    Widget surface = Container(
      decoration: BoxDecoration(
        gradient: effectiveGradient,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: effectiveBorder),
        boxShadow: effectiveShadow,
      ),
      child: Padding(
        padding: padding,
        child: child,
      ),
    );

    surface = ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: surface,
      ),
    );

    return surface;
  }
}
