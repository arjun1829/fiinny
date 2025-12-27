// lib/core/ads/native_inline_ad.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'ad_service.dart';

class NativeInlineAd extends StatefulWidget {
  final String adUnitId;
  final EdgeInsets padding;
  final int? inlineMaxHeight; 
  final void Function(bool isLoaded)? onLoadChanged;
  final TemplateType? forceTemplateType;

  const NativeInlineAd({
    super.key,
    required this.adUnitId,
    this.padding = const EdgeInsets.symmetric(horizontal: 0, vertical: 0),
    this.inlineMaxHeight,
    this.onLoadChanged,
    this.forceTemplateType,
  });

  @override
  State<NativeInlineAd> createState() => _NativeInlineAdState();
}

class _NativeInlineAdState extends State<NativeInlineAd> with AutomaticKeepAliveClientMixin {
  NativeAd? _ad;
  bool _loaded = false;
  bool _isLoading = false;
  Timer? _retryTimer;

  @override
  bool get wantKeepAlive => true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  @override
  void dispose() {
    _retryTimer?.cancel();
    _ad?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_isLoading) return;
    _retryTimer?.cancel();
    _isLoading = true;

    // Dispose old ad
    _ad?.dispose();
    _ad = null;
    if (mounted) setState(() => _loaded = false);
    widget.onLoadChanged?.call(false);

    if (!AdService.I.isEnabled) {
       await AdService.initLater();
       if (!mounted || !AdService.I.isEnabled) {
         _isLoading = false;
         return;
       }
    }

    // Determine template based on height if not forced
    TemplateType type = widget.forceTemplateType ?? TemplateType.medium;
    if (widget.forceTemplateType == null && widget.inlineMaxHeight != null) {
      if (widget.inlineMaxHeight! < 180) {
        type = TemplateType.small;
      }
    }

    final nativeAd = NativeAd(
      adUnitId: widget.adUnitId,
      request: AdService.buildAdRequest(),
      nativeTemplateStyle: NativeTemplateStyle(
        templateType: type,
        mainBackgroundColor: Colors.white,
        callToActionTextStyle: NativeTemplateTextStyle(
          textColor: Colors.white,
          backgroundColor: const Color(0xFF00C853), // Eco green-ish
          style: NativeTemplateFontStyle.bold,
          size: 16.0,
        ),
        primaryTextStyle: NativeTemplateTextStyle(
          textColor: Colors.black,
          style: NativeTemplateFontStyle.bold,
          size: 16.0,
        ),
        secondaryTextStyle: NativeTemplateTextStyle(
          textColor: Colors.grey,
          style: NativeTemplateFontStyle.normal,
          size: 14.0,
        ),
      ),
      listener: NativeAdListener(
        onAdLoaded: (ad) {
          debugPrint('[NativeInlineAd] Loaded ad: ${ad.responseInfo?.responseId}');
          if (!mounted) {
            ad.dispose();
            return;
          }
          setState(() {
            _ad = ad as NativeAd;
            _loaded = true;
            _isLoading = false;
          });
          widget.onLoadChanged?.call(true);
        },
        onAdFailedToLoad: (ad, error) {
          debugPrint('[NativeInlineAd] Failed to load: $error');
          ad.dispose();
          if (!mounted) return;
          setState(() {
            _ad = null;
            _loaded = false;
            _isLoading = false;
          });
          widget.onLoadChanged?.call(false);
          // Retry later
          _retryTimer = Timer(const Duration(seconds: 40), _load);
        },
      ),
    );

    try {
      await nativeAd.load();
    } catch (e) {
      debugPrint('[NativeInlineAd] Exception loading: $e');
      _isLoading = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (!_loaded || _ad == null) return const SizedBox.shrink();

    // Native Ad Template has fixed height ranges.
    // Small: Min 90dp.
    // Medium: Min 250dp usually. 
    // We let it take its natural size, constrained by width.
    
    // We add padding.
    return Padding(
      padding: widget.padding,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          minWidth: 320, 
          minHeight: 90,
          maxHeight: 400, // Reasonable max
        ),
        child: AdWidget(ad: _ad!),
      ),
    );
  }
}
