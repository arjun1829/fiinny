// lib/core/ads/adaptive_banner.dart
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import '../flags/remote_flags.dart';
import 'ad_service.dart';

class AdaptiveBanner extends StatefulWidget {
  final String adUnitId;
  final EdgeInsets padding;
  final bool inline;       // use inline adaptive if true
  final int? inlineMaxHeight;
  final String? userId;
  final void Function(bool isLoaded)? onLoadChanged;

  const AdaptiveBanner({
    super.key,
    required this.adUnitId,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    this.inline = false,
    this.inlineMaxHeight,
    this.userId,
    this.onLoadChanged,
  });

  @override
  State<AdaptiveBanner> createState() => _AdaptiveBannerState();
}

class _AdaptiveBannerState extends State<AdaptiveBanner> {
  BannerAd? _ad;
  bool _loaded = false;
  bool _isLoading = false;
  bool _needsReload = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  @override
  void didUpdateWidget(covariant AdaptiveBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.adUnitId != widget.adUnitId ||
        oldWidget.inline != widget.inline ||
        oldWidget.inlineMaxHeight != widget.inlineMaxHeight) {
      _load();
    }
  }

  Future<void> _load() async {
    if (_isLoading) {
      _needsReload = true;
      return;
    }
    _isLoading = true;
    _needsReload = false;

    _ad?.dispose();
    _ad = null;
    if (mounted) {
      setState(() => _loaded = false);
    } else {
      _loaded = false;
    }
    widget.onLoadChanged?.call(false);

    if (!AdService.I.isEnabled) {
      try {
        await AdService.initLater();
      } catch (err, stack) {
        _reportAdFailure('initialize ads', err, stack);
      }

      if (!mounted) {
        _completeLoad();
        return;
      }

      if (!AdService.I.isEnabled) {
        _completeLoad();
        return;
      }
    }

    final width = MediaQuery.of(context).size.width.truncate();
    AdSize? size;
    try {
      if (widget.inline) {
        final maxH = (widget.inlineMaxHeight ?? 120).clamp(32, 300);
        size = await AdSize.getInlineAdaptiveBannerAdSize(width, maxH);
      } else {
        size = await AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(width);
      }
    } on MissingPluginException catch (err, stack) {
      _reportAdFailure('adaptive size (missing plugin)', err, stack);
      _completeLoad();
      return;
    } on PlatformException catch (err, stack) {
      _reportAdFailure('adaptive size', err, stack);
      try {
        size = await AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(width);
      } on Exception catch (fallbackErr, fallbackStack) {
        _reportAdFailure('fallback adaptive size', fallbackErr, fallbackStack);
        _completeLoad();
        return;
      }
    } catch (err, stack) {
      _reportAdFailure('adaptive size', err, stack);
      _completeLoad();
      return;
    }

    if (size == null) {
      widget.onLoadChanged?.call(false);
      _completeLoad();
      return;
    }

    BannerAd? banner;
    var bannerDisposed = false;
    try {
      banner = BannerAd(
        adUnitId: widget.adUnitId,
        size: size,
        request: const AdRequest(),
        listener: BannerAdListener(
          onAdLoaded: (ad) {
            if (!mounted) {
              ad.dispose();
              bannerDisposed = true;
              return;
            }
            setState(() {
              _ad = ad as BannerAd;
              _loaded = true;
            });
            widget.onLoadChanged?.call(true);
          },
          onAdFailedToLoad: (ad, error) {
            ad.dispose();
            bannerDisposed = true;
            if (!mounted) return;
            setState(() {
              _loaded = false;
              _ad = null;
            });
            widget.onLoadChanged?.call(false);
            debugPrint('[AdaptiveBanner] Banner failed to load: $error');
          },
        ),
      );
      await banner.load();
    } on MissingPluginException catch (err, stack) {
      _reportAdFailure('load banner (missing plugin)', err, stack);
      banner?.dispose();
      _completeLoad();
      return;
    } on PlatformException catch (err, stack) {
      _reportAdFailure('load banner', err, stack);
      banner?.dispose();
      _completeLoad();
      return;
    } catch (err, stack) {
      _reportAdFailure('load banner', err, stack);
      banner?.dispose();
      bannerDisposed = true;
      _completeLoad();
      return;
    }

    if (!mounted) {
      if (banner != null && !bannerDisposed) {
        banner.dispose();
        bannerDisposed = true;
      }
      _completeLoad();
      return;
    }

    if (!_loaded) {
      if (banner != null && !bannerDisposed) {
        banner.dispose();
        bannerDisposed = true;
      }
      _completeLoad();
      return;
    }

    // When the ad successfully loads, the listener already copied the instance
    // into [_ad]. Ensure we keep the reference alive if it wasn't captured yet.
    _ad ??= banner;
    _completeLoad();
  }

  void _completeLoad() {
    final shouldReload = _needsReload;
    _isLoading = false;
    _needsReload = false;
    if (shouldReload && mounted) {
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (mounted) _load();
      });
    }
  }

  void _reportAdFailure(String context, Object error, StackTrace stackTrace) {
    widget.onLoadChanged?.call(false);
    debugPrint('[AdaptiveBanner] Failed to $context: $error\n$stackTrace');
  }

  @override
  void dispose() { _ad?.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    if (!AdService.isReady) return const SizedBox.shrink();

    if (Platform.isIOS) {
      return StreamBuilder<bool>(
        stream: RemoteFlags.instance.on<bool>(
          'adsEnabledIOS',
          userId: widget.userId,
          // fallback TRUE so ads show unless remotely disabled
          fallback: true,
        ),
        builder: (_, snap) {
          final enabled = snap.data ?? true;
          if (!enabled) return const SizedBox.shrink();
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
