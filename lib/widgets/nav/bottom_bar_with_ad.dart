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
        SafeArea(top: false, child: navBar),
      ],
    );
  }
}
