// lib/core/ads/ad_service.dart
import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart'
    show SynchronousFuture, debugPrint, kIsWeb, kReleaseMode;
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'ad_ids.dart';

/// Default to false. Enable special diagnostics explicitly with
/// --dart-define=DIAG_BUILD=true
const bool kDiagBuild =
    bool.fromEnvironment('DIAG_BUILD', defaultValue: false);

/// Simple, session-only caps (no SharedPreferences).
class AdService {
  AdService._();
  static final AdService I = AdService._();
  static bool _ready = false;
  static bool get isReady => _ready;

  InterstitialAd? _inter;
  RewardedAd? _rewarded;

  DateTime _lastInterShown = DateTime.fromMillisecondsSinceEpoch(0);
  int _actionsSinceInter = 0;

  bool _adsEnabled = false;
  Future<void>? _inFlightInit;

  bool get isEnabled => _adsEnabled;

  Future<void> init() {
    if (_adsEnabled) {
      return SynchronousFuture<void>(null);
    }
    final pending = _inFlightInit;
    if (pending != null) return pending;

    final future = _initializeInternal();
    _inFlightInit = future;
    return future.whenComplete(() {
      if (identical(_inFlightInit, future)) _inFlightInit = null;
    });
  }

  static Future<void> initLater() async {
    try {
      if (kIsWeb) {
        _ready = false;
        return;
      }

      // No more blanket skip on iOS. Use FORCE_TEST_ADS to force test ids.

      final bannerId = AdIds.banner;
      final appId = AdIds.appId;
      final missingIds = bannerId.isEmpty ||
          appId.isEmpty ||
          bannerId.contains('xxxx') ||
          appId.contains('xxxx') ||
          bannerId.contains('zzzz') ||
          appId.contains('zzzz') ||
          bannerId.contains('fill') ||
          appId.contains('fill');

      if (Platform.isIOS && missingIds) {
        debugPrint('[AdService] iOS AdMob IDs missing – skipping init.');
        _ready = false;
        return;
      }

      await AdService.I.init();
      _ready = AdService.I.isEnabled;
    } catch (err, stackTrace) {
      _ready = false;
      debugPrint('[AdService] initLater failed: $err\n$stackTrace');
    }
  }

  Future<void> _initializeInternal() async {
    if (!_shouldEnableAds()) {
      _adsEnabled = false;
      _ready = false;
      return;
    }

    try {
      await MobileAds.instance.initialize();
      await MobileAds.instance.updateRequestConfiguration(
        const RequestConfiguration(
          testDeviceIds: <String>[], // add your device ids if needed
        ),
      );

      _adsEnabled = true;
      _ready = true;

      preloadInterstitial();
      preloadRewarded();
    } catch (err, stackTrace) {
      _adsEnabled = false;
      _ready = false;
      debugPrint('[AdService] Google Mobile Ads init failed: $err\n$stackTrace');
    }
  }

  bool _shouldEnableAds() {
    if (kIsWeb) return false;
    if (!(Platform.isAndroid || Platform.isIOS)) return false;

    if (!AdIds.hasRealIdsForCurrentPlatform) {
      if (kReleaseMode && !forceTestAds) {
        debugPrint(
          '[AdService] Skipping Google Mobile Ads init on '
          '${Platform.operatingSystem} – real AdMob IDs are not configured.',
        );
        return false;
      }
      if (Platform.isIOS && AdIds.isUsingTestIds) {
        debugPrint('[AdService] Using Google test ads on iOS.');
      }
    }
    return true;
  }

  // ---------- Preload ----------
  void preloadInterstitial() {
    if (!_adsEnabled) return;
    if (_inter != null) return;
    InterstitialAd.load(
      adUnitId: AdIds.interstitial,
      request: const AdRequest(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) {
          ad.fullScreenContentCallback = FullScreenContentCallback(
            onAdDismissedFullScreenContent: (ad) {
              ad.dispose();
              _inter = null;
              preloadInterstitial();
            },
            onAdFailedToShowFullScreenContent: (ad, err) {
              ad.dispose();
              _inter = null;
              preloadInterstitial();
            },
          );
          _inter = ad;
        },
        onAdFailedToLoad: (_) {
          _inter = null;
        },
      ),
    );
  }

  void preloadRewarded() {
    if (!_adsEnabled) return;
    if (_rewarded != null) return;
    RewardedAd.load(
      adUnitId: AdIds.rewarded,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) {
          ad.fullScreenContentCallback = FullScreenContentCallback(
            onAdDismissedFullScreenContent: (ad) {
              ad.dispose();
              _rewarded = null;
              preloadRewarded();
            },
            onAdFailedToShowFullScreenContent: (ad, err) {
              ad.dispose();
              _rewarded = null;
              preloadRewarded();
            },
          );
          _rewarded = ad;
        },
        onAdFailedToLoad: (_) {
          _rewarded = null;
        },
      ),
    );
  }

  // ---------- Interstitial logic ----------
  Future<void> maybeShowInterstitial({
    int minActions = 6,
    Duration minGap = const Duration(minutes: 2),
  }) async {
    if (!_adsEnabled) return;
    _actionsSinceInter++;
    final now = DateTime.now();

    final allowed = _actionsSinceInter >= minActions &&
        now.difference(_lastInterShown) >= minGap &&
        _inter != null;

    if (!allowed) return;

    final ad = _inter!;
    _inter = null;
    await ad.show();
    _lastInterShown = now;
    _actionsSinceInter = 0;
  }

  // ---------- Rewarded logic ----------
  Future<bool> showRewarded({required void Function(int, String) onReward}) async {
    if (!_adsEnabled) return false;
    final ad = _rewarded;
    if (ad == null) {
      preloadRewarded();
      return false;
    }
    _rewarded = null;
    bool granted = false;
    await ad.show(onUserEarnedReward: (ad, rewardItem) {
      granted = true;
      onReward(rewardItem.amount.toInt(), rewardItem.type);
    });
    return granted;
  }
}
