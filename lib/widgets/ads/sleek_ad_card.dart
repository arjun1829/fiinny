import 'dart:async';

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lifemap/services/subscription_service.dart';

import '../../core/ads/ad_ids.dart';
import '../../core/ads/ad_service.dart';
import '../../core/ads/adaptive_banner.dart';
import '../../core/ads/web_house_ad_card.dart';
import '../../core/ads/native_inline_ad.dart';
import '../../core/flags/remote_flags.dart';

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
  int _bannerGeneration = 0;
  bool _initializationRequested = false;
  bool _flagEnabled = false;
  bool _flagResolved = false;
  StreamSubscription<bool>? _flagSubscription;

  @override
  void initState() {
    super.initState();
    _listenForFlags();
    _ensureAdInitialization();
  }

  @override
  void dispose() {
    _flagSubscription?.cancel();
    super.dispose();
  }

  void _listenForFlags() {
    if (kIsWeb) {
      try {
        if (!mounted) return;
        setState(() {
          _flagResolved = true;
          _flagEnabled = false;
        });

        _flagSubscription = RemoteFlags.instance
            .on<bool>('adsWebHouse', fallback: false)
            .listen((enabled) {
          if (!mounted) return;
          setState(() {
            _flagResolved = true;
            _flagEnabled = enabled;
          });
        });
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _flagResolved = true;
          _flagEnabled = false;
        });
      }
      return;
    }

    Future<void>.microtask(() async {
      // FORCE ENABLE ADS
      if (!mounted) return;
      setState(() {
        _flagResolved = true;
        _flagEnabled = true;
      });
    });
  }

  void _ensureAdInitialization() {
    if (_initializationRequested) return;
    if (AdService.isReady && AdService.I.isEnabled) return;
    _initializationRequested = true;
    AdService.initLater().whenComplete(() {
      if (!mounted) return;
      _initializationRequested = false;
      if (AdService.isReady && AdService.I.isEnabled) {
        setState(() {
          _loaded = false;
          _bannerGeneration++;
        });
      } else {
        setState(() => _loaded = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    // 1. Check Premium Status
    final sub = Provider.of<SubscriptionService>(context);
    if (sub.isPremium) {
      return const SizedBox.shrink();
    }

    if (!_flagResolved) {
      return const SizedBox.shrink();
    }

    if (!_flagEnabled) {
      return const SizedBox.shrink();
    }

    if (kIsWeb) {
      return WebHouseAdCard(
        margin: widget.margin,
        radius: widget.radius,
      );
    }

    if (!AdService.isReady || !AdService.I.isEnabled) {
      _ensureAdInitialization();
      return const SizedBox.shrink();
    }

    final useNative = !kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.android ||
            defaultTargetPlatform == TargetPlatform.iOS) &&
        AdIds.native.isNotEmpty;

    final childAd = useNative
        ? NativeInlineAd(
            key: ValueKey('native_$_bannerGeneration'),
            adUnitId: AdIds.native,
            inlineMaxHeight: 120, // Hint for template selection
            onLoadChanged: (isLoaded) {
              if (!mounted || _loaded == isLoaded) return;
              setState(() => _loaded = isLoaded);
            },
          )
        : AdaptiveBanner(
            key: ValueKey(_bannerGeneration),
            adUnitId: AdIds.banner,
            inline: false,
            inlineMaxHeight: 120,
            padding: EdgeInsets.zero,
            onLoadChanged: (isLoaded) {
              assert(() {
                // debugPrint(
                //   '[SleekAdCard] banner ${maskAdIdentifier(AdIds.banner)} '
                //   'loaded=$isLoaded generation=$_bannerGeneration',
                // );
                return true;
              }());
              if (!mounted || _loaded == isLoaded) return;
              setState(() => _loaded = isLoaded);
            },
          );

    return Visibility(
      visible: _loaded,
      maintainState: true,
      maintainAnimation: true,
      maintainSize: false,
      child: Container(
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
              Colors.teal.withValues(alpha: 0.04),
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
              Align(
                alignment: Alignment.center,
                child: childAd,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
