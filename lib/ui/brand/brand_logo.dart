import 'package:flutter/material.dart';

/// Lightweight brand logo avatar.
///
/// - Accepts either a bare brand key ("amazon") or a direct asset path
///   ("assets/brands/amazon.png").
/// - Auto-resolves to `assets/brands/<brand>.png` if no extension given.
/// - Auto-computes cacheWidth based on devicePixelRatio for crisp rendering.
/// - Graceful fallback (rounded/circular tile with the brand initial) if the asset is missing.
/// - Optional Hero, tooltip, border, and onTap.
///
/// Typical usage:
/// ```dart
/// BrandLogo(brand: 'netflix', size: 28)
/// BrandLogo(brand: 'assets/brands/spotify.png', isCircle: true)
/// BrandLogo(brand: 'amazon', heroTag: 'amazon-logo', onTap: () { ... })
/// ```
class BrandLogo extends StatelessWidget {
  /// Brand key (e.g., "amazon") or direct asset path ("assets/brands/amazon.png").
  final String brand;

  /// Rendered size (width = height).
  final double size;

  /// Corner radius when [isCircle] is false.
  final double radius;

  /// Use a circular avatar shape instead of rounded rect.
  final bool isCircle;

  /// Optional precomputed radius override; if provided, takes precedence over [radius].
  final BorderRadius? clipRadius;

  /// Optional border color. Defaults to `Theme.of(context).colorScheme.outlineVariant`.
  final Color? borderColor;

  /// Optional background behind the image/fallback.
  final Color? backgroundColor;

  /// Optional BoxFit for the image.
  final BoxFit fit;

  /// Optional Hero tag; if provided, wraps avatar in a Hero.
  final Object? heroTag;

  /// Optional tooltip text; if provided, wraps avatar in a Tooltip.
  final String? tooltip;

  /// Optional semantics label for screen readers.
  final String? semanticsLabel;

  /// Optional tap handler; if provided, wraps in InkWell with ripple.
  final VoidCallback? onTap;

  const BrandLogo({
    Key? key,
    required this.brand,
    this.size = 28,
    this.radius = 8,
    this.isCircle = false,
    this.clipRadius,
    this.borderColor,
    this.backgroundColor,
    this.fit = BoxFit.cover,
    this.heroTag,
    this.tooltip,
    this.semanticsLabel,
    this.onTap,
  }) : super(key: key);

  String get _path =>
      brand.endsWith('.png') ? brand : 'assets/brands/${brand.toLowerCase()}.png';

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final r = clipRadius ?? BorderRadius.circular(radius);
    final outline = borderColor ?? cs.outlineVariant.withValues(alpha: .6);
    final bg = backgroundColor ?? cs.surfaceContainerHighest.withValues(alpha: .65);

    // Compute cacheWidth for sharper rendering on high-DPR screens.
    final dpr = MediaQuery.maybeOf(context)?.devicePixelRatio ?? 2.0;
    final cache = (size * dpr).clamp(32.0, 256.0).round();

    Widget avatar = Semantics(
      label: semanticsLabel ?? 'Logo: ${brand.split('/').last}',
      button: onTap != null,
      child: ClipRRect(
        borderRadius: isCircle ? BorderRadius.circular(999) : r,
        clipBehavior: Clip.antiAlias,
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: bg,
            borderRadius: isCircle ? BorderRadius.circular(999) : r,
            border: Border.all(color: outline, width: .6),
          ),
          child: Image.asset(
            _path,
            fit: fit,
            cacheWidth: cache,
            // Subtle fade-in on first paint.
            frameBuilder: (context, child, frame, _) {
              if (frame == null) {
                return AnimatedOpacity(
                  opacity: 0,
                  duration: const Duration(milliseconds: 120),
                  child: child,
                );
              }
              return AnimatedOpacity(
                opacity: 1,
                duration: const Duration(milliseconds: 180),
                child: child,
              );
            },
            // Graceful fallback: brand initial in a tile.
            errorBuilder: (_, __, ___) {
              final letter = brand.isNotEmpty
                  ? brand.split('/').last.trim().isNotEmpty
                  ? brand.split('/').last.trim()[0].toUpperCase()
                  : '?'
                  : '?';
              return Container(
                alignment: Alignment.center,
                child: Text(
                  letter,
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: size * .48,
                    color: cs.onSurface.withValues(alpha: .55),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );

    if (tooltip != null && tooltip!.isNotEmpty) {
      avatar = Tooltip(message: tooltip!, child: avatar);
    }

    if (onTap != null) {
      avatar = Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: isCircle ? BorderRadius.circular(999) : r,
          child: avatar,
        ),
      );
    }

    if (heroTag != null) {
      avatar = Hero(tag: heroTag!, child: avatar);
    }

    return avatar;
  }
}
