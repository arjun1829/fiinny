// lib/widgets/nav/bottom_bar_with_ad.dart
import 'package:flutter/material.dart';
import '../../core/ads/ad_slots.dart';

class BottomBarWithAd extends StatelessWidget {
  final Widget navBar;
  final bool showAd;
  const BottomBarWithAd({super.key, required this.navBar, this.showAd = true});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showAd) const AdsBannerSlot(padding: EdgeInsets.zero),
        // Keep the actual nav bar pinned to the bottom
        const SafeArea(top: false, child: SizedBox.shrink()),
        SafeArea(top: false, child: navBar),
      ],
    );
  }
}
