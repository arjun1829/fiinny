import 'package:flutter/material.dart';

/// Previously responsible for reserving space for anchored banner ads.
///
/// Ads are now embedded directly within screens, so this shell simply passes
/// the child through unchanged while keeping the historical API surface.
class AdsShell extends StatelessWidget {
  const AdsShell({super.key, this.child});

  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return child ?? const SizedBox.shrink();
  }
}

extension AdsInsetsX on BuildContext {
  double adsBottomPadding({double extra = 0}) {
    final media = MediaQuery.of(this);
    final safePadding = media.padding.bottom > 0
        ? media.padding.bottom
        : media.viewPadding.bottom;
    return safePadding + extra;
  }
}
