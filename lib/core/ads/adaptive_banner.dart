import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import '../flags/remote_flags.dart';
import 'ad_service.dart';

class AdaptiveBanner extends StatefulWidget {
  final String adUnitId;
  final EdgeInsets padding;

  /// NEW: Use Google’s inline adaptive banner (taller) instead of anchored.
  /// Defaults to false to preserve existing behavior.
  final bool inline;

  /// NEW: Maximum height hint for inline banners (typical 80–120dp).
  /// Ignored when [inline] is false.
  final int? inlineMaxHeight;
  final String? userId;

  const AdaptiveBanner({
    super.key,
    required this.adUnitId,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    this.inline = false,
    this.inlineMaxHeight,
    this.userId,
  });

  @override
  State<AdaptiveBanner> createState() => _AdaptiveBannerState();
}

class _AdaptiveBannerState extends State<AdaptiveBanner> {
  BannerAd? _ad;
  bool _loaded = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    // Dispose any previous ad when reloading (e.g., on rotation).
    _ad?.dispose();
    _ad = null;
    _loaded = false;

    if (!AdService.I.isEnabled) {
      return;
    }

    final width = MediaQuery.of(context).size.width.truncate();

    AdSize? size;
    try {
      if (widget.inline) {
        // Inline adaptive supports variable heights; we pass a safe max.
        final maxH = (widget.inlineMaxHeight ?? 120).clamp(32, 300);
        size = await AdSize.getInlineAdaptiveBannerAdSize(width, maxH);
      } else {
        // Original anchored adaptive behavior (default).
        size = await AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(width);
      }
    } catch (_) {
      // Fallback to anchored adaptive if inline isn't supported on some devices.
      size = await AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(width);
    }

    if (size == null) return;

    final ad = BannerAd(
      adUnitId: widget.adUnitId,
      size: size,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (_) {
          if (!mounted) return;
          setState(() => _loaded = true);
        },
        onAdFailedToLoad: (_, __) {
          if (!mounted) return;
          setState(() => _loaded = false);
        },
      ),
    );

    await ad.load();
    if (!mounted) {
      ad.dispose();
      return;
    }
    setState(() => _ad = ad);
  }

  @override
  void dispose() {
    _ad?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!AdService.isReady) {
      return const SizedBox.shrink();
    }

    if (Platform.isIOS) {
      return StreamBuilder<bool>(
        stream: RemoteFlags.instance.on<bool>('adsEnabledIOS', userId: widget.userId, fallback: true),
        builder: (_, snap) {
          final enabled = snap.data ?? true;
          if (!enabled) {
            return const SizedBox.shrink();
          }
          return _buildBanner();
        },
      );
    }

    return _buildBanner();
  }

  Widget _buildBanner() {
    if (!AdService.I.isEnabled || !_loaded || _ad == null) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: widget.padding,
      child: SizedBox(
        width: _ad!.size.width.toDouble(),
        height: _ad!.size.height.toDouble(),
        child: AdWidget(ad: _ad!),
      ),
    );
  }
}
