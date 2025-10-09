// lib/core/ads/ad_slots.dart
import 'package:flutter/material.dart';
import 'adaptive_banner.dart';
import 'ad_ids.dart';

/// Drop-in banner slot (auto-collapses if the ad isn't loaded).
/// Works anchored (bottom bars) or inline (lists/sheets).
class AdsBannerSlot extends StatelessWidget {
  /// Outer padding around the ad container.
  final EdgeInsets padding;

  /// If true, use Inline Adaptive Banner (taller, variable height).
  final bool inline;

  /// Max height hint for inline banners (typical: 80–120).
  final int? inlineMaxHeight;

  /// Horizontal alignment of the ad.
  final Alignment alignment;

  /// Optional background wrapper.
  final Color? backgroundColor;
  final BorderRadiusGeometry? borderRadius;

  const AdsBannerSlot({
    super.key,
    this.padding = const EdgeInsets.only(bottom: 4),
    this.inline = false,
    this.inlineMaxHeight,
    this.alignment = Alignment.center,
    this.backgroundColor,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final banner = AdaptiveBanner(
      adUnitId: AdIds.banner,
      padding: EdgeInsets.zero, // outer padding handled here
      inline: inline,
      inlineMaxHeight: inlineMaxHeight,
    );

    Widget content = Align(alignment: alignment, child: banner);

    if (backgroundColor != null || borderRadius != null) {
      content = Container(
        decoration: BoxDecoration(color: backgroundColor, borderRadius: borderRadius),
        clipBehavior: borderRadius != null ? Clip.antiAlias : Clip.none,
        child: content,
      );
    }

    // Bottom SafeArea only for anchored banners. Inline slots don't need it.
    return SafeArea(
      top: false,
      bottom: !inline,
      child: Padding(padding: padding, child: content),
    );
  }
}
