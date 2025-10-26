// lib/core/ads/ad_slots.dart
import 'package:flutter/material.dart';

import 'adaptive_banner.dart';
import 'ad_ids.dart';

/// Drop-in banner slot for inline placements.
class AdsBannerSlot extends StatelessWidget {
  /// Outer padding around the ad container.
  final EdgeInsets padding;

  /// If true, use Inline Adaptive Banner (taller, variable height).
  final bool inline;

  /// Max height hint for inline banners (typical: 80–120).
  final int? inlineMaxHeight;

  /// Horizontal alignment of the ad.
  final Alignment alignment;

  /// Notify when the underlying ad load state changes.
  final void Function(bool isLoaded)? onLoadChanged;

  const AdsBannerSlot({
    super.key,
    this.padding = const EdgeInsets.only(bottom: 4),
    this.inline = true,
    this.inlineMaxHeight,
    this.alignment = Alignment.center,
    this.onLoadChanged,
  });

  @override
  Widget build(BuildContext context) {
    final banner = AdaptiveBanner(
      adUnitId: AdIds.banner,
      padding: EdgeInsets.zero, // outer padding handled here
      inline: inline,
      inlineMaxHeight: inlineMaxHeight,
      onLoadChanged: onLoadChanged,
    );

    return Padding(
      padding: padding,
      child: Align(alignment: alignment, child: banner),
    );
  }
}
