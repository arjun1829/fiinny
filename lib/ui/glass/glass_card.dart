// lib/ui/glass/glass_card.dart
import 'dart:ui';
import 'package:flutter/material.dart';
import '../tokens.dart'; // keep if you want to default from AppPerf.lowGpuMode

/// Lightweight glass-like card with safe blur clipping and theme awareness.
class GlassCard extends StatelessWidget {
  final Widget child;

  /// Optional colored accent bar on the left.
  final Color? accent;
  final double accentWidth;

  /// Optional gradient for the glass background.
  final List<Color>? glassGradient;

  /// Adds a glossy overlay at the top.
  final bool showGloss;
  final double glossOpacity;
  final double glossHeightFraction; // 0..1 of card height (approx)

  /// Padding inside the card.
  final EdgeInsetsGeometry padding;

  /// Corner radius for the card.
  final double radius;

  /// Optional tap/long-press handlers.
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// Controls whether BackdropFilter blur is applied.
  /// Defaults to `!AppPerf.lowGpuMode` if available.
  final bool enableBlur;

  /// Blur strength when enabled.
  final double blurSigma;

  /// Optional semantic label (useful even when not tappable).
  final String? semanticLabel;

  /// Whether to wrap in a RepaintBoundary (default true, like before).
  final bool isRepaintBoundary;

  /// Optional overrides for border/shadow (set to null to disable).
  final Color? borderColorOverride;
  final double?
      borderOpacityOverride; // if borderColorOverride == null, used with theme color
  final bool showShadow;

  const GlassCard({
    super.key,
    required this.child,
    this.accent,
    this.accentWidth = 4,
    this.glassGradient,
    this.showGloss = false,
    this.glossOpacity = .26,
    this.glossHeightFraction = .45,
    this.padding = const EdgeInsets.all(16),
    this.radius = 22,
    this.onTap,
    this.onLongPress,
    this.enableBlur = true,
    this.blurSigma = 12,
    this.semanticLabel,
    this.isRepaintBoundary = true,
    this.borderColorOverride,
    this.borderOpacityOverride,
    this.showShadow = true,
  });

  // tiny cache for default gradient (avoids list alloc every build)
  static final List<Color> _defaultLightGradient = [
    const Color(0xFFFFFFFF).withValues(alpha: .16),
    const Color(0xFFFFFFFF).withValues(alpha: .06),
  ];

  static final List<Color> _defaultDarkGradient = [
    const Color(0xFF1C1C1E).withValues(alpha: .28),
    const Color(0xFF1C1C1E).withValues(alpha: .12),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    // Decide whether to actually blur (fast fallback on low-GPU mode).
    final lowGpu = _lowGpuModeSafe();
    final shouldBlur = enableBlur && !lowGpu && blurSigma > 0;

    final gradient = glassGradient ??
        (isDark ? _defaultDarkGradient : _defaultLightGradient);

    final borderColor = borderColorOverride ??
        cs.onSurface
            .withValues(alpha: borderOpacityOverride ?? (isDark ? .18 : .20));

    final shadowColor = Colors.black.withValues(alpha: isDark ? .30 : .06);

    // Core painted card
    Widget content = Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: gradient,
        ),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: borderColor),
        boxShadow: showShadow
            ? [
                BoxShadow(
                  color: shadowColor,
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ]
            : null,
      ),
      foregroundDecoration: showGloss
          ? BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.white.withValues(
                      alpha: isDark ? glossOpacity * .6 : glossOpacity),
                  Colors.white.withValues(alpha: 0),
                ],
                stops: [0.0, glossHeightFraction.clamp(0.0, 1.0)],
              ),
            )
          : null,
      child: Padding(padding: padding, child: child),
    );

    // Clip the blur region locally (safer & cheaper).
    // BackdropFilter should be inside the clip.
    if (shouldBlur) {
      content = ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
          child: content,
        ),
      );
    }

    // Accent bar overlay.
    Widget cardBody = ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Stack(
        children: [
          content,
          if (accent != null)
            Positioned.fill(
              child: Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Container(
                    width: accentWidth,
                    decoration: BoxDecoration(
                      color: accent,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );

    // Optional repaint isolation
    if (isRepaintBoundary) {
      cardBody = RepaintBoundary(child: cardBody);
    }

    // Semantics always helpful (even when not tappable)
    cardBody = Semantics(
      button: onTap != null || onLongPress != null,
      label: semanticLabel,
      child: cardBody,
    );

    // Add ripple only if tappable
    if (onTap != null || onLongPress != null) {
      cardBody = Material(
        type: MaterialType.transparency,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
        child: InkWell(
          borderRadius: BorderRadius.circular(radius),
          onTap: onTap,
          onLongPress: onLongPress,
          child: cardBody,
        ),
      );
    }

    return cardBody;
  }

  bool _lowGpuModeSafe() {
    // Keep compatibility with your global knob but don’t hard-crash if missing.
    try {
      return AppPerf.lowGpuMode;
    } catch (_) {
      return false;
    }
  }
}
