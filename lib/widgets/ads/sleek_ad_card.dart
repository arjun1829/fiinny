import 'package:flutter/material.dart';

import '../../core/ads/ad_ids.dart';
import '../../core/ads/ad_service.dart';
import '../../core/ads/adaptive_banner.dart';

class SleekAdCard extends StatefulWidget {
  final EdgeInsets margin;
  final double radius;

  const SleekAdCard({
    super.key,
    this.margin = const EdgeInsets.fromLTRB(18, 8, 18, 12),
    this.radius = 16,
  });

  @override
  State<SleekAdCard> createState() => _SleekAdCardState();
}

class _SleekAdCardState extends State<SleekAdCard> {
  bool _loaded = false;

  @override
  Widget build(BuildContext context) {
    if (!AdService.isReady || !AdService.I.isEnabled) {
      return const SizedBox.shrink();
    }

    final banner = AdaptiveBanner(
      adUnitId: AdIds.banner,
      inline: true,
      inlineMaxHeight: 120,
      padding: EdgeInsets.zero,
      onLoadChanged: (isLoaded) {
        if (!mounted || _loaded == isLoaded) return;
        setState(() => _loaded = isLoaded);
      },
    );

    if (!_loaded) {
      return const SizedBox.shrink();
    }

    return Container(
      margin: widget.margin,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(widget.radius),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 16,
            offset: Offset(0, 8),
          ),
        ],
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.teal.withOpacity(0.04),
            Colors.white,
          ],
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.05),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'Sponsored',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: Colors.black54,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.center,
              child: banner,
            ),
          ],
        ),
      ),
    );
  }
}
