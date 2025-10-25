// lib/widgets/nav/bottom_bar_with_ad.dart
import 'package:flutter/material.dart';
import '../../core/ads/ads_banner_card.dart';

class BottomBarWithAd extends StatefulWidget {
  final Widget navBar;
  final bool showAd;
  const BottomBarWithAd({super.key, required this.navBar, this.showAd = true});

  @override
  State<BottomBarWithAd> createState() => _BottomBarWithAdState();
}

class _BottomBarWithAdState extends State<BottomBarWithAd> {
  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.showAd)
          AdsBannerCard(
            placement: 'bottom_nav',
            inline: false,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            margin: const EdgeInsets.only(bottom: 4),
            minHeight: 72,
            boxShadow: const [
              BoxShadow(color: Color(0x10000000), blurRadius: 12, offset: Offset(0, 6)),
            ],
          ),
        SafeArea(top: false, child: widget.navBar),
      ],
    );
  }
}
