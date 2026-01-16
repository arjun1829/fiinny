// lib/ui/tonal/tonal_card.dart
import 'package:flutter/material.dart';
import 'package:lifemap/ui/tokens.dart' show AppColors;

/// Lightweight, high-contrast card with optional elevation & ripple.
/// - Rounded (default r=18)
/// - Hairline border (tinted if provided)
/// - Optional header row + trailing action
/// - NEW: elevation + shadowColor + borderWidth
class TonalCard extends StatelessWidget {
  // Content
  final Widget child;

  // Optional header row (rendered above `child` with spacing)
  final Widget? header;

  // Optional trailing action shown on the header row's right side
  final Widget? trailingAdd;

  // Layout
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final BorderRadius borderRadius;

  // Interactions
  final VoidCallback? onTap;

  // Colors
  final Color? surface;
  final Color? borderColor;

  /// Preferred accent color for borders/accents.
  final Color? tint;

  /// Back-compat alias for older call sites; prefer [tint].
  @Deprecated('Use tint instead')
  final Color? accent;

  /// NEW: Material elevation for subtle shadow (0 = flat).
  final double elevation;

  /// NEW: Shadow color (defaults to a soft black if null).
  final Color? shadowColor;

  /// NEW: Border width (defaults to hairline = 1).
  final double borderWidth;

  const TonalCard({
    Key? key,
    required this.child,
    this.header,
    this.trailingAdd,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.onTap,
    this.borderRadius = const BorderRadius.all(Radius.circular(18)),
    this.surface,
    this.borderColor,
    this.tint,
    @Deprecated('Use tint instead') this.accent,
    this.elevation = 0, // ⬅️ NEW
    this.shadowColor, // ⬅️ NEW
    this.borderWidth = 1, // ⬅️ NEW
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // ignore: deprecated_member_use_from_same_package
    final effectiveTint = tint ?? accent;
    final effectiveSurface = surface ?? Colors.white.withValues(alpha: .92);
    final effectiveBorder =
        borderColor ?? (effectiveTint ?? AppColors.mint).withValues(alpha: .10);
    final effectiveShadow = shadowColor ?? Colors.black.withValues(alpha: 0.06);
    final dark = Colors.black.withValues(alpha: .92);

    final core = Padding(
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (header != null) ...[
            Row(
              children: [
                Expanded(child: header!),
                if (trailingAdd != null) trailingAdd!,
              ],
            ),
            const SizedBox(height: 12),
          ],
          child,
        ],
      ),
    );

    // Wrap in margin if provided.
    final withMargin =
        (margin == null) ? core : Padding(padding: margin!, child: core);

    // Use Material to support elevation + InkWell ripple cleanly.
    final material = Material(
      color: effectiveSurface,
      elevation: elevation,
      shadowColor: effectiveShadow,
      shape: RoundedRectangleBorder(
        borderRadius: borderRadius,
        side: BorderSide(color: effectiveBorder, width: borderWidth),
      ),
      clipBehavior: Clip.antiAlias, // keeps splash & content within radius
      child: withMargin,
    );

    if (onTap == null) return material;

    return InkWell(
      onTap: onTap,
      borderRadius: borderRadius,
      splashColor: (effectiveTint ?? dark).withValues(alpha: .08),
      highlightColor: (effectiveTint ?? dark).withValues(alpha: .04),
      child: material,
    );
  }
}
