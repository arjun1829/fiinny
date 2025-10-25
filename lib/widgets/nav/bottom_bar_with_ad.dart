// lib/widgets/nav/bottom_bar_with_ad.dart
import 'package:flutter/material.dart';

/// Lightweight wrapper around the main navigation bar.
///
/// Ads used to be injected here, but the widget now simply exposes a slot for
/// the navigation bar. Individual screens are responsible for reserving any
/// additional padding they might need.
class BottomBarWithAd extends StatelessWidget {
  final Widget navBar;

  const BottomBarWithAd({super.key, required this.navBar});

  @override
  Widget build(BuildContext context) {
    return navBar;
  }
}
